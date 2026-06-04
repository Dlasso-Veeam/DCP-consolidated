#!/usr/bin/env node
// smoke.mjs — headless walk of the onboarding prototype to catch regressions
// and cross-workload bleed BEFORE claiming a change works.
//
// Zero install: drives the Playwright-cached Chromium (or Chrome.app) over the
// DevTools Protocol using Node's built-in WebSocket + fetch. Loads index.html
// from file://, then for every workload walks its applicable screens and:
//   1) records any console.error / uncaught exception thrown while rendering
//      (the "looks fixed but is actually broken" class), and
//   2) checks the per-workload invariants in scripts/smoke-invariants.json
//      (the cross-workload-bleed / copy-regression class).
//
// QUIET ON SUCCESS: prints one summary line and exits 0.
// On failure: prints each (workload/screen) finding and exits 1.
//
// Usage: node scripts/smoke.mjs [file.html]   (default: index.html)

import { spawn } from 'node:child_process';
import { existsSync, readFileSync, globSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const FILE = process.argv[2] || 'index.html';
const FILE_URL = 'file://' + path.resolve(ROOT, FILE);
const INVARIANTS_PATH = path.join(ROOT, 'scripts', 'smoke-invariants.json');

// ---------- locate a Chromium binary (no install) ----------
function findChrome() {
  const candidates = [];
  const pwCache = path.join(os.homedir(), 'Library/Caches/ms-playwright');
  try {
    candidates.push(
      ...globSync(path.join(pwCache, 'chromium_headless_shell-*/chrome-mac/headless_shell')),
      ...globSync(path.join(pwCache, 'chromium-*/chrome-mac/Chromium.app/Contents/MacOS/Chromium'))
    );
  } catch {}
  candidates.push('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
  return candidates.find((c) => { try { return existsSync(c); } catch { return false; } });
}

const CHROME = findChrome();
if (!CHROME) {
  console.error('smoke: no Chromium/Chrome binary found; cannot run.');
  process.exit(2);
}

// ---------- launch headless, capture the DevTools ws endpoint ----------
const userDataDir = path.join(os.tmpdir(), 'smoke-cdp-' + Date.now());
const chrome = spawn(CHROME, [
  '--headless=new',
  '--remote-debugging-port=0',
  '--user-data-dir=' + userDataDir,
  '--no-first-run', '--no-default-browser-check',
  '--disable-gpu', '--disable-extensions', '--disable-dev-shm-usage',
  'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'] });

function cleanup(code) {
  try { chrome.kill('SIGKILL'); } catch {}
  try { rmSync(userDataDir, { recursive: true, force: true }); } catch {}
  process.exit(code);
}
// Reap the spawned browser + temp profile on any exit signal — otherwise a
// hook-stop timeout (SIGTERM) would orphan the headless Chrome process.
process.on('SIGINT', () => cleanup(130));
process.on('SIGTERM', () => cleanup(143));

const browserWsP = new Promise((resolve, reject) => {
  let buf = '';
  const to = setTimeout(() => reject(new Error('timed out waiting for DevTools endpoint')), 15000);
  chrome.stderr.on('data', (d) => {
    buf += d.toString();
    const m = buf.match(/DevTools listening on (ws:\/\/\S+)/);
    if (m) { clearTimeout(to); resolve(m[1]); }
  });
  chrome.on('exit', () => { clearTimeout(to); reject(new Error('chrome exited early')); });
});

// ---------- tiny CDP client over the built-in WebSocket ----------
let ws, msgId = 0;
const pending = new Map();
let sessionId = null;
const loadWaiters = [];
// findings buffered from console/exception events, tagged with the current step.
// 'page-load' covers anything thrown while the page boots (before the walk) —
// a top-level script crash here MUST be reported, not filtered out, or smoke
// would pass a page that throws on load.
let currentTag = 'page-load';
const findings = [];

function send(method, params = {}, useSession = true) {
  const id = ++msgId;
  const payload = { id, method, params };
  if (useSession && sessionId) payload.sessionId = sessionId;
  ws.send(JSON.stringify(payload));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

function handleEvent(method, params) {
  if (method === 'Page.loadEventFired') {
    while (loadWaiters.length) loadWaiters.shift()();
  } else if (method === 'Runtime.consoleAPICalled') {
    if (params.type === 'error') {
      findings.push({ tag: currentTag, kind: 'console.error', text: argsToText(params.args) });
    }
  } else if (method === 'Runtime.exceptionThrown') {
    const d = params.exceptionDetails || {};
    const text = (d.exception && (d.exception.description || d.exception.value)) || d.text || 'exception';
    findings.push({ tag: currentTag, kind: 'exception', text: String(text).split('\n')[0] });
  } else if (method === 'Log.entryAdded') {
    const e = params.entry || {};
    if (e.level === 'error') findings.push({ tag: currentTag, kind: 'log.error', text: e.text });
  }
}

function argsToText(args) {
  return (args || []).map((a) => (a.value !== undefined ? a.value : (a.description || a.type))).join(' ');
}

async function connect(url) {
  ws = new WebSocket(url);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = (e) => rej(new Error('ws error')); });
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
    } else if (msg.method) {
      handleEvent(msg.method, msg.params || {});
    }
  };
  // Create a tab, attach (flatten routes events through this same ws).
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' }, false);
  const att = await send('Target.attachToTarget', { targetId, flatten: true }, false);
  sessionId = att.sessionId;
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Log.enable');
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function evaluate(expression) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) {
    const d = r.exceptionDetails;
    const text = (d.exception && d.exception.description) || d.text || 'eval error';
    findings.push({ tag: currentTag, kind: 'eval-throw', text: String(text).split('\n')[0] });
    return undefined;
  }
  return r.result.value;
}

