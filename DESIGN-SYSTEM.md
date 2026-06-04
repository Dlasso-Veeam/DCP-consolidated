# Securiti Design System — Codified Rules

_Verified 2026-05-28 from live Figma file `out0snNz1zJyn7xjsY75dS` via REST API. Update via the REST API + `scripts/ds-lint.py`, never by hand from a memory file._

These are the **machine-checkable** rules the linter enforces. Anything not on these lists is a violation. Run `python3 scripts/ds-lint.py` to verify all 6 prototype files.

---

## 1. Type scale

**Only these font-sizes are allowed anywhere in CSS or inline styles:**

```
8px · 10px · 12px · 14px · 16px · 18px · 24px · 32px · 40px · 48px · 72px
```

- `12px` is allowed **only** in combination with `font-weight: 700` AND `text-transform: uppercase` (Menu group-label pattern). Otherwise 12px is a violation.
- `10px` is allowed only on Avatar-Mini text and Menu error-detail rows (rare, narrow exception).
- `8px` is allowed only on Avatar-Mini (20×20px).

Anything else (`11px`, `13px`, `15px`, `17px`, `19px`, `20px`, `22px`, `26px`, etc.) is a violation.

## 2. Font weights

**Only these weights:** `400`, `450`, `500`, `700`

- `450` is body default (Circular Pro)
- `500` is interactive emphasis (buttons, headings, table-cell body)
- `700` is menu group labels and bold emphasis
- `400` is reserved for fine captions

## 3. Component-specific font (verified from live Figma 2026-05-28)

| Component | Required size · weight |
|---|---|
| Button (any size: 28/36/44px) | **16px · 500** |
| Button Link variant | 14px · 450 |
| Chip — **Small** (h=16px) | 14px · 450 |
| Chip — **Medium** (h=20px) | 14px · 450 |
| Chip — **Default** (h=28px) | 16px · 500 |
| Text Input (28/36/44px) | 16px · 500 |
| Text Input label | 14px · 450 |
| Text Area | 16px · 450 |
| List Item primary | 16px · 450 |
| Table Cell body (all 5 sizes) | 16px · 500 |
| Table Cell header (Default/Sorted) | 14px · 450 / 14px · 500 |
| Alert text | 16px · 450 |
| Toast Line 1 (title) | 16px · 500 |
| Toast Line 2 (body) | 16px · 450 |
| Modal heading | 24px · 500 |
| Modal body | 16px · 450 |
| Dialog heading | 18px · 500 |
| Dialog body | 16px · 450 |

> **Choosing Modal vs Dialog (verified 2026-05-28 from live Figma):**
> The DS has two distinct overlay components — pick by width, not by what you call it in the code.
> - **Modal** (`out0snNz1zJyn7xjsY75dS` page `18429:55080`) — widths **780 / 1200 / 1328px**. Heading 24px / 500.
> - **Dialog** (page `20299:128459`) — width **548px** (with a 580px wrapper). Heading **18px / 500**. Variants: Information, Confirm, Danger.
>
> If a prototype overlay is in the 500–660px range, it's a Dialog. Use 18px heading. If it's 780px+, use 24px. Don't apply Modal 24px to a Dialog-sized container — the heading visually crowds the body in the narrow width.
| Tooltip title | 16px · 500 |
| Tooltip body | 14px · 450 |
| Selection label | 16px · 450 |
| Menu item | 14px · 450 |
| Menu group label | 12px · 700 (uppercase) |
| Menu error detail | 10px · 450 |
| Breadcrumbs | 14px · 450 |
| Pagination page number | 16px · 500 |
| Info Card header | 16px · 450 |
| Info Card value | 24px · 500 |
| Info Card unit | 14px · 450 |
| Upload text | 18px · 450 |
| Avatar Mini (20px) | 8px · 700 |
| Avatar Small (28px) | 14px · 450 |
| Avatar Default (36px) | 16px · 450 |
| Avatar Medium+ (44/52/60/68px) | 18px · 450 |
| Metadata Title | 18px · 500 |
| Metadata Subtitle | 16px · 450 |

## 4. Spacing scale

**Only these padding/gap/margin values:** `0, 2, 4, 8, 12, 16, 24, 32, 48, 64px`

- `2px` is reserved for borders / hairline insets.
- Off-scale values (5, 6, 10, 14, 20, 28, etc.) are violations.

## 5. Border radius

| Radius | Allowed on |
|---|---|
| `0` | square cells |
| `2px` | inner highlight only |
| `4px` | buttons, inputs, the filter-field container, **and chips on the `Label` radius token** (status / type / existence / tag labels) |
| `8px` | cards, alerts, modals, dialogs, drawers, panels |
| `100px` / `999px` | **chips on the `chip` radius token** (counts, quantities, removable/selectable tokens), pills |
| `50%` | avatars, circular indicators |

