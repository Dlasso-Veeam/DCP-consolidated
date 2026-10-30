/* ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
   AGENT SESSIONS — the one dataset behind the Agent Hub's charts and Activity's Agents lens (2026-10-29).

   Activity is the system of record and the hub only summarises it, so a chart's number has to be the number of rows you
   land on when you click it. That is only true if both pages read the SAME sessions. This module generates them once,
   deterministically, and each page asks for what it needs:
     - the hub counts them (VDC_SESSIONS.sessions(), filtered to its window and scope);
     - Activity lists them (VDC_SESSIONS.activityRows()), tagged so its Decision / Skill filters can find them.

   ONE 90-DAY SET. Per skill, `runs` x 3 sessions are spread evenly newest-to-oldest across 90 days, so exactly `runs`
   fall inside the last 30 — the same per-skill totals Agent Settings publishes (CAPS[].runs: monitor 38, restore 15,
   export 6, policies 3). A 7- or 30-day view is a filter of this set, never a re-draw, so the same session keeps the
   same id on every page and every range.

   STAGED, NOT DRAWN. Denials and failures follow a fixed cadence per skill (every Nth session), and recent non-auto
   sessions alternate into the approval queue. A seeded random draw can land on zero failures or an empty queue, which
   makes a success-rate chart read 100% and hides the very row the Hub exists to raise.

   A session is exactly ONE of  auto | approved | denied | waiting.  Only a session that RAN (auto or approved) has an
   outcome (success | failed): a denied session was declined, not failed, and a waiting one has not run.
   ══════════════════════════════════════════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var DAY = 86400000, WINDOW = 90, KEY_RESOLVED = 'vdc-session-resolved';

  /* The skills, mirrored from Agent Settings' CAPS. Reach is attributed to SKILLS and their workload scope — never to
     named standing agents (one orchestrator, ephemeral task agents). `type` is Activity's closed Type vocabulary. */
  var SKILLS = [
    { id: 'monitor',      name: 'Monitor & report',          access: 'Read',                      tier: 'Report',    auto: false, runs: 38, cats: '*',
      type: 'Report',   grant: 'Monitor & report · read only',        title: function (w) { return 'Monitor ' + w + ' and report what needs attention'; } },
    { id: 'restore',      name: 'Restore data',              access: 'Write · restores data',   tier: 'Ask first', auto: false, runs: 15, cats: '*',
      type: 'Restore',  grant: 'Restore data · asks first',           title: function (w) { return 'Restore items on ' + w; } },
    { id: 'exportd',      name: 'Export data',               access: 'Write · produces files',  tier: 'Ask first', auto: false, runs: 6,  cats: ['SaaS platforms'],
      type: 'Report',   grant: 'Export data · asks first',            title: function (w) { return 'Export items from ' + w; } },
    { id: 'policies',     name: 'Manage policies',           access: 'Write · policy settings', tier: 'Recommend', auto: false, runs: 3,  cats: '*',
      type: 'Review',   grant: 'Manage policies · recommends',        title: function (w) { return 'Review policy coverage on ' + w; } },
    { id: 'jobs',         name: 'Backup jobs',               access: 'Write · runs jobs',       tier: 'Ask first', auto: false, runs: 0,  cats: '*',
      type: 'Backup',   grant: 'Backup jobs · asks first',            title: function (w) { return 'Retry failed backup sessions on ' + w; } },
    { id: 'findings',     name: 'Findings and alerts',       access: 'Write · finding status',  tier: 'Report',    auto: false, runs: 0,  cats: ['SaaS platforms'],
      type: 'Analysis', grant: 'Findings and alerts · reports',       title: function (w) { return 'Triage findings on ' + w; } },
    { id: 'integrations', name: 'Assist with integrations',  access: 'Assist only',               tier: 'Pre-fill',  auto: false, runs: 0,  cats: '*',
      type: 'Question', grant: 'Assist with integrations · pre-fills', title: function (w) { return 'Assist with the ' + w + ' connection'; } }
  ];
  var DENY_EVERY = { restore: 5, exportd: 6 };
  var FAIL_EVERY = { monitor: 19, restore: 7, exportd: 5 };

  /* The vocabulary both pages share. */
  var DECISION_LABEL = { auto: 'Ran on its own', approved: 'Approved', denied: 'Denied', waiting: 'Awaiting decision' };
  var DECISION_KEYS = ['auto', 'approved', 'denied', 'waiting'];

  /* Registry id -> the workload string Activity carries on its rows (its own _ACT_WL_JOBWL). A workload Activity has no
     picker entry for keeps its registry name. */
  var ACT_WL = { 'ms365': 'Microsoft 365', 'azure-devops': 'Azure DevOps', 'confluence': 'Confluence', 'd365': 'Dynamics 365',
    'github': 'GitHub', 'gitlab': 'GitLab', 'gws': 'Google Workspace', 'jira': 'Jira', 'okta-wic': 'Okta WIC', 'ping': 'Ping',
    'powerplatform': 'Power Platform', 'hybrid-vms': 'VMware vSphere' };

  function registry() {
    return (window.WorkloadPickerDS && WorkloadPickerDS.canonicalEntries)
      ? WorkloadPickerDS.canonicalEntries(function () { return false; }) : [];
  }
  function liveWls() { return registry().filter(function (w) { return !w.disabled; }); }
  function wlName(id) { var w = registry().filter(function (x) { return x.id === id; })[0]; return w ? w.name : id; }
  function actWl(id) { return ACT_WL[id] || wlName(id); }
  function skillWls(sk) { return liveWls().filter(function (w) { return sk.cats === '*' || sk.cats.indexOf(w.cat) >= 0; }); }
  function skillById(id) { return SKILLS.filter(function (k) { return k.id === id; })[0]; }

  function rnd(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; var t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function dur(sk, r) {
    var s = sk.access === 'Read' ? 6 + Math.floor(r() * 40) : 50 + Math.floor(r() * 170);
    return s < 60 ? s + 's' : Math.floor(s / 60) + 'm ' + String(s % 60).padStart(2, '0') + 's';
  }

  /* ONE CLOCK for every page. Each page builds the set when it loads, and a session's timestamp is "base minus its age": if
     the hub and Activity each took their own Date.now(), a time range passed from one to the other would be shifted by the
     seconds between the two loads, and sessions on the edge of a range would fall in or out. The base is hour-aligned and
     pinned in sessionStorage, so every page in a tab agrees on it exactly (a new tab starts fresh). */
  function clock() {
    var HOUR = 36e5, fresh = Math.floor(Date.now() / HOUR) * HOUR;
    try {
      var kept = Number(sessionStorage.getItem('vdc-session-base'));
      if (kept && fresh - kept < DAY) return kept;       // a tab left open for a day re-bases rather than ageing forever
      sessionStorage.setItem('vdc-session-base', String(fresh));
    } catch (e) {}
    return fresh;
  }
  var BASE = clock();

  var _base = null;
  function build() {
    var r = rnd(99), now = BASE, out = [];
    SKILLS.forEach(function (sk) {
      var n = sk.runs; if (!n) return;
      var pool = skillWls(sk); if (!pool.length) return;
      var total = n * 3;
      for (var i = 0; i < total; i++) {
        var pos = (i + r()) / total, ageF = pos * WINDOW, age = Math.floor(ageF);
        var w = pool[Math.floor(r() * pool.length)];
        var d;
        if (sk.access === 'Read' || sk.access === 'Assist only') d = 'auto';
        else d = (DENY_EVERY[sk.id] && i % DENY_EVERY[sk.id] === DENY_EVERY[sk.id] - 1) ? 'denied' : 'approved';
        var waiting = d !== 'auto' && age < 5 && i % 2 === 0;
        var failed = !!(FAIL_EVERY[sk.id] && i % FAIL_EVERY[sk.id] === FAIL_EVERY[sk.id] - 1);
        var decided = waiting ? 'waiting' : d;
        out.push({ id: 's-' + sk.id + '-' + i, skill: sk.id, wl: w.id, cat: w.cat, age: age, ageF: ageF, started: now - ageF * DAY,
          decided: decided,
          outcome: (decided === 'auto' || decided === 'approved') ? (failed ? 'failed' : 'success') : null,
          wait: d === 'auto' ? 0 : Math.round(4 + r() * 180),
          reversed: decided === 'approved' && r() < 0.035,
          open: decided === 'waiting',
          dur: dur(sk, r) });
      }
    });
    return out;
  }

  /* Decisions made on the hub survive navigation (and are what Activity then lists as Approved). */
  function resolved() { try { return JSON.parse(localStorage.getItem(KEY_RESOLVED)) || {}; } catch (e) { return {}; } }
  function resolve(id) { try { var m = resolved(); m[id] = Date.now(); localStorage.setItem(KEY_RESOLVED, JSON.stringify(m)); } catch (e) {} }
  function reset() { try { localStorage.removeItem(KEY_RESOLVED); } catch (e) {} }

  function sessions() {
    if (!_base) _base = build();
    var res = resolved();
    return _base.map(function (s) {
      if (s.decided === 'waiting' && res[s.id]) {
        var c = {}; for (var k in s) c[k] = s[k];
        c.decided = 'approved'; c.open = false; c.outcome = 'success';
        return c;
      }
      return s;
    });
  }

  /* One session in Activity's agent-run row shape. Everything a hub filter needs is on the row (skill, decision), so
     Activity's own rows — which carry neither — can never leak into a hub drill-down and spoil the count. */
  var KIND_AGENT = { Restore: 'Recovery agent', Backup: 'Retry agent' };
  function trigger(s) { return s.decided === 'auto' ? 'Scheduled · system' : s.decided === 'approved' ? 'Approved · Darren Lasso' : 'On demand · Darren Lasso'; }
  function activityRows() {
    return sessions().map(function (s) {
      var sk = skillById(s.skill), name = actWl(s.wl);
      var st = s.decided === 'waiting' ? 'pending' : s.decided === 'denied' ? 'dismissed' : (s.outcome === 'failed' ? 'failed' : 'success');
      return { id: 'hs-' + s.id, hub: true, sessionId: s.id,
        agent: KIND_AGENT[sk.type] || 'Analysis agent', parent: 'Veeam Intelligence',
        capability: sk.title(name), kind: sk.type, wl: name, trigger: trigger(s),
        started: new Date(s.started), dur: s.decided === 'waiting' || s.decided === 'denied' ? '–' : s.dur,
        outcome: st === 'failed' ? 'Error' : st === 'success' ? 'Success' : st === 'pending' ? 'Awaiting decision' : 'Dismissed',
        granted: sk.grant, skill: sk.name, decision: DECISION_LABEL[s.decided], _st: st };
    });
  }

  window.VDC_SESSIONS = { BASE: BASE, SKILLS: SKILLS, WINDOW: WINDOW, DAY: DAY, DECISION_LABEL: DECISION_LABEL, DECISION_KEYS: DECISION_KEYS,
    sessions: sessions, activityRows: activityRows, skillWls: skillWls, skillById: skillById, actWl: actWl, wlName: wlName,
    liveWls: liveWls, resolve: resolve, reset: reset };
})();
