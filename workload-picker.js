// ═══════════════════════════════════════════════════════════════════════
// WORKLOAD PICKER — the ONE shared implementation (user ruling 2026-08-19:
// "1 codebase for 1 consistent implementation of the workload picker").
// Spec: Figma DCP fcV4iUjRZz7k… node 9286-65490 (verified live 2026-08-18/19).
//
// Owns the PANEL: search row → quick platform chips (All/SaaS/Datacenter) →
// sectioned Menu Listing of DS List Items → "Set default" footer.
// Pages own their BUTTON chrome and open/close wiring, and pass an adapter:
//
//   WorkloadPickerDS.renderPanel(panelEl, {
//     entries:    () => [{ id, name, cat, colorKey, monoKey, active,
//                          disabled, tip }],
//     onPick:     (id, name) => {},     // user chose a workload
//     getDefault: () => id | null,      // current default workload
//     setDefault: (id) => {},           // persist a new default
//     tipAttr:    'data-tooltip'        // page's styled-tooltip attribute
//   });
//
// LOGO RULE (user 2026-08-19): COLOR logos (wl-logo-* verbatim Figma
// exports) ONLY inside the expanded panel; the collapsed button affordance
// shows the MONOTONE mark — use monoLogo() there.
// Selected item: Green/S5 row fill + Green/S80 Medium label + SQUARE
// inset 2px bar + GREEN icon tile with the logo knocked out white +
// trailing check; house (home-filled) marks the default, both float right.
// ═══════════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  var CSS = [
    '.wlp-search { display:flex; align-items:center; gap:8px; height:44px; padding:4px 12px; border-bottom:1px solid var(--border-light,#e9e9ea); color:var(--black-60,#626469); }',
    '.wlp-search svg { flex-shrink:0; }',
    '.wlp-search input { flex:1; min-width:0; height:100%; border:none; outline:none; background:transparent; font-family:inherit; font-size:16px; color:var(--black-100,#1f2229); }',
    '.wlp-cats { display:flex; align-items:center; gap:8px; padding:8px 12px; }',   /* was: border-bottom hairline — removed (user 2026-09-04: no line between chips and the list) */
    '.wlp-cat { height:28px; min-width:28px; padding:3px 8px; border:none; border-radius:2px; background:var(--black-3,#f8f8f9); font-family:inherit; font-size:16px; font-weight:500; line-height:22px; color:var(--black-100,#1f2229); cursor:pointer; }',
    '.wlp-cat.is-on { background:var(--em-green-tint,#f6fbf9); color:var(--em-green,#01804a); }',
    '.wlp-list { max-height:320px; overflow:auto; padding:8px; }',
    '.wlp-group-hdr { padding:4px 8px; font-size:14px; line-height:16px; color:var(--black-60,#626469); }',
    '.wlp-item { display:flex; align-items:center; gap:8px; width:100%; min-height:36px; padding:4px 12px; border:none; border-radius:4px; background:transparent; font-family:inherit; font-size:16px; font-weight:450; line-height:22px; color:var(--black-100,#1f2229); cursor:pointer; text-align:left; }',
    '.wlp-item:hover { background:var(--em-green-tint,#f6fbf9); }',
    '.wlp-item.is-disabled { opacity:.5; cursor:default; }',
    '.wlp-item.is-disabled:hover { background:transparent; }',
    '.wlp-item.is-active { background:var(--em-green-tint,#f6fbf9); box-shadow:inset 2px 0 0 var(--em-green,#01804a); color:var(--em-green,#01804a); font-weight:500; border-radius:0; }',
    '.wlp-item-icon { display:inline-flex; align-items:center; justify-content:center; width:28px; height:28px; padding:4px; background:var(--em-green-tint,#f6fbf9); border-radius:4px; flex-shrink:0; }',
    '.wlp-item-icon svg { width:20px; height:20px; display:block; }',
    '.wlp-item.is-active .wlp-item-icon { background:var(--em-green,#01804a); }',
    '.wlp-item.is-active .wlp-item-icon svg * { fill:var(--white,#fff); stroke:none; }',
    '.wlp-item-name { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex:1; min-width:0; }',
    /* Category "All <cat>" row (pattern A, 2026-09-02 — Activity only via
       cfg.categoryRows): clones the wlp-item recipe; Medium name; count in a
       light-green numeric badge (the Vision value-chip convention, S80 on
       S5); glyph from the DS store (data-system-type-outlined). Member rows
       inset 12px under it so the group reads parent/children, and each new
       group gets top breathing room. */
    /* was: .wlp-cat-all name at font-weight 500 — normalized to Book
       (user 2026-09-04: the weight difference read as a header) */
    '.wlp-cat-tile { font-size:13px; font-weight:500; color:var(--em-green,#01804a); font-variant-numeric:tabular-nums; }',
    '.wlp-item.is-active .wlp-cat-tile { color:var(--white,#fff); }',
    /* was: 24px member inset — RETIRED 2026-09-04 (user: with the count
       tile differentiating the All rows in the shared tile slot, the indent
       is redundant noise; grouping is carried by the 8px group gap, order,
       and the tile-type difference — all tiles now align in one column) */
    '.wlp-group-div { border-top:1px solid var(--border-light,#e9e9ea); margin:8px 4px; }',   /* between-group seam (user 2026-09-04) — replaces the bare 8px gap */
    /* was: .wlp-cat-count trailing pill — the count moved INTO the row tile (2026-09-04) */

    '.wlp-home { display:inline-flex; color:var(--em-green,#01804a); flex-shrink:0; margin-left:auto; }',
    '.wlp-check { display:inline-flex; color:var(--em-green,#01804a); flex-shrink:0; margin-left:auto; }',
    '.wlp-home + .wlp-check { margin-left:8px; }',
    '.wlp-footer { border-top:1px solid var(--border-light,#e9e9ea); padding:8px 12px; }',
    '.wlp-setdef { border:none; background:none; padding:0 4px; font-family:inherit; font-size:16px; line-height:20px; color:var(--em-green,#01804a); text-decoration:underline; cursor:pointer; }',
    '.wlp-def-radio { margin:0; width:16px; height:16px; flex-shrink:0; accent-color:var(--em-green,#01804a); pointer-events:none; }',
    '.wlp-manage-hint { margin-left:12px; font-size:14px; color:var(--black-60,#626469); }',
    '.wlp-empty { padding:12px; font-size:14px; color:var(--black-60,#626469); }'
  ].join('\n');

  function ensureCss() {
    if (document.getElementById('wlp-shared-css')) return;
    var st = document.createElement('style');
    st.id = 'wlp-shared-css';
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  function _store(name) {
    return (typeof window !== 'undefined' && window.__SECURITI_ICONS) ? window.__SECURITI_ICONS[name] : null;
  }

  // COLOR mark — full-svg string entries (verbatim Figma exports). Panel only.
  // Gradient/defs ids are NAMESPACED per injection (2026-09-08): url(#id)
  // resolves document-wide, and a duplicate id inside a display:none
  // container (e.g. a hidden screen embedding the same logo) hijacks the
  // reference and the gradient never paints — logos rendered as empty tiles.
  var _wlpUid = 0;
  function colorLogo(key, size) {
    var e = _store(key);
    if (!e) return '';
    var svg = (typeof e === 'string') ? e : e.svg;
    if (!svg) return '';
    if (svg.indexOf('id="') >= 0) {
      var suf = '-wlp' + (++_wlpUid);
      svg = svg.replace(/id="([^"]+)"/g, 'id="$1' + suf + '"')
               .replace(/url\(#([^)]+)\)/g, 'url(#$1' + suf + ')')
               .replace(/href="#([^"]+)"/g, 'href="#$1' + suf + '"');
    }
    return svg.replace(/^<svg width="\d+" height="\d+"/, '<svg width="' + size + '" height="' + size + '"');
  }

  // MONO mark — currentColor object entries (brand-*/workload-outlined).
  // The collapsed button affordance uses THIS, never the color mark.
  function monoLogo(key, size) {
    var e = _store(key || 'workload-outlined') || _store('workload-outlined');
    if (!e || !e.paths) return '';
    var fr = e.fillRule ? ' fill-rule="' + e.fillRule + '" clip-rule="' + e.fillRule + '"' : '';
    return '<svg width="' + size + '" height="' + size + '" viewBox="' + e.viewBox + '" fill="currentColor" aria-hidden="true">'
      + e.paths.map(function (d) { return '<path' + fr + ' d="' + d + '"/>'; }).join('') + '</svg>';
  }

  var CHECK = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>';
  function homeGlyph() {
    var e = _store('home-filled');
    if (!e || !e.paths) return '';
    return '<svg width="14" height="14" viewBox="' + e.viewBox + '" fill="currentColor" aria-hidden="true">'
      + e.paths.map(function (d) { return '<svg-path d="' + d + '"/>'; }).join('').replace(/svg-path/g, 'path') + '</svg>';
  }

  var CATS = ['All', 'SaaS', 'Datacenter'];
  var _catOfChip = { 'SaaS': 'SaaS platforms', 'Datacenter': 'Datacenter' };

  function renderPanel(panelEl, cfg) {
    ensureCss();
    var st = panelEl._wlpState || (panelEl._wlpState = { q: '', cat: 'All', manage: false });
    // member-inset scope: only while category rows actually render (flag on,
    // not in manage mode) — keeps every other page's picker full-bleed
    panelEl.classList.toggle('wlp-has-cats', !!cfg.categoryRows && !st.manage);
    // Preserve the list's scroll across re-renders (user 2026-08-19: Set
    // default / pick re-renders reanchored the list to the top, hiding the
    // row the action just applied to — which read as the button not working).
    var _prevList = panelEl.querySelector('.wlp-list');
    var _keepScroll = _prevList ? _prevList.scrollTop : 0;
    var tipAttr = cfg.tipAttr || 'data-tooltip';
    var defWl = cfg.getDefault ? cfg.getDefault() : getDefaultWl();
    var entries = cfg.entries() || [];

    var searchSvg = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>';
    var html = '<div class="wlp-search">' + searchSvg + '<input type="text" placeholder="Search" autocomplete="off"></div>';
    // cfg.noCats (2026-10-06, Identity dashboard): a picker scoped to ONE group of workloads has no All/SaaS/Datacenter chips to switch between
    if (!cfg.noCats) html += '<div class="wlp-cats">' + CATS.map(function (c) {
      return '<button type="button" class="wlp-cat' + (st.cat === c ? ' is-on' : '') + '" data-cat="' + c + '">' + c + '</button>';
    }).join('') + '</div>';

    var visible = entries.filter(function (en) {
      if (st.q && en.name.toLowerCase().indexOf(st.q) < 0) return false;
      if (!cfg.noCats && st.cat !== 'All' && en.cat !== _catOfChip[st.cat]) return false;
      return true;
    });
    var catRank = { 'SaaS platforms': 0, 'Datacenter': 1 };
    visible.sort(function (a, b) {
      var r = (catRank[a.cat] || 0) - (catRank[b.cat] || 0);
      return r !== 0 ? r : a.name.localeCompare(b.name);
    });
    // CATEGORY ROWS (pattern A, 2026-09-02): when cfg.categoryRows is on and
    // we're not in manage mode (categories can't be the default), the passive
    // group header COLLAPSES INTO a selectable "All <category>" row scoping
    // the page to every workload in the group. A category whose members are
    // all disabled renders disabled with the shared tip.
    // display labels match the chips row above ('All SaaS', not 'All SaaS
    // platforms' — user 2026-09-03); the full category name stays the id
    var _shortCat = { 'SaaS platforms': 'SaaS' };
    function _catAllRow(cat) {
      var members = entries.filter(function (x) { return x.cat === cat; });
      var enabled = members.filter(function (x) { return !x.disabled; });
      // AGGREGATE category (cfg.aggregateCats, 2026-09-04 — Activity's
      // Datacenter): the category is the ONLY pickable unit — member rows
      // are suppressed, the All row is selectable regardless of member
      // disabled flags, and its tile carries a GLYPH (cfg.categoryGlyph)
      // instead of the member count (a count is meaningless when the
      // members aren't individually pickable).
      var agg = !!(cfg.aggregateCats && cfg.aggregateCats.indexOf(cat) >= 0);
      var dis = agg ? false : enabled.length === 0;
      var on = !!(cfg.activeCat && cfg.activeCat() === cat);
      // Anatomy = the SAME row grammar as every workload row (user 2026-09-04:
      // Medium weight + bare text + trailing badge read as a HEADER, not a
      // clickable row): standard 28px tile carrying the member COUNT (honest
      // — "N workloads inside"), Book label, hierarchy from the member
      // indent alone. was: no tile · Medium name · trailing count badge.
      return '<button type="button" role="menuitemradio" aria-checked="' + on + '"'
        + ' class="wlp-item wlp-cat-all' + (on ? ' is-active' : '') + (dis ? ' is-disabled' : '') + '"'
        + ' data-cat-all="' + cat + '" data-cat-members="' + (agg ? members : enabled).map(function (x) { return x.id; }).join(',') + '"'
        + (dis ? ' aria-disabled="true" ' + tipAttr + '="Not connected in this prototype"' : '')
        + '><span class="wlp-item-icon' + (agg ? '' : ' wlp-cat-tile') + '">' + (agg && cfg.categoryGlyph ? (cfg.categoryGlyph(cat) || members.length) : members.length) + '</span>'
        + '<span class="wlp-item-name">All ' + (_shortCat[cat] || cat) + '</span>'
        + (on ? '<span class="wlp-check" aria-hidden="true">' + CHECK + '</span>' : '') + '</button>';
    }
    var lastCat = null, listHtml = '';
    visible.forEach(function (en) {
      var _aggCat = !!(cfg.categoryRows && !st.manage && cfg.aggregateCats && cfg.aggregateCats.indexOf(en.cat) >= 0);
      if (en.cat !== lastCat) {
        if (lastCat !== null && cfg.categoryRows && !st.manage) listHtml += '<div class="wlp-group-div"></div>';
        listHtml += (cfg.categoryRows && !st.manage) ? _catAllRow(en.cat) : '<div class="wlp-group-hdr">' + en.cat + '</div>';
        lastCat = en.cat;
      }
      if (_aggCat) return;   // aggregate category: the All row IS the group
      var icon = colorLogo(en.colorKey, 20) || monoLogo(en.monoKey, 20);
      // MANAGE MODE (the approved 2026-08-05 gesture): rows lead with a
      // radio; clicking a row selects it as the DEFAULT (no navigation).
      var lead = '';
      if (st.manage && !en.disabled) {
        var _staged = (st.manageSel != null ? st.manageSel : defWl);
        lead = '<input type="radio" class="wlp-def-radio" name="wlp-default" ' + (en.id === _staged ? 'checked ' : '') + 'tabindex="-1" aria-hidden="true">';
      }
      var tail = '';
      if (en.id === defWl && !st.manage) tail += '<span class="wlp-home" ' + tipAttr + '="Default workload" aria-label="Default workload">' + homeGlyph() + '</span>';
      if (en.active && !st.manage) tail += '<span class="wlp-check" aria-hidden="true">' + CHECK + '</span>';
      listHtml += '<button type="button" role="' + (st.manage ? 'radio' : 'menuitemradio') + '" aria-checked="' + (st.manage ? en.id === defWl : !!en.active) + '"'
        + ' class="wlp-item' + (en.active && !st.manage ? ' is-active' : '') + (en.disabled ? ' is-disabled' : '') + '"'
        + ' data-id="' + en.id + '" data-name="' + String(en.name).replace(/"/g, '&quot;') + '"'
        + (en.disabled ? ' aria-disabled="true"' + (en.tip ? ' ' + tipAttr + '="' + String(en.tip).replace(/"/g, '&quot;') + '"' : '') : '')
        + '>' + lead + '<span class="wlp-item-icon">' + icon + '</span><span class="wlp-item-name">' + en.name + '</span>' + tail + '</button>';
    });
    html += '<div class="wlp-list" role="menu">' + (listHtml || '<div class="wlp-empty">No workloads match.</div>') + '</div>';
    // cfg.noFooter (2026-09-08): a FORM-FIELD consumer (policy editor's
    // Workload control) has no default-workload concept — skip the footer.
    if (!cfg.noFooter) html += '<div class="wlp-footer"><button type="button" class="wlp-setdef">' + (st.manage ? 'Done' : 'Set default') + '</button>'
      + (st.manage ? '<span class="wlp-manage-hint">Choose the default workload</span>' : '') + '</div>';
    panelEl.innerHTML = html;
    var _newList = panelEl.querySelector('.wlp-list');
    if (_newList && _keepScroll) _newList.scrollTop = _keepScroll;

    // wiring — all state lives on the panel element; re-render on change
    var input = panelEl.querySelector('.wlp-search input');
    input.value = st.q;
    input.addEventListener('input', function () { st.q = input.value.trim().toLowerCase(); rerenderListOnly(); });
    input.addEventListener('click', function (e) { e.stopPropagation(); });
    function rerenderListOnly() {
      var focused = document.activeElement === input;
      var v = input.value;
      renderPanel(panelEl, cfg);
      var ni = panelEl.querySelector('.wlp-search input');
      ni.value = v;
      if (focused) { ni.focus(); ni.setSelectionRange(v.length, v.length); }
    }
    panelEl.querySelectorAll('.wlp-cat').forEach(function (b) {
      b.addEventListener('click', function (e) { e.stopPropagation(); st.cat = b.getAttribute('data-cat'); rerenderListOnly(); });
    });
    panelEl.querySelectorAll('.wlp-item:not(.is-disabled)').forEach(function (b) {
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        // category "All <cat>" rows (never rendered in manage mode)
        var catAll = b.getAttribute('data-cat-all');
        if (catAll) {
          if (cfg.onPickCategory) cfg.onPickCategory(catAll, (b.getAttribute('data-cat-members') || '').split(',').filter(Boolean));
          renderPanel(panelEl, cfg);
          return;
        }
        if (st.manage) {
          // manage mode (original 2026-08-05 gesture, THIRD restoration pass
          // 2026-08-19): the radio click only STAGES the choice — nothing
          // commits until Done. Done stores the default AND selects it as
          // the current workload.
          st.manageSel = b.getAttribute('data-id');
          st.manageSelName = b.getAttribute('data-name');
          renderPanel(panelEl, cfg);
          return;
        }
        cfg.onPick(b.getAttribute('data-id'), b.getAttribute('data-name'));
        renderPanel(panelEl, cfg);
      });
    });
    var sd = panelEl.querySelector('.wlp-setdef');
    if (sd) sd.addEventListener('click', function (e) {
      e.stopPropagation();
      if (!st.manage) {
        // enter manage mode with a clean stage
        st.manage = true;
        st.manageSel = null;
        st.manageSelName = null;
        renderPanel(panelEl, cfg);
        return;
      }
      // DONE: commit the staged choice — store the default AND select it as
      // the current workload (the original gesture; radio clicks never commit).
      var sel = st.manageSel, selName = st.manageSelName;
      st.manage = false;
      st.manageSel = null;
      st.manageSelName = null;
      if (sel && sel !== defWl) {
        (cfg.setDefault || setDefaultWl)(sel);
        cfg.onPick(sel, selName);
      }
      renderPanel(panelEl, cfg);
    });
  }

  // ── CANONICAL WORKLOAD LIST (user ruling 2026-08-19: identical on every
  // picker; source of truth = Protected Data's list at ruling time). Pages
  // must NOT derive their own lists (activity's job-seed-derived list had
  // invented AWS/VMware rows — the trigger for this rule). Connected = the
  // 10 seeded SaaS workloads; ms365 + the Datacenter set are visible but
  // disabled "not connected" placeholders, exactly as on Protected Data.
  var WORKLOADS = [
    { id: 'azure-devops',  name: 'Azure DevOps',      cat: 'SaaS platforms', colorKey: 'wl-logo-azure-devops' },
    { id: 'confluence',    name: 'Confluence',        cat: 'SaaS platforms', colorKey: 'wl-logo-confluence' },
    { id: 'd365',          name: 'Dynamics 365',      cat: 'SaaS platforms', colorKey: 'wl-logo-d365' },
    { id: 'github',        name: 'GitHub',            cat: 'SaaS platforms', colorKey: 'wl-logo-github' },
    { id: 'gitlab',        name: 'GitLab',            cat: 'SaaS platforms', colorKey: 'wl-logo-gitlab' },
    { id: 'gip',           name: 'Google Identity Protection', cat: 'SaaS platforms', colorKey: 'wl-logo-gip' },
    { id: 'gws',           name: 'Google Workspace',  cat: 'SaaS platforms', colorKey: 'wl-logo-gws' },
    { id: 'jira',          name: 'Jira',              cat: 'SaaS platforms', colorKey: 'wl-logo-jira' },
    { id: 'okta-wic',      name: 'Okta',              cat: 'SaaS platforms', colorKey: 'wl-logo-okta-wic' },
    // was: colorKey null ("no logo in the mock" → generic workload-glyph
    // fallback, which read as an unrelated equalizer icon — user catch
    // 2026-09-01). wl-logo-ping = the official Ping Identity badge assembled
    // from Ping's own brand SVG (see securiti-icons-data.js provenance).
    { id: 'ping',          name: 'Ping',              cat: 'SaaS platforms', colorKey: 'wl-logo-ping' },
    { id: 'powerplatform', name: 'Power Platform',    cat: 'SaaS platforms', colorKey: 'wl-logo-powerplatform' },
    // ms365 ENABLED 2026-09-01 (was: disabled 'Not connected' placeholder) —
    // Protected Data now seeds the full contoso.onmicrosoft.com hierarchy
    // (Figma 13027-98203). Other consumer pages have no ms365 seeds yet and
    // will show empty states when it is picked there.
    { id: 'ms365',              name: 'Microsoft 365',     cat: 'SaaS platforms', colorKey: 'wl-logo-ms365' },
    // Entra ID: a cloud identity service, so it sits with the SaaS platforms next to Okta and Google Identity (mono mark until a brand logo is added to the store).
    { id: 'entra-id',           name: 'Entra ID',          cat: 'SaaS platforms', colorKey: null, monoKey: 'iam-identity-provider-outlined' },
    // ENABLED 2026-09-18 (was: disabled 'Not connected' placeholder, same
    // pattern as ms365 above) — seeds a flat VM list (no hierarchy; the tree
    // explorer collapses for this workload, see selectWl in inventory-V1.html).
    { id: 'hybrid-vms',         name: 'Virtual Machines',  cat: 'Datacenter',     colorKey: null, monoKey: 'dc-vms' },
    // Active Directory: an on-premises directory service, so it is a Datacenter workload of its own (the computers and users are objects INSIDE the forest, not a sub-type of Computers).
    { id: 'active-directory',   name: 'Active Directory',  cat: 'Datacenter',     colorKey: null, monoKey: 'dc-computers' },
    { id: 'hybrid-computers',   name: 'Computers',         cat: 'Datacenter',     colorKey: null /* was 'logo-computers' — the picker mock 9286-65208 shows the MONO dns entity glyph */, monoKey: 'dc-computers', disabled: true, tip: 'Not connected in this prototype' },
    { id: 'hybrid-unstructured',name: 'Unstructured Data', cat: 'Datacenter',     colorKey: null, monoKey: 'dc-files',     disabled: true, tip: 'Not connected in this prototype' },
    { id: 'hybrid-files',       name: 'Files',             cat: 'Datacenter',     colorKey: null, monoKey: 'dc-files',     disabled: true, tip: 'Not connected in this prototype' }
  ];
  // Standard entry builder: the canonical list with per-page active detection.
  // isActive(id, name) → boolean; everything else comes from the registry.
  function canonicalEntries(isActive) {
    return WORKLOADS.map(function (w) {
      return { id: w.id, name: w.name, cat: w.cat, colorKey: w.colorKey, monoKey: w.monoKey || null,
               active: !w.disabled && !!isActive(w.id, w.name), disabled: !!w.disabled, tip: w.tip };
    });
  }

  // MONO mark for the COLLAPSED button, per workload — derived from the same
  // verbatim color logo with every paint forced to currentColor, so the
  // silhouette is the true brand shape (user 2026-08-19: the generic
  // workload glyph on selected chips was wrong). Falls back to the generic
  // workload glyph only when the registry has no color entry (Ping,
  // Datacenter placeholders).
  function monoMark(workloadId, size) {
    var reg = null;
    for (var i = 0; i < WORKLOADS.length; i++) if (WORKLOADS[i].id === workloadId) { reg = WORKLOADS[i]; break; }
    var svg = reg && reg.colorKey ? colorLogo(reg.colorKey, size) : '';
    if (svg) {
      return svg
        .replace(/fill="(?!none")[^"]*"/g, 'fill="currentColor"')
        .replace(/stop-color="[^"]*"/g, 'stop-color="currentColor"');
    }
    return monoLogo(reg && reg.monoKey ? reg.monoKey : null, size);
  }

  // ── DEFAULT WORKLOAD — PER PAGE (user ruling 2026-08-19, revising the
  // brief global-default pass: each page keeps ITS OWN default; the promise
  // is only that a default set on a page survives refresh ON THAT PAGE).
  // One implementation, namespaced key: 'vdc-default-wl:<page filename>',
  // value = registry id. Reads fall back to the older un-namespaced keys
  // once (pre-namespace values migrate forward on first read).
  function _pageKey() {
    try { return (location.pathname.split('/').pop() || 'page'); } catch (e) { return 'page'; }
  }
  function _validId(v) { return v && WORKLOADS.some(function (w) { return w.id === v && !w.disabled; }); }
  function getDefaultWl() {
    try {
      var k = 'vdc-default-wl:' + _pageKey();
      var v = localStorage.getItem(k);
      if (_validId(v)) return v;
      // legacy fallbacks (global key, activity's old key) — migrate forward
      var legacy = localStorage.getItem('vdc-default-wl') || localStorage.getItem('dcc-default-workload');
      if (_validId(legacy)) { localStorage.setItem(k, legacy); return legacy; }
    } catch (e) {}
    return null;
  }
  function setDefaultWl(id) {
    try { localStorage.setItem('vdc-default-wl:' + _pageKey(), id); } catch (e) {}
  }

  window.WorkloadPickerDS = { renderPanel: renderPanel, colorLogo: colorLogo, monoLogo: monoLogo,
                              monoMark: monoMark, WORKLOADS: WORKLOADS, canonicalEntries: canonicalEntries,
                              getDefaultWl: getDefaultWl, setDefaultWl: setDefaultWl };
})();
