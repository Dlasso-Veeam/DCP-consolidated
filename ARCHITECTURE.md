# Veeam Data Cloud — Onboarding Prototype Architecture

**Audience:** AI coding agents picking up this prototype to extend it.
**Style:** Rule-forward. Read sections 0 and 9 before writing any code.

---

## Table of Contents

0. [Read this first](#0-read-this-first)
1. [File map and mental model](#1-file-map-and-mental-model)
2. [The wizard flow](#2-the-wizard-flow)
3. [The `WORKLOADS` extension API](#3-the-workloads-extension-api)
4. [Auth screen architecture](#4-auth-screen-architecture)
5. [Test Connection architecture](#5-test-connection-architecture)
6. [Picker substep patterns](#6-picker-substep-patterns)
7. [Inventory architecture](#7-inventory-architecture)
8. [Restore architecture](#8-restore-architecture)
9. [Cross-cutting rules — read before writing code](#9-cross-cutting-rules--read-before-writing-code)
10. [Design system conventions](#10-design-system-conventions)
11. [Adding a new workload — checklist](#11-adding-a-new-workload--checklist)
12. [Pitfalls log](#12-pitfalls-log)
13. [Grep recipes](#13-grep-recipes)

---

## 0. Read this first

This is a **single-file-per-screen vanilla HTML prototype**, not a framework app. Each top-level HTML file is self-contained: it inlines all CSS, JS, mock data, and state. There is **no build step, no framework, no shared module system, no package.json**.

The three files (`index.html`, `inventory.html`, `backup-policies.html`) simulate connected views of one product, but they share **no runtime state**. State that needs to "flow" between them is faked via:

- localStorage persistence (`localStorage.getItem/setItem`) for things like policy choice
- Convention: each prototype owns its own seed data shaped to match what would arrive from the real backend

**This means:** when a contract changes (e.g., a new workload, a new categorization rule), you may need to edit **all three files**. There is no single source of truth across them. Treat them as siblings, not as a layered architecture.

### Hard rules (violating these breaks things)

1. **Use existing components. Do not invent new variants.** If you're tempted to write a new drawer, alert, button, or table, find the existing one first. The user has corrected this repeatedly. (§9)
2. **CSS variables only — never raw hex.** Use `var(--blue-100)`, `var(--orange-10)`, etc. Defined in `<style>` `:root` at the top of each file. (§10)
3. **Inline SVG only — no icon fonts.** Material Symbols / Font Awesome / etc. fail in Figma capture and render inconsistently. Use `<svg>` with `fill="currentColor"` or `stroke="currentColor"`. (§10)
4. **Tooltips: `data-tooltip` only — never `title=`.** The `title` attribute produces native browser pop-ups that don't match the rest of the product. (§10)
5. **Verify rendered DOM, not just the data array.** Renderers in this codebase are often hardcoded to a fixed row shape. Mutating an array without checking the renderer's loop is a recurring failure. (§12)
6. **Per-workload behavior via flags on the WORKLOADS dict, not JS conditionals — when possible.** Conditionals are acceptable when the behavior is genuinely one-off; flags are required when other workloads might want the same behavior later. (§3, §9)

### Where to start when extending

- Adding a new connector → §3 + §11
- Changing copy on an existing workload → §3 (look up the field name first)
- Touching the auth screen → §4
- Touching the test-connection screen → §5
- Touching the inventory tree-nav or columns → §7
- Touching the restore drawer (preview / comparison / restore-points) → §8 — **and read it twice before writing**

---

## 1. File map and mental model

```
saas-onboarding/
├── index.html              ~9k lines    Onboarding wizard (catalog → splash → wizard → summary)
├── inventory.html          ~26k lines   Inventory tree-nav + restore wizard + drawers
├── backup-policies.html    ~?k lines    Policy management (separate flow)
└── ARCHITECTURE.md         this file
```

### What each file owns

**`index.html` — onboarding**
- The catalog page (workload picker)
- The wizard (basic info → applications? → auth → test → pickers → region → protection → summary)
- The post-create summary / overview
- The `WORKLOADS` dict (the extension API — see §3)

**`inventory.html` — inventory & restore**
- The inventory view (tree-nav, drill-downs, search, filters, temporal "Browse as of" picker)
- The restore wizard (cart, configure, summary)
- All drawers: preview, comparison, restore-points (these are **one drawer with three modes**, not three drawers — see §8)
- All seed data for resources (`RESOURCES`, `D365_SCHEMAS`, etc.)
- The `CATEGORIES` config (per-workload inventory categorization)

**`backup-policies.html` — policy management**
- Separate prototype. Has its own seed data and chrome.
- Touched lightly during workload rounds (mostly sample-name updates).

### Mental model

Each HTML file is a **state machine driving DOM**:
- All screens live in DOM as `<div class="screen" id="screen-X">` simultaneously
- A single `.active` class toggles which screen is visible
- `goTo(screenName)` flips the active screen
- Per-screen render functions are called when the screen activates (or whenever state changes that affect it)

There is no virtual DOM and no reactivity. Render functions read state and rewrite the relevant DOM region. The code is **imperative**, not declarative.

---

## 2. The wizard flow

```
catalog (catalog cards)
   ↓ selectWorkload(wlKey)
splash (left dark panel + right marketing copy)
   ↓ Get started
basic-info (Connection name + owners)
   ↓ Continue
applications  (requiresApplicationStep only — PP)
   ↓
auth (Express + Manual tiles, "Before you connect" alert, in-tile callouts)
   ↓ Connect
test-conn (connectivity stage → capability rows in parallel)
   ↓ Continue
[picker substep, ONE of:]
   environments      (requiresEnvList — D365, PP)
   workspaces        (requiresWorkspaceList — Google Workspace pattern; check current uses)
   gitlab-groups     (requiresGroupList — GitLab)
   ado-orgs          (requiresOrgList — Azure DevOps, but UX is single-select org URL)
   confluence-sites  (requiresSitePicker — Confluence multi-site OAuth)
   confluence-spaces (requiresSpacesList — Confluence spaces)
   ↓
[no picker → skip directly]
   ↓
infra-storage (Region & Storage)
   ↓ Continue
[scope — currently skipped via hideScopeStep on all workloads]
   ↓
protect (Apply standard policy | Set up policy later)
   ↓ Save and continue → createConnection()
overview (Summary card + recommended next steps)
```

### Screen IDs

| ID | Purpose | Conditional? |
|---|---|---|
| `screen-catalog` | Workload picker | Always |
| `screen-splash` | Welcome / marketing | Always |
| `screen-welcome` | (Legacy — check usage) | — |
| `screen-basic-info` | Connection name | Always |
| `screen-applications` | Pre-auth app picker | `requiresApplicationStep` |
| `screen-auth` | Express / Manual | Always |
| `screen-test-conn` | Connectivity + capability checks | Always |
| `screen-environments` | Multi-env picker | `requiresEnvList && !inlineProvisioning` |
| `screen-workspaces` | Multi-workspace picker | `requiresWorkspaceList` (or Power BI in PP) |
| `screen-gitlab-groups` | GitLab top-level group picker | `requiresGroupList` |
| `screen-ado-orgs` | ADO org picker | `requiresOrgList` |
| `screen-confluence-sites` | Multi-site picker | `requiresSitePicker` |
| `screen-confluence-spaces` | Spaces picker | `requiresSpacesList` |
| `screen-infra-storage` | Region & Storage | Always |
| `screen-scope` | Scope & Fields | `!hideScopeStep` (currently hidden everywhere) |
| `screen-protect` | Policy choice | Always |
| `screen-overview` | Post-create summary | Always |
| `screen-permissions` | (Static success page — legacy) | — |
| `screen-inventory` | (Stub in index.html; real one is in inventory.html) | — |
| `screen-stats` | (Stats stub) | — |

### Flow control

- `goTo(screenName)` activates a screen
- `advanceFromAuth()`, `advanceFromProtect()`, etc. encode the per-step routing logic
- Substep order between auth and infra-storage is driven by the workload flags; the sidebar substep builder mirrors that logic

---

## 3. The `WORKLOADS` extension API

`WORKLOADS` is the dict at `index.html` ~line 7880 that defines every connector. **It is the primary extension point of this codebase.**

```js
var WORKLOADS = {
  github: { /* ... */ },
  d365:   { /* ... */ },
  pp:     { /* ... */ },
  gitlab: { /* ... */ },
  'azure-devops': { /* ... */ },
  confluence: { /* ... */ },
};
```

### Identity & visuals

| Field | Type | Purpose |
|---|---|---|
| `name` | string | User-facing name (e.g., "Microsoft Power Platform") |
| `tag` | string | Vendor / category tag (e.g., "Microsoft Cloud") |
| `category` | string | Catalog section label |
| `desc` | string | Catalog right-panel description |
| `protected` | string[] | "What's Protected" pills |
| `prereqs` | string[] | Minimum requirements list |
| `icon` | string (SVG) | Connector logo (used in catalog tile, headers, etc.) |
| `iconBg` | string (CSS color) | Background of the icon tile |
| `expressIcon` | string (SVG) | Icon inside the "Authorize with X" Express button |

### Welcome splash

| Field | Type | Purpose |
|---|---|---|
| `splashHero` | object | Left dark panel of welcome/splash screen. See below. |
| `splashHero.title` | string (HTML) | Headline (`<br>` allowed) |
| `splashHero.desc` | string | Subhead |
| `splashHero.bullets` | string[] | Value props (rendered with green checkmarks) |

Fallback: if `splashHero` is omitted, a `DEFAULT_SPLASH_HERO` renders.

### Auth screen labels

| Field | Type | Purpose |
|---|---|---|
| `expressLabel` | string | Text on the Express CTA button |
| `defaultInstanceName` | string | Seed value for the Connection name input |
| `connectedTitle` | string | Post-OAuth connected-state title |
| `connectedSubtitle` | string | Post-OAuth connected-state subtitle |
| `changeLabel` | string | Text on the "Change org" / "Change site" button |
| `defaultRegion` | string | Pre-selected region on Region & Storage |

### Auth model flags

| Field | Type | When true |
|---|---|---|
| `manualCertSupport` | bool | Manual auth supports certificate (vs. only secret) |
| `manualCertUsesPfx` | bool | Cert is a single `.pfx` (vs. `.cer` + Veeam-held key). ADO + PP. |
| `requiresTenantId` | bool | Manual form reveals a Tenant ID input |
| `requiresOrganizationUrl` | bool | Manual form reveals an Organization URL input (ADO) |

### Substep / picker flags

| Field | Type | When true |
|---|---|---|
| `requiresApplicationStep` | bool | Show pre-auth Applications picker (PP — picks Power Platform / Power BI) |
| `applicationOptions` | object[] | Cards rendered on the Applications step. See below. |
| `requiresEnvList` | bool | Show Environments substep + env-row on test-conn |
| `requiresWorkspaceList` | bool | Show Workspaces substep |
| `requiresGroupList` | bool | Show GitLab Groups substep |
| `requiresOrgList` | bool | Show ADO Orgs substep (currently routes to single-select org URL UX) |
| `requiresSitePicker` | bool | Show Confluence Sites picker |
| `requiresSpacesList` | bool | Show Confluence Spaces picker |

`applicationOptions[]` shape:
```js
{ id, label, desc, defaultSelected, primary?, iconBg, icon }
```
Used by PP to let the admin pick Power Platform vs Power BI vs both, which downstream gates env-list visibility, Power BI prereqs bullet, etc.

### Auth pipeline flags

| Field | Type | Effect |
|---|---|---|
| `requiresPostAuthPropagation` | bool | Adds the propagation row (`tc-perm-row-prop`) to the test-conn sequence — Entra SP propagation simulation. Microsoft workloads. |
| `inlineProvisioning` | bool | D365 only. Per-env provisioning happens on the Environments substep instead of the test-conn aggregate row. Hides the test-conn env-row. |
| `envAdminRoleLabel` | string | Used by the "Before you connect" alert and the env-row failure copy (e.g., "Power Platform System Administrator"). |

### Test Connection flags

| Field | Type | Effect |
|---|---|---|
| `permissionCheckRows` | object[] | Capability rows for the test-conn screen. Replaces the default 4-row generic checks. See §5 schema. |
| `hidePermRowChevrons` | bool | PP only. Capability + propagation rows lose their chevron + click-to-expand affordance. The env row keeps its chevron. |
| `envRowTitle` | string | Overrides default "Environment Connection" wording on the env-aggregate row. |
| `envRowSubtitle` | string | Static subtitle pinned to the env-row (instead of state-aware "Validating connection to N environments" wording). |
| `envRowSuppressInlineFailureDetail` | bool | Hides the dense red failure paragraph under the env-row. PP routes failure context to the per-env badge tooltip instead. |
| `envRowFailureBadgeTooltip` | string | Tooltip copy for the per-env Failed pill (when `envRowSuppressInlineFailureDetail` is set). Supports `\n` for line breaks. |
| `hideScopeStep` | bool | Skips the Scope & Fields configure substep. Currently set on every workload — the step is parked. |

### Help drawer

| Field | Type | Purpose |
|---|---|---|
| `helpContent` | string (HTML) | Long-form help, rendered in the right-side help drawer. Should cover Express, Manual, scopes, prereqs. |

### What's NOT a flag

- **Per-screen copy variations** (Express subhead, body text, etc.) are currently driven by JS conditionals on `wl === 'github'`, etc. **Promote to a flag if more than one workload needs the same override.** See §9.
- **Picker substep order**: implicit in `advanceFromAuth()` / sidebar builder. There's no `substepOrder` array.

---

## 4. Auth screen architecture

The auth screen (`screen-auth`) has a stable shell with three workload-dependent regions:

```
┌─────────────────────────────────────────────────┐
│ Wizard header (workload name)                   │
├─────────────────────────────────────────────────┤
│ Title: "Connect to {name}"                      │
│ Subtitle: "Choose how Veeam authenticates..."   │
├─────────────────────────────────────────────────┤
│ [Reconsent banner — hidden in normal flow]      │
├─────────────────────────────────────────────────┤
│ [#prereqs-alert — orange "Before you connect"]  │
│   • Workload-specific bullets                   │
├─────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────┐ │
│ │ Express tile (selected by default)          │ │
│ │   • 3-4 checkmarks (workload-overridable)   │ │
│ │   • [#express-perenv-note] (info callout)   │ │
│ │   • [#express-admin-note] (orange callout)  │ │
│ │   • CTA: "Authorize with {workload}"        │ │
│ └─────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────┐ │
│ │ Manual tile (collapsed by default)          │ │
│ │   • [#manual-perenv-note] (orange callout)  │ │
│ │   • Tenant ID? / Client ID / Secret or Cert │ │
│ └─────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
```

### Workload-aware copy hooks

All of these are populated by `selectWorkload(wl)` in `index.html`:

| DOM ID | What it is | How to override per workload |
|---|---|---|
| `#auth-title` | "Connect to X" | Built from `w.name` |
| `#auth-subtitle` | Body copy under title | JS conditional on `wl` (see GitHub example) |
| `#express-desc` | Express tile subhead | JS conditional on `wl` |
| `#express-benefit-{1..4}` | The 4 green checkmarks | JS conditional on `wl` |
| `#express-btn-label` + `#express-btn-icon` | CTA | `w.expressLabel` + `w.expressIcon` |
| `#prereqs-alert` (built from `#prereqs-list` bullets) | Shared alert above both tiles | Push bullets in the `wl ===` branch inside `selectWorkload` |
| `#express-perenv-note` | Info callout inside Express tile | Show when `w.requiresEnvList` |
| `#express-admin-note` | Orange callout inside Express tile | Show for ADO + GitHub (extend by adding `wl ===` check) |
| `#manual-perenv-note` | Orange callout inside Manual tile | Show when `requiresEnvList \|\| wl === 'azure-devops' \|\| wl === 'github'` |
| `#manual-tenant-id` | Tenant ID input | Shown when `w.requiresTenantId` |
| `#manual-org-url` | Organization URL input | Shown when `w.requiresOrganizationUrl` |
| `#cred-cert-section` | `.cer`-only upload | When `manualCertSupport && !manualCertUsesPfx` |
| `#cred-cert-pfx-section` | `.pfx` upload + opt-in passphrase | When `manualCertUsesPfx`. Copy varies per workload via `applyPfxWorkloadCopy(w)`. |
| `#cred-secret-section` | Client Secret input | Default for non-cert workloads |

### Adding workload-specific auth copy

```js
// Inside selectWorkload(wl):
if (wl === 'mynewconnector') {
  authSub.textContent = '...';                           // body
  expressDesc.textContent = '...';                       // Express subhead
  document.getElementById('express-benefit-1').textContent = '...';
  // ...
}
```

### Adding a "Before you connect" bullet

```js
// In selectWorkload, inside the prereqs-alert section:
if (wl === 'mynewconnector') {
  bullets.push('<strong>X role</strong> required for Y.');
}
```

### Single-bullet rendering

If only one bullet is pushed, the list renders as a paragraph (no bullet marker) — see the `bullets.length === 1` branch. This is intentional — bullet glyphs read as visual noise when there's nothing to enumerate.

### Express vs Manual in-tile callouts

Each callout has a title `<div>` (font-weight:700) and a body `<div>` (font-size:13px). Override per workload:

```js
// Inside selectWorkload:
if (wl === 'mynewconnector') {
  expressAdminNote.style.display = 'flex';
  expressAdminNoteTitle.textContent = 'Recommended: ...';
  expressAdminNoteBody.innerHTML = '...';
}
```

The selectors `div[style*="font-weight:700"]` and `div[style*="font-size:13px"]` find these scoped to the callout's `flex:1` wrapper.

### PFX section copy

`applyPfxWorkloadCopy(w)` (in `index.html`) swaps PFX section copy per workload. Branches on `currentWorkload === 'pp'` vs default (ADO). To add a new PFX-using workload, add a branch there.

---

## 5. Test Connection architecture

### Stages

```
1. Connectivity (top card)
     ├─ Spinner ring + "Testing connectivity..."
     └─ After ~2s: green check + "Connection successfully established."
2. Capability checks (lower card, parallel launches)
     ├─ Header: passed/total counter + dual-segment progress bar
     ├─ [Propagation row]  (requiresPostAuthPropagation)
     ├─ Capability row 0..N  (permissionCheckRows[i])
     └─ [Env-aggregate row] (requiresEnvList && !inlineProvisioning)
```

### Header math (universal)

- Counter shows **passed/total**, not completed/total
- Progress bar splits into two segments: green (`#tc-perm-bar`) for passed, orange (`#tc-perm-bar-fail`) for failed
- When all pass: 100% green / 0% orange. When 1-of-6 fails: ~83% green / ~17% orange.
- `updateProgress(didPass)` takes a pass/fail bool; both call sites pass the right value.

### `permissionCheckRows` schema

```js
permissionCheckRows: [
  {
    id: 0,                                   // numeric; sets which DOM row (tc-perm-row-0..5)
    title: 'Repository content',             // bold row label
    subtitle: 'Commits, branches, tags...',  // gray subtitle below title
    detail: 'GET https://... → 200 OK',      // shown in the expand panel (verification call)
    fix: 'In your App settings, ...',        // shown only when the row fails — remediation
    softWarn: false,                         // optional: if true, failure is a soft warning, not a block
  },
  // up to 6 rows total
]
```

Rules:
- Up to **6 capability rows** (DOM has slots `tc-perm-row-0` through `tc-perm-row-5`)
- Rows beyond `permissionCheckRows.length` are hidden + excluded from the row count
- `detail` is always rendered when the row is expanded; `fix` is rendered **only when state === 'fail'**

### Chevron behavior

- Default: any row with `detail` or `fix` shows a chevron + cursor:pointer + click-to-expand
- Workload-level `hidePermRowChevrons: true` suppresses chevrons on **capability + propagation rows** (PP only)
- The env-aggregate row's chevron (`#tc-env-chevron`) is **independent** — controlled by `toggleEnvRowExpanded`, not affected by the flag

### Env-aggregate row

For workloads with `requiresEnvList && !inlineProvisioning`:

- **Title:** "Environment Connection" by default. Override with `envRowTitle`.
- **Subtitle:** dynamic state-aware copy by default ("Validating connection to N selected environments" → "Connected to all N environments" → "Permissions check failed for X of Y"). Override with `envRowSubtitle` to pin a static workload-specific subtitle (PP).
- **Inline failure paragraph** (`#tc-perm-row-env-detail`): suppressed when `envRowSuppressInlineFailureDetail` is set. Failure context routes to the per-env badge tooltip via `envRowFailureBadgeTooltip`.
- **Per-env expandable panel** (`#tc-env-expanded`): rendered by `paintEnvExpanded(envs)`, lists each env with a Connected/Failed pill + Remove action.

### Failed-env badge tooltip

When `envRowFailureBadgeTooltip` is set, the per-env Failed pill carries `data-tooltip="..."`. Multi-line copy supported via `\n`. Uses the same styled floating bubble as `.info-tip` icons (see §10).

### Retry / Remove

- Footer Retry button: re-runs the entire sequence (`runTestConnectionSequence(true)`); `isRetry` flag suppresses the simulated failure.
- Per-env Remove button: drops that env from `d365SelectedEnvs` + repaints. If all failures are cleared, the row flips green + footer flips to Continue.

---

## 6. Picker substep patterns

There are five picker substeps (env / workspace / group / org / spaces). They share a common visual + interaction pattern but have separate state and HTML.

### Common pattern

```
┌────────────────────────────────────────────────┐
│ Intro: "We discovered N {nouns}..."            │
├────────────────────────────────────────────────┤
│ ┌──────────────────────────────────────────┐   │
│ │ Card 1: "Include all {nouns}" (Recommended) │
│ │   • Body: which types are auto-included   │
│ │   • Summary: "N nouns — X type, Y type"   │
│ └──────────────────────────────────────────┘   │
│ ┌──────────────────────────────────────────┐   │
│ │ Card 2: "Include selected {nouns}"        │
│ │   • Filter chips: [Type A 2/2] [Type B 1/3]│
│ │   • Toggle: "Auto-add new {nouns} matching│
│ │              the selected types above"    │
│ │   • Table with checkboxes                  │
│ └──────────────────────────────────────────┘   │
└────────────────────────────────────────────────┘
```

### State shape (env example)

```js
var ENV_STATE = {
  mode: 'all' | 'custom',                  // which card is active
  filters: Set<typeString>,                // which filter chips are selected
  manualSelections: Set<envId>,            // explicit selections (custom mode)
  autoAddFuture: bool,                     // toggle state
  // ...
};
```

Each picker has its own state constant: `ENV_STATE`, `WORKSPACE_STATE`, `GITLAB_GROUPS_STATE`, `ADO_ORGS_STATE`, `CONFLUENCE_SITES_STATE`, `SPACES_STATE`.

### Filter chips

- Multi-state: `full` (all of this type selected), `partial` (some), empty (none)
- Count badge: `selected/total`
- Tooltip on count: "X/Y — selected / total of this type" via `data-tooltip` (§10)

### Auto-add-future toggle

- Standalone state (e.g., `_envAutoAddFutureForFilters`)
- Captures the active filter-chip state at commit time so newly-discovered items matching those filters get auto-added on the next discovery cycle
- Tooltip on the help icon explains the contract

### Adding a new picker

If a new connector needs a picker that doesn't fit env/workspace/group/org/spaces, **strongly consider whether one of those archetypes fits first**. Adding a 6th picker means duplicating ~1k lines of HTML+JS+state. The user has been explicit about this — see "Pattern Discipline" in §9.

If you genuinely need a new picker:
1. Pick the most similar existing one
2. Clone the full HTML + state object + render function + filter logic
3. Update the `requires*List` flag + the screen ID + the state-object name
4. Wire it into the substep order via `advanceFromAuth` and the sidebar builder

---

## 7. Inventory architecture

(`inventory.html` — independent from `index.html`)

### Tree-nav

The left tree-nav has three structural concepts:

1. **Categories** — top-level groupings per workload (`CATEGORIES[workload]`)
2. **Folders** — drill-down levels (e.g., GitLab subgroup hierarchy, Confluence space → page tree)
3. **Buckets** — special pseudo-folders (e.g., "Deleted in Prod")

### Inventory table

The main table is driven by:
- **Columns** — `INV_COLUMNS_BY_CAT[catKey]` or fallback `INV_COLUMNS`. Per-category shape (Repository columns differ from Workspace columns).
- **Rows** — filtered subset of `RESOURCES` matching the active category + filters + temporal pin

### Drill-down

- Each tree-nav click invokes `drill.toggleRow(tableKey, rowId)`
- Composite IDs let synthetic levels (records, fields) coexist with real resources:
  - `rec-{schemaKey}-{idx}` for D365 records
  - `field-{schemaKey}~{idx}~{encodedFieldName}` for D365 fields
- Per-table registries (`inv`, `child`, `rec`, `gws`, `field`) keep state for each drill level

### Temporal "Browse as of" picker

- The chip at the top of inventory lets the user pin a past date
- Last Backup timestamps stay **unconditional** (they don't shift with the picker — see §12 pitfall)
- The picker pin affects which restore points are considered "current" and which items appear as "deleted in prod"

### Cart mode

- Multi-select across drills, persisted in `cartState`
- Cart pill renders in the tree-nav body above the first root
- Tree-nav cart badges (icon + count) on each branch reflect the cart contents

### Categories config

```js
var CATEGORIES = {
  github: [
    { key: 'repos',  label: 'Repositories',   icon: '...', primaryTypes: ['repo'] },
    { key: 'orgs',   label: 'Organizations',  icon: '...', primaryTypes: ['org'] },
    // ...
    { key: 'deleted', label: 'Deleted in Prod', icon: '...', primaryTypes: [] },  // pseudo-category
  ],
  // ...
};
```

The `deleted` pseudo-category bypasses normal cat/primary-type filters in `resourcePassesFilters` and instead matches by deletion state.

---

## 8. Restore architecture

### The drawer — one component, three modes

There is **one drawer** in `inventory.html`. It renders one of three modes:

```js
rdState.mode = 'compare';    // two-side diff (default)
rdState.mode = 'matches';    // restore-points list
rdState.mode = 'compare' + rdState.fieldScope = {...}; // field-scoped preview
```

**Do not create new drawer variants.** The user has been explicit about this. To add a new view, add a `mode` value or a state hint (like `fieldScope`) and branch inside `renderRdBody`.

### `rdState` shape

```js
var rdState = {
  resourceId, title, workload, meta,
  leftSel: 'prod', rightSel: null,            // which time-points are loaded into each pane
  leftDropOpen, rightDropOpen,                // picker popovers
  leftPickerYear/Month/Day, rightPickerYear/Month/Day,
  mode: 'compare' | 'matches',
  matchedRps: [],                              // restore points for 'matches' mode
  cameFromMatches: bool,                       // back-affordance flag
  fieldScope: { fieldName, recordName } | null, // filter body to one field
};
```

### Opening the drawer

- From inventory row name → `openResourceDrawer(id)` → `mode = 'compare'`
- From kebab "View restore points" → opens with `mode = 'matches'`
- From a Preview button on a field row → opens with `mode = 'compare'` + `fieldScope = {...}`

**CRITICAL:** Always reset `rdState.mode = 'compare'` and `rdState.cameFromMatches = false` at the start of `openRecordDrawer` (or equivalent entry points). Without this reset, a previously-opened matches view will leak into the next preview click. (See §12.)

### Field-scoped drawer

When `rdState.fieldScope` is set, `renderRdBody` filters `baseFields` to just the matching field row and prepends a header. The drawer chrome is otherwise unchanged. **Do not build a separate field drawer.**

### Pre-execution checks

Workload-driven via a config table (not hardcoded). Each workload's `preExecutionChecks` array drives the live ticker in the restore summary card. The check list is **workload-specific** — don't apply Confluence-style checks to GitHub.

### Restore reason

Optional Restore reason / description field in the restore config step. Renders in the summary card recap. State lives on `restoreConfig.reason`.

---

## 9. Cross-cutting rules — read before writing code

These are the rules established (often by the user correcting drift) across many rounds of work.

### Pattern discipline

1. **Use existing components. Don't invent variants.**
   - Before building a new drawer/alert/button/table, find the existing one. The user has corrected this multiple times: *"there shouldn't be more than one version of the preview drawer"*, *"this is just another drill-down level like everywhere else."*
   - When something looks slightly different from what exists, the answer is usually a flag or a mode on the existing component, not a new component.

2. **Per-workload behavior via flags, not JS conditionals — when possible.**
   - Acceptable conditionals: one-off copy ("Choose how Veeam connects to your GitHub organization") that's truly specific to one workload.
   - Unacceptable: any behavior where a second workload might plausibly want the same thing. Promote to a flag (`hidePermRowChevrons`, `envRowSubtitle`, etc.).
   - When in doubt, use a flag. The flag-driven path scales; the conditional doesn't.

3. **Verify rendered DOM, not just data.**
   - Renderers in this codebase are often hardcoded to a fixed row shape (e.g., `[permRow0..permRow3]`). Mutating the data array without checking the renderer's loop is a recurring failure mode. (§12)
   - When you add/change something, **load the page, drive the UI to the relevant state, and count DOM children**. Do not declare a fix complete based on the data being correct.

### Naming & structure

4. **Component heights are 28 / 36 / 44px. No intermediate values.**
5. **Spacing scale is 4 / 8 / 12 / 16 / 24px.** No 5/10/15/20/30.
6. **Border-radius:** 4px (buttons/inputs/chips) · 8px (cards/alerts/modals) · 50% (avatars).

### Copy

7. **Sentence case for screen titles** ("Connection test" not "Connection Test").
8. **Use CSS variables in inline styles too** — `var(--orange-10)` not `#fef1ea`.
9. **No emojis in code/docs unless explicitly requested.**

### Behavior

10. **Last Backup is unconditional.** It does not shift with the temporal picker. Deleted items anchor to 1-5 days before parsed deletion date. (§12)
11. **Tooltips: `data-tooltip` only.** Never `title=`. (§10)
12. **Icons: inline SVG with `stroke-linecap="round" stroke-linejoin="round"` on stroke-based icons.** (§10 + §12)

### Workload archetypes

The connectors loosely cluster into archetypes — recognize which one you're extending:

| Archetype | Members | Key flags |
|---|---|---|
| **Git-style** | GitHub, GitLab, Bitbucket?, ADO | OAuth-app auth, optional secret/PAT manual, org/group/repo scope |
| **Microsoft Cloud** | D365, PP, ADO | Entra OAuth2 + cert-or-secret SP, propagation row, env list, app reg |
| **Atlassian Cloud** | Confluence | 3LO OAuth + API token Manual, site picker, no cert auth |
| **SaaS account** | (Generic catch-all) | Single-account scope, no env list, no propagation |

When adding a new workload, pick the closest archetype and copy from there.

---

## 10. Design system conventions

The full design system reference lives in:
- `~/.claude/projects/-Users-d-lasso/memory/design-system-tokens.md`
- `~/.claude/projects/-Users-d-lasso/memory/design-system-components.md`

**Always read these before doing UI work.** This section summarizes the rules most likely to be violated.

### Colors

```css
/* Primary */
var(--blue-100)         /* #1ca8dd — primary action */
var(--black-100)        /* #1f2229 — primary text */
var(--black-60)         /* secondary text */
var(--layout-bg)        /* page background */
var(--form-bg)          /* input background */

/* Status */
var(--green) / --green-10 / --green-30        /* success */
var(--orange) / --orange-10 / --orange-30     /* warning */
var(--error) / --error-10 / --error-30        /* error */
```

**Never write raw hex.** Defined at `<style>:root` at the top of each HTML file.

### Typography

- Default body text: **14px / Circular Pro / weight 450**
- Captions: 12px / weight 400
- Labels/emphasis: weight 500
- Bold (700): only when explicitly requested
- Headings: ITC Avant Garde Gothic Std

### Icons

```html
<!-- correct -->
<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">...</svg>

<!-- wrong -->
<span class="material-symbols-outlined">search</span>
<i class="fa fa-search"></i>
```

- **Always inline SVG.** Never icon fonts.
- **`stroke-linecap="round" stroke-linejoin="round"`** on stroke-based icons — without these, short lines (like the "!" stem in the alert-triangle) don't render at small sizes.
- Use `fill="currentColor"` or `stroke="currentColor"` so the icon inherits parent color.

### Alert pattern

All four sides bordered (no left-stripe). Standard shape:

```html
<div style="background:var(--orange-10); border:1px solid var(--orange-30); border-radius:8px; padding:14px 16px; display:flex; align-items:flex-start; gap:8px">
  <svg width="16" height="16" ...>...</svg>
  <div style="flex:1">
    <div style="font-size:14px; font-weight:700; color:var(--black-100); margin-bottom:6px">Title</div>
    <div style="font-size:13px; color:var(--black-100); line-height:20px">Body</div>
  </div>
</div>
```

Color scheme per alert type:
| Type | bg | border | icon stroke |
|---|---|---|---|
| Information | `var(--blue-10)` | `var(--blue-30)` | `var(--blue-100)` |
| Success | `var(--green-10)` | `var(--green-30)` | `var(--green)` |
| Warning | `var(--orange-10)` | `var(--orange-30)` | `var(--orange)` |
| Error | `var(--error-10)` | `var(--error-30)` | `var(--error)` |

### Tooltip pattern

```html
<!-- correct: floating styled bubble -->
<span data-tooltip="Tooltip text">Anchor</span>

<!-- correct with optional .info-tip icon styling -->
<span class="info-tip" tabindex="0" data-tooltip="Help text" aria-label="More info">
  <svg width="14" height="14" ...>...</svg>
</span>

<!-- wrong: native browser pop-up doesn't match the product -->
<span title="Tooltip text">Anchor</span>
```

- The delegation in `index.html` (`setupInfoTooltips`) matches any `[data-tooltip]` element on hover/focus
- Multi-line: use `\n` in `data-tooltip` content; the JS applies `white-space: pre-line` automatically
- `.info-tip` class is the **circular help-icon styling** — independent of tooltip behavior. Use it only when you want the circular icon visual.

### Selected / active states — use shadow patterns

| Context | CSS |
|---|---|
| Selected list item | `box-shadow: inset 2px 0 0 var(--blue-100)` |
| Active tab | `box-shadow: inset 0 -2px 0 var(--green)` |
| Form input focused | `box-shadow: inset 0 0 0 1px var(--blue-100)` |
| Error tab | `box-shadow: inset 0 -3px 0 var(--error)` |

Never use background-only highlighting.

---

## 11. Adding a new workload — checklist

### Phase 1: minimal stub (catalog → connected)

1. **Add a catalog card** in `index.html` (around line 870):
   ```html
   <div class="cat-card" onclick="selectWorkload('mynewconnector')">
     <div class="cat-card-top">
       <div class="cat-icon" style="background:#hexcolor"><svg>...</svg></div>
       <span class="cat-card-name">My New Connector</span>
     </div>
     <div class="cat-card-desc">Back up X, Y, Z.</div>
   </div>
   ```

2. **Add a `WORKLOADS` entry** with the minimum required fields:
   ```js
   'mynewconnector': {
     name: 'My New Connector', tag: 'Vendor', category: 'Category',
     desc: 'Right-panel description.',
     protected: ['Pill 1', 'Pill 2', 'Pill 3'],
     prereqs: ['Requirement 1', 'Requirement 2'],
     icon: '<svg>...</svg>', iconBg: '#hexcolor',
     manualCertSupport: false,
     expressLabel: 'Authorize with My New Connector',
     expressIcon: '<svg>...</svg>',
     defaultInstanceName: 'MyNewConnector-connection-1',
     connectedTitle: 'Connected to "demo-account"',
     connectedSubtitle: 'Access: ALL resources',
     changeLabel: 'Change account',
     defaultRegion: 'US East (N. Virginia) — us-east-1',
     helpContent: '<h4>Express</h4><p>...</p>',
   },
   ```

3. **Run through the wizard** — catalog → splash → basic info → auth → test → infra-storage → protect → summary should all work without additional changes. Default chrome (icons, name) will render; test-conn will use the 4 default generic checks.

### Phase 2: connector-specific UX

4. **Custom test-connection checks** — add `permissionCheckRows` (up to 6 rows, see §5 schema).

5. **Splash hero** — add `splashHero: { title, desc, bullets }` for the welcome page.

6. **Per-workload auth copy** — add `wl === 'mynewconnector'` branches in `selectWorkload` for:
   - `#auth-subtitle` body copy
   - `#express-desc` Express tile subhead
   - The 4 `#express-benefit-{1..4}` checkmarks
   - `#prereqs-alert` bullets

7. **In-tile callouts** — extend the show conditions on `#express-admin-note` and/or `#manual-perenv-note` to include your workload, and add a copy branch.

### Phase 3: picker substep (if needed)

8. **Pick the closest existing picker** (env / workspace / group / org / spaces). Add the corresponding `requires*List` flag.

9. **If you genuinely need a new picker** — see §6. Clone an existing one; do not build from scratch.

### Phase 4: inventory + restore (inventory.html)

10. **Add the workload to `CATEGORIES`** with its inventory categories.
11. **Add columns to `INV_COLUMNS_BY_CAT`** if the default columns don't fit.
12. **Add seed resources to `RESOURCES`** (or workload-specific data like `D365_SCHEMAS`).
13. **Add a `preExecutionChecks` entry** for the workload-specific checks during restore.

### Phase 5: policy / dev affordances

14. **Add a dev-jump shortcut** in the dev bar (search for `dev-jump` in index.html).
15. **Update `backup-policies.html`** sample data if the workload should appear there.

---

## 12. Pitfalls log

Real failures that happened during this prototype's development. Don't repeat them.

### "The data array has the right rows but the UI doesn't show them"

**Cause:** A render function hardcoded to a fixed row count. Adding to the data without updating the renderer's loop silently fails.

**Example:** `[permRow0..permRow3]` hardcoded; adding a 5th workload check requires bumping to `[permRow0..permRow5]` AND adding `tc-perm-row-4` and `tc-perm-row-5` to the HTML.

**Fix:** Always `grep` the data variable name in render functions to find every consumer before mutating it. Verify rendered DOM after the change.

### "Click Preview, the matches drawer opens instead"

**Cause:** `rdState.mode` was set to `'matches'` on a previous click and never reset. The next entry point inherited stale state.

**Fix:** Always reset `rdState.mode = 'compare'; rdState.cameFromMatches = false; rdState.fieldScope = null;` at the start of every drawer-entry function.

### "Last Backup timestamp keeps changing"

**Cause:** Timestamp was computed from the temporal "Browse as of" picker date. As the user changed the date, the timestamp shifted.

**Fix:** Last Backup is **unconditional**. It doesn't depend on temporal state. For deleted items, anchor to 1-5 days before the parsed deletion date — they were last backed up before they were deleted, period.

### "I added a new alert and it looks different from the others"

**Cause:** Inline styles drifted — `padding: 12px 14px` instead of `14px 16px`, font-weight 500 instead of 700, raw hex instead of CSS variables.

**Fix:** Copy the canonical alert shape from §10. Use CSS variables only. Title `14px/700/var(--black-100)`. Body `13px/var(--black-100)/line-height:20px`. Padding `14px 16px`. Icon `16px` with `stroke-linecap="round" stroke-linejoin="round"`.

### "The triangle warning icon looks broken at small sizes"

**Cause:** SVG path used `<line>` elements for the "!" stem + dot without `stroke-linecap="round"`. At 16px, the short stem rendered as a hairline, the dot disappeared, and the triangle corners were mitered.

**Fix:** Use `stroke-linecap="round" stroke-linejoin="round"` on the `<svg>`. Replace `<line>` with `<path d="M12 9v4"/>` and `<path d="M12 17h.01"/>` (Lucide canonical form — `<path>` inherits parent stroke attrs more reliably).

### "I created a new drawer / alert / picker variant"

**Cause:** Not checking for existing components first. Pattern proliferation is the #1 failure mode in this codebase.

**Fix:** Before building anything new, grep for what already exists. Examples: `grep "openResourceDrawer\|openRecordDrawer"`, `grep "renderEnvExpanded\|paintEnvExpanded"`, etc. The user has rejected new variants multiple times — *"don't create another drawer component, you have too many variants already."*

### "Browser-native tooltip pop-up appears (gray Windows-style)"

**Cause:** Used `title="..."` instead of `data-tooltip="..."`.

**Fix:** Always use `data-tooltip`. The floating-tooltip handler in `setupInfoTooltips` renders a styled bubble that matches the product.

### "Filter chips appear on a single-select picker"

**Cause:** Cloned a multi-select picker for a single-select use case without dropping the filter UI.

**Fix:** Filter chips are only relevant for batch-select. Drop them when single-select.

### "PFX section asks for a passphrase even when the .pfx isn't encrypted"

**Cause:** Made passphrase required by default.

**Fix:** PFX files are not universally encrypted. Use progressive disclosure — the passphrase field only appears when the user opts in via the "My .pfx is passphrase-protected" toggle. The toggle pattern applies to **all** PFX-using workloads.

### "Spinner icon + 'Waiting for...' copy paired with the no-policy state"

**Cause:** Hardcoded spinner SVG that always rendered, paired with body lines that hardcoded "Waiting" copy. When no policy applied, the row appeared to be working on something when in fact nothing was scheduled.

**Fix:** Icon + body line + chip + meta should always be **mutually consistent**. When no policy applied: neutral icon, "Not configured" body line, hidden meta. When applied: spinner, "Waiting for..." body line, visible meta.

---

## 13. Grep recipes

Common navigation queries:

```bash
# Find a workload definition
grep -n "^  github:" index.html

# Find all WORKLOADS fields used in JS
grep -oE 'w\.[a-zA-Z]+' index.html | sort -u

# Find a screen
grep -n 'id="screen-auth"' index.html

# Find a render function
grep -n "function renderEnvExpanded\|function paintEnvExpanded" inventory.html

# Find all uses of a state variable
grep -n "rdState\." inventory.html

# Find all CSS color variables
grep -n "^  --" index.html

# Find which workloads set a specific flag
grep -B5 "hidePermRowChevrons: true" index.html | grep -E "^  [a-z'-]+: \{"

# Find all data-tooltip targets
grep -n "data-tooltip=" index.html

# Find all drawer entry points
grep -n "openResourceDrawer\|openRecordDrawer\|openFieldsDrill" inventory.html

# Verify whether a feature is already implemented before adding it
grep -ni "feature-keyword" index.html inventory.html backup-policies.html
```

---

## Appendix: history of major rounds

For context on what's been deliberately built vs. parked:

- **PP-1 through PP-5:** Power Platform onboarding refresh (Microsoft naming, screen copy, .pfx cert path, test-connection chevron cleanup + math fix, summary no-policy state)
- **ADO-1, A1:** Azure DevOps onboarding (single-select org, PFX, manual-skip-picker) + three-level inventory hierarchy
- **D1:** D365 records become drillable, fields are the leaf level
- **G1:** GitLab subgroups + folder hierarchy
- **Confluence 1-3:** Sites + Spaces picker, inventory categories, pre-execution checks
- **Deleted-1:** "Deleted in Prod" bucket across workloads
- **GitHub copy refresh:** Welcome page, auth screen, test-connection subtitles

The TaskList in the session (TaskList tool) tracks per-round work.

---

## Regression guardrails (scripts/ + hooks) — READ BEFORE EDITING index.html

These exist because the recurring failure on this prototype is *cross-workload
bleed* and *"said it's fixed but it's broken."* They are automated; don't skip them.

- **`scripts/parse-check.mjs`** — fast JS syntax check (strips HTML comments,
  compiles each `<script>` block with `vm.Script`). `node scripts/parse-check.mjs [file]`.
- **`scripts/smoke.mjs`** — headless walk of every workload × screen over `file://index.html`
  using the Playwright-cached Chromium via raw CDP (zero install). Reports any
  console error / exception while rendering, and checks the invariants in
  **`scripts/smoke-invariants.json`**. Quiet on success (one PASS line), verbose +
  exit 1 on failure. `node scripts/smoke.mjs`.
- **`scripts/smoke-invariants.json`** — per-`(workload, screen)` assertions:
  `contains` / `notContains` / `textEquals` / `hidden` / `visible`, optional `setup` JS.
  **When you add or change a workload's copy/markup, add an invariant here** so the
  next change can't silently regress or leak it into another workload.

**Hooks (`.claude/settings.json`)** — active automatically:
- *PostToolUse* on Edit/Write/MultiEdit → runs parse-check on the edited `.html`;
  a syntax error is surfaced to Claude immediately (exit 2).
- *Stop* → if `index.html` changed since the last passing smoke (mtime vs
  `.claude/.last-smoke`), runs the smoke walk and **blocks the turn from ending**
  if it fails. Infra/timeout errors warn but don't block.

`ds-lint.py` (type-scale / font-weight DS linter) is a separate manual tool;
run `python3 scripts/ds-lint.py` to check the type scale.

---

**End of document.** Updates welcome. Keep it terse and rule-forward.