> ✅ **Verified from live Figma 2026-06-03 (corrects an earlier mis-read):** the `New Components / Chip` corner radius is bound to a **radius token with two options — `Label` = 4px and `chip` = pill (100px)** — switchable per instance via the Appearance panel ("dynamic-radius"). It is **not** a variant axis, which is why a raw geometry dump shows only the default (pill) and why my first pass wrongly concluded "pill only." **Both radii are correct; choose by role** (see §5a). A REST `cornerRadius` dump alone is insufficient — check the radius variable binding.

Anything else (`3px`, `5px`, `6px`, `10px`, `12px`, `16px`) is a violation.

## 5a. Chip — the only small-label component (verified from live Figma 2026-06-03)

There is **no "Badge" component** in the DS. Every inline label / tag / status pill / count is the single `New Components / Chip` (key `80a49b75a1392852b25348273444cd5011fa2525`). It has **two radius tokens — pick by role**:

**Pick the radius token by FUNCTION, not by content** (matches the token names):

| Radius token | Shape | Use for |
|---|---|---|
| **`Label`** | 4px | **Static / informational** — a value you *read*, not act on: status (Active/Protected), type (Folder/User), existence (Deleted/Added), tags (SaaS/Bronze), **and count/contents summaries** ("14 members", "14 repositories"). This is the default for in-table/in-card data chips. |
| **`chip`** | pill (100px) | **Interactive** — something you *act on*: filter chips, removable/selectable tokens, multi-select. The pill shape signals an affordance, not a value. |

> Rule of thumb: **if it just shows data → `Label` (4px); if you click/remove/select it → `chip` (pill).** "Has a click-to-drill" does NOT make a value chip interactive — a Contents count is still a Label even though clicking it drills (the row name owns navigation). Most chips in our tables are informational, so they're Labels.

Verified axes & specs (Figma 2026-06-03):
- **Variant axes:** `Type` (Default/Grey/Blue/Green/Teal/Orange/Gold/Red/Purple/Dark Purple/Dark Blue) · `Mode` (Light/Outline/Dark) · `Size` (Small/Medium/Default) · `State`.
- **3 sizes:** `Small` (h16, 14px·450) · `Medium` (h20, 14px·450) · `Default` (h28, 16px·500). Dense tables → Small/Medium.
- **Text case:** normal — `textCase: None`. **Never uppercase** a chip (Okta `ACTIVE` → display `Active`).
- **Modes:** `Light` = tinted fill, no border · `Outline` = tinted fill **+** matching colored stroke.
- **Type tints (Light):** Default/Grey `#f8f8f9` · Blue `#f3fafd` · Green `#eff6ea` · Teal `#f1faf9` · Orange `#fef1ea` · Gold `#fbf5e0` · Red `#fbeeec` · Purple `#f2e8f2` · Dark Purple `#eae8f4` · Dark Blue `#eaf0fb`. Padding `0 8px`; height fixed by size.

**Implication for the prototypes:** the 4px label classes (`.badge`, `.ex-badge`, `.res-type`, `.tag`, `.okta-pill`) are correct as **`Label`-radius chips**; `.contents-chip` (counts) is correctly a **`chip`-radius pill**. Both are legitimate — they are the one Chip component at its two radius tokens, chosen by purpose. Keep labels at 4px, counts/tokens at pill; just keep font (14/450 small-med) and **normal case** consistent.

## 6. Component heights

**Interactive elements (buttons, inputs, list items, single-line cells):**
- `28px` (small)
- `36px` (medium)
- `44px` (default)

**Table cells (specialized):** `32 / 40 / 48 / 56 / 64px`
**Avatars:** `20 / 28 / 36 / 44 / 52 / 60 / 68px`

Off-scale heights (32 outside table cells, 26, 30, 40 outside cells, etc.) are violations.

## 7. Colors

- Every color in CSS rules MUST be a CSS variable from the `:root` block.
- Raw hex (`#1ca8dd`) inside a CSS rule body or inline `style="…"` is a violation.
- Exceptions: hex inside SVG `fill="…"` / `stroke="…"` attributes, brand colors clearly comment-marked (GitHub `#24292e`, Jira `#205081`, etc.), `:root` definitions themselves.

## 8. Alert pattern

- Full 1px border on all 4 sides (no left-stripe / no left-bar).
- Tinted background (color-S10) + matching border (color-S30).
- `border-radius: 8px`.
- Icon (16×16px SVG) + bold title on same row, `gap: 8px`.
- Body indented `padding-left: 24px` (= 16px icon + 8px gap).
- Title + body: `color: var(--black-100)`.

## 9. Iconography

- All icons inline SVG with `fill="currentColor"` (or `stroke="currentColor"`) so color inherits.
- No icon fonts (Material Symbols, Material Icons, Font Awesome).
- Icon sizes per component: 16px (default), 12px (small), 24px (large).

---

## Source of truth

This file is **derived** from the canonical Figma library `out0snNz1zJyn7xjsY75dS`. If Figma diverges from this file, re-run the audit via REST API and update **this file first**, then the linter.

Memory references:
- Type-scale tokens: `~/.claude/projects/-Users-d-lasso/memory/design-system-tokens.md`
- Component specs (verified 2026-05-28): `~/.claude/projects/-Users-d-lasso/memory/design-system-components.md`
- Linter: `scripts/ds-lint.py`
