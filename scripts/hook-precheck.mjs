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
import { checkDoctrine } from './doctrine-check.mjs';
import { checkDrawerCoverage } from './drawer-coverage-check.mjs';
import { checkPrdInvariants } from './prd-invariants-check.mjs';

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

// Doctrine ratchet (2026-08-07): the user's standing design rulings, enforced
// mechanically because prose rules kept losing to edit momentum. A count that
// grows past its frozen baseline blocks the edit with the ruling attached.
const violations = checkDoctrine(file, src);
if (violations.length) {
  console.error(`✗ design-doctrine violation in ${path.basename(file)} after this edit:`);
  for (const v of violations) console.error(`    ${v.id} (${v.was} → ${v.now}): ${v.why}`);
  console.error('Undo the violating markup — these are agreed standing rules, not suggestions.');
  process.exit(2);
}

// Metadata-payload ratchet (2026-08-10): a drawer branch or one of its
// manifest-required fields disappeared — the PM's full-payload directive
// is machine-enforced; regenerate the manifest deliberately if fields moved.
// PRD skeleton lock-down (2026-08-12): structural spec contracts —
// category rosters, section membership, grid column sets, audit model.
const prd = checkPrdInvariants(file, src);
if (prd.length) {
  console.error(`✗ PRD invariant broken in ${path.basename(file)} — this structure is spec-locked:`);
  for (const p of prd) console.error('    ' + p);
  process.exit(2);
}

const coverage = checkDrawerCoverage(file, src);
if (coverage.length) {
  console.error(`✗ drawer metadata coverage regression in ${path.basename(file)}:`);
  for (const c of coverage) console.error('    ' + c);
  process.exit(2);
}
process.exit(0);
