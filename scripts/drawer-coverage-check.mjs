#!/usr/bin/env node
// drawer-coverage-check.mjs — metadata-payload completeness ratchet.
//
// WHY (2026-08-10): the PM requires the preview module to show the FULL
// compare-meaningful API payload for EVERY ADO type. Claims of completeness
// were repeatedly falsified by screenshots (category summaries on single
// items, thin Repo fields). This check makes the claim MACHINE-ENFORCED:
// scripts/drawer-manifest.json freezes, per type, the field labels its
// drawer branch must emit. Any edit that drops a branch or one of its
// required fields fails the PostToolUse hook.
//
// The manifest is the REVIEWABLE contract — regenerate deliberately when
// fields are ADDED (never silently): see the generator snippet in
// ado-compare-field-audit.md. Limitations (documented): label presence is
// checked file-wide (labels are near-unique literals), and dynamically
// computed labels are not tracked.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MANIFEST = path.join(HERE, 'drawer-manifest.json');

export function checkDrawerCoverage(filePath, src) {
  let manifest;
  try { manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8')); } catch { return []; }
  // Only the files that carry the ADO drawer generator.
  if (!/Azure DevOps/.test(src) || !/_buildResourceSnapshotFieldsCore/.test(src)) return [];
  const problems = [];
  for (const [type, labels] of Object.entries(manifest)) {
    // Two generator styles: if-chains (`t === 'Type'`) and the GitHub
    // schema switch (`case 'Type':`).
    if (!src.includes(`t === '${type}'`) && !src.includes(`case '${type}':`)) {
      problems.push(`branch missing for type '${type}'`);
      continue;
    }
    for (const label of labels) {
      if (!src.includes(`{f:'${label}'`) && !src.includes(`{f: '${label}'`) && !src.includes(`{f:'${label} `)
          && !src.includes(`f('${label}'`) && !src.includes(`mb('${label}'`)) {
        problems.push(`'${type}' lost required field '${label}'`);
      }
    }
  }
  return problems;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  let failed = false;
  for (const f of process.argv.slice(2)) {
    let src;
    try { src = fs.readFileSync(f, 'utf8'); } catch { continue; }
    const p = checkDrawerCoverage(f, src);
    if (p.length) {
      failed = true;
      console.error(`✗ drawer coverage regressions in ${path.basename(f)}:`);
      for (const x of p) console.error('    ' + x);
    } else {
      console.log(`drawer-coverage: OK (${path.basename(f)})`);
    }
  }
  process.exit(failed ? 1 : 0);
}
