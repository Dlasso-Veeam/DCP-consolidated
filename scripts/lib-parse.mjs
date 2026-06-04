// lib-parse.mjs — single source of truth for the prototype JS syntax check.
// Used by both scripts/parse-check.mjs (CLI) and scripts/hook-precheck.mjs
// (PostToolUse hook) so the two can never disagree about whether a file parses.
//
// Strips HTML comments first (so a "<script>" written in prose inside a comment
// is not mis-parsed as a code block — the long-standing false positive), then
// compiles each real <script>…</script> block in script context with vm.Script.
// Compile-only: nothing runs, so it's instant and side-effect free.

import vm from 'node:vm';

export function parseHtmlScripts(src) {
  const noComments = src.replace(/<!--[\s\S]*?-->/g, '');
  const blocks = [...noComments.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const errors = [];
  let n = 0;
  for (const body of blocks) {
    n++;
    try {
      new vm.Script(body, { filename: `block${n}.js` });
    } catch (e) {
      errors.push({ block: n, message: e.message });
    }
  }
  return { blockCount: n, errors };
}
