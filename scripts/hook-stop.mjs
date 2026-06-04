#!/usr/bin/env node
// hook-stop.mjs — Stop hook.
// Before a turn is allowed to end, run the headless smoke walk over index.html
// IF index.html changed since the last passing smoke. This is the guard against
// "said it's fixed but it's actually broken": a turn that broke the onboarding
// flow cannot end clean.
//
//   • No change to index.html since last pass  → exit 0 (skip; nothing to check)
//   • smoke PASS                                → update sentinel, exit 0
//   • smoke FAIL (exit 1)                       → emit {"decision":"block"} with
//                                                 the findings, so Claude must fix
//   • smoke harness/infra error (exit 2) or no  → warn on stderr, do NOT block
//     browser binary                              (don't trap on tooling issues)

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.env.CLAUDE_PROJECT_DIR
  || path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const TARGET = path.join(ROOT, 'index.html');
const SENTINEL = path.join(ROOT, '.claude', '.last-smoke');

function readStdin() {
  return new Promise((resolve) => {
    let d = '';
    process.stdin.on('data', (c) => (d += c));
    process.stdin.on('end', () => resolve(d));
    setTimeout(() => resolve(d), 500);
  });
}

const input = JSON.parse((await readStdin()) || '{}');
// Avoid re-entrancy loops: if we're already inside a stop-hook continuation, bail.
if (input.stop_hook_active) process.exit(0);

// mtime guard — only run when index.html is newer than the last passing smoke.
// Capture the target mtime BEFORE the run; on pass we stamp the sentinel with
// THIS value (not "now"), so any edit landing during the smoke run has a newer
// mtime and is re-tested next time instead of being silently skipped.
let targetM;
try {
  targetM = fs.statSync(TARGET).mtimeMs;
  const lastM = fs.existsSync(SENTINEL) ? fs.statSync(SENTINEL).mtimeMs : 0;
  if (targetM <= lastM) process.exit(0);
} catch {
  // if index.html is missing, nothing to guard
  process.exit(0);
}

const run = spawnSync('node', [path.join(ROOT, 'scripts', 'smoke.mjs'), 'index.html'], {
  cwd: ROOT, encoding: 'utf8', timeout: 60000,
});

const out = ((run.stdout || '') + (run.stderr || '')).trim();

if (run.status === 0) {
  // pass — stamp the sentinel, then backdate its mtime to the target's pre-run
  // mtime so edits made during the run aren't treated as already-tested.
  try {
    fs.writeFileSync(SENTINEL, new Date().toISOString() + '\n');
    const t = new Date(targetM);
    fs.utimesSync(SENTINEL, t, t);
  } catch {}
  process.exit(0);
}

if (run.status === 1) {
  // real smoke failure → block the stop and hand Claude the findings
  const reason =
    'Smoke test FAILED — the onboarding flow is broken. Do not end the turn until this passes.\n\n'
    + out
    + '\n\nRe-run with: node scripts/smoke.mjs';
  process.stdout.write(JSON.stringify({ decision: 'block', reason }));
  process.exit(0);
}

// status 2 / null (timeout, no browser, harness error): warn but don't trap.
console.error('hook-stop: smoke could not run (infra/timeout); not blocking.\n' + out);
process.exit(0);
