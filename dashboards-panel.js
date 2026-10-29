/* ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
   DASHBOARDS PANEL — shared component (2026-10-29).  Edit it here, never per page.

   The product's Dashboards section is a left panel beside the dashboard: a "Dashboards" title, a search box, the
   System / Custom / Shared with me tabs, and a tree of groups (a chevron tile + name) each holding its dashboards,
   the open one marked with the selected-list recipe (green text, tint, 2px inset bar). A circular button on the
   panel's edge collapses it. Both Identity Resilience and the Agent Hub are dashboards, so both render this and you
   move between them from the list.

   Usage — the page provides the split, the component fills the side:
     <div class="dsh-split" id="dshSplit">
       <div class="dsh-side" id="dshSide"></div>
       <div class="dsh-main"> …the dashboard… </div>
     </div>
     DashboardsPanel.mount({ host: document.getElementById('dshSide'), current: 'identity' | 'agenthub' });

   Hrefs are relative to the prototypes folder and are prefixed with window.VDC_BASE (set by a page that lives in a
   subfolder, as the Agent Hub does) — the same convention vdc-notifications.js uses.
   ══════════════════════════════════════════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* Registry. Group name + dashboard name follow the product's own pattern ("SaaS Data Protection" > "SaaS Data
     Protection Overview"). A new dashboard is one entry here and appears on every page. */
  var REG = [
    { group: 'Identity Resilience', items: [ { id: 'identity', label: 'Identity Resilience Overview', href: 'identity-dashboard.html' } ] },
    { group: 'Agent Hub',           items: [ { id: 'agenthub', label: 'Agent Hub Overview',           href: 'Agent%20hub/index.html' } ] }
  ];
  var TABS = [ ['system', 'System'], ['custom', 'Custom'], ['shared', 'Shared with me'] ];
  var EMPTY = { custom: 'No custom dashboards yet.', shared: 'No dashboards have been shared with you.' };
  var KEY = 'vdc-dash-panel-collapsed';

  var CSS = ''
    /* the split the page provides */
    + '.dsh-split{display:flex;align-items:stretch;position:relative;min-width:0;}\n'
    + '.dsh-side{position:relative;width:320px;flex-shrink:0;margin-right:16px;transition:width .2s ease,margin .2s ease;}\n'
    + '.dsh-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:16px;transition:margin .2s ease;}\n'
    + '.dsh-split.is-collapsed .dsh-side{width:0;margin-right:0;}\n'
    + '.dsh-split.is-collapsed .dsh-panel{display:none;}\n'
    /* the panel: a bordered card, title / search / tabs / tree */
    + '.dsh-panel{height:100%;box-sizing:border-box;background:var(--white,#fff);border:1px solid var(--border-light,#e9e9ea);border-radius:4px;display:flex;flex-direction:column;gap:12px;padding:12px 0 12px;overflow:hidden;}\n'
    + '.dsh-title{font-size:18px;line-height:22px;font-weight:500;color:var(--black-100,#1f2229);padding:4px 12px;}\n'
    + '.dsh-search{position:relative;margin:0 12px;}\n'
    + '.dsh-search svg{position:absolute;left:10px;top:50%;transform:translateY(-50%);width:20px;height:20px;color:var(--black-60,#626469);pointer-events:none;}\n'
    + '.dsh-search input{width:100%;box-sizing:border-box;height:36px;padding:0 12px 0 38px;border:1px solid var(--border,#d2d3d4);border-radius:4px;background:var(--form-bg,#f8f8f8);font-family:inherit;font-size:16px;color:var(--black-100,#1f2229);}\n'
    + '.dsh-search input::placeholder{color:var(--black-60,#626469);}\n'
    /* Vision Text Input "active": fill + border change, not a ring */
    + '.dsh-search input:focus{outline:none;background:var(--em-green-tint,#f6fbf9);border-color:var(--em-green,#01804a);}\n'
    /* DS Button Tabs: track Black/S5 r4 gap 2; active = White + 1px Black/S20 + semibold S100 */
    + '.dsh-tabs{display:flex;gap:2px;margin:0 12px;padding:2px;background:var(--black-5,#f8f8f9);border-radius:4px;}\n'
    + '.dsh-tabs button{flex:0 0 auto;height:36px;padding:0 12px;border:1px solid transparent;border-radius:4px;background:none;font-family:inherit;font-size:16px;font-weight:450;color:var(--black-70,#626469);cursor:pointer;white-space:nowrap;}\n'
    + '.dsh-tabs button:hover{background:var(--black-10,#e9e9ea);}\n'
    + '.dsh-tabs button.is-active{background:var(--white,#fff);border-color:var(--black-20,#d2d3d4);font-weight:500;color:var(--black-100,#1f2229);}\n'
    + '.dsh-tabs button:focus-visible{outline:none;box-shadow:0 0 0 2px #fff,0 0 0 4px #008436;}\n'
    /* tree */
    + '.dsh-tree{display:flex;flex-direction:column;flex:1;min-height:0;overflow:auto;}\n'
    + '.dsh-grp{display:flex;align-items:center;gap:12px;width:100%;height:44px;padding:0 12px;border:none;background:none;font-family:inherit;font-size:16px;font-weight:500;color:var(--black-100,#1f2229);text-align:left;cursor:pointer;}\n'
    + '.dsh-grp:hover{background:var(--black-5,#f8f8f9);}\n'
    + '.dsh-grp-chev{width:28px;height:28px;flex-shrink:0;border-radius:4px;background:var(--green-s10,#e4f6ee);color:var(--em-green,#01804a);display:inline-flex;align-items:center;justify-content:center;transition:transform .15s ease;}\n'
    + '.dsh-grp-chev svg{width:20px;height:20px;display:block;}\n'
    + '.dsh-grp.is-closed .dsh-grp-chev{transform:rotate(-90deg);}\n'
    + '.dsh-item{display:flex;align-items:center;height:36px;margin-left:36px;padding:0 12px;font-size:16px;font-weight:450;color:var(--black-100,#1f2229);text-decoration:none;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}\n'
    + '.dsh-item:hover{background:var(--black-5,#f8f8f9);}\n'
    /* the selected-list recipe used everywhere else: green text, tint, 2px inset bar */
    + '.dsh-item.is-current{color:var(--em-green,#01804a);font-weight:500;background:var(--em-green-tint,#f6fbf9);box-shadow:inset 2px 0 0 var(--em-green,#01804a);cursor:default;}\n'
    + '.dsh-item:focus-visible,.dsh-grp:focus-visible{outline:none;box-shadow:inset 0 0 0 2px #008436;}\n'
    + '.dsh-empty{padding:12px;font-size:16px;line-height:22px;color:var(--black-60,#626469);}\n'
    /* The collapse control is the file explorer's pill on Protected Data (.tree-nav-toggle), value for value: 16 x 24, white,
       1px border, radius 8, a faint shadow, a 10px chevron, centred ON the panel's right border. Collapsed, the panel goes to
       zero width and the pill stays on that edge with the chevron flipped — no margin is left behind. (An earlier version was
       a 32px circle that parked 20px of margin on the page when collapsed.) */
    + '.dsh-collapse{position:absolute;top:16px;left:100%;transform:translateX(-50%);z-index:20;width:16px;height:24px;padding:0;background:var(--white,#fff);border:1px solid var(--border,#d2d3d4);border-radius:8px;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;color:var(--black-60,#626469);box-shadow:0 1px 2px rgba(0,0,0,0.06);}\n'
    + '.dsh-collapse:hover{color:var(--black-100,#1f2229);background:var(--black-3,var(--black-5,#f8f8f9));}\n'
    + '.dsh-collapse:focus-visible{outline:none;box-shadow:0 0 0 2px #fff,0 0 0 4px #008436;}\n'
    + '.dsh-collapse svg{display:block;transition:transform .22s ease;}\n'
    + '.dsh-split.is-collapsed .dsh-collapse svg{transform:rotate(180deg);}\n'
    /* The panel narrows the dashboard, and a card header carries title + age stamp + refresh + kebab. At that width the
       title was the thing that gave way (every title ellipsised, even "Sessions"). When a card is narrow the age text
       yields instead — the page's own "Last fetched" stamp and the refresh button still carry freshness. */
    + '.dsh-narrow .w-age,.dsh-narrow .idd-wage{display:none;}\n'
    + '@media (max-width:1100px){.dsh-side{width:260px;}}\n'
    + '@media (prefers-reduced-motion:reduce){.dsh-side,.dsh-main,.dsh-grp-chev,.dsh-collapse svg{transition:none;}}\n';

  function css() {
    if (document.getElementById('dsh-css')) return;
    var st = document.createElement('style'); st.id = 'dsh-css'; st.textContent = CSS; document.head.appendChild(st);
  }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function ic(name) {
    var e = (window.__SECURITI_ICONS || {})[name]; if (!e || !e.paths) return '';
    return '<svg viewBox="' + e.viewBox + '" fill="currentColor" aria-hidden="true">' + e.paths.map(function (p) { return '<path d="' + p + '"/>'; }).join('') + '</svg>';
  }
  function store(get, v) {
    try { if (get) return localStorage.getItem(KEY) === '1'; localStorage.setItem(KEY, v ? '1' : '0'); } catch (e) {}
    return false;
  }

  function mount(opts) {
    css();
    var host = opts.host, current = opts.current, split = host.closest('.dsh-split');
    var S = { tab: 'system', q: '', closed: {} };

    function go(href) { window.location.href = (window.VDC_BASE || '') + href; }

    function tree() {
      if (S.tab !== 'system') return '<div class="dsh-empty">' + EMPTY[S.tab] + '</div>';
      var q = S.q.trim().toLowerCase(), out = '';
      REG.forEach(function (g) {
        var items = g.items.filter(function (it) { return !q || it.label.toLowerCase().indexOf(q) >= 0 || g.group.toLowerCase().indexOf(q) >= 0; });
        if (!items.length) return;
        var closed = !q && S.closed[g.group];
        out += '<button type="button" class="dsh-grp' + (closed ? ' is-closed' : '') + '" aria-expanded="' + !closed + '" data-grp="' + esc(g.group) + '">'
             + '<span class="dsh-grp-chev">' + ic('keyboard-arrow-down-outlined') + '</span>' + esc(g.group) + '</button>';
        if (!closed) items.forEach(function (it) {
          var cur = it.id === current;
          out += '<a class="dsh-item' + (cur ? ' is-current' : '') + '" href="' + (cur ? '#' : (window.VDC_BASE || '') + it.href) + '"'
               + (cur ? ' aria-current="page"' : '') + ' data-href="' + esc(it.href) + '">' + esc(it.label) + '</a>';
        });
      });
      return out || '<div class="dsh-empty">No dashboards match “' + esc(S.q.trim()) + '”.</div>';
    }

    function paint() { host.querySelector('.dsh-tree').innerHTML = tree(); }

    host.innerHTML =
        '<div class="dsh-panel" role="navigation" aria-label="Dashboards">'
      +   '<div class="dsh-title">Dashboards</div>'
      +   '<div class="dsh-search">' + ic('search-outlined') + '<input type="search" placeholder="Search" aria-label="Search dashboards" autocomplete="off"></div>'
      +   '<div class="dsh-tabs" role="tablist">' + TABS.map(function (t) {
            return '<button type="button" role="tab" data-tab="' + t[0] + '" aria-selected="' + (t[0] === S.tab) + '"' + (t[0] === S.tab ? ' class="is-active"' : '') + '>' + t[1] + '</button>'; }).join('') + '</div>'
      +   '<div class="dsh-tree"></div>'
      + '</div>'
      + '<button type="button" class="dsh-collapse" aria-label="Collapse dashboards" title="Collapse dashboards" aria-expanded="true">'
      +   '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg></button>';

    var btn = host.querySelector('.dsh-collapse');
    function setCollapsed(on, persist) {
      split.classList.toggle('is-collapsed', on);
      btn.setAttribute('aria-expanded', String(!on));
      btn.setAttribute('aria-label', on ? 'Expand dashboards' : 'Collapse dashboards');
      btn.title = on ? 'Expand dashboards' : 'Collapse dashboards';
      if (persist) store(false, on);
    }
    btn.addEventListener('click', function () { setCollapsed(!split.classList.contains('is-collapsed'), true); });
    setCollapsed(store(true), false);

    host.querySelector('.dsh-search input').addEventListener('input', function (e) { S.q = e.target.value; paint(); });
    host.querySelector('.dsh-tabs').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-tab]'); if (!b) return;
      S.tab = b.getAttribute('data-tab');
      [].forEach.call(host.querySelectorAll('.dsh-tabs button'), function (x) { var on = x === b; x.classList.toggle('is-active', on); x.setAttribute('aria-selected', String(on)); });
      paint();
    });
    host.querySelector('.dsh-tree').addEventListener('click', function (e) {
      var g = e.target.closest('.dsh-grp');
      if (g) { var n = g.getAttribute('data-grp'); S.closed[n] = !S.closed[n]; paint(); return; }
      var a = e.target.closest('.dsh-item');
      if (a) { e.preventDefault(); if (!a.classList.contains('is-current')) go(a.getAttribute('data-href')); }
    });
    paint();
    fitCards(split);
  }

  /* Toggle .dsh-narrow on each card by its own width. A ResizeObserver rather than a container query: containment would
     make every card a containing block for position:fixed, which would break the kebab menus anchored to the viewport. */
  var NARROW = 340;
  function fitCards(split) {
    var main = split.querySelector('.dsh-main'); if (!main) return;
    function run() {
      [].forEach.call(main.querySelectorAll('.widget, .idd-widget'), function (c) { c.classList.toggle('dsh-narrow', c.getBoundingClientRect().width < NARROW); });
    }
    var q = 0, again = function () { cancelAnimationFrame(q); q = requestAnimationFrame(run); };
    if (window.ResizeObserver) new ResizeObserver(again).observe(main);
    new MutationObserver(again).observe(main, { childList: true, subtree: true });   // the pages rebuild their widgets in place
    window.addEventListener('resize', again);
    split.addEventListener('transitionend', again);   // panel collapse animates the column width
    run();
  }

  window.DashboardsPanel = { mount: mount, registry: REG };
})();
