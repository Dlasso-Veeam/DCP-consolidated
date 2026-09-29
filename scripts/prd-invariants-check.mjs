#!/usr/bin/env node
// prd-invariants-check.mjs — the "fix and then LOCK DOWN" half of the
// GitHub/ADO inventory PRD work (user directive 2026-08-12).
//
// Freezes the PRD skeletons as STATIC structural assertions over the
// prototype source, so the regression classes we just repaired cannot
// silently recur:
//   • GitHub R1: scanner categories repointed away from Alert types
//   • GitHub R2: hourly security log files re-seeding
//   • category rosters shrinking (14 GH org cats, 9 ADO org cats)
//   • repo section membership (incl. the §2.8 Branches grid)
//   • PRD grid column sets (repos, root orgs)
//   • the unified audit model (audit leaf + coverage field)
// Hard failures (no baselines) — these are spec contracts, not debt.
// Runs in hook-precheck after every edit; CLI: node prd-invariants-check.mjs <file...>

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CHECKS = [
  // ── GitHub PRD ─────────────────────────────────────────────────────────
  { id: 'gh-scanner-types', why: 'R1 lock: scanner categories must point at Alert types (§2.10 scanners→findings)',
    test: (s) => s.includes("{ id:'dependabot-alerts',  label:'Dependabot Alerts',       types:['Dependabot Alert'] }")
               && s.includes("types:['Code Scanning Alert']") && s.includes("types:['Secret Scanning Alert']") },
  { id: 'gh-log-files-parked', why: 'R2 lock: per-repo hourly security log files stay parked',
    test: (s) => s.includes('var _alertCats = [];') },
  { id: 'gh-14-org-cats', why: '§2.2: all 14 Organization Settings categories in GH_ORGCFG_FOLDER_KEYS',
    test: (s) => ['Secrets','Variables','Webhooks','Rulesets','Custom Properties Schema','Members','Teams',
                  'Custom Roles','Installed GitHub Apps','Code Security Configurations','Actions Permissions',
                  'Runner Groups','Dependabot Secrets','Projects v2']
                 .every((n) => s.includes(`'${n}': 'org-`)) },
  { id: 'gh-repo-sections', why: '§2.7/§2.8: 3 repo sections; Content includes the Branches grid',
    test: (s) => s.includes("folders:['source-code','branches','wiki','labels','milestones','issues','prs','discussions','releases']")
               && s.includes("folders:['dependabot-alerts','code-scanning','secret-scanning']") },
  { id: 'gh-repos-grid', why: '§2.6: repos grid = Repo | Visibility | Last push | Backed up (+picker Size/Fork/Policy)',
    test: (s) => /CHILD_COLUMNS_REPOS_GITHUB = \[[^\]]*'Repo'[^\]]*'Visibility'[^\]]*'Last push'[^\]]*'Backed up'[^\]]*optional: true[^\]]*optional: true[^\]]*'Policy'/s.test(s) },
  { id: 'gh-root-grid', why: '§2.1: root = Organization | Repositories | Members',
    test: (s) => /INV_COLUMNS_ORGS_GITHUB = \[[^\]]*'Organization'[^\]]*ghRepoTotal[^\]]*ghMembers/s.test(s) },
  { id: 'gh-source-code-detached', why: '§2.8: the source bundle must not claim Branch rows',
    test: (s) => s.includes("{ id:'source-code', label:'Source code & history', types:['Git Content','Tag','Workflow','LFS Object'] }") },
  // ── ADO PRD ────────────────────────────────────────────────────────────
  { id: 'ado-9-org-cats', why: '§2.3: 9 Organization Settings categories',
    test: (s) => ['tpls','pools','dpools','users','pol','feeds','hooks','ext','oacls']
                 .every((k) => new RegExp(`\\['${k}',`).test(s)) },
  { id: 'ado-audit-leaf', why: 'Unified audit model: single leaf w/ coverage field (user ruling 2026-08-05)',
    test: (s) => s.includes("adoCovers: 'May 1 \\u2013 Jul 30, 2026'") || s.includes("adoCovers: 'May 1 – Jul 30, 2026'") },
  { id: 'ado-flat-alerts', why: 'Single-table security alerts (PM 2026-08-08): 8 seeded alert rows',
    test: (s) => (s.match(/'(?:Code Scanning|Dependabot|Secret Scanning) Alert'\]/g) || []).length >= 3
               && s.includes('window.ADO_SEC_ALERTS = [') },
  { id: 'ado-item-grids', why: 'Phase 3 descriptors present (aclTokens + secAlerts + wi + prs)',
    test: (s) => s.includes('aclTokens:') && s.includes('secAlerts:') && /wi:\s*\{ name: 'Work item'/.test(s) },
  // ── Cross-cutting ──────────────────────────────────────────────────────
  { id: 'tree-table-alignment', why: 'Tree mirrors table sort — spec sorts stay parked (user 2026-08-12)',
    test: (s) => s.includes('// was: if (r.wl === \'Okta WIC\') _oktaTreeSpecSort(rawKids);') },
];

export function checkPrdInvariants(filePath, src) {
  // Only the three inventory prototypes carry these structures.
  if (!/GH_ORGCFG_FOLDER_KEYS/.test(src) || !/ADO_SEC_ALERTS|orgSetCats/.test(src)) return [];
  return CHECKS.filter((c) => !c.test(src)).map((c) => `${c.id}: ${c.why}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  let failed = false;
  for (const f of process.argv.slice(2)) {
    let src;
    try { src = fs.readFileSync(f, 'utf8'); } catch { continue; }
    const p = checkPrdInvariants(f, src);
    if (p.length) {
      failed = true;
      console.error(`✗ PRD invariant violations in ${path.basename(f)}:`);
      for (const x of p) console.error('    ' + x);
    } else {
      console.log(`prd-invariants: OK (${path.basename(f)})`);
    }
  }
  process.exit(failed ? 1 : 0);
}
