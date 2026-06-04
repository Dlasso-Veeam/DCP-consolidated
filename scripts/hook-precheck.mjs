#!/usr/bin/env node
// hook-precheck.mjs — PostToolUse hook.
// Fires after Edit/Write/MultiEdit. If the edited file is an .html prototype,
// run the fast JS syntax check on it. On a syntax error, exit 2 so the error
// text is surfaced straight back to Claude (the tool already ran; this just
// flags the breakage immediately instead of letting it ride).
//
// Silent + exit 0 for non-HTML edits or when the file parses cleanly.

import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';

function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.on('data', (c) => (data += c));
    process.stdin.on('end', () => resolve(data));
    // guard: if no stdin arrives, resolve empty after a tick
    setTimeout(() => resolve(data), 500);
  });
}

const raw = await readStdin();
let input = {};
try { input = JSON.parse(raw || '{}'); } catch {}

const file = input?.tool_input?.file_path;
if (!file || !file.endsWith('.html')) process.exit(0);

let src;
try { src = fs.readFileSync(file, 'utf8'); } catch { process.exit(0); }

const noComments = src.replace(/<!--[\s\S]*?-->/g, '');
const blocks = [...noComments.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);

const errors = [];
let n = 0;
for (const body of blocks) {
  n++;
  try { new vm.Script(body, { filename: `block${n}.js` }); }
  catch (e) { errors.push(`script block ${n}: ${e.message}`); }
}

if (errors.length) {
  console.error(`✗ JS syntax error in ${path.basename(file)} after this edit:`);
  for (const e of errors) console.error(`    ${e}`);
  console.error('Fix this before continuing — the page will not run.');
  process.exit(2);
}
process.exit(0);
