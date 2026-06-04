#!/usr/bin/env node
// parse-check.mjs — fast JS syntax check for the single-file HTML prototypes.
// Thin CLI wrapper over scripts/lib-parse.mjs (shared with the PostToolUse hook).
//
// Usage:  node scripts/parse-check.mjs [file1.html file2.html ...]
// Default file: index.html
// Exit 0 = all blocks parse; Exit 1 = at least one syntax error (printed).

import fs from 'node:fs';
import { parseHtmlScripts } from './lib-parse.mjs';

const files = process.argv.slice(2);
if (files.length === 0) files.push('index.html');

let hadError = false;

for (const file of files) {
  let src;
  try {
    src = fs.readFileSync(file, 'utf8');
  } catch (e) {
    console.error(`parse-check: cannot read ${file}: ${e.message}`);
    hadError = true;
    continue;
  }
  const { errors } = parseHtmlScripts(src);
  for (const { block, message } of errors) {
    hadError = true;
    console.error(`✗ ${file} (script block ${block}): ${message}`);
  }
}

if (hadError) {
  console.error('parse-check: FAILED — fix the syntax error(s) above before continuing.');
  process.exit(1);
} else {
  console.log('parse-check: OK');
}
