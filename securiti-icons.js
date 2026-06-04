// ─────────────────────────────────────────────────────────────────
// Securiti DS icon swap runtime (v2 — comprehensive sweep)
// ─────────────────────────────────────────────────────────────────
(function() {
  function waitFor(test, then) {
    if (test()) return then();
    let n = 0;
    const t = setInterval(() => {
      if (test() || n++ > 100) { clearInterval(t); then(); }
    }, 50);
  }

  function entryFor(name) {
    const v = window.__SECURITI_ICONS && window.__SECURITI_ICONS[name];
    if (!v) return null;
    // Backwards-compat: previous format was an array of path strings.
    if (Array.isArray(v)) return { viewBox: '0 0 20 20', paths: v };
    return v;
  }

  function swapSvg(svg, name) {
    const entry = entryFor(name);
    if (!entry) return false;
    if (svg.getAttribute('data-securiti-icon') === name) return false;
    svg.setAttribute('viewBox', entry.viewBox);
    svg.setAttribute('fill', 'currentColor');
    svg.removeAttribute('stroke');
    svg.removeAttribute('stroke-width');
    svg.removeAttribute('stroke-linecap');
    svg.removeAttribute('stroke-linejoin');
    svg.innerHTML = entry.paths.map(d => `<path d="${d}" fill="currentColor" fill-rule="nonzero"/>`).join('');
    svg.setAttribute('data-securiti-icon', name);
    return true;
  }

  // Helper: find the closest text label nearby (for icons inside
  // colored-tile + label rows).
  function nearbyText(svg, maxParents) {
    let el = svg;
    for (let i = 0; i < (maxParents || 4); i++) {
      el = el.parentElement;
      if (!el) break;
      const t = (el.textContent || '').trim().toLowerCase();
      if (t.length > 1 && t.length < 80) return t;
    }
    return '';
  }

  // ── Label → icon map. Matched against the trimmed lowercase
  //    text content of the nearest ancestor that has any text.
  //    First match wins, so order specific → generic.
  const LABEL_MAP = [
    [/^global search$/,               'discovery-scan-outlined'],
    [/^intelligent policies$/,        'policy-outlined'],
    [/^contextual intelligence$/,     'recommendations-outlined'],
    [/^primary data intelligence$/,   'total-data-outlined'],
    [/^custom dashboards$/,           'dashboard-outlined'],
    [/^precision resilience$/,        'precision-resilience-outlined'],
    [/^backup ai agents$/,            'my-ai-agents-outlined'],
    // NOTE: "See What's New" intentionally NOT swapped — its inline
    // play-triangle is a watch-the-video CTA, not a Securiti concept
    // icon. The DS sparkle (whats-new) implies AI; wrong association.
    [/^connect now$/,                 null],   // skip — generic CTA
    [/^invite an administrator$/,     'tenant-user-outlined'],
    [/^skip onboarding$/,             null],
  ];

  // ── Sidenav (inventory.html) ────────────────────────────────────
  const SELECTOR_RULES = [
    { sel: '.sidenav .nav-btn[title="Home"] svg',     icon: 'dashboard-outlined' },
    { sel: '.sidenav .nav-btn[title="Restore"] svg',  icon: 'backup-plan-filled' },
    { sel: '.sidenav .nav-btn[title="Policies"] svg', icon: 'policy-outlined' },
    { sel: '.sidenav .nav-btn[title="Activity"] svg', icon: 'anomalies-activity-outlined' },
    { sel: '.sidenav .nav-btn[title="Settings"] svg', icon: 'settings-outlined' },
    // Sidenav (index.html — same .nav-btn but identified by position)
    // 1=grid (dashboard), 2=shield (security), 3=search (discovery-scan),
    // 4=document (policy), 5=settings/gear (active), 6=chat bubble, 7=help (?).
    { sel: '.sidenav .sidenav-body .nav-btn:nth-of-type(1) svg', icon: 'dashboard-outlined' },
    { sel: '.sidenav .sidenav-body .nav-btn:nth-of-type(2) svg', icon: 'security-outlined' },
    { sel: '.sidenav .sidenav-body .nav-btn:nth-of-type(3) svg', icon: 'discovery-scan-outlined' },
    { sel: '.sidenav .sidenav-body .nav-btn:nth-of-type(4) svg', icon: 'policy-outlined' },
    { sel: '.sidenav .sidenav-body .nav-btn:nth-of-type(5) svg', icon: 'settings-outlined' },
    { sel: '.sidenav .sidenav-body .nav-btn:nth-of-type(6) svg', icon: 'recommendations-outlined' },
    { sel: '.sidenav .sidenav-body .nav-btn:nth-of-type(7) svg', icon: 'help-videos-outlined' },

    // Breadcrumb home — use the Securiti filled home glyph.
    { sel: '.breadcrumbs > svg:first-of-type', icon: 'home-filled' },

    // Notifications / What's new / Help in top bars
    { sel: '[title="Notifications"] svg, [title="What\'s new"] svg, [title="Whats new"] svg', icon: 'whats-new-outlined' },
    { sel: '[title="Help"] svg, [title="help"] svg', icon: 'help-videos-outlined' },
    { sel: '[title="Search"] svg', icon: 'discovery-scan-outlined' },

    // Banner shield (covered-bar / b-discovering) — heuristic: SVG
    // with the well-known shield path `M12 1L3 5v6c0 5.55...`
    { sel: '.covered-bar > svg:first-child', icon: 'security-outlined',
      onlyIf: (svg) => /M12 1L3 5v6/.test(svg.outerHTML) },

    // Plan dock (sticky restore-cart) icon
    { sel: '.plan-dock-icon', icon: 'backup-plan-outlined' },

    // Workspace strategy cards — feature-list icons (large 40x40 tile)
    { sel: '.ws-strategy-icon svg', icon: null /* per-label below */ },
  ];

  // ── Button-text → icon (the inline SVG inside the button) ───────
  const BUTTON_TEXT_RULES = [
    [/^view activity$/i,        'anomalies-activity-outlined'],
    [/^view graph$/i,           'workflow-outlined'],
    [/^save view$/i,            'save-outlined'],
    [/^saved views.*$/i,        'views-outlined'],
    [/^protect$/i,              'security-outlined'],
    [/^restore selected$/i,     'backup-plan-outlined'],
    // "See What's New" stays as the original play-triangle — generic
    // "watch a video" CTA, not a Securiti-branded concept.
    [/^invite an administrator$/i, 'tenant-user-outlined'],
    [/^connect now$/i,          null], // skip — generic arrow
  ];

  function applyButtonText() {
    let count = 0;
    document.querySelectorAll('button, .btn, .bulk-btn, [role="button"]').forEach((b) => {
      const txt = (b.textContent || '').trim().toLowerCase();
      for (const [re, icon] of BUTTON_TEXT_RULES) {
        if (!re.test(txt)) continue;
        if (icon == null) break;
        const svg = b.querySelector(':scope > svg, :scope > * > svg');
        if (!svg) break;
        if (svg.getAttribute('data-securiti-icon')) break;
        if (swapSvg(svg, icon)) count++;
        break;
      }
    });
    return count;
  }

  function applySelectorRules() {
    let count = 0;
    SELECTOR_RULES.forEach((r) => {
      if (!r.icon) return;
      document.querySelectorAll(r.sel).forEach((el) => {
        const svg = el.tagName === 'svg' ? el : el.querySelector('svg');
        if (!svg) return;
        if (r.onlyIf && !r.onlyIf(svg)) return;
        if (swapSvg(svg, r.icon)) count++;
      });
    });
    return count;
  }

  // Walk every SVG and check its containing row/cell for a label match.
  // This handles the welcome-screen feature grid icons (each is a small
  // SVG inside a tile inside a labeled row).
  function applyLabelMap() {
    let count = 0;
    const allSvgs = document.querySelectorAll('svg');
    allSvgs.forEach((svg) => {
      if (svg.getAttribute('data-securiti-icon')) return;
      // Skip the brand mark (sidenav logo + welcome hero) — they're
      // intentional, fully-formed Securiti logos.
      if (svg.closest('.sidenav-logo')) return;
      const text = nearbyText(svg, 3);
      if (!text) return;
      for (const [re, icon] of LABEL_MAP) {
        if (!re.test(text)) continue;
        if (icon == null) break;
        if (swapSvg(svg, icon)) count++;
        break;
      }
    });
    return count;
  }

  function run() {
    if (!window.__SECURITI_ICONS) return;
    let total = 0;
    total += applySelectorRules();
    total += applyButtonText();
    total += applyLabelMap();
    window.__securitiIconSwapCount = total;
    if (window.console) console.debug('[securiti-icons v2] swapped ' + total + ' icons');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => waitFor(() => !!window.__SECURITI_ICONS, run));
  } else {
    waitFor(() => !!window.__SECURITI_ICONS, run);
  }
})();
