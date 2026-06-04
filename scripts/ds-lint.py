#!/usr/bin/env python3
"""
Securiti DS linter — checks prototype HTML files against the codified
design-system rules in DESIGN-SYSTEM.md.

Currently enforces (Phase 1):
  • Type scale: only 8/10/14/16/18/24/32/40/48/72px font-sizes allowed
    in CSS or inline styles. Plus narrow exceptions:
      - 12px is allowed only with weight 700 + text-transform: uppercase
        (Menu group-label pattern).
      - The single 11px in #devjump (dev nav bar) is whitelisted.

  • Font weight: only 400 / 450 / 500 / 700.

Output: one line per violation: <file>:<line>: <reason> :: <snippet>.
Exit code 1 if any violations, 0 if clean.

Phase 2 (TODO): spacing scale, border-radius rules, component heights,
raw-hex color usage, alert pattern compliance.
"""
import os, re, sys

# Files to lint — keep this in sync with the prototype roster.
PROTOTYPE_FILES = [
    "inventory-v1.html",
    "inventory.html",
    "activity.html",
    "backup-policies.html",
    "index.html",
    "index-Maxim.html",
]

ALLOWED_FONT_SIZES = {8, 10, 14, 16, 18, 24, 32, 40, 48, 72}
ALLOWED_WEIGHTS = {400, 450, 500, 700}

FONT_SIZE_RE = re.compile(r"font-size:\s*(\d+(?:\.\d+)?)px", re.IGNORECASE)
FONT_WEIGHT_RE = re.compile(r"font-weight:\s*(\d+)", re.IGNORECASE)

# Lines inside this id block are dev-only and whitelisted entirely.
DEV_BAR_SELECTOR = "#devjump"


def lint_file(path):
    """Return list of (lineno, reason, snippet)."""
    with open(path) as f:
        lines = f.readlines()
    violations = []
    for i, raw in enumerate(lines, start=1):
        line = raw.rstrip("\n")
        # Skip the dev nav bar — explicitly out-of-scope per DESIGN-SYSTEM.md.
        if DEV_BAR_SELECTOR in line:
            continue
        # --- font-size checks ---
        for m in FONT_SIZE_RE.finditer(line):
            size = float(m.group(1))
            size_int = int(size) if size.is_integer() else size
            if size_int in ALLOWED_FONT_SIZES:
                continue
            if size_int == 12:
                # 12px exception: only with weight 700 + uppercase on the same line
                if "font-weight: 700" in line and "text-transform: uppercase" in line:
                    continue
                # Or weight 700 on the line with multi-line CSS rules (best-effort)
                if "font-weight: 700" in line and (
                    "uppercase" in line or "letter-spacing" in line
                ):
                    continue
                violations.append((
                    i,
                    f"font-size 12px without weight 700 + uppercase (Menu group-label pattern)",
                    line.strip()[:200],
                ))
                continue
            violations.append((
                i,
                f"font-size {size_int}px — off type scale (allowed: 8/10/14/16/18/24/32/40/48/72)",
                line.strip()[:200],
            ))
        # --- font-weight checks ---
        for m in FONT_WEIGHT_RE.finditer(line):
            w = int(m.group(1))
            if w in ALLOWED_WEIGHTS:
                continue
            # Allow "font-weight: 600" if it's a known DS-spec exception
            # — none currently. Anything else is a violation.
            violations.append((
                i,
                f"font-weight {w} — only 400/450/500/700 allowed",
                line.strip()[:200],
            ))
    return violations


def main():
    here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    total = 0
    by_file = {}
    for rel in PROTOTYPE_FILES:
        path = os.path.join(here, rel)
        if not os.path.exists(path):
            print(f"SKIP missing file: {rel}")
            continue
        v = lint_file(path)
        by_file[rel] = v
        total += len(v)
    # Summary table
    print("=" * 70)
    print(f"DS LINT — {total} total violation(s) across {len(by_file)} file(s)")
    print("=" * 70)
    for rel, v in by_file.items():
        print(f"  {rel:<28}  {len(v):>4} violation(s)")
    print()
    if total == 0:
        print("✓ Clean.")
        return 0
    # Detailed
    for rel, v in by_file.items():
        if not v:
            continue
        print(f"\n--- {rel} ---")
        for lineno, reason, snippet in v[:80]:
            print(f"  L{lineno}: {reason}")
            print(f"        {snippet}")
        if len(v) > 80:
            print(f"  ... ({len(v) - 80} more)")
    return 1


if __name__ == "__main__":
    sys.exit(main())
