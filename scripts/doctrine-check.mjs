#!/usr/bin/env node
// doctrine-check.mjs — enforcement for the user's standing design rulings.
//
// WHY THIS EXISTS (2026-08-07): the rules below were expressed, agreed, and
// recorded in memory — and still got violated when they were peripheral to
// whatever edit was in focus (outlined badge composed from ex-badge +
// inline border, 2026-08-07; native title= regressions; "e.g." in copy).
// Prose rules live in the model's periphery; this check puts them in its
// face: the PostToolUse hook runs it after EVERY html edit and a violation
// blocks with exit 2.
//
// Mechanism: BASELINE RATCHET. Legacy debt is frozen per-file in
// doctrine-baseline.json; any edit that INCREASES a rule's count fails.
// Counts that decrease auto-tighten the baseline. New files initialize
// silently. This means "don't add new violations" — not "the file is clean".
//
// Rules (each cites its ruling):
//   outlined-chip  — chips are borderless (.res-type outline dropped
//                    2026-07-30; re-violated 2026-08-07). No badge span may
//                    carry an inline border style.
//   native-title   — styled [data-tooltip] only, never raw title= (user firm).
//   eg-in-copy     — no "e.g." in UI copy ("Example:" / "for example").
//   raw-hex        — CSS vars only, no new raw hex (CLAUDE.md rule 1).
//   icon-font      — inline SVG only, never icon fonts (CLAUDE.md rule 2;
//                    hard zero, no baseline).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BASELINE_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), 'doctrine-baseline.json');

