# GitHub Restore — Scenarios & Options Reference

**Purpose:** Map every restore and export scenario the GitHub workload supports, including all available options per scenario AND the per-object behaviors (what gets preserved, what gets transformed, what is lost, what requires manual action). Foundation for PRD writing, behavior decisions, and team alignment.

**Scope:** GitHub workload only.

**Note on cross-organization restore:** GitHub Apps installed via standard (non-enterprise) flow cannot create new organizations on GitHub. Cross-organization restore is only possible into a **target org that already exists and has the backup connector App installed**. Enterprise-level App permissions (introduced July 2025) allow org creation, but require apps owned by the enterprise.

---

## Table of Contents

1. [Object hierarchy & restorability](#1-object-hierarchy--restorability)
2. [Scenario-to-options matrix](#2-scenario-to-options-matrix)
3. [Scenario A — Whole Organization (DR)](#3-scenario-a--whole-organization-dr)
4. [Scenario B — Organization Config (granular)](#4-scenario-b--organization-config-granular)
5. [Scenario C — Single Repository (whole-to-new)](#5-scenario-c--single-repository-whole-to-new)
6. [Scenario D — Bulk Repositories (whole-to-new)](#6-scenario-d--bulk-repositories-whole-to-new)
7. [Scenario E — Repository Config (granular)](#7-scenario-e--repository-config-granular)
8. [Scenario F — Repository Content (no granular)](#8-scenario-f--repository-content-no-granular)
9. [Scenario G — Audit Log Export](#9-scenario-g--audit-log-export)
10. [Scenario H — Repository Security Alerts Export](#10-scenario-h--repository-security-alerts-export)
11. [Scenario I — Repository Download](#11-scenario-i--repository-download)
12. [Scenario J — Granular Object Download](#12-scenario-j--granular-object-download)
13. [Admin-facing warnings per item type](#13-admin-facing-warnings-per-item-type)
14. [Per-object behavior catalog](#14-per-object-behavior-catalog)
15. [Cross-cutting rules](#15-cross-cutting-rules)
16. [Behavior decisions & open enterprise questions](#16-behavior-decisions--open-enterprise-questions)
17. [Product requirements — supplementary behaviors](#17-product-requirements--supplementary-behaviors)

---

## 1. Object hierarchy & restorability

```
Organization
├─ Organization Config (15 categories)
│  ├─ Org Secrets                   [granular | additive | metadata only]
│  ├─ Org Variables                 [granular | additive]
│  ├─ Org Webhooks                  [granular | additive | active in granular flow]
│  ├─ Org Rulesets                  [granular | additive]
│  ├─ Custom Properties Schema      [granular | additive]
│  ├─ Members                       [granular | additive | requires user exists]
│  ├─ Teams                         [granular | additive | nested teams supported]
│  ├─ Custom Roles                  [granular | additive]
│  ├─ Installed GitHub Apps         [granular | metadata only — manual reinstall]
│  ├─ Code Security Configurations  [granular | additive]
│  ├─ Actions Permissions           [granular | SINGLETON | replace-only]
│  ├─ Runner Groups                 [granular | metadata — runner instances are infra]
│  ├─ Org Dependabot Secrets        [granular | additive | metadata only]
│  ├─ Projects v2                   [granular | additive | refs may break]
│  └─ Audit Log                     [EXPORT ONLY — append-only on GitHub]
│
└─ Repositories (1..N)
   ├─ Repository Content (9 categories) — restorable only as part of whole-repo
   │  ├─ Git Content (history, files, tags)
   │  ├─ Branches (with HEAD pointers)
   │  ├─ Labels (with referenced colors/descriptions)
   │  ├─ Milestones
   │  ├─ Issues (with comments, reactions, assignees, milestones, labels)
   │  ├─ Pull Requests (with reviews, comments, state, branch refs)
   │  ├─ Discussions (with categories, comments, answers)
   │  ├─ Wiki
   │  └─ Releases (tags + notes always; binary assets toggleable)
   │
   ├─ Repository Config (14 categories)
   │  ├─ Branch Protection Rules    [granular | additive | requires branch pattern match]
   │  ├─ Repository Rulesets        [granular | additive | requires branch/tag patterns]
   │  ├─ Repo Secrets               [granular | additive | metadata only]
   │  ├─ Repo Variables             [granular | additive]
   │  ├─ Repo Webhooks              [granular | additive | active in granular flow]
   │  ├─ Deploy Keys                [granular | additive | public keys only]
   │  ├─ Environments               [granular | additive | with protection rules]
   │  ├─ Custom Property Values     [granular | additive | requires schema in org]
   │  ├─ Dependabot Secrets         [granular | additive | metadata only]
   │  ├─ GitHub Pages Settings      [granular | SINGLETON | replace-only]
   │  ├─ Topics                     [granular | SINGLETON | full list replace]
   │  ├─ Autolinks                  [granular | additive | per key_prefix]
   │  ├─ Collaborators              [granular | additive | requires user exists]
   │  └─ Team Permissions           [granular | additive | requires team exists in org]
   │
   └─ Repository Security (3 categories) — export only
      ├─ Dependabot Alerts          [EXPORT ONLY — alerts managed by GitHub Security]
      ├─ Code Scanning Alerts       [EXPORT ONLY]
      └─ Secret Scanning Alerts     [EXPORT ONLY]
```

**Restorability legend:**
- `granular` — can be restored individually or in groups, back into the existing source object
- `additive` — restore creates or supplements; existing matching items follow the conflict resolution choice
- `replace-only` — singleton; restore overwrites the single existing instance
- `metadata only` — content-secret values are not stored in backup (GitHub API constraint)
- `SINGLETON` — only one instance exists per parent; multi-select disabled but item is restorable
- `EXPORT ONLY` — cannot be written back to GitHub by any restore mechanism

---

## 2. Scenario-to-options matrix

Scenarios fall into two operation classes that admins, support, and CISO/auditors must distinguish:

- **Modifying operations (Restore wizards)** — write data back to GitHub. Subject to conflict resolution, cross-org constraints, audit trail of every change. Require restore-write capability on the connector.
- **Read-only operations (Export / Download modals)** — produce JSON or archive artifacts from backup snapshots. No changes to GitHub. Used for compliance retention, forensic isolation, cross-platform migration, and offline review. Available even when the connector is in restore-disabled state.

Both operation classes coexist for most object types — the admin can either restore an item back to GitHub or export it as JSON. The Export/Download column below indicates the read-only path that exists for each scope. For Org Config and Repo Config items, the Export/Download path is delivered through Scenario J — drilling into the relevant category and using the Download action on the folder, multi-selection, or individual leaf items.

### Modifying operations (Restore)

| Scenario | Sub-scope | Restore to GitHub | Conflict modes | Cross-org | Cross-region | Restore-target name handling | Read-only path also available |
|---|---|---|---|---|---|---|---|
| **A. Whole Organization (DR)** | Org-wide | YES — into existing target org (target ≠ source always) | Override (only mode in MVP) | Required (target ≠ source, target must exist) | Settings-controlled (default off) | Repos within DR with name collisions auto-suffixed `{original}-restored-{date}`; non-colliding repos created with original names | YES via I (Organization Download variant — wrapper ZIP containing org-config bundle + per-repo archives) |
| **B. Org Config (granular)** | B1: all 15 categories | YES — additive into existing org | Override / Skip (default Skip) | Advanced toggle | Settings-controlled | n/a (config items, not repos) | YES via J — bundle ZIP of all category JSONs |
| | B2: single category | YES — additive | Override / Skip | Advanced toggle | Settings-controlled | n/a | YES via J — category ZIP |
| | B3: multi items | YES — additive | Override / Skip | Advanced toggle | Settings-controlled | n/a | YES via J — selection ZIP |
| | B4: single item | YES — additive | Override / Skip | Advanced toggle | Settings-controlled | n/a | YES via J — single JSON |
| **C. Single Repository (whole-to-new)** | Whole repo | YES — creates new repo (override-existing-repo deferred — see Road ahead) | n/a — MVP always creates new repo | Advanced toggle | Settings-controlled | Auto-generated `{original}-restored-{YYYYMMDD}`, read-only | YES via I — `.tar.gz` / `.zip` archive |
| **D. Bulk Repositories (whole-to-new)** | Multiple whole repos | YES — creates new repos | n/a — MVP always creates new repos (same constraint as C) | Advanced toggle (applies to all selected) | Settings-controlled | Auto-generated per-repo, read-only | YES via I bulk — wrapper ZIP of per-repo archives |
| **E. Repo Config (granular)** | E1: all 14 categories | YES — additive into existing repo | Override / Skip (default Skip) | NO — granular Repo Config always restored to source repo | n/a (no cross-org) | n/a (config items, not repos) | YES via J — bundle ZIP |
| | E2: single category | YES — additive | Override / Skip | NO | n/a | n/a | YES via J — category ZIP |
| | E3: multi items | YES — additive | Override / Skip | NO | n/a | n/a | YES via J — selection ZIP |
| | E4: single item | YES — additive | Override / Skip | NO | n/a | n/a | YES via J — single JSON |
| **F. Repo Content** | F1: whole repo (Issues, PRs, Discussions, Wiki, Releases, Branches, Labels, Milestones) | YES — only via Scenario C/D (whole-repo restore) | Inherits from C/D — always new repo | Inherits from C/D | Inherits from C/D | Inherits from C/D | YES via I (whole-repo archive) |
| | F2: single content item (Issue, PR, Discussion, Wiki page, etc.) | NO — Repo Content cannot be granularly restored to GitHub | n/a | n/a | n/a | n/a | YES via J — single JSON |
| | F3: multiple content items | NO — same as F2 | n/a | n/a | n/a | n/a | YES via J — selection ZIP |

**Audit log captures (applies to all Modifying operations):** operator, source, target, restore point, scope (categories / items in scope), conflict mode, advanced options (cross-org / cross-region / restore-as-fork flags), per-item outcomes, total duration.

### Read-only operations (Export / Download)

| Scenario | Sub-scope | Output format | Restore point selection | Cross-region |
|---|---|---|---|---|
| **G. Audit Log Export** | G1: full | JSON or CSV | Date range (admin-defined, bounded by retention) | n/a |
| | G2: single event | JSON | Single event reference | n/a |
| **H. Security Alerts Export** | H1: bundle (all 3 alert types) | JSON | Most recent snapshot | n/a |
| | H2: single category (Code / Secret / Dependabot) | JSON | Most recent snapshot | n/a |
| | H3: single alert | JSON | Most recent snapshot | n/a |
| **I. Repository Download** | I1: single repo | `.tar.gz` or `.zip` archive (admin choice) | Any retained restore point | n/a |
| | I2: bulk repos | Wrapper ZIP containing one archive per repo (`.tar.gz` or `.zip` per-repo, uniform across selection) | Per-repo most-recent restore point | n/a |
| **J. Granular Object Download** | J1: single item (any restorable Org Config, Repo Config, or Repo Content item) | JSON | Most recent restore point | n/a |
| | J2: multi-select / category | ZIP of JSONs | Most recent restore point | n/a |

**Audit log captures (applies to all Read-only operations):** operator, source identifier (org, repo, or both), scope (date range, category, item IDs, or selection), output format, snapshot used, generation timestamp, file size. No "outcome" — read-only operations either complete or fail.

### Cross-org rules

| Cross-org type | Allowed for | Constraint |
|---|---|---|
| To another existing connected org | DR (always — target ≠ source by definition), single / bulk whole-repo (advanced toggle), granular Org Config (advanced toggle) | Target org must already exist on GitHub with the connector App installed |
| To a newly-created org | NEVER in MVP | The "create organization" GitHub App permission is enterprise-only and not part of the standard connector App scope |
| Granular Repo Config to a different repo | NEVER | Conceptually breaks granular semantics — would require an explicit copy-to-different-repo flow (out of MVP scope, see Road ahead) |

### Compliance retention — point-in-time configuration snapshots

For audit and compliance frameworks (DORA, NIS2, SOC 2, ISO 27001), admins can produce point-in-time configuration snapshots through the Read-only operations. Common retention patterns:

| Compliance need | Recommended scenario | Output |
|---|---|---|
| Quarterly Org Config baseline | Drill into Org root → Org Config category → Download (Scenario J — whole-Org-Config bundle) | ZIP containing JSON for all 15 Org Config categories at the selected restore point |
| Repository configuration baseline | Drill into a repo → Download Repository (Scenario I) with Repo Config metadata included | Single archive with bare git + Repo Config JSONs at the selected restore point |
| Org-wide audit log retention | Scenario G with date range matching retention period (e.g. monthly export, 7-year retention for SOX) | JSON or CSV bounded by retention period |
| Security posture snapshot | Scenario H bundle for incident response or quarterly security review | JSON containing all active alerts at the time of the most recent snapshot |
| Single-item evidence (forensic / legal hold) | Scenario J — single JSON for the specific Issue, PR, Discussion, or config item | Single JSON with original IDs preserved |
| Bulk multi-repo configuration retention | Multi-select repos → Download selected (Scenario I bulk) with Repo Config metadata included | Wrapper ZIP with one archive per repo |

Read-only exports do not require the connector to be in restore-write mode — they remain available even in restore-disabled states (relevant for the V2 read-only mode roadmap item, see decision 13.15).

### Reasoning notes — why some scopes are restore-locked

- **Repo Content is restore-locked to whole-repo** but downloadable at any granularity (single Issue, single PR, etc.). This is because Repo Content items are renumbered on restore — GitHub assigns new sequential IDs in the target repo, breaking all cross-references (`#42` becomes `#7`, etc.). Single-item granular restore would create orphan IDs and dangling references inside otherwise intact repos. Download has no such constraint because original IDs are preserved in JSON.
- **Cross-region is a separate dimension from cross-org.** A target can be in the same org cluster but a different region (rare), or a different org and different region (common). Both cases require the Platform Admin Settings escape (decision 13.9). Cross-org alone (same region) does not require the escape.
- **Granular Repo Config is locked to source repo** because the operation is a recovery operation, not a copy operation. Cross-repo copy is a different use case (decision 13.17, deferred to Road ahead).

---

## 3. Scenario A — Whole Organization (DR)

### What it is
Restore an **entire Organization** (all repositories + Org Config layer) into a **target Organization** (always different from source, must already exist with the backup connector App installed).

### Use cases
- Source org compromised by threat actor — recover to clean recovery org
- Source org accidentally deleted — recover to standby org
- Source org migration — restore to new business org
- Compliance audit — restore Q3 2025 state into isolated audit org for inspection

### Available options

#### 1. Restore point matching
- Admin picks a single datetime (hour precision)
- System auto-matches each repository to its closest snapshot ≤ that datetime
- Different repos can have different backup policies → can end up at different actual snapshots in one DR operation

#### 2. Target organization
- Single-select from list of connected orgs (excluding source)
- Target must already exist on GitHub and have the backup connector App installed

#### 3. Layer toggles (5 toggles, all default ON)
- Include Org Config (all 15 categories)
- Include Repo Config (all 14 categories per repo)
- Include Wiki pages (per repo)
- Include Release assets (binaries — tags+notes always restored regardless)
- Include Git LFS objects (per repo)

#### 4. Conflict resolution
- **Always Override** (no Skip mode for DR — DR brings everything back from backup)
- Items in target that exist with same name as backup → overwritten with backup version
- Items in target that don't exist in backup → left untouched (Veeam never deletes during restore)
- Repos with name collision → restored with suffix `-restored-{YYYYMMDD}`

### Per-object behavior in DR

| Object type | Behavior in DR |
|---|---|
| Repositories — Git Content | Full Git history, all branches, all tags restored. New repo (or overwritten existing). |
| Issues | New numeric IDs assigned by GitHub on creation. **Original ID preserved in issue body header.** Authorship: each comment shows current restore operator with note "Originally authored by `@<original-author>` on `<original-date>`". |
| Pull Requests | New numeric IDs. Source/target branch refs preserved if branches restored (they are, in DR). PR review history, comments, approvals preserved with original-author headers. Merge commit hashes preserved in Git history. |
| Discussions | New numeric IDs. Threading and accepted-answer markers preserved. Reactions counts preserved. |
| Wiki | Restored as-is. Internal links between wiki pages by slug — preserved. |
| Releases | Tags + notes always restored. Binary assets controlled by toggle. Release URLs change due to new repo URL if cross-org. |
| Labels | Restored with same name + color. Issues/PRs reference them by name → links survive. |
| Milestones | Restored with new IDs. Issues/PRs reference them by name + date → links survive. |
| Branches | Full HEAD pointers, ref hierarchy preserved. |
| Branch Protection Rules | Restored from per-repo Config. Pattern-based — apply automatically as branches exist. |
| Webhooks (Org + Repo) | **INACTIVE** in DR (target org URLs differ from source — endpoints don't know new org). Configuration preserved. |
| Secrets (Org + Repo + Environments + Dependabot) | Names + timestamps only. Values absent. Manual re-entry required after restore. |
| Variables | Restored fully (values are not secret). |
| Deploy Keys | Public keys restored. Private keys remain on the developer machines (not in backup). |
| Environments | Recreated with protection rules, deployment branch policies. Environment secrets metadata only. |
| Members | Added to target org. Invitation flow may apply if user not already org member. |
| Teams | Restored with nested team relationships. Member assignments restored if those users are also restored. |
| Custom Roles | Restored as org roles. |
| Installed Apps (Org level) | **NOT auto-installed.** Restored as metadata listing — admin must reinstall each App manually on target org. |
| Custom Properties Schema | Restored. Per-repo property values follow when Repo Config toggle ON. |
| Code Security Configurations | Restored. Repo associations follow when Repo Config toggle ON. |
| Actions Permissions | Singleton — replaces target org Actions Permissions. |
| Runner Groups | Group config restored. Actual self-hosted runner instances are infrastructure outside backup; admin must connect runners to restored groups. |
| Projects v2 | Project structure restored. Items reference issues/PRs by ID. In DR, issues get new IDs → references may not resolve in target. MVP behavior: best-effort restore, wizard warns admin. Automatic ID remapping deferred to V2. |
| Audit Log | Snapshot from backup is exportable from DR target, but does not push events into target org's live audit log. Audit log is append-only on GitHub. |
| Notifications | NOT replayed. Users do not receive notifications for restored issues/PRs/discussions. |
| @-mentions in restored content | Preserved as text. Users referenced are not re-notified. If user no longer exists in target org, the mention renders as a broken link. |
| References between objects (#123 in PR body referencing Issue #123) | Same-repo `#N` references rewritten to new IDs with visible annotation `#NEW (originally #N)`. Cross-repo refs and full URLs preserved. Markdown code blocks and Git commit messages never modified. See section 13.5. |
| External webhooks pointing to source org URLs | Not auto-updated. Admin must manually update third-party integrations (CI, monitoring, Slack, Jira sync) to new org URLs. |

### Post-restore manual actions required
1. Re-enter all secret values (Org + Repo + Environment + Dependabot)
2. Reactivate webhooks after verifying endpoint URLs work with new org
3. Reinstall Org-level GitHub Apps
4. Reconnect self-hosted runners to restored Runner Groups
5. Update DNS, OAuth callbacks, third-party integrations to new org URL
6. Verify Members invitations completed
7. Communicate new repository URLs to teams

---

## 4. Scenario B — Organization Config (granular)

### What it is
Restore one or more Org Config items back into the **same source organization**, additively. Mostly used for routine recovery (accidental deletion, rollback of misconfiguration) rather than DR.

### Sub-scopes

| Sub-scope | What's restored |
|---|---|
| B1. `org-all` | All 15 Org Config categories at once |
| B2. `org-category` | All items in one category (e.g. all Org Webhooks) |
| B3. `org-multi` | Selected subset of items in one category (cherry-pick) |
| B4. `org-single` | One specific item |

### Use cases
- Admin accidentally deleted an Org Webhook → restore B4 single
- Org Members list was bulk-removed → restore B2 entire Members category
- Compliance: "restore last week's complete Org Config" → B1 all
- Multiple webhooks lost in one operation → B3 multi cherry-pick

### Available options

#### 1. Target organization
- Always source org (no target picker, no cross-org option in MVP)

#### 2. Conflict resolution
- **Skip if exists** (default, Recommended) — leaves matching items in production untouched
- **Override existing** (Destructive) — replaces matching items with backup version
- Items in production NOT in backup → always untouched (Veeam safety, both modes)

### Per-category behavior

| Category | What's restored | Behavior on Skip / Override |
|---|---|---|
| Org Secrets | Name + scope (visibility / selected_repository_ids) only. Value is never in backup. | Skip: existing secret untouched. Override: secret scope updated from backup; existing secret value untouched. Secret values can never be modified by restore (GitHub API constraint). |
| Org Variables | Full content (name + value) | Standard skip/override on name match |
| Org Webhooks | Full config (URL, events, secret token, content type). **Restored ACTIVE** because target org is the source org — endpoints already know it. | Skip: existing webhook with same URL untouched. Override: webhook config replaced with backup version. |
| Org Rulesets | Full ruleset definition + branch/tag patterns | Standard skip/override on name match |
| Custom Properties Schema | Schema definition (property names, types, allowed values) | Standard skip/override on property name match. Per-repo property values that don't match the current schema (after schema change) are skipped during Repo Config restore with restore log warning. No automatic schema migration. |
| Members | Username + role | Skip: existing members untouched. Override: role updated to backup snapshot. **User must already exist on GitHub.** If user doesn't exist or has been deleted, the membership cannot be restored — flagged as warning in restore log. |
| Teams | Team name + members + nested teams + privacy + description | Skip: existing teams untouched. Override: team replaced (members may get added/removed to match backup). **Members not on GitHub anymore are skipped from team restore.** |
| Custom Roles | Role name + permissions set | Standard skip/override |
| Installed GitHub Apps | App identifier + config metadata. **App is NOT reinstalled automatically.** Admin must manually reinstall each App. | Skip/Override controls whether the metadata listing is updated; install action remains manual. |
| Code Security Configurations | Configuration name + settings + repo associations | Standard skip/override on configuration name |
| Actions Permissions | **SINGLETON** — single Org-level config (allowed actions, fork PR policy, default workflow permissions) | Skip: target Actions Permissions untouched. Override: replaced with backup snapshot. |
| Runner Groups | Group config (name, allowed repos, allowed workflows). Self-hosted runner instances are infra — NOT in backup. | Standard skip/override on group name. Admin must verify runner connections. |
| Org Dependabot Secrets | Name + scope (which repos can use it). Value absent. | Same as Org Secrets — manual value re-entry. |
| Projects v2 | Project structure (views, fields, automations) + items list (referenced by issue/PR ID). | **References to issues/PRs use numeric IDs.** Granular Projects restore to source org doesn't change IDs, so refs stay valid. Cross-org or DR — refs may break (best-effort restore in MVP, no automatic ID remapping; warning shown in wizard). |
| Audit Log | NOT restorable. Clicking Restore icon for Audit Log opens Export modal instead. | n/a |

### Post-restore manual actions required
- Re-enter secret values (Org Secrets, Org Dependabot Secrets)
- Reinstall any Org-level GitHub Apps that were uninstalled
- Verify self-hosted runner connections to Runner Groups
- Webhooks come back ACTIVE — verify they don't fire unwanted events on existing endpoints

---

## 5. Scenario C — Single Repository (whole-to-new)

### What it is
Restore one entire repository as a **new repository**. Original is never modified. Whole-repo restore includes all Content + all Config layers in one operation.

### Use cases
- Repository was deleted by mistake → recreate as new repo
- Repository corrupted / hijacked → restore clean copy from before incident
- Audit / forensic isolation → restore Q3 state to inspect-only repo
- Migration / spin-off → restore source repo into new org for separate team

### Available options

#### 1. Target organization
- **Default: same org as source**
- **Advanced option**: "Restore to a different organization"
  - When enabled, admin can select from connected organizations (subject to cross-region settings, see 17.6)
  - Target org must already exist with the connector App installed (the system cannot create organizations on GitHub)
  - The source org itself remains a valid selection in this list (equivalent to disabling the advanced option)

#### 2. New repository name
- Auto-generated: `{original-name}-restored-{YYYYMMDD}`
- Read-only — admin cannot edit
- If target already has a repo with that name (extremely unlikely on same date), suffix gets numeric tail `-2`, `-3`, etc. **Open: confirm collision handling**.

#### 3. Layer toggles (4 toggles, default ON)
- Include Repo Config (all 14 categories, Branch Protection, Webhooks, Secrets metadata, Variables, etc.)
- Include Wiki pages
- Include Release assets (binaries — tags+notes always restored regardless)
- Include Git LFS objects

Always-restored regardless of toggles: Git Content (history, branches, tags), Issues, Pull Requests, Discussions, Labels, Milestones.

#### 4. Restore as fork of original (advanced toggle, default OFF)
- When OFF (default): restored repo is a standalone new repo
- When ON: restored repo is created as a **fork** of the original repo on GitHub
  - Enables native cross-repo PR workflow: developer can open PR from restored fork → original repo through GitHub UI without setting up additional remotes
  - Enables "Sync fork with upstream" button in GitHub UI for selective recovery of branches/files
  - Enables `compare/main...:restored:branch` URLs for visual diff between restored and original
  - GitHub UI shows fork relationship visually ("forked from acme-eu/auth-service")
- Constraint: requires original repo to still exist on GitHub. Fork relationship is created at repo creation time and cannot be added retroactively (GitHub API limitation).
- Constraint: forks inherit some settings from upstream that cannot be overridden (e.g. some rulesets, base branch protection). Restored Repo Config items that conflict with inherited settings are flagged in restore log.
- Use case: investigation, cherry-pick recovery, selective merge back to original. NOT recommended for DR scenarios where original is deleted/lost.

### Per-object behavior in whole-to-new

| Object type | Behavior |
|---|---|
| Git Content | Full restore — all commits, all branches, all tags, all merge commits. Commit hashes preserved (deterministic from content). Author + committer fields preserved as recorded in Git. |
| Branches | All branches restored, HEAD pointers preserved. Default branch metadata preserved. |
| Tags | All tags restored (annotated and lightweight). |
| Issues | New numeric IDs (target repo starts numbering from 1, or whatever its current count is). **Original issue number preserved as inline note in body header.** Comment IDs are new — chronology preserved by timestamp. **Authorship**: each issue/comment displayed with restore-operator as author + inline header `Originally authored by @<original-author> on <original-date>` rendered as quoted block at top of body. |
| Pull Requests | New numeric IDs. PR head/base branches preserved (because branches are restored). Review history, comments, approvals preserved with original-author header annotation. Merged-state preserved. **Cannot re-merge or re-trigger merge events** — PR is restored as a snapshot of historical state, not as a fresh PR. |
| Pull Request commits | Commits preserved in Git history (commits are content-addressed, hashes don't change). PR commit timeline reconstructed from Git. |
| Discussions | New IDs. Threading preserved by parent-child relationships. Accepted-answer markers preserved. |
| Issue/PR cross-references (#123 in body) | Same-repo `#N` references rewritten to new IDs with visible annotation: `#NEW (originally #N)`. Cross-repo refs (`org/repo#N`) and full URLs left as-is. Markdown code blocks and Git commit messages never modified. Restore notes header in body explains the rewrite. |
| Mentions (@username) | Preserved as text. **Users not re-notified.** If user is not in target org or doesn't have repo access, mention renders as a broken link. |
| Reactions | Preserved by aggregation per type. Original reactor's identity preserved as metadata. |
| Labels | Restored with name + color + description. Issues/PRs reference labels by name — links survive renumbering. |
| Milestones | Restored with name + due date + state (open/closed). Issues/PRs reference milestones by name — links survive. |
| Wiki | Restored as-is. Wiki internal links by slug — preserved. |
| Releases | Tags always restored. Release notes always restored. Release ASSETS (binaries) controlled by toggle — when excluded, release exists but has no downloadable artifacts. |
| Branch Protection Rules | Restored from Repo Config. Patterns apply to restored branches. |
| Repository Rulesets | Restored. |
| Webhooks | **INACTIVE** in whole-to-new — new repo URL means target endpoints (CI, Slack, Jira) don't know how to handle events from new repo name. Admin verifies and reactivates manually. |
| Secrets (Repo + Dependabot + Environment) | Names + timestamps only. Values absent. Manual re-entry required. |
| Variables | Full content restored. |
| Deploy Keys | Public keys restored. |
| Environments | Restored with protection rules, branch policies. Environment secrets are metadata only. |
| Custom Property Values | Restored. Requires custom property schema to exist on target org (it does if target = source org; if cross-org, schema must exist on target org). |
| GitHub Pages Settings | Source branch + folder + custom domain restored. **Pages site itself rebuilds on first push to source branch.** |
| Topics | Full topic list replaces target. |
| Autolinks | Restored per `key_prefix`. |
| Collaborators | Direct collaborators (outside-org users) restored. **User must exist on GitHub.** Permissions level preserved. |
| Team Permissions | Team-to-repo associations restored. **Team must exist in target org.** Permissions level preserved. |
| Repository visibility (private/public/internal) | Preserved in restored repo. Admin can change after restore. |
| Repository archived state | Preserved. |
| Default branch | Preserved. |
| Forks of source repo | NOT restored (forks are separate user repos). |
| Stars / Watchers / followers | NOT restored (these are user-level relationships). |
| Notifications subscriptions | NOT restored. Users following source repo are not auto-subscribed to restored repo. |
| Traffic / Insights / Pulse | NOT restored (analytics are platform-side derived data). |
| GitHub Actions runs history | NOT restored (workflow run history is GitHub-side; admin can re-run from restored workflows). |
| GitHub Actions cache | NOT restored. |
| GitHub Actions self-hosted runner registrations | NOT restored. |
| Webhook delivery history | NOT restored (delivery logs are GitHub-side). |

### Post-restore manual actions required
1. Re-enter all secret values (repo, environment, Dependabot)
2. Reactivate webhooks after verifying integrations recognize new repo name
3. Communicate new repo URL to team / update bookmarks
4. If repo had GitHub Pages with custom domain, update DNS to point at new repo
5. Reconnect any external CI/CD that pulled from old repo URL
6. Decide whether to delete the original (if it still exists) and rename the restored one — this is a **manual GitHub UI operation**, not part of restore

---

## 6. Scenario D — Bulk Repositories (whole-to-new)

### What it is
Restore N repositories as N new repositories in one batch operation. Each becomes a separate new repo with `-restored-{date}` suffix.

### Use cases
- Department/team migration — restore subset of repos to new org
- Targeted recovery — multiple repos affected by same incident
- Compliance restore — entire team's repos for audit window

### Available options

Same as Scenario C with these differences:

#### 1. Restore point matching
- Admin picks a single datetime — one moment in time applied to all selected repos
- System auto-matches each repo to its closest snapshot ≤ that datetime
- Different repos may end up at different actual snapshots in one batch (one from 06:00 backup, another from 04:00 backup)

#### 2. Target organization
- Single target for all repos in the batch (you can't split a batch into multiple targets in one wizard)
- Same-org default + advanced cross-org toggle (same as Scenario C)

#### 3. New names
- `{original}-restored-{YYYYMMDD}` per repo, displayed in a table
- Read-only

#### 4. Layer toggles
- Same 4 toggles as Scenario C (Repo Config / Wiki / Releases / LFS), applied uniformly to all repos in batch

### Per-object behavior
**Identical to Scenario C, applied per-repo.** Differences worth noting:
- Job runs as a batch — best-effort with per-repo status report. Each repo attempted independently; per-repo success/failure reported in Activity feed. No automatic rollback of completed restores. Retry option available for failed repos.
- All repos get the same restore datetime → if some repos didn't have a backup at that time, the closest available is used (with delta annotation in review).

### Post-restore manual actions required
- Same as Scenario C, multiplied by N repos.

---

## 7. Scenario E — Repository Config (granular)

### What it is
Restore one or more Repo Config items back into the **same source repository**, additively. Equivalent to Scenario B but at repo level.

### Sub-scopes

| Sub-scope | What's restored |
|---|---|
| E1. `repo-all` | All 14 Repo Config categories at once |
| E2. `repo-category` | All items in one category (e.g. all Repo Webhooks) |
| E3. `repo-multi` | Selected subset of items in one category |
| E4. `repo-single` | One specific item |

### Use cases
- Webhook accidentally deleted → E4 single
- Branch protection rule lost during config change → E4 or E2
- Entire repo config rolled back to last week → E1 all
- Multiple secrets accidentally deleted → E3 multi
- Compliance check: "show me what Repo Config looked like Q3" → E1 all with Override

### Available options

#### 1. Target
- **Always source repo** (no target picker, no cross-org option)
- Granular cross-repo restore would conceptually require defining "what does it mean to restore Webhook X from repo A into repo B" — out of scope; would need explicit copy-config flow

#### 2. Conflict resolution
- **Skip if exists** (default) — items already in production untouched, only missing items restored
- **Override existing** — matching items replaced with backup version
- Items in production NOT in backup → always untouched

### Per-category behavior

| Category | What's restored | Notes |
|---|---|---|
| Branch Protection Rules | Pattern + ruleset config (required reviews, required checks, push restrictions, etc.) | Pattern matches branches; if branch doesn't exist, rule still saved and applies when matching branch is created |
| Repository Rulesets | Modern ruleset config (branch + tag + push rulesets) | Same caveat as Branch Protection |
| Repo Secrets | Name + timestamps only | **Values absent — manual re-entry** |
| Repo Variables | Full (name + value) | Standard |
| Repo Webhooks | Full config (URL, events, secret, content type) — **restored ACTIVE** because target = source repo, endpoints already know this repo by URL | Webhook fires immediately after restore. Verify before restore that you want it fired again. |
| Deploy Keys | Public key + title + read/write flag | Private key remains on developer machine, never in backup |
| Environments | Environment name + protection rules + deployment branch policies + secrets/variables under environment | Environment secrets are metadata only |
| Custom Property Values | Per-property values for the repo | Requires schema in org Custom Properties Schema (may be missing if Org Config schema was changed) |
| Dependabot Secrets | Name + timestamps only | **Values absent — manual re-entry** |
| GitHub Pages Settings | **SINGLETON** — source branch, folder, custom domain, HTTPS enforcement | Replaces target's current Pages config in Override. Pages rebuilds on next push. |
| Topics | **SINGLETON** — full topic list (max 20) | Override replaces entire list. Skip leaves current topics. |
| Autolinks | Per `key_prefix` (e.g. `JIRA-` → URL template) | Standard granular restore |
| Collaborators | Direct outside-collaborators with permission level | User must exist; if deleted from GitHub, restoration fails for that user |
| Team Permissions | Team-to-repo with permission level | Team must exist in org; if team deleted (org config changed since backup), restore fails for that team |

### Webhook ACTIVE vs INACTIVE — most important behavioral distinction

| Restore path | Webhook state on restore |
|---|---|
| Whole-repo (Scenario C/D) → restored to NEW repo | INACTIVE — target endpoints don't know new repo URL |
| Granular Repo Config (Scenario E) → restored to EXISTING repo | ACTIVE — target endpoints already know this repo URL |
| DR (Scenario A) → entire org to NEW org | INACTIVE — target endpoints don't know new org URLs |
| Granular Org Config (Scenario B) → restored to EXISTING org | ACTIVE — target endpoints already know this org |

### Post-restore manual actions required
- Re-enter secret values (Repo Secrets, Dependabot Secrets, Environment Secrets)
- For Override webhook restores: webhooks restored ACTIVE — verify integrations are ready to receive events; first matching event after restore will fire
- For singleton Pages settings restore: verify Pages site rebuilt successfully
- For Collaborators / Team Permissions where user/team is missing on GitHub: handle restore log warnings

---

## 8. Scenario F — Repository Content (no granular)

### What it is
The 9 Repository Content categories (Git Content, Branches, Labels, Milestones, Issues, Pull Requests, Discussions, Wiki, Releases) **cannot be restored individually** because of tight coupling:
- Issues/PRs/Discussions have **numeric IDs** assigned by GitHub on creation
- PRs reference branches and base/head commits
- Issues reference labels, milestones, assignees
- Comments reference issues/PRs
- Cross-references (`#123`, `#456`) link objects by ID
- Restoring a single Issue would create it with a new ID — breaking all `#N` references

Restore of Content always happens via whole-repo restore (Scenario C or D), or as part of DR (Scenario A) when Repo Config + Wiki/Releases/LFS toggles are ON.

### Available options
None at this level. Per-Content-category granular restore is not supported.

User can:
- Drill into a Content category (e.g. Issues) to browse the backup snapshot
- Preview a single Content item to compare backup vs production
- Trigger whole-repo restore from any Content drill level (toolbar button always visible)

### Per-category behavior in whole-repo restore

| Category | Detail |
|---|---|
| Git Content | Commit hashes preserved (content-addressed). Author/committer email + name + dates preserved. Signed commits remain signed. Submodule references preserved as-is. |
| Branches | All branches + HEAD + protection from Branch Protection Rules. Default branch flag preserved. |
| Labels | Color, description, name preserved. Reference by name from issues/PRs unaffected. |
| Milestones | Title, description, due date, state. Reference by name from issues/PRs unaffected. |
| Issues | New IDs. Original ID stored as inline header in body. Authorship via header annotation. Comments preserve threading by timestamp. Closed/open state preserved. Closed-by-PR reference may break (different PR number). |
| Pull Requests | New IDs. Head/base branches preserved (branches are restored). Diff is reconstructed from Git. Review state preserved (approved / changes requested / commented). Reviewers preserved as text. Merge state preserved (merged / closed / open). Cannot re-merge programmatically. |
| Discussions | New IDs. Categories preserved. Accepted answer marker preserved. Reactions preserved. Polls preserved as snapshot (cannot accept new votes). |
| Wiki | Restored as separate Git repo (`<repo>.wiki.git`). Internal links by slug preserved. |
| Releases | Tags + notes always. Binary assets controlled by toggle. Pre-release / draft state preserved. Latest-release flag preserved on most recent. |

### Always-lost in restore (across all Content categories)

- Notification subscriptions
- Watchers / Stars
- Issue / PR / Discussion view counts (analytics)
- Webhook delivery history for Content events
- Forks (forks are separate user repos)
- Insights / Traffic / Pulse data
- Workflow run history (Actions tab)
- Pages deployment history

---

## 9. Scenario G — Audit Log Export

### What it is
GitHub audit log is **append-only on GitHub** — cannot be written back. Only operation is download of snapshot for SIEM, compliance, or incident response.

### Use cases
- Incident response: "what happened in the org between 14:23 and 14:45 during the breach?"
- Compliance audit: "export Q3 2025 audit log for SOC 2 review"
- Forensics: "trace user X's activity for 30-min window post-incident"
- Comparison: "what audit events existed in backup but are missing from current GitHub audit log?" (potential future feature)

### Sub-modes

| Sub-mode | Description |
|---|---|
| G1. Full audit log with date filter | Multi-record export with time range presets |
| G2. Single audit event | One event exported as standalone JSON |

### Available options for G1 (full audit log)

#### 1. Time range
- Last 24 hours
- Last 7 days (default — Recommended)
- Last 30 days
- Last 90 days
- All time (since backup started)
- Custom range — datetime From/To with hour precision

#### 2. Format
- **JSON** (default) — for SIEM ingestion (Splunk, Elastic, Sentinel), incident response, programmatic analysis
- **CSV** — for Excel review, compliance reports

#### 3. Filename pattern
- `audit-log-<orgName>-<range>.<format>` — e.g. `audit-log-veeam-software-last7d.json`

### Available options for G2 (single event)
- Format: JSON only (single event in JSON is the trivial case)
- Filename: `<event-slug>.json`

### Per-event behavior (what's in the export)

| Field | Restored / Exported |
|---|---|
| Event timestamp (UTC) | YES |
| Event type / action name | YES |
| Actor (user / app / system) | YES — username / display |
| Affected resource (org/repo/team/user) | YES |
| IP address | YES if recorded by GitHub |
| User agent | YES if recorded |
| Programmatic access type (PAT / GitHub App / OAuth App) | YES |
| Country / location | YES if recorded |
| Event-specific payload (e.g. permission changed from X to Y) | YES |

**What's NOT in audit log export:**
- Live "current" comparison with production audit log (export is snapshot only)
- Reasoning behind the action
- Related events grouped by session

### Restore is NOT supported
Even if DR Scenario A includes "Audit Log" via Org Config toggle, the audit log content is exportable from the DR target but does NOT push events into target org's live audit log.

---

## 10. Scenario H — Repository Security Alerts Export

### What it is
Three alert categories (Dependabot, Code Scanning, Secret Scanning) are **point-in-time snapshots managed by GitHub Security**. Cannot be written back to GitHub. Only operation is JSON download.

### Use cases
- SIEM ingestion: pull alerts into Splunk for correlation
- Compliance: "we had X vulnerabilities open as of Q3 close — show me"
- Incident response: triage alerts that existed at moment of breach
- Comparison forensics: "did this alert exist before the breach? when did it appear?"

### Sub-modes

| Sub-mode | Description |
|---|---|
| H1. Security bundle (all 3 alert types in one JSON) | All Dependabot + Code Scanning + Secret Scanning alerts |
| H2. Single alert category | All alerts in one specific category |
| H3. Single alert | One specific alert exported |

### Available options
- **Format**: JSON only (for all sub-modes — alerts are structured for SIEM ingestion, CSV not provided)
- **No date filter** for any sub-mode (alert sets are typically small enough for full export)
- **Filename patterns**:
  - H1: `security-<repoName>.json`
  - H2: `<category-slug>-<repoName>.json` (e.g. `dependabot-alerts-auth-service.json`)
  - H3: `<alert-slug>.json` (e.g. `dependabot-42-lodash.json`)

### Per-alert-type fields exported

#### Dependabot Alerts
- Alert number + severity (critical/high/medium/low) + state (open/dismissed/resolved/auto_dismissed)
- Affected dependency (package name, version range, ecosystem)
- Vulnerability metadata (CVE, GHSA ID, CVSS score)
- Vulnerable manifest path + line numbers
- Created at + updated at + dismissed at
- Dismisser (user) + dismissal reason + dismissal comment
- Auto-dismissed flag
- Fix availability info (fixed in version)

#### Code Scanning Alerts
- Alert number + state + severity
- Tool that produced the alert (CodeQL / third-party SARIF)
- Rule ID + rule description
- Affected file + line numbers
- Most recent instance details
- Created at + updated at + dismissed at
- Dismisser + reason + comment

#### Secret Scanning Alerts
- Alert number + state (open/resolved)
- Secret type (e.g. github_personal_access_token, aws_access_key_id)
- Secret value? **Never in export** (GitHub redacts)
- Resolution metadata (resolved by, resolution reason: revoked/false_positive/used_in_tests/wont_fix)
- Created at + resolved at
- Repository location of the leaked secret

### Restore is NOT supported
Alerts are not restorable to GitHub. They are produced by GitHub's security scanning services and reflect state at scan time.

---

## 11. Scenario I — Repository Download

### What it is
Download a backup snapshot of an entire repository as a downloadable archive — **without writing back to GitHub**. Read-only export operation. Result is a `.tar.gz` (or `.zip`) bundle containing the bare git repo + structured metadata files for non-git content (issues, PRs, wiki, releases, config).

### Use cases
- Offline backup copy on developer's machine for incident investigation without GitHub network access
- Cross-platform migration to GitLab / Bitbucket / Azure DevOps / self-hosted Gitea (admin can extract git data and import elsewhere)
- Forensic isolation — full repo state captured to evidence storage without live GitHub interaction
- Compliance export — auditor receives complete repo snapshot for review without needing GitHub access
- Vendor lock-in mitigation — customer can prove data portability

### Available options

#### 1. Source restore point
- Radio list of available snapshots (single repo, single point in time)

#### 2. Format
- `.tar.gz` (default) — preserves Unix file permissions, smaller for repos with many files
- `.zip` — universal compatibility (Windows, drag-drop)

#### 3. Content toggles (default ON)
- Include Git Content (bare git repo with all branches, tags, history) — **always required for repository download to be meaningful**
- Include Repo Config metadata (JSON files for webhooks, branch protection, settings)
- Include Wiki (separate `wiki.git` directory in archive)
- Include Issues / PRs / Discussions metadata (JSON files)
- Include Release assets (binaries) — significantly larger archive
- Include Git LFS objects (binaries) — significantly larger archive

#### 4. Filename pattern
- `{org}-{repo}-{YYYYMMDD-HHMM}.tar.gz` (e.g. `acme-eu-auth-service-20260427-0814.tar.gz`)

### Archive contents (structure)

```
acme-eu-auth-service-20260427-0814/
├── repo.git/                    # Bare git repository (clone with `git clone repo.git`)
│   ├── HEAD
│   ├── refs/
│   ├── objects/
│   └── ...
├── wiki.git/                    # Bare wiki git (if Wiki toggle ON)
├── metadata/
│   ├── repository.json          # Repo settings, topics, visibility, archived state
│   ├── issues.json              # All issues with comments, reactions, assignees, labels
│   ├── pull_requests.json       # All PRs with reviews, comments, branch refs
│   ├── discussions.json         # All discussions with answers, reactions
│   ├── releases.json            # Release tags, notes, asset listings
│   ├── branch_protection.json   # Branch protection rules
│   ├── rulesets.json            # Repository rulesets
│   ├── webhooks.json            # Webhook configs (secret tokens redacted)
│   ├── secrets_metadata.json    # Secret names + scope (no values)
│   ├── variables.json           # Variables
│   ├── deploy_keys.json         # Public keys
│   ├── environments.json        # Environments + protection rules + env secrets metadata
│   ├── custom_property_values.json
│   ├── pages_settings.json
│   ├── topics.json
│   ├── autolinks.json
│   ├── collaborators.json       # Direct collaborators with permission level
│   └── team_permissions.json    # Team-to-repo associations
├── assets/                      # Release binary assets (if Releases toggle ON)
│   └── {release-tag}/
│       └── {asset-files}
├── lfs/                         # LFS objects (if LFS toggle ON, separate from .git)
└── README.md                    # Auto-generated archive overview + restoration hints
```

### Per-object behavior in download

| Object type | In archive |
|---|---|
| Git history | Full bare git repo. Cloneable with `git clone repo.git`. Hashes preserved. |
| Issues / PRs / Discussions | JSON files with all metadata, comments, reactions. Original IDs and authorship preserved (in JSON, not subject to renumbering since download doesn't create new GitHub IDs). |
| Cross-references in body text | Preserved as-is (no rewriting — IDs in JSON match original). |
| Webhook secret tokens | Redacted as `null` in JSON (write-only field, never in backup). |
| Secret values | Absent from archive. Only names + scope in JSON. |
| Wiki | Separate `wiki.git` bare git directory. |
| Release assets | In `assets/` directory if toggle ON. |
| LFS objects | In `lfs/` directory if toggle ON. |
| Audit log | NOT included (audit log is org-level, not repo-level — see Scenario G). |
| Security alerts | NOT included (alerts are org-level — see Scenario H). |

### Constraints
- Archive size can be large for big repos with LFS/Releases (can exceed 10 GB)
- Download initiated server-side; admin gets email/notification when archive is ready for download
- Generated archives have time-limited download URLs (e.g. 7 days) for security
- **Read-only operation** — does not require restore-write capability of the connector. Available even when connector is in read-only mode (per decision 13.15).

### Trigger entry points
- Inventory list filtered to GitHub Repositories → Download icon on a repo row
- Drill into Org → Repositories list → Download icon on a repo row
- Drill into a repo → 3-section view → "Download Repository" toolbar button (with format/content options)
- Multi-select repos → bulk action "Download selected" (handled as **Bulk Repository Download** below)

### Bulk Repository Download (variant of Scenario I)

When admin multi-selects 2+ repos in Repositories list and clicks "Download selected", the result is a **wrapper ZIP** containing one per-repo archive per selected repository. This is distinct from Granular Object Download (Scenario J) — which produces JSON files — because repositories are inherently archive-shaped (bare git + metadata bundle).

#### Available options (bulk)
- **Per-repo archive format**: `.tar.gz` (default) or `.zip` — applied uniformly to all selected repos
- **Wrapper filename**: `{org}-{count}-repositories-{YYYYMMDD-HHMM}.zip` (e.g. `acme-eu-12-repositories-20260427-0814.zip`)
- **Content toggles** (applied to all repos): same toggles as single-repo download — Repo Config metadata, Issues/PRs/Discussions, Wiki, Release assets, Git LFS objects
- Source restore point: most recent snapshot per-repo (closest snapshot ≤ target time per individual repo, not a global timestamp)

#### Wrapper structure
```
acme-eu-12-repositories-20260427-0814.zip/
├── auth-service-20260427-0814.tar.gz
├── billing-engine-20260427-0814.tar.gz
├── frontend-app-20260427-0814.tar.gz
└── ... (one archive per selected repo)
```

#### Constraints (bulk-specific)
- Wrapper ZIP can be very large (10+ GB depending on selection size) — generation always async, time-limited download URL emailed when ready
- All repos use the same content toggles — admin cannot pick "wiki for repo A but not repo B"; for that, run separate single-repo downloads
- Best-effort: if individual repo archives fail to generate (rate limits, transient errors), the wrapper is still produced with successful repos; failed repos listed in the wrapper's `MANIFEST.txt` for retry

### Organization Download (Scenario K — variant of Scenario I at org level)

When the admin needs to capture the entire state of an organization (org config + all its repos) as a single archive — typically for compliance evidence, quarterly audit, or full forensic snapshot — the system produces an **organization wrapper ZIP** containing both the org configuration bundle and per-repo archives.

#### Use cases
- **Compliance evidence** — auditor requests "snapshot of org X as of date Y" for SOC 2 / ISO 27001 / DORA review. One file, one delivery, immutable.
- **Quarterly compliance review** — admin captures org state at quarter-end as evidence of controls in effect during the quarter
- **Pre-migration baseline** — before migrating an org or making structural changes, admin captures full org state for rollback reference
- **Forensic isolation** — security incident requires complete preservation of org state at incident time, separate from the live system
- **Pre-DR dry run** — before initiating actual DR (Scenario A), admin downloads the source org as evidence of "what state we're recovering from"

#### Available options
- **Source restore point** — any retained restore point at org level
- **Per-repo archive format** — `.tar.gz` (default) or `.zip`, applied uniformly to all repos in the org
- **Content toggles** (applied to all repos): same toggles as single-repo download — Repo Config, Issues/PRs/Discussions, Wiki, Releases, LFS
- **Org Config inclusion** — always included as `org-config-bundle.zip` inside the wrapper. Cannot be excluded; this is the point of an organization download.

#### Wrapper structure
```
acme-eu-organization-20260427-0814.zip/
├── org-config-bundle.zip          (all 15 Org Config categories as JSON files)
│   ├── webhooks.json
│   ├── secrets-metadata.json
│   ├── members.json
│   ├── teams.json
│   ├── ... (15 categories total)
│   └── audit-log.json             (most recent retention window)
├── repos/
│   ├── auth-service-20260427-0814.tar.gz
│   ├── billing-engine-20260427-0814.tar.gz
│   ├── frontend-app-20260427-0814.tar.gz
│   └── ... (one archive per repo in the org)
└── MANIFEST.txt                    (org name, restore point, generation date, list of included repos, list of any failed repo archives for retry)
```

#### Constraints (org-specific)
- Wrapper ZIP can be very large for orgs with many large repos (50+ GB possible) — generation always async, time-limited download URL emailed when ready
- All repos in the org use the same content toggles — admin cannot pick "Wiki for some repos but not others"; for that, use individual repo downloads
- Best-effort: failed repo archives don't block the wrapper. The `MANIFEST.txt` lists which repos failed and the reason, so admin can re-attempt them individually.
- Org Audit Log included in `org-config-bundle.zip` covers only the audit log retention window stored in backup (typically 6 months for GHEC, longer for GHEC+Data Residency). Admin should run separate audit log exports if a wider date range is needed.

#### Trigger entry points
- Inventory list filtered to GitHub Organizations → Download icon on an Org row
- Drill into Org → toolbar "Download Organization" button alongside "Restore Organization"

---

## 12. Scenario J — Granular Object Download

### What it is
Download individual objects (single issue, single PR, single discussion, single release, single config item, etc.) from a backup snapshot as **structured JSON files** — without writing back to GitHub.

### Use cases
- Developer wants to recover a single deleted issue's content into a different repo (admin not needed)
- Compliance auditor requests specific issues as evidence (e.g. "all PRs touching `auth-service` from Q3")
- Cross-repo migration of issues/PRs by developer manual import
- Lightweight investigation — read JSON locally without restoring whole repo

### Available options

#### 1. Source restore point
- Radio list of available snapshots

#### 2. Object selection
- Single object → one JSON file
- Multiple objects (multi-select in drill view) → ZIP of JSON files
- Whole category (e.g. all Issues, all PRs) → ZIP of JSON files

#### 3. Format
- JSON (only — alerts/audit log already use JSON in scenarios G/H; consistency)

#### 4. Filename patterns
- Single issue: `issue-{repo}-{number}.json` (e.g. `issue-auth-service-87.json`)
- Single PR: `pr-{repo}-{number}.json`
- Single discussion: `discussion-{repo}-{number}.json`
- Single release: `release-{repo}-{tag}.json`
- Single Org Config item (e.g. webhook): `org-webhook-{org}-{name}.json`
- Single Repo Config item: `repo-{config-type}-{repo}-{name}.json`
- Bulk: `{category}-{repo}.zip` (e.g. `issues-auth-service.zip`)

### Per-object download — what's included in JSON

The download description shown to the admin in the modal must be **scope-aware** — tailored to the specific item type being downloaded. Each row below represents a JSON file inside the resulting archive and the contextual description / redaction note the admin sees.

#### Repo Content items

| Object type | JSON contents | Redaction note |
|---|---|---|
| **Issue** | Issue body, all comments, reactions per comment, assignees, labels, milestones, author, dates, state, references. Original IDs preserved. | None |
| **Pull Request** | PR body, head/base branch refs, all reviews + reviewer state + comments, line annotations, merge state, linked issues. Original IDs preserved. | None |
| **Discussion** | Discussion body, threading (comments + replies), accepted answer marker, reactions, category, polls (if any). | None |
| **Release** | Tag, name, notes (markdown), pre-release flag, draft flag, asset listing with URLs. | Binary release assets are NOT included — for those use whole-repository download (Scenario I). |
| **Branch** | Ref pointer, target commit hash, protection status, ahead/behind counts vs default branch. | For full branch history use whole-repository download (Scenario I). |
| **Wiki page** | Markdown body, frontmatter, version history list. | None |
| **Label** | Name, color, description. | None |
| **Milestone** | Title, description, due date, state, linked issues count. | None |

#### Org Config items

| Object type | JSON contents | Redaction note |
|---|---|---|
| **Org Webhook** | Webhook URL, events, content type, SSL verification, active status. | **Secret token is not present** — write-only field on GitHub (the API returns asterisks `"********"` instead of the actual value), so the token is never available to any backup product. |
| **Org Secret** | Secret name, scope (selected repos / visibility), timestamps. | **Secret value is never in the backup** (GitHub API constraint). Only metadata + scope. |
| **Org Variable** | Name, value, scope. | None — variable values are stored normally. |
| **Org Dependabot Secret** | Name, scope, timestamps. | **Value is never in the backup.** Only metadata + scope. |
| **Member** | Username, organization role, team memberships, join date. | None |
| **Team** | Team name, slug, privacy, parent team, members list, repo permissions. | None |
| **Custom Role** | Role name, base role, permissions list. | None |
| **Installed GitHub App** | App name, installation ID, requested permissions, access scope. | **App credentials, tokens, and secrets are never in the backup.** Apps must be reinstalled manually via GitHub UI/marketplace. |
| **Code Security Configuration** | Configuration definition + repo associations. | None |
| **Actions Permissions** | Singleton org-level config (allowed actions, fork PR policy, default workflow permissions). | None |
| **Runner Group** | Group name, allowed repos list, allowed workflows config. | **Self-hosted runner instances are infrastructure, not in backup.** Only group config is downloaded. |
| **Org Ruleset** | Ruleset definition with branch/tag patterns, required checks, restrictions. | None |
| **Custom Property Schema** | Property names, types, allowed values, schema definitions. | None |
| **Project v2** | Project structure (views, fields, automations, items list with referenced issue/PR IDs). | Items reference issues/PRs by numeric ID; references resolve only against current target repo state. |

#### Repo Config items

| Object type | JSON contents | Redaction note |
|---|---|---|
| **Branch Protection Rule** | Pattern, required checks, required reviewers, restrictions, admin enforcement. | None |
| **Repository Ruleset** | Same shape as branch protection — pattern + rules + enforcement. | None |
| **Repo Webhook** | URL, events, content type, SSL, active status. | **Secret token is not present (GitHub API returns asterisks instead of the value).** |
| **Repo Secret** | Name, scope, timestamps. | **Value is never in the backup.** |
| **Repo Variable** | Name, value, scope. | None |
| **Deploy Key** | Public key, title, read/write permission, verification metadata. | **Private keys are never in the backup** — they live on the original developer machines. |
| **Environment** | Config + protection rules + deployment branch policies + environment-scoped secret/variable metadata. | **Environment secret values are redacted** — only names + scope. Re-enter values manually if restored. |
| **Custom Property Value** | Property name + values per repo. | None |
| **Dependabot Secret** | Name, scope, timestamps. | **Value is never in the backup.** |
| **GitHub Pages Setting** | Source branch, custom domain, HTTPS enforcement, build type. | None |
| **Topics** | List of topics applied to repository. | None |
| **Autolink** | Key prefix, URL template. | None |
| **Collaborator** | Username, permission level. | None |
| **Team Permission** | Team-to-repo association with permission level. | None |

### Granular Content download — never available

Single Git commit, single file from Git, single Branch as standalone — **NOT supported**. Git content is intrinsically a graph (commits reference parents, blobs, trees). Single-commit download breaks integrity. Use Scenario I (whole repo) for any Git content extraction.

### Trigger entry points
- Drill into any restorable object → Download icon (next to Restore icon) on the row
- Drill into category → multi-select objects → bulk action "Download selected"
- Drill into category folder → "Download category" action (downloads ZIP of all objects in category)
- Preview drawer footer → "Download as JSON" button (for single objects)

### Constraints
- **Read-only operation** — does not require restore-write capability
- Download is immediate for single objects (small JSON), batched/queued for bulk (>50 objects)
- Time-limited download URLs (7 days)

### Note on overlap with Scenarios G + H
Scenarios G (Audit Log Export) and H (Security Alerts Export) are **specialized cases** of Scenario J for export-only object types. Their separate documentation reflects that they are the **only available action** for those object types (they cannot be restored to GitHub at all). Scenario J covers download of objects that **could otherwise also be restored** (issues, PRs, etc.) — it provides an alternative to restore-to-GitHub for use cases where the developer wants the data, not the restoration.

---

## 13. Admin-facing warnings per item type

This section maps each restorable item type to the **specific warnings the admin should see** at the review step of the restore flow — based on what's actually in the restore scope, not generic blanket warnings. Only warnings relevant to items actually in scope are shown.

**Convention:** ⚠️ = warning (action needed) · ℹ️ = info (FYI, no action) · 🔴 = critical (compliance/safety)

### Org Config items

| Item type in scope | Warnings shown |
|---|---|
| Org Webhooks | ⚠️ **Webhooks restored as ACTIVE** in granular flow — they will fire on the next matching event in this organization. Verify integrations (CI/CD, monitoring, chat) are ready to receive events.<br>ℹ️ Webhook secret tokens are **not in backup** (write-only field on GitHub) — re-enter manually if your endpoints validate signatures. |
| Org Secrets | ℹ️ Secret values are never stored in backups (GitHub API constraint). Override mode updates only secret scope (visibility, repo access list). Production secret values remain untouched in all conflict modes. |
| Org Dependabot Secrets | ℹ️ Same as Org Secrets — values never in backup, only metadata + scope restored. |
| Members | ⚠️ User must already exist on GitHub. If a member's user account no longer exists, that membership cannot be restored — flagged in restore log per missing user. |
| Teams | ⚠️ Team restoration adds members back. Members whose user accounts no longer exist on GitHub are skipped per team — flagged in restore log. Nested team relationships preserved. |
| Custom Roles | ℹ️ Custom role permissions restored as-is. If permission keys changed in GitHub since backup (rare), unsupported permissions are skipped with warning. |
| Installed GitHub Apps | ⚠️ **Apps are NOT auto-reinstalled**. Restore creates a metadata listing of which Apps were installed. Admin must manually reinstall each App via GitHub UI/marketplace flow. |
| Code Security Configurations | ℹ️ Configuration definitions restored. Repo associations follow when Repo Config is also in scope. |
| Actions Permissions | ℹ️ Singleton org-level config (allowed actions, fork PR policy, default workflow permissions). Override replaces entire current config. |
| Runner Groups | ⚠️ Group config (name, allowed repos, allowed workflows) restored. **Self-hosted runner instances are infrastructure, NOT in backup** — admin must verify runner connections to restored groups manually. |
| Org Rulesets | ℹ️ Ruleset definitions restored with branch/tag patterns. Apply automatically when matching refs exist in repos. |
| Custom Properties Schema | ℹ️ Schema definitions restored. Per-repo property values that don't conform to current schema (after schema changes) are skipped during Repo Config restore — restore log records each skipped value. |
| Projects v2 | ⚠️ Project structure (views, fields, automations) restored. **Item references use numeric IDs** — references may not resolve correctly when issue/PR IDs change in target. Review affected projects after restore. |
| Audit Log | n/a — export only, never restorable to GitHub. |

### Repo Config items

| Item type in scope | Warnings shown |
|---|---|
| Branch Protection Rules | ⚠️ Rules require matching branch patterns to apply. **Rules requiring specific GitHub Apps as required status checks may block PRs if those Apps don't exist in target org.** |
| Repository Rulesets | Same as Branch Protection — pattern + app dependencies. |
| Repo Webhooks | ⚠️ **Webhooks restored as ACTIVE** in granular flow — they fire on next matching event in this repository. Verify integrations are ready before confirming.<br>ℹ️ Webhook secret tokens are **not in backup** — re-enter manually if endpoints validate signatures. |
| Repo Secrets | ℹ️ Secret values never in backup. Override mode updates only secret scope. Production values untouched. |
| Repo Variables | ℹ️ Full content (name + value) restored. Standard skip/override on name match. |
| Deploy Keys | ⚠️ **Public keys restored. Private keys remain on the developer machines (not in backup).** Restored deploy keys may be invalid if the original developer no longer has the matching private key (e.g. left the company, machine reformatted). |
| Environments | ⚠️ Environment config + protection rules + deployment branch policies restored. **Environment secrets** are metadata only — re-enter values manually. |
| Custom Property Values | ⚠️ Values that don't match the current Custom Properties Schema (after schema changes in org) are skipped per property — restore log records each skipped value with reason. |
| Dependabot Secrets | ℹ️ Names + scope only. Values manual after restore. |
| GitHub Pages Settings | ⚠️ Singleton — replaces target's current Pages config. **Pages site rebuilds on next push to source branch.** Custom domain setting preserved. |
| Topics | ℹ️ Singleton — replaces target's current topic list (max 20). |
| Autolinks | ℹ️ Restored per `key_prefix`. |
| Collaborators | ⚠️ Direct outside-collaborators restored with permission level. **User must exist on GitHub** — missing users skipped with restore log warning. |
| Team Permissions | ⚠️ Team-to-repo associations restored. **Team must exist in target org** (created by Org Config restore if Members/Teams in scope). Missing teams skipped with warning. |

### Repo Content items (always whole-repo restore)

| Item type | Warnings shown (whole-repo restore) |
|---|---|
| Issues | ⚠️ **New numeric IDs assigned** — original IDs preserved as inline body header. Cross-references (`#123`) in body text rewritten with annotation `#NEW (originally #123)`.<br>ℹ️ @mentions of users no longer on GitHub render as inactive text. Authorship preserved as text annotation; comments show restore operator as system author. |
| Pull Requests | ⚠️ Same renumbering + cross-ref rewriting as Issues.<br>⚠️ **Merge state preserved as snapshot** (merged/closed/open) but PR cannot be re-merged programmatically. Merge commits may not be present in restored Git history if backup was taken before merge or after force-push. Restored PR descriptions get an automatic annotation about this. |
| Discussions | Same renumbering as Issues. Threading and accepted-answer markers preserved. |
| Wiki | ℹ️ Restored as separate `wiki.git`. Internal links by slug preserved (slugs unchanged). |
| Releases | ℹ️ Tags + notes always restored. Binary assets controlled by toggle (excluded → release exists with no downloadable artifacts). |
| Branches / Tags | ℹ️ Full HEAD pointers and ref hierarchy preserved. |
| Labels / Milestones | ℹ️ Restored by name. Issues/PRs reference them by name → links survive renumbering. |

### Repo Security items

| Item type | Behavior |
|---|---|
| Dependabot / Code Scanning / Secret Scanning Alerts | n/a — export only, never restorable to GitHub. Alerts produced by GitHub Security services. |

### Cross-cutting warnings (apply to multiple item types)

| Trigger condition | Warning shown |
|---|---|
| Scope contains items that get new numeric IDs (issues, PRs, discussions) AND target is new repo or different org | ℹ️ Cross-references in restored bodies rewritten with annotation `#NEW (originally #N)`. Markdown code blocks, commit messages, external URLs not modified. |
| Scope contains items that reference users by username (members, collaborators, team perms, mentions) | ℹ️ Users no longer on GitHub render as inactive text — username visible but link dead, no notifications fire. |
| Scope contains Custom Property Values OR Custom Properties Schema | ℹ️ Property values that don't match current schema are skipped per property with restore log warning. |
| Scope contains Projects v2 | ⚠️ Project items reference issues/PRs by numeric ID — may not resolve if target IDs differ from source. |
| Bulk operation (DR or bulk repos) | ℹ️ Each item restored independently — failures don't roll back successes. Per-item status in Activity feed. Failed items can be retried. |
| Cross-region target detected | 🔴 **Cross-region transfer.** Source and target are in different regions. Requires documented legal basis (SCC, adequacy decision). Audit trail records cross-region flag. |
| Restore as fork mode (single repo only) | ℹ️ Fork inherits some settings from upstream that may override or conflict with restored Repo Config. Conflicts flagged in restore log. |

### Warning reference table

The table below is the canonical list of warnings the system shows to admins. Each row defines:
- **Warning ID** — stable identifier used across this document, frontend code, and audit log entries
- **Severity** — info / warn / critical
- **Trigger** — the scope condition that causes this warning to appear
- **Where shown** — which scenarios surface this warning, and whether it appears in target selection, review, or both

| Warning ID | Severity | Trigger | Where shown |
|---|---|---|---|
| `org-webhooks-active-override` | ⚠️ warn | Granular Org Config restore in Override mode AND scope includes webhooks | Scenario B review |
| `org-webhooks-active-skip` | ℹ️ info | Granular Org Config restore in Skip mode AND scope includes webhooks | Scenario B review |
| `webhook-secret-tokens` | ℹ️ info | Any scope that includes webhooks (Org or Repo) | Any review with webhooks in scope |
| `org-secrets-scope-only` | ℹ️ info | Scope includes Org Secrets | Scenario B review, DR review (when Org Config included) |
| `members-must-exist` | ⚠️ warn | Scope includes Members | Scenario B review, DR review (when Org Config included) |
| `teams-members-must-exist` | ⚠️ warn | Scope includes Teams | Scenario B review, DR review (when Org Config included) |
| `apps-not-auto-reinstalled` | ⚠️ warn | Scope includes Installed Apps OR whole Org Config | Scenario B review, DR review (when Org Config included) |
| `runner-groups-infra` | ⚠️ warn | Scope includes Runner Groups OR whole Org Config | Scenario B review, DR review (when Org Config included) |
| `projects-v2-refs` | ⚠️ warn | Scope includes Projects v2 OR whole Org Config OR whole Repo Config | Scenarios B / C / D / DR review |
| `repo-webhooks-active-override` | ⚠️ warn | Granular Repo Config in Override mode AND scope includes webhooks | Scenario E review |
| `repo-webhooks-active-skip` | ℹ️ info | Granular Repo Config in Skip mode AND scope includes webhooks | Scenario E review |
| `repo-secrets-scope-only` | ℹ️ info | Scope includes Repo Secrets | Scenario E review, single / bulk / DR review (when Repo Config included) |
| `branch-protection-app-deps` | ⚠️ warn | Scope includes Branch Protection Rules OR Rulesets OR whole Repo Config | Scenario E review, single / bulk / DR review (when Repo Config included) |
| `deploy-keys-private-gone` | ⚠️ warn | Scope includes Deploy Keys OR whole Repo Config | Scenario E review, single / bulk / DR review (when Repo Config included) |
| `environments-secrets-metadata` | ⚠️ warn | Scope includes Environments OR whole Repo Config | Scenario E review, single / bulk / DR review (when Repo Config included) |
| `custom-property-values-skip-invalid` | ℹ️ info | Scope includes Custom Property Values OR Custom Properties Schema OR whole Repo Config OR whole Org Config | Most reviews |
| `pages-singleton-rebuild` | ⚠️ warn | Scope includes Pages Settings OR whole Repo Config | Scenario E review, single / bulk / DR review (when Repo Config included) |
| `collaborators-must-exist` | ⚠️ warn | Scope includes Collaborators OR whole Repo Config | Scenario E review, single / bulk / DR review (when Repo Config included) |
| `team-permissions-team-must-exist` | ⚠️ warn | Scope includes Team Permissions OR whole Repo Config | Scenario E review, single / bulk / DR review (when Repo Config included) |
| `content-renumbering` | ℹ️ info | Whole-to-new restore (single, bulk, DR) — Repo Content with new IDs | Scenarios C / D / DR review |
| `pr-merge-snapshot` | ℹ️ info | Scope includes PRs (whole-to-new restore) | Scenarios C / D / DR review |
| `mention-degradation` | ℹ️ info | Scope includes user-referencing items (Members, Teams, Collaborators, Issues, PRs, Discussions) | Most reviews |
| `bulk-best-effort-repos` | ℹ️ info | Bulk repo restore (Scenario D) OR DR (Scenario A) | Scenarios D / DR review |
| `bulk-best-effort-items` | ℹ️ info | Bulk granular restore (Scenario B or E with multiple items selected) | Scenarios B / E review when more than one item is selected |
| `cross-region` | 🔴 critical | Source and target are in different regions | Target selection (inline, immediately after target chosen) AND review |
| `restore-as-fork-conflicts` | ℹ️ info | "Restore as fork" advanced option is enabled | Scenario C target step (immediately upon enabling) AND review |

#### Severity levels

Each warning has one of three severity levels. Frontend renders each severity with distinct visual treatment (color, icon) per the design system.

| Severity | When to use |
|---|---|
| **info** | Behavior the admin should know about but doesn't require any decision — e.g. "@mentions of removed users render as inactive text". Informational only. |
| **warn** | Behavior that may require admin action after restore, or affects how restored items will function — e.g. "Webhooks will be reactivated", "Deploy Keys may be invalid". Admin should review. |
| **critical** | Compliance, security, or data residency implications — e.g. cross-region transfer. Requires explicit acknowledgment of legal/compliance basis before proceeding. |

### Warning rendering requirements

The "Behavior notes" section in restore wizards (review step) must follow these rules:

1. **Scope-aware** — only warnings relevant to the actual items in the restore scope are shown. A warning about secrets must not appear when the admin is restoring only a Team.
2. **Deduplicated** — when multiple items in scope trigger the same warning, the warning appears once.
3. **Conditional rendering** — when the scope produces zero warnings, the "Behavior notes" section is not shown at all (no empty section).
4. **Order independent of selection order** — warnings render in a stable order so admins navigating back to the review step see consistent output.

#### Wizard placement matrix

| Wizard | Where warnings appear |
|---|---|
| Scenario A (DR) | Review step |
| Scenario B (Granular Org Config) | Review step |
| Scenario C (Single repo whole-to-new) | Review step |
| Scenario D (Bulk repos) | Review step |
| Scenario E (Granular Repo Config) | Review step |
| Scenario F (Repo Content) | Falls back to Scenario C — see Scenario C requirements |
| Scenarios G/H (export) | Not applicable — export is read-only, no behavior changes on GitHub |
| Scenarios I/J (download) | Inline contextual info in the modal body (per item type) — no separate "Behavior notes" section |

#### Examples — what an admin sees per scope

**Example 1 — Restore a single Team (Scenario B, scope = one Team item):**
- `teams-members-must-exist` (warn)
- `mention-degradation` (info)

The admin does NOT see warnings about secrets, webhooks, deploy keys, or other items not in scope.

**Example 2 — Restore single repo whole-to-new with all default options (Scenario C):**
- `content-renumbering` (info)
- `pr-merge-snapshot` (info)
- `mention-degradation` (info)
- `webhook-secret-tokens` (info)
- `repo-secrets-scope-only` (info)
- `branch-protection-app-deps` (warn)
- `deploy-keys-private-gone` (warn)
- `environments-secrets-metadata` (warn)
- `custom-property-values-skip-invalid` (info)
- `pages-singleton-rebuild` (warn)
- `collaborators-must-exist` (warn)
- `team-permissions-team-must-exist` (warn)
- `projects-v2-refs` (warn)

**Example 3 — Restore Webhooks category in Override mode (Scenario E):**
- `repo-webhooks-active-override` (warn) — most important
- `webhook-secret-tokens` (info)

The admin does NOT see warnings about secrets, deploy keys, environments, or other Repo Config items not in scope.

---

## 14. Per-object behavior catalog

This section consolidates per-object behaviors across scenarios. Each row answers: when this object is restored (in any scenario that includes it), what happens?

### Issues

| Aspect | Behavior |
|---|---|
| Numeric ID | New ID assigned by GitHub on creation in target repo |
| Original ID | Preserved as inline header in issue body: `Originally Issue #N from <source-org>/<source-repo> created on <date>` |
| Author | Restore operator; original author shown in inline header |
| Comments | Each restored as new comment with original-author header |
| Comment timestamps | Preserved as text in headers; system timestamps reflect restore time |
| Reactions | Aggregated counts preserved per emoji + per original reactor |
| Assignees | Preserved if assignees still exist in target org/repo |
| Labels | Reapplied by name (if same label exists in target repo) |
| Milestones | Reapplied by name |
| References to other issues (`#123`) | Rewritten to new IDs with visible annotation when target IDs change. Same-repo `#N` → `#NEW (originally #N)`. Cross-repo `org/repo#N` and full URLs preserved as-is. |
| Mentions (`@user`) | Preserved as text. Users not re-notified. If user no longer exists on GitHub, mention renders as inactive/struck-through text via GitHub graceful degradation — username remains visible (admin can identify "who did this") but link is dead. No restore engine action required. |
| Closed state | Preserved |
| Closed-by-PR reference | Broken if PR number changes |
| Locked state | Preserved |
| Pinned state | Not restored (pin is a per-org curation) |

### Pull Requests

| Aspect | Behavior |
|---|---|
| Numeric ID | New ID |
| Original ID | Inline header in body |
| Head / Base branches | Preserved if branches restored (whole-repo and DR include all branches) |
| Diff | Reconstructed from Git history (commits unchanged) |
| Reviews | Preserved with original reviewer in inline header |
| Review comments | Preserved with original author + line annotations |
| Approval state | Preserved (approved / changes requested / commented) |
| Required status checks | Re-evaluated by current branch protection rules + current GitHub Actions; status badges may show as pending until first run |
| Merge state | Preserved as snapshot (merged / closed / open) |
| Re-merging a restored PR | Not possible programmatically — PR is snapshot of historical state |
| Merge commit may be missing in restored Git history | Possible edge case: PR's merge commit may not be present in restored Git history if backup snapshot was taken before merge happened or after a force-push that rewrote history. Restored PR description gets inline annotation: *"⚠ This PR's merge commit may not be present in restored Git history. Verify branch state matches PR status."* Implementation: simple text injection during PR restoration, no merge-state detection logic required. |
| Linked issues (`Closes #N`) | Broken if numeric IDs change |
| Draft state | Preserved |

### Webhooks

| Aspect | Behavior |
|---|---|
| URL | Preserved exactly |
| Subscribed events | Preserved exactly |
| Secret token | **Never in backup** — write-only field on GitHub, API returns asterisks instead of the actual value. Restored webhook arrives without a secret. Admin must manually re-enter the token in GitHub UI / API after restore for endpoint signature validation to work. See Webhook secret tokens catalog entry below for full behavior. |
| Content type (JSON / form) | Preserved |
| SSL verification flag | Preserved |
| Active state | **Depends on flow**: ACTIVE for granular restores to existing scope, INACTIVE for whole-to-new and DR |
| Delivery history | Not restored (logs are GitHub-side) |

### Secrets (Org / Repo / Environment / Dependabot — all secret types)

| Aspect | Behavior |
|---|---|
| Name | Preserved |
| Created at / updated at | Preserved as metadata |
| Scope (which repos can use Org-level secret) | Preserved |
| **Value** | **NEVER in backup. Always absent on restore.** |
| Post-restore action | Manual re-entry of value via GitHub UI or API |

### Branches

| Aspect | Behavior |
|---|---|
| Branch ref (HEAD pointer) | Preserved |
| Default branch flag | Preserved |
| Protection (via Branch Protection Rules) | Reapplied via Repo Config restore (separate from Content) |
| Branch tracking from forks | Not restored |

### Tags

| Aspect | Behavior |
|---|---|
| Tag ref | Preserved |
| Annotated tag metadata | Preserved |
| Tag protection rules | Reapplied via Rulesets in Repo Config |

### Releases

| Aspect | Behavior |
|---|---|
| Tag association | Preserved |
| Release name + notes | Always restored |
| Pre-release / draft state | Preserved |
| Latest-release flag | Preserved on most recent |
| Binary assets | **Toggleable** — restored only if Releases toggle ON; without it, release exists with no downloadable artifacts |
| Download counts | Not restored (analytics) |

### Wiki

| Aspect | Behavior |
|---|---|
| Pages content | Preserved |
| Internal wiki links | Preserved (link by slug, slugs unchanged) |
| Wiki page history | Wiki is a separate Git repo; full history restored |
| Sidebar / footer customization | Preserved |

### GitHub Pages

| Aspect | Behavior |
|---|---|
| Source branch + folder | Preserved |
| Custom domain | Preserved |
| HTTPS enforcement flag | Preserved |
| **Live site state** | Pages rebuilds on next push to source branch — site URL (default `<user>.github.io/<repo>`) changes if repo name changes |

### Members / Teams / Collaborators / Team members

| Aspect | Behavior |
|---|---|
| User identity | Resolved by GitHub username — must exist on GitHub |
| User missing on GitHub | Restoration of that membership fails — flagged in restore log; admin reviews |
| Permission level | Preserved |
| Invitation state | If user not yet org member, GitHub sends invitation flow on restore (membership starts in "pending" state until user accepts) |
| GitHub native re-add behavior | If a user was an organization member within the last 3 months, GitHub automatically offers to "restore their privileges" or "start fresh" when re-adding them. The Veeam restore replays the original membership which preserves role + team memberships; admin should be aware that GitHub-side privilege history may also influence what is restored if the user left recently. |
| **Team members (individual restore)** | A single team member is granularly restorable as a leaf item in Scenario B. GitHub API supports `PUT /orgs/{org}/teams/{team_slug}/memberships/{username}` for adding individuals back to a team — used when admin accidentally removed a user from a team and needs to restore that single membership without restoring the entire team. |
| Team member preview | Drill: Org Config → Teams → {team-name} → drill into team to see member list. Each member has Preview + Download + Restore actions. |
| Rate limits | Organization owners are limited to 50 invitations per 24 hours (500 if org is more than 1 month old or on paid plan). For bulk member restore, this rate limit applies and the restore engine paces invitations accordingly. |

### Webhook secret tokens (write-only field)

Webhook secret tokens deserve a dedicated note because their behavior surprises admins who expect "full restore = full restore":

| Aspect | Behavior |
|---|---|
| Backup contains the secret token | **No.** GitHub returns webhook config as `null` for the `secret` field after it's been set (write-only field). No backup product, including Veeam, has access to it. |
| Restored webhook signature validation | If receiving endpoints validate the `X-Hub-Signature-256` header, those validations will fail until the admin manually re-enters the secret token in GitHub UI/API after restore. |
| Restored webhook delivery | Webhook deliveries succeed at the HTTP level (POST happens) but endpoint-side validation rejects them as forged. |
| Admin action required | Re-enter secret token via GitHub UI: Settings → Webhooks → click webhook → fill "Secret" field → Update webhook. Or via API: `PATCH /repos/{owner}/{repo}/hooks/{hook_id}` with `{config: {secret: "..."}}`. |
| Frontend handling | Show `webhook-secret-tokens` info bar in any restore flow that includes webhooks. Download flows show this in the redaction note. |

### Custom Property Values (per-repo property assignments)

| Aspect | Behavior |
|---|---|
| Property values | Preserved |
| Schema dependency | Custom Properties Schema must exist on target org. If schema is missing or has changed since backup, individual property values that don't conform to current schema are skipped during restore with restore log warning. No automatic schema migration. |

### Projects v2

| Aspect | Behavior |
|---|---|
| Project structure (views, fields, automations) | Preserved |
| Project items (referenced by issue/PR ID) | **References break** if issue/PR numeric IDs change (DR / cross-repo / whole-to-new) |
| Granular project restore to source org | Item references stay valid |
| MVP behavior | Project structure restored; item references preserved as-is. Wizard warns admin that refs may not resolve in target. Automatic ID remapping deferred to V2. |

---

## 15. Cross-cutting rules

### 15.1 Veeam restore safety property
**No restore mode ever deletes items in production that are not in the backup snapshot.** Applies to:
- DR with override
- Granular Override
- Granular Skip (trivially, since it doesn't even touch existing items)
- Whole-to-new (n/a — target is new, nothing to delete)

Items in production but not in backup → always untouched.

### 15.2 Webhook ACTIVE / INACTIVE rule
- Restore creates a NEW org/repo → webhooks INACTIVE
- Restore writes to EXISTING org/repo → webhooks ACTIVE

Reasoning: target endpoints (CI, monitoring, integrations) reach this object by URL. New URL = endpoints don't know it.

### 15.3 Secret values rule
GitHub API does not return secret values once written. Backup stores name + metadata only. Every restore of a secret → value is absent → manual re-entry required.

### 15.4 GitHub App constraint on org creation
Standard backup connector App cannot create new GitHub Organizations. All cross-org restore destinations must already exist on GitHub with the backup connector App installed.

### 15.5 Original metadata preservation rule
Restored objects (issues, PRs, comments, discussions) include an inline header at top of body containing:
- Original ID / number
- Original author username
- Original creation date
- Source org/repo

This is text inside the body — visible when reading, not a structural metadata field.

### 15.6 Numeric ID renumbering rule
Issues, PRs, Discussions get new numeric IDs on creation in target repo. Same-repo references (`#123`) inside body text are rewritten to new IDs with visible annotation `#NEW (originally #N)`. See section 13.5 for full rules. Cross-repo references and external URLs are preserved as-is.

### 15.7 Notification suppression
Restored objects do not generate notifications. Users referenced via `@mentions` are not notified. This protects against notification storms during DR / large bulk restores.

### 15.8 Conflict resolution applicability
- Skip / Override applies only to **granular** restore (B and E scenarios)
- Whole-to-new (C, D) — target is new, no conflicts
- DR (A) — always Override (Skip semantically doesn't make sense for DR)

### 15.9 Restore point selection model
- Single object → radio list of available snapshots (single-repo C wizard, granular B/E wizards)
- Multiple objects with potentially different policies → datetime + auto-match (DR A wizard, bulk D wizard)

---

## 16. Behavior decisions & open enterprise questions

This section captures finalized behavior decisions plus open questions flagged for product roadmap consideration. Decision IDs (13.1, 13.2, ...) are stable identifiers used across PRDs, code, and prototype — they intentionally do not match the section number.

All decisions in 13.1–13.10 are **committed for MVP** unless marked otherwise. Decisions 13.11–13.15 are **enterprise expectations flagged for product roadmap** — out of scope for MVP but documented for stakeholder alignment. Decisions 13.16–13.18 are **deferred MVP scope choices** — known scenario gaps that have an explicit V2 target.

### 13.1 Cross-org for granular Org Config — DECIDED: NO in MVP

Granular Org Config restore is locked to source org. No target picker, no cross-org advanced toggle.

**Reasoning:**
- Granular semantic is "fix mistakes in source" — adding cross-org changes the meaning
- Enterprise lens: fewer advanced toggles = fewer accidental misconfigurations under pressure
- Members / Teams / Custom Roles are particularly sensitive (privilege escalation risk in cross-org)

**Future consideration:** if customer demand emerges, V2 can add cross-org with restrictions (excluded categories: Members, Teams, Custom Roles, Installed Apps).

### 13.2 Override behavior for secrets — DECIDED: scope-only update

Secret values are never written or modified by restore in any mode. Override updates only secret scope (visibility / selected_repository_ids). Production secret values remain untouched.

**Reasoning:**
- GitHub API does not allow creating or updating a secret without an `encrypted_value` — there is no metadata-only PATCH endpoint
- Backup never stores secret values (GitHub API constraint — values are write-only)
- Therefore "Override secret value" is technically impossible without destroying production value
- "Override scope" (which repos can use the secret) is the only meaningful Override action for secrets

**Behavior:**
- Skip mode: existing secret untouched
- Override mode: existing secret value untouched, scope updated from backup

### 13.3 Custom Properties — DECIDED: support in MVP, skip invalid values

Custom Properties Schema and per-repo Custom Property Values are backed up and restorable as part of Org Config (Schema) and Repo Config (Values).

**Behavior:**
- Schema restore follows standard granular Skip/Override on property name
- Per-repo Property Values restore validates against current schema before write
- Invalid values (property removed, type changed, value not in current allowed list) are skipped with restore log warning per item:
  - `SKIPPED: property "team_owner" — value "alpha-team" not in current allowed values`
  - `SKIPPED: property "criticality" — type changed from string to enum, value "high" not valid`
- No automatic schema migration logic — admin reconciles schema changes separately

### 13.4 Projects v2 references — DECIDED: best-effort with warning in MVP

Projects v2 items reference issues/PRs by numeric ID. After whole-repo or DR restore, IDs change in target → references break.

**MVP behavior:**
- Projects v2 structure restored (views, fields, automations)
- Item references preserved as-is (point to original IDs)
- Review step shows warning: *"Projects v2 in this scope reference issues and pull requests by numeric ID. After restore, references may not resolve correctly for items in repositories that get new IDs. Review affected projects after restore."*
- Restore log captures: "N Projects items reference issue/PR IDs that may not exist in target"

**V2 backlog:** automatic ID remapping within restore session (track source-to-target ID mapping, rewrite Projects items at end of batch).

### 13.5 Cross-reference rewriting in body text — DECIDED: rewrite with annotation

Body text in restored issues, PRs, discussions, and comments containing same-repo references (`#123`) is rewritten to new IDs with visible annotation showing original ID.

**Behavior:**
- Same-repo `#N` references → rewrite to `#NEW (originally #N)`
- Cross-repo references (`org/repo#N`) → leave as-is (target repo IDs unchanged in source)
- Full URLs (`https://github.com/...`) → leave as-is
- Markdown code blocks (` `` ` and triple-backtick) → never modified
- Git commit messages → never modified (commit content-addressed; modifying would break Git integrity)

**Restore notes header in body:** *"This content was restored from backup. Cross-references to other issues and pull requests in this repository have been updated to match the restored ID space — original numbers shown in parentheses."*

**Review step** shows info explaining this behavior before admin confirms.

**Audit trail:** restore log captures count of rewritten references per restored object.

### 13.6 Bulk restore partial failure — DECIDED: best-effort with per-item report

Bulk operations (Scenario D, DR Scenario A) continue past individual failures, report per-item outcome.

**Behavior:**
- Each repo / item attempted independently
- Per-item status in Activity feed: ✓ success / ⚠ partial / ✗ failed (with reason)
- Summary at end of batch: "N succeeded, M failed, K partial"
- "Retry failed" action available after batch
- No automatic rollback of completed restores
- Email notification with full report when batch completes

**Reasoning:**
- Aligns with Veeam B&R + VDC standard for bulk operations across other workloads
- Maximize successful restores under stress conditions
- Failed items can be retried without redoing successful ones
- Auto-rollback would be more destructive (restored repos may already be in active use)

### 13.7 Webhook on Override — DECIDED: ACTIVE with explicit warning

Override of Repo Webhook or Org Webhook restores the webhook in ACTIVE state. Wizard surfaces this with a prominent warning bar before confirmation.

**Reasoning (developer-as-owner consideration):**
- Backup admin (operator) typically does NOT have GitHub UI access to the affected repo
- Repo developer (owner) may not know restore happened
- INACTIVE restored webhook → silent failure: developers waste time debugging missing notifications/CI events
- ACTIVE restored webhook → first event fires to downstream system → developers get visible signal that something changed
- Webhook configs come from trusted backup snapshot (not arbitrary source) — reactivation risk is acceptable

**Wizard behavior:**
- Review step shows prominent warning:
  > *"Webhooks will be reactivated and may fire on next matching event. Verify integrations are ready to receive events from this repository before confirming."*
- Audit trail captures: webhook restored ACTIVE, expected first-fire window
- Restore log notes per webhook: "Webhook restored ACTIVE — endpoint URL: `<URL>`"

**Exception (whole-to-new flows):** webhooks restored to a NEW repo (Scenario C, D) or NEW org (DR Scenario A) remain INACTIVE because target endpoints don't recognize the new URL. ACTIVE-on-Override applies only to granular restore back to existing source repo/org.

### 13.8 "Closed by PR #N" automatic references — DECIDED: rewrite via API

GitHub renders "Closed by PR #N" using the issue's `linked_pull_requests` association field, not literal body text. Restore engine sets this association to the restored PR's new ID at issue creation time.

**Behavior:**
- Issue restored with `linked_pull_requests` containing new PR IDs (mapped from source IDs)
- GitHub UI renders correct "Closed by PR #NEW" widget automatically
- No body text parsing required (it's structured metadata)

**Implementation note:** one extra API call per restored issue with linked PRs. Negligible performance impact.

### 13.9 Cross-region / cross-instance restore — DECIDED: hard block by default, settings-controlled escape

Restore target selection in any restore wizard offers **only organizations in the same region as the source** by default. Cross-region targets are not selectable in this state.

**Settings-controlled escape (Platform Admin role):**
- The product Settings area (separate from the restore wizard) exposes the option: **"Allow cross-instance / cross-region restore: Disabled"** (default)
- Toggling to Enabled requires Platform Admin role (not Backup Admin role) — separation of duties
- Setting state changes are recorded in the audit log with operator identity, timestamp, and the new state
- When Enabled, target selection in restore wizards expands to include cross-region organizations. Each target's region is identifiable, and targets in regions different from the source are explicitly marked as cross-region.
- Selecting a cross-region target requires explicit admin confirmation that documented legal basis exists (Standard Contractual Clauses, adequacy decision, or other compliance authorization). The admin cannot proceed without this confirmation.
- The audit log captures cross-region operations with explicit consent flag, source region, and target region.

**Region detection:**
- Each connected Org's Enterprise affiliation determines its instance host (`<name>.ghe.com` for GHE.com Data Residency, `github.com` for default)
- Region is derived from the Enterprise data residency setting (EU / US / AU / Japan / etc.)
- Stored in Org metadata at connector setup time

**Reasoning (enterprise lens):**
- Customers paying for GHE.com Data Residency expect zero accidental cross-region transfers
- Backup admin under incident pressure should not make compliance decisions
- Separation of duties: cross-region permission is platform/compliance decision, restore execution is operations decision
- Hard block in UI eliminates accidental compliance breaches; settings-controlled escape supports legitimate multi-region DR strategies

### 13.10 Restore points beyond retention — DECIDED: not possible

Admin selects from available snapshots only. Datetime picker (DR, bulk) constrained to `[oldest_snapshot, newest_snapshot]` range. Radio list (single-repo, granular) shows only available snapshots. No edge case to handle — UI prevents invalid selections.

---

## Enterprise expectations flagged for product roadmap

The following are **enterprise customer expectations** identified during design review. They are **out of scope for MVP** but documented to align stakeholders on what enterprise customers will expect from the product over time.

### 13.11 RBAC — granular roles for restore operations

Enterprise customers expect granular role-based access control within the Veeam product, not single-role "backup admin" that can do everything.

**Expected roles:**
- **Backup Operator** — can run restore in same-region default scope
- **Senior Backup Admin** — can run DR restore (whole org)
- **Platform Admin / Compliance Officer** — can change product-level settings (e.g. cross-region restore enable/disable)
- **Read-only Auditor** — can view audit trail and restore history, cannot run operations

**MVP position:** single backup-admin role, all operations available. Enterprise customers will request granular RBAC.

**Roadmap target:** V2.

### 13.12 Approval workflows for destructive operations

Enterprise customers expect 4-eyes approval for high-impact operations:

- DR restore (whole org) → second-person approval required
- Override mode in granular restore → optional approval based on customer config
- Cross-region restore → second-person approval required
- Restore from snapshot older than configurable threshold (e.g. 30 days) → optional approval

**Workflow:** backup admin initiates → approval queue → senior admin approves → restore executes.

**MVP position:** no approval workflows; all operations execute on Confirm.

**Roadmap target:** V2 / V3.

### 13.13 Data classification policy enforcement

Enterprise customers use GitHub Custom Properties for data classification (e.g. `data-sensitivity: restricted`, `compliance-framework: PCI-DSS`). They expect the backup product to honor these classifications during restore.

**Expected behavior:**
- Repo with `data-sensitivity: restricted` → cross-region restore blocked even when general setting is enabled (property-driven additional gate)
- Repo with `compliance-framework: PCI-DSS` → may require additional approval for any restore
- Customer-configurable policy mapping (which properties trigger which restrictions)

**MVP position:** Custom Properties are backed up and restored as data, but do not drive policy enforcement on restore operations.

**Roadmap target:** V2+. Requires policy engine in product.

### 13.14 Dry run mode for destructive operations

Enterprise admins want to preview the full restore plan before executing destructive operations (DR, Override, bulk).

**Expected behavior:**
- Wizard offers "Dry run" alternative to "Confirm"
- Dry run executes all validation checks (target availability, schema compatibility, RBAC, etc.)
- Output shows detailed plan: "would restore X items, would skip Y, would fail on Z (reason)"
- No real operation performed
- Dry run report exportable for compliance officer review

**MVP position:** no dry run mode.

**Roadmap target:** V1.5 / V2 — strong enterprise expectation, should be prioritized early.

### 13.15 Connector read-only mode

Some enterprise customers want to install the backup connector in read-only mode (backup-only, restore disabled at the connector level).

**Expected behavior:**
- Default connector posture: read-only (backup operations only)
- Restore capability requires explicit unlock at connector settings level
- Unlock requires Platform Admin role
- Audit trail captures restore-capability state changes

**MVP position:** connector has unified backup+restore capability; no read-only mode.

**Roadmap target:** V2. Aligns with separation-of-duties expectations and zero-trust security postures.

## Deferred MVP scope choices

### 13.16 Override-existing-repo for whole-repo restore (Scenarios C and D) — DEFERRED

In MVP, single-repo (Scenario C) and bulk-repo (Scenario D) restore always create new repositories with `{original}-restored-{YYYYMMDD}` naming. There is no option to override an existing repository in place.

**Why this is deferred:**

In-place override of an existing repository is a destructive operation with high blast radius — it would replace an active repo's git history, content, and config wholesale. Enterprise customers are split on whether this should ever be allowed. Some scenarios where admins want it:

- Disaster recovery where the original repo still exists but has been corrupted (compromised, ransomware, accidental force-push)
- Pre-production rollback where admin wants to reset a staging repo to a known-good state without changing its name (preserving CI/CD references, integrations, deploy keys)

**Constraints that make this hard in MVP:**

- Override semantics for git history are ambiguous (force-push vs new-history vs preserve-and-merge)
- Webhooks, secrets, environments, deploy keys all have to be reconciled — same problems as Override mode in Scenario B / E but compounded
- Approval workflow (decision 13.12) is essentially mandatory for an in-place destructive operation of this size
- Dry-run mode (decision 13.14) is essentially mandatory before allowing it

**MVP position:** always create new repo. Admin who needs override-in-place can: (a) restore as new repo, (b) manually retire the original, (c) rename the restored repo to take over the original name. This preserves the audit trail and avoids destructive operations without explicit safeguards.

**Roadmap target:** V2 — paired with approval workflow + dry-run requirements. Single-repo (C) and bulk (D) decisions can be made together.

### 13.17 Cross-repo granular Repo Config copy — DEFERRED

In MVP, granular Repo Config restore (Scenario E) always targets the source repo. Admins cannot select a granular Repo Config item from one repo and restore it into a different repo.

**Why some admins want this:**

- Standardize webhooks across multiple repos by copying from a "template" repo
- Apply branch protection from a known-good repo to a newly created one
- Recover a single config item from a deleted repo into its replacement

**MVP position:** for these use cases, admins can use Scenario J (Granular Object Download) to extract the JSON, then manually apply it via GitHub API or UI. Cross-repo automated copy adds significant complexity (target validation, conflict resolution against existing items, API permission scoping per item type).

**Roadmap target:** V2 — likely surfaced as a "Copy config from another repo" action separate from the Restore wizard, since it's a copy operation rather than a recovery operation.

### 13.18 Whole-Org-Config restore as a standalone scenario — DEFERRED

In MVP, whole-Org-Config restore is available only as part of DR (Scenario A) — it is one layer within the DR wizard. There is no standalone "restore the entire Org Config without restoring the repos" wizard.

**Why some admins want this:**

- Recover from accidental org-wide config changes (mass webhook deletion, accidental removal of all Custom Property schemas) without touching repos
- Apply a known-good Org Config baseline to a freshly created org

**MVP position:** admin can use Scenario B1 (granular Org Config — all 15 categories) which functionally restores all Org Config layers but is positioned as a "granular all" rather than a dedicated whole-Org-Config restore. This works but the labeling can be confusing — admin doing org-wide recovery doesn't think of it as "granular".

**Roadmap target:** V2 — rebrand or split out as a dedicated scenario with clearer positioning. Functional behavior is largely already in B1.

---

## 17. Product requirements — supplementary behaviors

This section consolidates supplementary product requirements that span multiple scenarios. These are functional requirements about what the system must do, not how the UI presents them. The design system and UX team own the visual realization.

### 17.1 Advanced options grouping

**Applies to:** Scenario C, Scenario D.

**Requirement:** The target step in single-repo and bulk-repo restore wizards exposes optional behaviors that change the default restore semantics. These optional behaviors are grouped together as "advanced options" so admins using defaults aren't burdened with decisions they don't need to make.

**Advanced options per scenario:**
- **Scenario C** (single repo whole-to-new): "Restore to a different organization", "Restore as fork of original repo"
- **Scenario D** (bulk repos): "Restore to a different organization"

**Behavior:**
- The advanced options are not surfaced in the primary flow path — admins must opt in to viewing them
- When an admin enables any advanced option, the system indicates that an advanced option is currently active so the admin remains aware of the non-default state when reviewing the operation later
- Each advanced option, when enabled, surfaces its own constraints or implications inline (e.g. cross-region warnings, fork conflict notes) without forcing the admin to navigate to the review step to see them

### 17.2 Bulk restore — large repository lists

**Applies to:** Scenario D.

**Requirement:** Bulk restore operations may include 100s or 1000s of repositories. The system must remain readable and usable at this scale.

**Behavior:**
- The target naming step displays the source-to-target name mapping with the total count visible at all times. When the list is short enough to read at a glance, all rows are shown. When the list is long, the system shows enough rows for the admin to verify the naming pattern is correct and indicates how many additional repositories follow the same pattern without listing them individually.
- The review step shows a preview of the repositories included in the operation. When the list is short enough, all repositories are listed. When the list is long, a representative subset is shown by default with an explicit option to see the full list. The total count is always visible.
- The naming pattern is always `{original-name}-restored-{YYYYMMDD}` and applies uniformly to all repositories in the bulk operation.

### 17.3 Repository download — restore point selection

**Applies to:** Scenario I (Repository Download).

**Requirement:** When downloading a repository archive, the admin must be able to choose any retained restore point — not only the most recent. This matches the parity expectation with restore wizards where any retained point is selectable.

**Behavior:**
- All retained restore points are available for selection
- The most recent restore point is selected by default and is identifiable as the most recent
- Each restore point is identified by date, time, snapshot type (daily/weekly/monthly), and age relative to "now"
- The generated archive filename embeds the date of the selected restore point so that downloaded files are unambiguous when archived locally

### 17.4 Repository download — archive format

**Applies to:** Scenario I (Repository Download), and the bulk variant.

**Requirement:** The admin must be able to choose between `.tar.gz` and `.zip` archive formats. Single-object downloads (Scenario J) are JSON only — no format choice applies.

**Behavior:**
- `.tar.gz` is the default format, recommended for environments where the archive will be cloned back as a Git repository (preserves Unix file permissions)
- `.zip` is offered for universal compatibility with Windows tools and drag-drop environments
- The format setting applies uniformly to all repositories in a bulk download — no per-repository format

### 17.5 Download messages — scope-aware content

**Applies to:** Scenarios I and J.

**Requirement:** The information shown to the admin when initiating a download must be specific to the item type being downloaded. Generic messages create confusion when the admin sees fields described that don't apply to the item they're downloading (e.g. "comments and reactions" when downloading a Webhook).

**Behavior:**
- Each downloadable item type has a dedicated description explaining what the resulting JSON or archive contains
- Each item type that has redacted fields (secret values, private keys, tokens, credentials, infrastructure references) shows a redaction notice explaining what is omitted and why
- Items with no redactions show no redaction notice
- The full item-type-to-message mapping is defined in section 12 (Per-object download — what's included in JSON)

### 17.6 Cross-region restore controls

**Applies to:** Scenarios A, C, D, and the system-wide settings.

**Requirement:** Cross-region restore (transferring backed-up data from one region to another) has compliance and data residency implications and is not allowed by default. Admins with sufficient privilege can enable it for their tenant. When enabled, individual cross-region operations still require admin acknowledgment.

**Behavior:**
- A tenant-level setting controls whether cross-region targets are selectable. The setting defaults to disabled.
- Only admins with the Platform Admin role can change the setting. Changes are recorded in the audit log.
- When the setting is disabled, target organization pickers in restore wizards exclude cross-region targets and indicate to the admin that cross-region targets exist but are filtered out, with a path to the setting.
- When the setting is enabled, target organization pickers include cross-region targets. The admin sees a region indicator on each target and an explicit cross-region marker on targets in regions different from the source.
- Selecting a cross-region target raises the `cross-region` warning at the moment of selection — the admin sees the implication immediately, not only at the review step.
- The review step repeats the cross-region warning so the admin acknowledges it before confirming.
- The cross-region flag is included in the audit log entry for the restore operation, including source region and target region.

### 17.7 Action availability per row

**Applies to:** All inventory views and drill levels.

**Requirement:** Admins must be able to take the right actions on the right object types from anywhere in the inventory, without having to navigate to a specific entry point. The system surfaces only actions that are valid for the given object.

#### Repository rows (inventory list and Org drill)
- **Download** — opens whole-repository download (Scenario I)
- **Restore** — opens whole-repo restore wizard (Scenario C)

#### Organization rows (inventory list)
- **Restore** — opens DR wizard (Scenario A)
- No download in MVP (whole-org download is not in scope for MVP)

#### Folder row — Repo Config or Org Config category
- **Download** — downloads the entire category as a ZIP of JSONs (Scenario J — category)
- **Restore** — opens granular wizard with the entire category in scope (Scenarios B / E)

#### Folder row — Repo Content category (Issues, PRs, Branches, etc.)
- **Download** — downloads the entire category as a ZIP of JSONs (Scenario J — category)
- Restore is not available at the category level. Repo Content cannot be granularly restored — admin must drill into the category and use whole-repo restore from the toolbar.

#### Folder row — Audit Log or Security Alerts category
- **Export** — opens the relevant export modal (Scenarios G / H). These categories are read-only on the GitHub side (cannot be restored at all).

#### Leaf item — granularly restorable (Webhook, Secret metadata, Member, Team member, Branch Protection rule, etc.)
- **Preview** — opens the preview drawer
- **Download** — downloads single item as JSON (Scenario J — single)
- **Restore** — opens granular wizard with single item in scope (Scenarios B / E)

#### Leaf item — Repo Content (single Issue, PR, Branch, Wiki page, etc.)
- **Preview** — opens the preview drawer
- **Download** — downloads single item as JSON (Scenario J — single)
- Single-item restore is not available. To restore an individual issue or PR, admin downloads its JSON for reference and uses whole-repo restore for full recovery.

#### Leaf item — export-only (audit event, security alert)
- **Preview** — opens the preview drawer
- **Export** — exports as JSON (Scenarios G / H)
- No restore. No separate download.

#### Repository drill toolbar
- **Download Repository** — opens whole-repository download (Scenario I)
- **Restore Repository** — opens whole-repo restore wizard (Scenario C)

These two actions are always present at the top of the drill view when the admin is inside a repository, regardless of which sub-section they're viewing.

#### Multi-select bulk action bar
- **Restore selected** — bulk restore (Scenarios D for repos, B-multi or E-multi for items)
- **Download selected** — bulk download (Scenario I bulk variant for repos, Scenario J bulk for items)
- **Clear** — clears the selection

#### Preview drawer footer
- For granularly-restorable items: **Download as JSON** + **Restore this item**
- For Repo Content items: **Download as JSON** + **Restore Repository**
- For export-only items: **Export to JSON** (no separate download — these are already export-only)

### 17.8 Settings — Platform Admin controls

**Applies to:** System-wide.

**Requirement:** Some settings affect product-wide restore behavior and must only be changeable by users with elevated privilege. These settings are surfaced in a dedicated Settings area, separate from per-operation choices.

**Settings available in MVP:**
- **Allow cross-instance / cross-region restore** (see 17.6 Cross-region restore controls)

**Behavior:**
- The Settings area is reachable from a global entry point in the application
- Only Platform Admin role can change settings — other roles see a read-only view
- All setting changes are recorded in the audit log with operator and timestamp
- The Settings area also displays a read-only inventory of connected organizations with their region, so admins can confirm what cross-region implications would apply

### 17.9 Confirmation summary

**Applies to:** All restore wizards.

**Requirement:** When the admin confirms a restore operation, the system presents a summary of what was submitted. This summary serves as audit-trail-relevant acknowledgment and as a record the admin can refer to.

**Information included in the summary:**
- Scenario type and source identifier (org, repo, or both)
- Target identifier (org, new repo name)
- Restore point (date and time)
- Layers and content options selected
- Conflict mode (Override / Skip) where applicable
- Cross-region flag with source and target regions when cross-region applies
- Bulk best-effort note for bulk and DR operations
- Webhook reactivation note when webhooks are restored in Override mode
- Secret scope-only note when secrets are in scope
- Restore-as-fork tag when that advanced option is enabled

**Audit trail correspondence:** the same fields included in the summary are written to the audit log entry for the restore operation. Operator identity, timestamp, and per-item outcomes are added by the system.

---

*End of document.*