// ---------- the walk ----------
async function navigate(screen) {
  // goTo maps `screen` → #screen-<screen> and runs that screen's render fn.
  // Wrap so an in-page throw is captured rather than killing the eval.
  return evaluate(
    `(function(){try{goTo(${JSON.stringify(screen)});return null;}catch(e){return String((e&&e.stack)||e);}})()`
  );
}

function routeFor(flags) {
  const r = ['catalog', 'welcome', 'basic-info', 'auth'];
  if (flags.requiresApplicationStep) r.push('applications');
  if (flags.requiresEnvList) r.push('environments');
  if (flags.id === 'gitlab' || flags.requiresGroupList) r.push('gitlab-groups');
  if (flags.id === 'azure-devops') r.push('ado-orgs');
  if (flags.id === 'confluence') r.push('confluence-sites', 'confluence-spaces');
  r.push('test-conn', 'infra-storage');
  if (!flags.hideScopeStep && flags.id !== 'github') r.push('scope');
  r.push('protect', 'overview');
  return r;
}

async function main() {
  const browserWs = await browserWsP;
  await connect(browserWs);

  // Load the file and wait for the load event.
  const loaded = new Promise((res) => loadWaiters.push(res));
  await send('Page.navigate', { url: FILE_URL });
  await Promise.race([loaded, sleep(8000)]);
  await sleep(150); // let inline top-level scripts settle

  // Open the gate so screens render.
  await evaluate(`(function(){try{if(typeof grantSession==='function')grantSession();}catch(e){} var g=document.getElementById('passwordGate'); if(g)g.style.display='none'; return 'ok';})()`);

  // Read workload list + the flags we route on.
  const meta = await evaluate(`(function(){
    if(typeof WORKLOADS==='undefined')return null;
    var out={};
    Object.keys(WORKLOADS).forEach(function(k){
      var w=WORKLOADS[k]||{};
      out[k]={id:k, requiresEnvList:!!w.requiresEnvList, requiresGroupList:!!w.requiresGroupList,
               requiresApplicationStep:!!w.requiresApplicationStep, hideScopeStep:!!w.hideScopeStep};
    });
    return out;
  })()`);

  if (!meta) { console.error('smoke: WORKLOADS not found — did the page load?'); cleanup(1); return; }

  const workloads = Object.keys(meta);
  let invariants = [];
  try { invariants = JSON.parse(readFileSync(INVARIANTS_PATH, 'utf8')); } catch {}

  let screenCount = 0;
  const assertFailures = [];

  for (const wl of workloads) {
    currentTag = `${wl}/select`;
    await evaluate(`(function(){try{selectWorkload(${JSON.stringify(wl)});return null;}catch(e){return String(e);}})()`);
    // Best-effort seed for env workloads so downstream screens have state.
    await evaluate(`(function(){try{if(${meta[wl].requiresEnvList?'true':'false'}&&typeof seedD365Environments==='function'&&currentWorkload==='d365')seedD365Environments();if(typeof enterEnvScreen==='function'&&${meta[wl].requiresEnvList?'true':'false'})enterEnvScreen();}catch(e){}return 0;})()`);

    for (const screen of routeFor(meta[wl])) {
      currentTag = `${wl}/${screen}`;
      const thrown = await navigate(screen);
      if (thrown) findings.push({ tag: currentTag, kind: 'render-throw', text: String(thrown).split('\n')[0] });
      await sleep(8); // allow async console/exception events to flush

      // run invariants for this exact (wl,screen)
      for (const inv of invariants) {
        if (inv.wl !== wl || inv.screen !== screen) continue;
        if (inv.setup) await evaluate(`(function(){try{${inv.setup}}catch(e){}return 0;})()`);
        for (const a of inv.asserts || []) {
          const res = await evaluate(`(function(){
            var el=document.querySelector(${JSON.stringify(a.sel)});
            if(!el)return {ok:false,why:'missing element',sel:${JSON.stringify(a.sel)}};
            var txt=(el.textContent||'').replace(/\\s+/g,' ').trim();
            var disp=getComputedStyle(el).display;
            var vis=disp!=='none'&&el.offsetParent!==null;
            ${a.contains ? `if(txt.indexOf(${JSON.stringify(a.contains)})===-1)return {ok:false,why:'missing text',want:${JSON.stringify(a.contains)},got:txt.slice(0,80)};` : ''}
            ${a.notContains ? `if(txt.indexOf(${JSON.stringify(a.notContains)})!==-1)return {ok:false,why:'forbidden text present',bad:${JSON.stringify(a.notContains)},got:txt.slice(0,80)};` : ''}
            ${a.textEquals ? `if(txt!==${JSON.stringify(a.textEquals)})return {ok:false,why:'text mismatch',want:${JSON.stringify(a.textEquals)},got:txt.slice(0,80)};` : ''}
            ${a.hidden ? `if(vis)return {ok:false,why:'should be hidden but visible'};` : ''}
            ${a.visible ? `if(!vis)return {ok:false,why:'should be visible but hidden'};` : ''}
            return {ok:true};
          })()`);
          if (res && !res.ok) {
            assertFailures.push({ tag: `${wl}/${screen}`, label: inv.label || '', sel: a.sel, detail: res });
          }
        }
      }
      screenCount++;
    }
  }

  // Final drain so trailing async console/exception events from the last
  // screen land before we decide pass/fail.
  await sleep(60);

  // ---------- report ----------
  const errFindings = findings;
  const ok = errFindings.length === 0 && assertFailures.length === 0;

  if (ok) {
    console.log(`smoke: PASS — ${workloads.length} workloads, ${screenCount} screens, 0 console errors, ${invariants.length} invariants held`);
    cleanup(0);
    return;
  }

  console.error(`smoke: FAIL on ${FILE}`);
  if (errFindings.length) {
    console.error(`\n  Console errors / exceptions (${errFindings.length}):`);
    for (const f of errFindings) console.error(`    [${f.tag}] ${f.kind}: ${f.text}`);
  }
  if (assertFailures.length) {
    console.error(`\n  Invariant failures (${assertFailures.length}) — likely cross-workload bleed or copy regression:`);
    for (const f of assertFailures) {
      console.error(`    [${f.tag}] ${f.label} (${f.sel}): ${JSON.stringify(f.detail)}`);
    }
  }
  cleanup(1);
}

main().catch((e) => { console.error('smoke: harness error:', e.message); cleanup(2); });
