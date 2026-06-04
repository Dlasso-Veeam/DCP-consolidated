#!/usr/bin/env node
// hook-precheck.mjs — PostToolUse hook.
// Fires after Edit/Write/MultiEdit. If the edited file is an .html prototype,
// run the fast JS syntax check on it (shared logic in lib-parse.mjs). On a
// syntax error, exit 2 so the error text is surfaced straight back to Claude
// (the tool already ran; this just flags the breakage immediately).
//
// Silent + exit 0 for non-HTML edits or when the file parses cleanly.

import fs from 'node:fs';
import path from 'node:path';
import { parseHtmlScripts } from './lib-parse.mjs';

function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.on('data', (c) => (data += c));
    process.stdin.on('end', () => resolve(data));
    setTimeout(() => resolve(data), 500); // guard if no stdin arrives
  });
}

const raw = await readStdin();
let input = {};
try { input = JSON.parse(raw || '{}'); } catch {}

const file = input?.tool_input?.file_path;
if (!file || !file.endsWith('.html')) process.exit(0);

let src;
try { src = fs.readFileSync(file, 'utf8'); } catch { process.exit(0); }

const { errors } = parseHtmlScripts(src);
if (errors.length) {
  console.error(`✗ JS syntax error in ${path.basename(file)} after this edit:`);
  for (const { block, message } of errors) console.error(`    script block ${block}: ${message}`);
  console.error('Fix this before continuing — the page will not run.');
  process.exit(2);
}
process.exit(0);
