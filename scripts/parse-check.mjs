#!/usr/bin/env node
// parse-check.mjs — fast JS syntax check for the single-file HTML prototypes.
//
// Strips HTML comments first (so prose mentions of "<script>" inside comments
// don't get mis-parsed as a block — that was the long-standing false positive),
// then compiles each real <script>…</script> block in script context with
// vm.Script. Compile-only: nothing runs, so it's instant and side-effect free.
//
// Usage:  node scripts/parse-check.mjs [file1.html file2.html ...]
// Default file: index.html
// Exit 0 = all blocks parse; Exit 1 = at least one syntax error (printed).

import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';

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
  // Strip HTML comments so a "<script>" written in prose inside a comment
  // is not treated as a code block.
  const noComments = src.replace(/<!--[\s\S]*?-->/g, '');
  // Only bare <script> … </script> blocks (external src= scripts have no body).
  const blocks = [...noComments.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);

  let n = 0;
  for (const body of blocks) {
    n++;
    try {
      new vm.Script(body, { filename: `${path.basename(file)}#block${n}.js` });
    } catch (e) {
      hadError = true;
      console.error(`✗ ${file} (script block ${n}): ${e.message}`);
    }
  }
}

if (hadError) {
  console.error('parse-check: FAILED — fix the syntax error(s) above before continuing.');
  process.exit(1);
} else {
  // Quiet on success — one short line.
  console.log('parse-check: OK');
}