const RULES = [
  {
    id: 'outlined-chip',
    why: 'Chips are BORDERLESS — .res-type is the one grey chip (ruling 2026-07-30, re-violated 2026-08-07). Reuse .res-type or an existing chip class; never inline border styles on a badge.',
    count(src) {
      const tags = src.match(/<span[^>]*>/g) || [];
      let n = 0;
      for (const t of tags) {
        if (/class=(?:"|\\")[^"]*(?:res-type|ex-badge)/.test(t) && /style=(?:"|\\")[^"]*border/.test(t)) n++;
      }
      // JS-composed markup ('<span class="res-type" …' inside strings) is
      // covered too: the tag regex matches string literals in script blocks.
      return n;
    }
  },
  {
    id: 'native-title',
    why: 'Never raw title= — the styled [data-tooltip] bubble is the only tooltip (user firm, feedback-no-native-title-tooltips).',
    count: (src) => (src.match(/ title="/g) || []).length + (src.match(/ title=\\"/g) || []).length
  },
  {
    id: 'eg-in-copy',
    why: 'No "e.g." in UI copy — "Example:" in placeholders, "for example" in prose (feedback-no-eg-in-ui-copy; sweep quoted strings, not just attributes).',
    count(src) {
      // Only inside string literals / markup text — comments are fine.
      const noComments = src.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '');
      return (noComments.match(/\be\.g\./g) || []).length;
    }
  },
  {
    id: 'raw-hex',
    why: 'CSS custom properties only — no new raw hex outside :root (CLAUDE.md rule 1).',
    count(src) {
      // Freeze legacy hex via baseline; svg data + :root included in the
      // frozen count, so only NET NEW hex trips the ratchet.
      return (src.match(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g) || []).length;
    }
  },
  {
    id: 'hand-drawn-svg',
    why: 'ONLY DS-store icons, ALWAYS (all-caps ruling 2026-07-29; violated again with the tenant building glyph, caught 2026-08-11). New icons go through _dsStoreIconSvg + the securiti-icons-data.js store — never a new inline <path d="..."> literal. Legacy glyphs are frozen at the baseline.',
    count: (src) => (src.match(/<path d=\\?"/g) || []).length
  },
  {
    id: 'inline-styled-pill',
    why: 'Status chips/pills are EXISTING COMPONENTS, never inline-styled spans (user 2026-09-10, after repeated regressions: activity = .act-status-pill, inventory = .aiac-chip, badges = light variant). A <span style="…"> that sets BOTH a background and a border-radius is a hand-rolled chip — use the page\'s pill class instead. Legacy pills are frozen at the baseline.',
    count(src) {
      const tags = src.match(/<span style=(?:\\)?"[^"]*"/g) || [];
      let n = 0;
      for (const t of tags) {
        if (/border-radius/.test(t) && /background/.test(t)) n++;
      }
      return n;
    }
  },
  {
    id: 'undefined-css-var',
    why: 'Every var(--x) referenced in a file must be DEFINED in that file — an undefined custom property renders silently unset (no error, no fallback). Caught 2026-09-09: agent-studio.html used --green-soft-160 (defined only in index.html) 8 times; every green tint on the page rendered blank and shipped that way. Ratchet: legacy stragglers frozen at baseline; NET NEW undefined refs trip this.',
    count(src) {
      // Definitions: CSS declarations AND JS setProperty('--x', …).
      const defined = new Set((src.match(/--[a-zA-Z0-9-]+(?=\s*:)/g) || []));
      (src.match(/setProperty\(\s*['"](--[a-zA-Z0-9-]+)/g) || []).forEach((m) => {
        defined.add(m.replace(/setProperty\(\s*['"]/, ''));
      });
      // Only BARE refs count — var(--x, fallback) degrades safely by design.
      // Names with uppercase are template placeholders (--col-w-KEY), skipped.
      // Comments aren't refs.
      const noComments = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '');
      const used = noComments.match(/var\(\s*(--[a-z0-9-]+)\s*\)/g) || [];
      const missing = new Set();
      used.forEach((u) => {
        const name = (u.match(/--[a-z0-9-]+/) || [null])[0];
        if (name && !defined.has(name)) missing.add(name);
      });
      return missing.size;
    }
  },
  {
    id: 'uncited-component-family',
    why: 'EVERY new UI component family must cite its DS source (user 2026-08-19, after the hand-rolled accordion: "you consistently keep building new components without first referencing the design system"). A CSS class family (shared prefix, 3+ classes) counts as a component; its defining CSS block must carry a "Figma <node-id or component name>" citation within the 6 lines above its first rule. Legacy uncited families are frozen at the baseline — only NET NEW uncited families trip this.',
    count(src) {
      // Collect class-family prefixes from CSS rule selectors: .foo-bar-baz → foo-bar.
      const styleBlocks = (src.match(/<style[\s\S]*?<\/style>/g) || [src]).join('\n');
      const lines = styleBlocks.split('\n');
      const fams = {};   // prefix → { classes:Set, firstLine:number }
      lines.forEach((ln, i) => {
        const sels = ln.match(/^\s*\.([a-z][a-z0-9]+(?:-[a-z0-9]+)+)\b/);
        if (!sels) return;
        const cls = sels[1];
        const parts = cls.split('-');
        if (parts.length < 2) return;
        const prefix = parts.slice(0, 2).join('-');
        if (!fams[prefix]) fams[prefix] = { classes: new Set(), firstLine: i };
        fams[prefix].classes.add(cls);
        if (i < fams[prefix].firstLine) fams[prefix].firstLine = i;
      });
      let uncited = 0;
      Object.keys(fams).forEach((prefix) => {
        const f = fams[prefix];
        if (f.classes.size < 3) return;   // 1-2 classes = utility, not a component
        const ctx = lines.slice(Math.max(0, f.firstLine - 6), f.firstLine + 1).join('\n');
        // TIGHTENED 2026-09-01 (self-citation loophole): bare "DS "/"design
        // system" wording no longer counts — it let a comment cite another
        // CSS class ("clones .rd-relg-samebtn... DS list-footer grammar") as
        // provenance. A citation must name a Figma node/component (or be a
        // verbatim/production-matched asset). Legacy re-baselined same day.
        if (!/Figma|verbatim|production match/i.test(ctx)) uncited++;
      });
      return uncited;
    }
  },
  {
    id: 'icon-font',
    why: 'Inline SVG only — icon fonts fail in Figma captures (CLAUDE.md rule 2). Hard zero.',
    hardZero: true,
    count: (src) => (src.match(/material-symbols|material-icons|font-?awesome|class="fa fa-/gi) || []).length
  }
];

function loadBaseline() {
  try { return JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8')); } catch { return {}; }
}
function saveBaseline(b) {
  fs.writeFileSync(BASELINE_PATH, JSON.stringify(b, null, 2) + '\n');
}

// Returns { violations: [{id, why, was, now}], updated } and manages the ratchet.
export function checkDoctrine(filePath, src) {
  // Key by Optimal-prefix + basename: root inventory.html and
  // Optimal/inventory.html collided on one baseline entry (found 2026-08-11).
  const _dir = path.basename(path.dirname(filePath));
  const key = (_dir === 'Optimal' ? 'Optimal/' : '') + path.basename(filePath);
  const baseline = loadBaseline();
  const fileBase = baseline[key] || null;
  const counts = {};
  const violations = [];
  for (const rule of RULES) {
    const n = rule.count(src);
    counts[rule.id] = n;
    if (rule.hardZero) {
      if (n > 0) violations.push({ id: rule.id, why: rule.why, was: 0, now: n });
      continue;
    }
    if (fileBase && n > (fileBase[rule.id] ?? 0)) {
      violations.push({ id: rule.id, why: rule.why, was: fileBase[rule.id] ?? 0, now: n });
    }
  }
  if (!violations.length) {
    // Initialize new files; ratchet DOWN improved counts. Never loosen.
    const next = { ...(fileBase || {}) };
    let dirty = !fileBase;
    for (const rule of RULES) {
      if (rule.hardZero) continue;
      if (!(rule.id in next) || counts[rule.id] < next[rule.id]) { next[rule.id] = counts[rule.id]; dirty = true; }
    }
    if (dirty) { baseline[key] = next; saveBaseline(baseline); }
  }
  return violations;
}

// CLI: node doctrine-check.mjs <file.html> [...]
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  let failed = false;
  for (const f of process.argv.slice(2)) {
    let src;
    try { src = fs.readFileSync(f, 'utf8'); } catch { continue; }
    const v = checkDoctrine(f, src);
    if (v.length) {
      failed = true;
      console.error(`✗ doctrine violations in ${path.basename(f)}:`);
      for (const x of v) console.error(`    ${x.id}: ${x.was} → ${x.now}. ${x.why}`);
    } else {
      console.log(`doctrine-check: OK (${path.basename(f)})`);
    }
  }
  process.exit(failed ? 1 : 0);
}
