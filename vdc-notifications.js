/* ══ VDC NOTIFICATIONS — shared component (2026-10-27) ═══════════════════════════════════════════════════════════
   One source for every page that has the left rail (edit HERE, never per page — same rule as workload-picker.js).

   The message glyph at the bottom of the rail (above the avatar) opens the platform's Notifications panel:
   a card over the page with the message list on the left (System Notifications is the only tab here) and the
   date-grouped notification cards on the right. The glyph carries a count of unread notifications.

   What lands here:
     · agent recommendations  — e.g. the ROT policy Veeam Intelligence recommends for Microsoft 365 (live: it follows
                                the same vdc-rot-state the Policies page, Activity and the assistant panel share)
     · approvals needed       — agent tasks paused on the user
     · actions taken          — what an agent did on its own, inside the autonomy the user set
     · failures               — agent runs that failed or were stopped by a guardrail
     · platform notifications — unchanged, shown so the agent's notifications sit in the real stream
   Which of the four agent kinds arrive is the user's choice: Agent Settings › Notifications (localStorage
   vdc-agent-notif). Read state: vdc-notif-read.

   Hosts can call window.vdcNotifRefresh() after they change vdc-rot-state; the badge also follows storage events,
   window focus and tab visibility. ─────────────────────────────────────────────────────────────────────────── */
(function(){
  if (window.__vdcNotif) return; window.__vdcNotif = true;

  var KEY_CFG = 'vdc-agent-notif', KEY_READ = 'vdc-notif-read', KEY_ROT = 'vdc-rot-state', KEY_TASKS = 'vdc-agent-task-overrides';
  var DEFAULTS = { on:true, recs:true, actions:true, failures:true };   // on = the master switch: off silences every agent kind and keeps the checklist as it was
  window.VDC_NOTIF_KINDS = [
    { k:'recs',      label:'Recommendations',  desc:'A new recommendation is raised.' },
    { k:'actions',   label:'Actions taken',    desc:'An agent completes an action on its own, within its autonomy.' },
    { k:'failures',  label:'Failures',         desc:'An agent run fails or is stopped by a guardrail.' }
  ];

  // Demo reset: reloading a page reopens the scenario, so "already told" / "already read" start over with it (the pages clear vdc-rot-state the same way).
  try { var nav = performance.getEntriesByType('navigation')[0]; if (nav && nav.type === 'reload'){ localStorage.removeItem('vdc-notif-voiced'); localStorage.removeItem('vdc-notif-read'); } } catch (e) {}
  function jget(k, d){ try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } }
  function jset(k, v){ try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function esc(s){ return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function icon(name, size){
    var e = (window.__SECURITI_ICONS || {})[name]; if (!e || !e.paths) return '';
    return '<svg width="' + size + '" height="' + size + '" viewBox="' + e.viewBox + '" fill="currentColor" aria-hidden="true">' + e.paths.map(function(p){ return '<path d="' + p + '"/>'; }).join('') + '</svg>';
  }
  /* The one status chip for an agent session that is waiting on the user (approval gate OR question gate: one state, one label).
     Vision Chip Default (grey light) with the AI gradient tile in the pre-icon position. Every page renders it from here. */
  // THE VEEAM INTELLIGENCE GLYPH (user 2026-10-30): wherever the product points at the assistant — an "Ask Veeam Intelligence"
  // button, a chip — it wears the rainbow-gradient tile with the white sparkle, never the plain one-colour sparkle. One builder
  // so a button on the policy page and one on a session detail cannot drift. size = the tile's edge in px (16 in buttons).
  window.vdcAiGlyph = function(size){
    var n = size || 16;
    return '<span class="vdc-ai-glyph" style="--g:' + n + 'px" aria-hidden="true">' + icon('ai-sparkle', Math.round(n * 1.5)) + '</span>';
  };
  window.vdcDecisionChip = function(){
    return '<span class="vdc-decide"><span class="vdc-decide-ai" aria-hidden="true">' + icon('ai-sparkle', 24) + '</span>Awaiting decision</span>';
  };
  // ── THE THREAD'S TOPIC, IN THE PANEL HEADER (user 2026-10-30) ──────────────────────────────────────────────
  // Once a thread has a subject the header says what it is ("Retail Division ROT policy recommendation") with the product
  // name demoted to a small label above it; a thread with no subject keeps the single "Veeam Intelligence" title. The topic is
  // set by whatever STARTS the thread (a pending recommendation, an open-ended starter, a staged scenario), never inferred
  // from typed text, and it holds until + starts a new chat. Saved beside the conversation so it follows it across pages.
  var KEY_TOPIC = 'vdc-ai-topic';
  function applyTopic(){
    var box = document.querySelector('#aiPanel .ai-head-text'); if (!box) return;
    var cur = box.querySelector('.ai-head-title'); if (!cur) return;
    var t = (typeof aiAgent !== 'undefined' && aiAgent._topic) || '', brand = box.querySelector('.ai-head-brand');
    if (t){
      if (!brand){ brand = document.createElement('div'); brand.className = 'ai-head-brand'; brand.textContent = 'Veeam Intelligence'; box.insertBefore(brand, cur); }
      cur.innerHTML = '<span class="ai-head-tx">' + esc(t) + '</span>'; cur.setAttribute('data-tooltip', t); box.classList.add('has-topic');
    } else {
      if (brand) brand.remove();
      cur.textContent = 'Veeam Intelligence'; cur.removeAttribute('data-tooltip'); box.classList.remove('has-topic');
    }
  }
  window.vdcSetPanelTopic = function(t){
    if (typeof aiAgent === 'undefined') return;
    aiAgent._topic = t || null;
    try { if (t) localStorage.setItem(KEY_TOPIC, t); else localStorage.removeItem(KEY_TOPIC); } catch(e){}
    applyTopic();
  };
  // A carried or restored conversation brings its topic back; an empty panel never shows a stale one.
  function restoreTopic(){
    if (typeof aiAgent === 'undefined') return;
    if (!aiAgent._topic && aiAgent.msgs && aiAgent.msgs.length){ try { aiAgent._topic = localStorage.getItem(KEY_TOPIC) || null; } catch(e){} }
    if (aiAgent._topic && !(aiAgent.msgs && aiAgent.msgs.length)) aiAgent._topic = null;
    applyTopic();
  }
  // QUICK PROMPTS ON/OFF (user 2026-10-30): the thumbs-down in the Quick Prompts header turns them off for good; Agent
  // Settings has the switch to turn them back on. One personal preference, kept in the browser like the notification kinds.
  var KEY_QP = 'vdc-quick-prompts';
  window.vdcQuickPromptsOn = function(){ try { return localStorage.getItem(KEY_QP) !== 'off'; } catch(e){ return true; } };
  window.vdcQuickPromptsSet = function(on){
    try { localStorage.setItem(KEY_QP, on ? 'on' : 'off'); } catch(e){}
    if (!on){ try { if (typeof window.vdcClearQuickPrompts === 'function') window.vdcClearQuickPrompts(); if (typeof aiRenderChips === 'function') aiRenderChips([]); } catch(e){} }
  };
  window.vdcQuickPromptsOff = function(){
    window.vdcQuickPromptsSet(false);
    if (typeof showToast === 'function') showToast('Quick prompts are off. You can turn them back on in Agent Settings.');
  };
  window.vdcNotifConfig = function(){ var c = jget(KEY_CFG, {}), o = {}; for (var k in DEFAULTS) o[k] = c[k] == null ? DEFAULTS[k] : !!c[k]; return o; };
  window.vdcNotifSetConfig = function(k, on){ var c = window.vdcNotifConfig(); c[k] = !!on; jset(KEY_CFG, c); refresh(); };

  // ── DEMO RESET ─────────────────────────────────────────────────────────────────────────────────────────────
  // One deliberate control instead of a silent wipe (user 2026-10-29: "rather than a refresh wipe out, can you add
  // a control in the dev jump header"). Agent demo state is spread over several keys and two storages, and a
  // half-reset is worse than none — activating the ROT policy alone leaves the recommendation permanently "done",
  // which is what made it disappear and look broken. Everything the agent scenarios write is listed here; add new
  // keys to this list, not to a per-page reset.
  // NOT reset: the user's own preferences (notification choices, panel width, default workload; Quick Prompts is the one
  // preference the reset DOES restore, by request) — those are not
  // scenario state and wiping them would be a surprise.
  var VDC_DEMO_KEYS = [
    'vdc-rot-state',              // the ROT recommendation's decision + the policy it created
    'vdc-notif-voiced',           // what the assistant has already said in conversation
    'vdc-notif-read',             // which notifications have been read
    'vdc-agent-task-overrides',   // approve/decline on the pending agent tasks
    'vdc-ai-transcript',          // a conversation carried between pages
    'vdc-facts',                  // sealed facts that strike through resolved recommendations
    'vdc-session-declined',       // requests declined from a session detail (agent-sessions.js)
    'vdc-session-resolved',       // requests approved from the Agent Hub (agent-sessions.js)
    'vdc-ai-topic',               // the open thread's title in the panel header
    'vdc-quick-prompts'           // Quick Prompts switched off from the thumbs-down: reset turns them back on (user 2026-10-30)
  ];
  window.vdcResetAgentDemo = function(opts){
    try { VDC_DEMO_KEYS.forEach(function(k){ localStorage.removeItem(k); sessionStorage.removeItem(k); }); } catch(e){}
    // jobs the agent put on the shared bridge — drop only those, other jobs are not ours
    try {
      var br = JSON.parse(localStorage.getItem('dcc-jobs-bridge')) || [];
      localStorage.setItem('dcc-jobs-bridge', JSON.stringify(br.filter(function(b){ return b.origin !== 'agent'; })));
    } catch(e){}
    try { sessionStorage.removeItem('vdc-ai-handoff'); sessionStorage.removeItem('vdc-ai-flow'); sessionStorage.removeItem('vdc-rot-activate'); } catch(e){}
    if (opts && opts.silent) return;
    location.reload();   // the page rebuilt its UI from this state on load; a reload is the honest way to re-read it
  };

  // ── A DECIDED RECOMMENDATION STOPS OFFERING THE DECISION (user 2026-10-30) ─────────────────────────────────────────
  // Once the policy is activated the card must say so and stop offering Review and Dismiss: you cannot dismiss what you have
  // just accepted (and, the other way, cannot activate what you declined). The card is saved data, so what it shows is derived
  // from the shared decision state each time the panel renders, not stored in the card: it is right after a page hop, a
  // reload and a reset. The click itself answers at once ("Activating…") so the press is visibly accepted before the page
  // catches up.
  window.vdcSyncDecisions = function(){
    var s = jget(KEY_ROT, {}), els = document.querySelectorAll('#aiBody [data-decide="rot"]');
    [].forEach.call(els, function(el){
      var done = s.rec === 'approved' ? ['approved', 'Policy activated. It runs for the first time tonight.']
               : s.rec === 'dismissed' ? ['dismissed', 'Recommendation dismissed. No policy was created.'] : null;
      if (!done){ el.removeAttribute('data-decided'); return; }
      if (el.getAttribute('data-decided') === done[0]) return;
      el.setAttribute('data-decided', done[0]);
      el.innerHTML = '<div class="aiac-decide-done ' + done[0] + '" role="status">' + esc(done[1]) + '</div>';
    });
  };
  document.addEventListener('click', function(e){
    var b = e.target.closest && e.target.closest('[data-rot-act]'); if (!b || b.disabled) return;
    setTimeout(function(){ b.disabled = true; b.setAttribute('aria-busy', 'true'); b.textContent = 'Activating\u2026'; }, 0);   // after its own onclick has run
  }, true);

  // ── DISMISSING THE ROT RECOMMENDATION, SHARED (user 2026-10-30) ───────────────────────────────────────────────
  // One flow on every page: the reasons card (same card as the thumbs-down's, opened on a message that says what dismissing
  // does), Send = the dismissal. The Policies page owns richer machinery (its editor, the File ROT list), so it keeps
  // rotDismissAsk and this delegates to it; everywhere else the decision is recorded straight into vdc-rot-state, which
  // every page, the Notifications panel and Activity already read.
  var ROT_DISMISS_CFG = { hook:'vdcRotDismissSent', title:'Why are you dismissing this?', send:'Dismiss recommendation', downTip:'Dismiss this recommendation',
    reasons:['Wrong scope', 'Inaccurate', 'Not needed right now', 'Already handled elsewhere', 'Something else'],
    note:'Sending dismisses the recommendation. Feedback helps improve the assistant. Your conversation is not shared unless you include it.' };
  function say(html){ if (typeof aiPushAgent === 'function') aiPushAgent(html); else if (typeof aiAgent !== 'undefined'){ aiAgent.msgs.push({ role:'agent', html:html }); if (typeof aiRender === 'function') aiRender(); } }
  window.vdcRotDismissAsk = function(){
    if (typeof window.rotDismissAsk === 'function') return window.rotDismissAsk();
    if (typeof aiAgent === 'undefined') return;
    if (typeof aiOpen === 'function') aiOpen();
    var s = jget(KEY_ROT, {});
    if (s.rec){ say('<p>' + (s.rec === 'approved' ? 'That recommendation was already accepted.' : 'You already dismissed that recommendation.') + '</p>'); return; }
    aiAgent.msgs = aiAgent.msgs.filter(function(m){ return !(m && m.fbCfg && m.fbCfg.hook === 'vdcRotDismissSent' && !m.fbSent); });   // one open dismissal at a time
    aiAgent.msgs.push({ role:'agent', html:'<p>Dismissing this recommendation means no policy is created for Retail Taxes, Retail Archive and Retail Ops, and I won\u2019t raise this one again unless the situation changes.</p><p>Tell me what\u2019s off about it and I\u2019ll recommend better.</p>',
      fb:'down', fbOpen:true, fbReasons:{}, fbCfg:ROT_DISMISS_CFG });
    aiAgent._scrollAnchor = 'bottom'; if (typeof aiRender === 'function') aiRender();
  };
  window.vdcRotDismissSent = function(i, reasons, comment){
    var s = jget(KEY_ROT, {}); if (s.rec) return;
    s.rec = 'dismissed'; s.by = 'Darren Lasso'; s.note = comment || ''; s.ts = Date.now();
    if (reasons && reasons.length){ s.reason = reasons.join('|'); s.reasonLabel = reasons.join(', '); }
    jset(KEY_ROT, s);
    window.vdcSyncDecisions();
    // a plain string: every page's showToast takes one (the object form is not universal)
    if (typeof showToast === 'function') showToast('Recommendation dismissed. ' + ((reasons && reasons.length) ? 'Reason recorded: ' + reasons.join(', ') + '. ' : '') + 'No policy was created.');
    say('<p>Dismissed \u2014 no policy was created.' + ((reasons && reasons.length) ? ' I\u2019ve noted: ' + esc(reasons.join(', ').toLowerCase()) + '.' : '') + ' You can undo this from the File ROT list.</p>');
    refresh();
  };

  // ── the notification stream ─────────────────────────────────────────────────────────────────────────────────
  function at(daysAgo, h, m){ var d = new Date(); d.setDate(d.getDate() - daysAgo); d.setHours(h, m, 0, 0); return d; }
  var DEMO_APPROVALS = false;   // see the staging note inside build() — one switch, returns them everywhere
  function build(){
    var cfg = window.vdcNotifConfig(), rs = jget(KEY_ROT, {}), ov = jget(KEY_TASKS, {}), out = [];
    if (cfg.on && cfg.recs){
      var decided = rs.rec === 'approved' ? 'You activated this policy.' : (rs.rec === 'dismissed' ? 'You dismissed this recommendation' + (rs.reasonLabel ? ': ' + rs.reasonLabel + '.' : '.') : '');
      out.push({ id:'rot-rec', kind:'agent', at:at(0, 8, 41), title:'Veeam Intelligence recommends a ROT policy for Retail Division',
        body:'4.2 TB (63%) of backed-up content in Retail Taxes, Retail Archive and Retail Ops has not been modified in 36 months, and no ROT policy covers it.' + (decided ? ' ' + decided : ''),
        href:'activity.html#agents/rot1', done:!!rs.rec, needs:true, topic:'Retail Division ROT policy recommendation' });
    }
    // DEMO STAGING (user 2026-10-29: "stage this whole agent panel so that it just wants to bring the ROT policy to
    // our attention"). The two awaiting decisions are switched OFF, not deleted — flip DEMO_APPROVALS back to true
    // and they return everywhere at once: the arrival screen, the catch-up line, the Notifications list and the
    // rail badge all read from this one build().
    if (DEMO_APPROVALS)
    {   // approval requests are not a choice: an agent that is waiting on a person must never wait silently
      if (!(ov.at3 && ov.at3.status)) out.push({ id:'appr-at3', kind:'agent', at:at(0, 3, 12), title:'Approval needed: re-run the failed SharePoint Sites backup',
        body:'Veeam Intelligence paused the Retail Division retry and is waiting on you. Nothing runs until you answer.', href:'activity.html#agents/at3', needs:true, task:'at3', topic:'Re-run failed SharePoint Sites backup' });
      if (!(ov.at5 && ov.at5.status)) out.push({ id:'appr-at5', kind:'agent', at:at(0, 7, 40), title:'Approval needed: restore Account records to the Dynamics 365 sandbox',
        body:'Veeam Intelligence staged the restore from the Oct 12, 3:15 AM restore point and paused for your approval.', href:'activity.html#agents/at5', needs:true, task:'at5', topic:'Restore Account records to the Dynamics 365 sandbox' });
    }
    if (cfg.on && cfg.actions){
      out.push({ id:'act-okta', kind:'agent', at:at(1, 16, 5), title:'Veeam Intelligence retried the failed Okta backup',
        body:'The retry completed and all three sessions succeeded. It stayed inside its Backup jobs grant.', href:'activity.html#agents', read:true });
      out.push({ id:'act-gws', kind:'agent', at:at(5, 10, 30), title:'Veeam Intelligence restored the Finance-Admins group',
        body:'The restore you approved on Oct 22 completed. 5 members were returned to the group.', href:'activity.html#agents', read:true });
    }
    if (cfg.on && cfg.failures){
      out.push({ id:'fail-ado', kind:'agent', at:at(3, 5, 10), title:'An agent run failed: retry of the Azure DevOps backup',
        body:'Veeam Intelligence stopped at the repository-access guardrail. Nothing was changed.', href:'activity.html#agents', read:true });
    }
    [[14, 8, 40, 6], [14, 8, 40, 5], [19, 2, 32, 9], [19, 2, 32, 8], [19, 2, 32, 7]].forEach(function(s, i){
      out.push({ id:'sys' + i, kind:'system', at:at(s[0], s[1], s[2]), title:'Multiple Failed Login Attempts Detected', body:'User devops@cclinker.net could not login after ' + s[3] + ' consecutive failed login attempt(s)', read:true });
    });
    out.sort(function(a, b){ return b.at - a.at; });
    var read = jget(KEY_READ, {});
    out.forEach(function(n){ n.unread = !(n.read || n.done || read[n.id]); });
    return out;
  }
  function unreadCount(){ return build().filter(function(n){ return n.unread; }).length; }
  function markRead(ids){ var r = jget(KEY_READ, {}); ids.forEach(function(id){ r[id] = 1; }); jset(KEY_READ, r); }

  // ── rail glyph + badge ──────────────────────────────────────────────────────────────────────────────────────
  function railBtn(){ return document.querySelector('.vn-sys-btn[data-fly="Notifications"], .vn-sys-btn[data-fly="Send feedback"]'); }
  function paintBadge(){
    paintDot();
    var b = railBtn(); if (!b) return;
    var n = unreadCount(), bd = b.querySelector('.vdc-nb');
    if (!n){ if (bd) bd.remove(); return; }
    if (!bd){ bd = document.createElement('span'); bd.className = 'vdc-nb'; b.appendChild(bd); }
    bd.textContent = n > 9 ? '9+' : String(n);
    b.setAttribute('aria-label', 'Notifications, ' + n + ' unread');
  }
  function paintDot(){
    var l = document.querySelector('.vn-ai-launcher'); if (!l) return;
    // It glows and turns while a decision is waiting that the user has not yet opened — hearing it in the panel is not acting on it, so
    // the icon stays lit after the assistant has said it, and goes quiet once the user opens it, decides it, or marks it read.
    var on = !panelOpen() && typeof aiAgent !== 'undefined' && build().some(function(n){ return n.needs && !n.done && n.unread; });
    l.classList.toggle('has-voice', on);
    l.setAttribute('aria-label', on ? 'Open the Veeam AI assistant. It has something for you.' : 'Open the Veeam AI assistant');
  }
  function refresh(){ paintBadge(); if (document.getElementById('vdcNp')) paintPanel(); voiceSoon(); }
  window.vdcNotifRefresh = refresh;

  // ── the assistant speaks first ───────────────────────────────────────────────────────────────────────────
  // The same events as the list, said in the conversation. Only the ones that need a DECISION are voiced (approval requests always;
  // recommendations while the user wants them) — they come from build(), so the notification settings decide, not a second preference.
  // It never opens the panel: closed, the assistant's rail icon carries a dot; open, the message waits for a quiet moment
  // (nothing running, no approval pending in the thread). Each event is voiced once.
  // The recommendation's evidence, so the card can be shown on every page. backup-policies defines window.ROT_EVIDENCE
  // itself and that copy wins — this is the fallback for Activity, Settings and Protected Data, which have the panel and
  // the card renderer but not the policy page's data.
  var ROT_EV = {
    vrows: { title: 'Share of each site\u2019s backed-up volume untouched for 36+ months', rows: [
      { label:'Retail Archive', frac:0.89, color:'var(--chart-soft-gold)', val:'89%', val2:'1.7 of 1.9 TB' },
      { label:'Retail Taxes',   frac:0.73, color:'var(--chart-soft-gold)', val:'73%', val2:'1.9 of 2.6 TB' },
      { label:'Retail Ops',     frac:0.27, color:'var(--chart-soft-gold)', val:'27%', val2:'0.6 of 2.2 TB' } ] },
    strip: [['Untouched for 36+ months', 4.2, 'var(--chart-soft-gold)', '4.2 TB untouched for 36+ months (63%)'],
            ['Changed within 36 months', 2.5, 'var(--black-20)', '2.5 TB changed within 36 months (37%)']]
  };
  var KEY_VOICED = 'vdc-notif-voiced', voiceTimer = null;
  function panelOpen(){ return document.body.classList.contains('ai-open'); }
  function pendingVoice(){ if (typeof aiAgent === 'undefined' || typeof aiRender !== 'function') return []; var v = jget(KEY_VOICED, {}); return build().filter(function(n){ return n.needs && !n.done && !v[n.id]; }); }
  function quiet(){ return !aiAgent.busy && !(aiAgent.activeGate && aiAgent.activeGate.gate && !aiAgent.activeGate.gate.resolved); }
  // ── the two blocks, lifted out of voice() (2026-10-29) so the solicited path (vdcNotifSpeak) and the unprompted
  //    push path render EXACTLY the same thing — a second copy is how the two would drift. ──
  function speakRec(v){
      // SAME RECOMMENDATION, SAME BLOCK (user 2026-10-27). This used to be a bare paragraph with a button glued on, while
      // the identical recommendation reached through the Policies page carried a full evidence card — the same facts, two
      // renderings, decided by nothing but how the user happened to arrive. A recommendation asks for a decision, so it
      // shows its evidence wherever it appears; the catch-up differs only in that it has no reasoning trace ahead of it,
      // because the user did not ask for it.
      // was: '<p>While you were away I found a retention gap. <strong>4.2 TB (63%)</strong> ... </p>' + glued .ai-gate-btns
      var ev = window.ROT_EVIDENCE || ROT_EV;
      var m = (typeof window.aiacCardHtml === 'function')
        ? { role:'card', _voiced:true, open:false, card:{
            headline:'While you were away I found a retention gap in Retail Division.',
            headsub:'4.2 TB (63%) of backed-up content in Retail Taxes, Retail Archive and Retail Ops has not changed in 36 months, and no ROT policy covers it. I drafted a policy for those sites.',
            stripTitle:'Backed-up volume of the three uncovered sites', unit:'TB', strip: ev.strip, vrows: ev.vrows,
            // The page owns the verb when it can (the ask depends on whether the editor or the list is open there).
            // OFF-PAGE: BOTH ROUTES (user 2026-10-29: "should i have the options to review OR approve right from the
            // card?"). The card already carries the whole justification, so making someone travel to act on a
            // decision they have made is pure friction — but the policy's own settings (retention window, actions,
            // severity) are NOT in the card, so the fast path has to say it is accepting them as proposed.
            // The grammar picks the weights, not preference: activating is the agent acting here on your consent, so
            // it is the green primary; reviewing LEAVES the panel, so it is secondary with the open-in-new glyph.
            // was: a single green primary 'Review the proposed policy' — a travel verb wearing the act-here style.
            decision: (typeof window.rotDecision === 'function') ? window.rotDecision() : {
              ask:'I\u2019ve configured a policy for those three sites. Activate it as proposed, or open it first to adjust anything \u2014 nothing is created until you do.',
              btns: [
                // Secondary label trimmed twice for fit (user 2026-10-29: "too wordy. can we help these 2 buttons
                // fit on the same row?"): 'Review the proposed policy' -> 'Review first' -> 'Review'. The object is
                // named by the headline and the ask above, and the glyph says it travels, so the verb alone carries
                // it. Shortening the LABEL rather than .ai-gate-btn's padding keeps the DS button geometry intact.
                { label:'Activate', onclick:'vdcNotifGo(\'rec-activate\')', attr:'data-rot-cta data-rot-act data-tooltip="Activates the policy exactly as drafted"' },
                { label:'Review', onclick:'vdcNotifGo(\'rec\')', nav:true },
                // DISMISS IS ITS OWN VERB (user 2026-10-30): declining the recommendation is a decision, which is not what the
                // thumbs-down under the reply means (that rates the reply). It asks for a reason, then records the dismissal.
                { label:'Dismiss', onclick:'vdcRotDismissAsk()', primary:false, attr:'data-dismiss' }
              ], key:'rot' }
          } }
        : { role:'agent', _voiced:true, html:'<p>While you were away I found a retention gap. <strong>4.2 TB (63%)</strong> of backed-up content in Retail Taxes, Retail Archive and Retail Ops has not changed in 36 months, and no ROT policy covers it. I drafted a policy for those sites.</p>'
            + '<div class="ai-gate-btns"><button type="button" class="ai-gate-btn primary" data-rot-cta onclick="vdcNotifGo(\'rec\')">Review the proposed policy</button></div>' };
      // Where the policy page can record a dismissal, thumbs-down carries its reasons and hook; elsewhere the card
      // still takes the GENERIC feedback row — rating a response is always valid, it is only the dismissal wording
      // that is page-specific. was: `else m.noFb = true`, which silenced feedback on every page but Policies.
      // The thumbs-down under this card is PLAIN FEEDBACK on every page now (it used to carry the dismissal hook on the Policies
      // page only, so one icon meant "rate this reply" there and "decline the policy" there). Dismissing has its own button.
    aiAgent.msgs.push(m); (pendingVoice().filter(function(n){ return !n.task; })).forEach(function(n){ v[n.id] = 1; });
  }
  function speakAppr(appr, v, withOther){
    if (!appr.length) return;
      // COLLAPSED CATCH-UP (user 2026-10-27): context decides what is EXPANDED, not what is present.
      // Opening the panel on a surface answers the question you brought (the recommendation above); approvals that belong to
      // another surface are acknowledged in one line and nothing more. Enumerating them gave three identically-labelled Review
      // buttons with no hierarchy, and re-listed decisions that already live in the Notifications panel and in Activity.
      // The ASSURANCE stays — "nothing runs until you answer" is load-bearing, since a user who sees only the policy item could
      // reasonably conclude nothing else is pending. The INVENTORY is what they did not come for.
      // 'other' is conditional: it only reads as other-than when a recommendation was voiced in the same breath, and the count
      // covers every approval, so it can no longer contradict a decision sitting right above it.
      // was: '<p>N agent tasks are waiting on your approval. Nothing runs until you answer.</p>'
      //      + one .vdc-voice-row per task, each with its own Review button
      var other = withOther ? 'other ' : '';
      aiAgent.msgs.push({ role:'agent', _voiced:true, noFb:true, html:'<p>'
        + (appr.length === 1 ? 'One ' + other + 'task is' : appr.length + ' ' + other + 'tasks are')
        + ' waiting on your approval. Nothing runs until you answer.</p>'
        // TRAVEL IS MARKED, AND IT IS NOT A TEXT LINK (user 2026-10-29). This control leaves the conversation for
        // Activity, so it takes the LOOK-HERE grammar: secondary bordered button + trailing open-in-new glyph. The
        // inline green link it replaces was the treatment parked on 2026-09-09 as too subtle next to gate primaries,
        // and it read as .aiac-more, which is reserved for in-place disclosure. Out of the sentence onto its own row,
        // since a bordered control cannot sit mid-paragraph.
        // was: '... Nothing runs until you answer. <button class="vdc-voice-more">Review in Activity</button></p>'
        + '<div class="vdc-voice-go"><button type="button" class="aiac-btn" onclick="vdcNotifGo(\'appr\')">Review in Activity'
        + ((typeof window._dsStoreIconSvg === 'function' && window._dsStoreIconSvg('open-in-new-outlined', 16)) || '') + '</button></div>' });
    appr.forEach(function(n){ v[n.id] = 1; });
  }

  function voice(){
    if (!panelOpen()) return true;
    var list = pendingVoice(); if (!list.length) return true;
    // SOLICIT, DON'T SHOUT (user 2026-10-29): "the agent is shouting as opposed to soliciting my interest... I
    // shouldn't be immediately greeted by the full response before I have even had a chance to show my interest in
    // that specific topic." On a page whose home screen renders the agent's offers, pushing the full card into the
    // thread the moment the panel opens both buries the home screen and answers a question nobody asked. The pending
    // items are surfaced there as quiet cards instead, in the same grammar as the staged scenarios, and the full
    // block is spoken only when the user picks one (vdcNotifSpeak).
    if (window.VDC_SOLICIT_HOME){
      var _already = document.querySelector('#aiBody .ai-home-card[onclick*="vdcNotif"]');
      if (!_already && (!aiAgent.msgs || !aiAgent.msgs.length)){ if (typeof aiRenderHome === 'function') aiRenderHome(); }
      return true;   // nothing is pushed, so there is nothing to wait for a quiet moment for
    }
    if (!quiet()) return false;
    var recs = list.filter(function(n){ return !n.task; }), appr = list.filter(function(n){ return n.task; }), v = jget(KEY_VOICED, {});
    if (recs.length) speakRec(v);
    speakAppr(appr, v, !!recs.length);
    jset(KEY_VOICED, v); aiAgent._scrollAnchor = 'bottom'; aiRender(); paintDot();
    return true;
  }
  // ── solicitation API — what the agent would like to tell you, for a page that renders offers on its home screen ──
  // Titles and bodies are the AUTHORED notification copy, reused verbatim rather than re-written for this surface.
  // Approvals collapse to a single item for the same reason the catch-up line does: the count and the assurance are
  // the point, the inventory is not.
  // What the USER would say to pick a concern up. Defined once because the card list maps build() items into its own
  // shape while vdcNotifSpeak works from the RAW build() item — reading `ask` off the latter silently got undefined
  // and fell back to the agent's own headline, which is the wording that read wrong in the first place.
  function askFor(n){
    return n.id === 'rot-rec' ? 'Review the ROT gap you found in Retail Division' : 'Tell me more about this';
  }
  window.vdcNotifPending = function(){
    var list = pendingVoice(); if (!list.length) return [];
    var recs = list.filter(function(n){ return !n.task; }), appr = list.filter(function(n){ return n.task; }), out = [];
    // `ask` is what the USER would say to pick this up — the staged turn is spoken in their voice, not the agent's
    // (user 2026-10-29: the old turn echoed the agent's own notification headline back, which nobody would say).
    // Reuses the phrasing the policy page already authors for this same recommendation, so the two routes match.
    recs.forEach(function(n){ out.push({ id:n.id, kind:'rec', title:n.title, sub:n.body, ask:askFor(n) }); });
    // Approvals are listed ONE PER ROW (user 2026-10-29). The collapsed "N tasks are waiting" item was right for a
    // message pushed into the conversation — there the count was the whole point and the inventory was noise. On a
    // screen that exists to BE the list, the items are the content, and a single totalling row hides what is waiting.
    // was: one { id:'__appr' } item carrying the count.
    // Stripping "Approval needed:" leaves the verb mid-sentence, where it was lowercase because a colon preceded it
    // ("re-run the failed..."). As a card title it now STARTS the sentence, so it is capitalised (user 2026-10-29).
    appr.forEach(function(n){ var t = n.title.replace(/^Approval needed:\s*/, '');
      out.push({ id:n.id, kind:'appr', task:n.task, title:t.charAt(0).toUpperCase() + t.slice(1), sub:n.body }); });
    return out;
  };
  // The agent's own analysis of the retention gap, as a reasoning trace. Mirrors the authored steps in
  // backup-policies' rotGapFlow for the same recommendation — kept here for the pages that have no policy page to
  // borrow them from, the same reason ROT_EV exists above. Where rotGapFlow IS defined we call it instead.
  var ROT_STEPS = [
    { kind:'route', label:'Interpreting request \u2014 retention gap on Retail Division SharePoint', ms:400, detail:[['scope','Retail Division sites \u00b7 ROT policies'],['mode','read-only analysis']], result:'A coverage gap against the four active ROT policies' },
    { kind:'tool',  label:'content.age \u2014 last-modified distribution per site', ms:800, detail:[['sites','5 in Retail Division'],['threshold','36 months']], result:'4.2 TB untouched across 3 sites' },
    { kind:'tool',  label:'policies.match \u2014 which ROT policies cover which sites', ms:600, detail:[['policies','4 active']], result:'None cover Retail Taxes, Retail Archive or Retail Ops' }
  ];
  // Commit the arrival screen into the transcript so the concern list stays above the answer instead of being wiped
  // by it — picking a card is a turn in the conversation, not a jump to a different screen.
  function commitArrival(pickedId){
    if (aiAgent.msgs && aiAgent.msgs.length) return;
    if (!aiAgent._arrivalHtml) return;
    // The picked concern is sealed in the committed copy: it has been taken up, so it must not keep reading as an
    // open offer. Left live it was also inert — pendingVoice() no longer returns it, so a second click did nothing.
    // Clones .aiac-act.sealed's treatment rather than inventing one.
    var html = aiAgent._arrivalHtml;
    if (pickedId){
      try {
        var tmp = document.createElement('div'); tmp.innerHTML = html;
        var hit = tmp.querySelector('[onclick*="' + pickedId + '"]');
        if (hit){ hit.removeAttribute('onclick'); hit.setAttribute('disabled',''); hit.classList.add('is-picked'); }
        html = tmp.innerHTML;
      } catch(e){}
    }
    aiAgent.msgs.push({ role:'agent', _voiced:true, _arrival:true, noFb:true, html:html });
  }
  // ── FOLLOW-UP PROMPTS, SHARED ───────────────────────────────────────────────────────────────────────────────
  // The Quick Prompts pattern (protected-data, 2026-09-23): a suggested QUESTION after an answer that does not
  // itself point to a next step — never an action, so it cannot collide with the no-acknowledge-only-actions rule.
  // Lifted here because the ROT card now appears on four pages while the renderer existed on one (user 2026-10-29).
  // ROUTING DEVIATION, deliberate: the original sends the prompt as if typed. On the Policies page aiSend is
  // overridden to route anything matching /rot|retail division|untouched/ back into rotGapFlow, so a typed
  // follow-up would re-answer with the same card. These three carry authored answers and push the turn directly.
  // The answers are existing copy — the policy's own actions and the why-recommended tooltip — not new claims.
  var QP_ANSWERS = {
    'What happens to the 4.2 TB when this runs?':
      'Nothing is deleted. The policy flags the content for review and only excludes it from backup after a 30-day review window, so it stays recoverable throughout and you can stop it at any point in those 30 days.',
    'Does this change my protected volume?':
      'Not immediately. Once the review window passes and the content is excluded, that 4.2 TB stops counting toward protected volume. Until then the figure is unchanged.',
    'Can I change the 36-month threshold?':
      'Yes. The age threshold and the minimum file size are part of the policy — editable before you activate it, and afterwards as a new version. Changing the age changes which content matches.',
    'Which sites does this cover?':
      'Retail Taxes, Retail Archive and Retail Ops in the Retail Division. Together they hold the 4.2 TB that has not been modified in 36 months and that no ROT policy covers.',
    'Can I stop it once it has started?':
      'Yes. Stop it at any point in the 30-day review window and nothing changes. The flagged content stays backed up and recoverable until that window passes.'
  };
  var ROT_FOLLOWUPS = Object.keys(QP_ANSWERS);
  window.vdcRotFollowups = function(){ return ROT_FOLLOWUPS.slice(); };   // so a page that owns the flow can offer the same three
  window.vdcQuickPromptGo = function(btn){
    var q = btn.getAttribute('data-q');
    if (typeof aiAgent === 'undefined') return;
    window.vdcClearQuickPrompts();
    // A prompt that is another starter's opening ask hands over to that starter (it pushes the user turn itself).
    var st = STARTERS_BY_ASK[q]; if (st){ window.vdcStarterGo(st.id); return; }
    aiAgent.msgs.push({ role:'user', html:q });
    (aiAgent._qpAsked = aiAgent._qpAsked || {})[q] = 1;
    var a = QP_ANSWERS[q];
    if (!a){ if (typeof aiSend === 'function'){ aiSend(q); } return; }
    // THE AGENT ANSWERS IN TIME (user 2026-10-29: "the response just appears immediately"). The question and its
    // answer used to be pushed in the same frame, so a follow-up was the one exchange in the panel with no beat
    // between asking and being answered — everywhere else the agent visibly thinks first. A follow-up is a short
    // clarification, so it gets the lightweight beat (the existing typing dots) rather than vdcNotifSpeak's full
    // stepped trace, which would overstate the work. The reply then composes itself word by word like any other.
    aiAgent._scrollAnchor = 'bottom';
    aiAgent.thinking = true;
    if (typeof aiSetBusy === 'function') aiSetBusy(true);
    if (typeof aiRender === 'function') aiRender();
    setTimeout(function(){
      aiAgent.thinking = false;
      aiAgent.msgs.push({ role:'agent', html:'<p>' + esc(a) + '</p>' });
      aiAgent._scrollAnchor = 'bottom';
      if (typeof aiRender === 'function') aiRender();
      if (typeof aiSetBusy === 'function') aiSetBusy(false);
      // QUICK PROMPTS ARE A REGULAR PART OF THE CONVERSATION, NOT A ONE-OFF (user 2026-10-30: after a follow-up was
      // answered "no further guidance"). Each answer leaves the next unasked prompts of the same set under the
      // composer; once the set is spent, the starters take over so there is always a way forward.
      window.vdcNextQuickPrompts();
    }, 780);
  };
  window.vdcNextQuickPrompts = function(){
    var pool = aiAgent._qpPool || [], asked = aiAgent._qpAsked || {}, started = aiAgent._qpStarted || {};
    var next = pool.filter(function(p){ return !asked[p]; });
    if (next.length){ paintQP(next.slice(0, 3), pool); return; }
    next = STARTERS.map(function(o){ return o.ask; }).filter(function(p){ return !started[p]; });
    if (next.length) paintQP(next.slice(0, 3), next);
  };
  // Clearing goes through one function so the DOM and the remembered list cannot disagree.
  window.vdcClearQuickPrompts = function(){
    try { document.getElementById('aiChips').innerHTML = ''; } catch(e){}
    try { aiAgent._qp = null; } catch(e){}
  };
  // Carried across a page hop: the prompts belong to the answer that is still on screen, so they travel with the
  // transcript (user 2026-10-29 — they vanished on landing because #aiChips is not part of aiAgent.msgs).
  window.vdcRestoreQuickPrompts = function(){
    try {
      var raw = JSON.parse(localStorage.getItem('vdc-ai-transcript'));
      if (raw && raw.qp && raw.qp.length) window.vdcRenderQuickPrompts(raw.qp);
    } catch(e){}
  };
  // The public call starts a NEW set: the pool is the whole list, asked is reset, the first three are shown.
  window.vdcRenderQuickPrompts = function(list){
    if (!list || !list.length) return;
    try { aiAgent._qpPool = list.slice(); aiAgent._qpAsked = {}; } catch(e){}
    paintQP(list.slice(0, 3), list);
  };
  // The chips live in the footer, BELOW the scrolling transcript, so painting them shrinks the transcript's viewport
  // and the last lines of the response (the card's own actions) end up behind the footer's top edge (user 2026-10-30:
  // the prompts "are covering the bottom of the response card and blocking the CTAs"). A response is read to its end,
  // so once the footer has its new height the transcript follows to the bottom. Repeated on the next frame and after
  // the card's arrival motion, because the card is still growing when the prompts first paint.
  function followToEnd(){
    var b = document.getElementById('aiBody'); if (!b) return;
    var go = function(){ b.scrollTop = b.scrollHeight; };
    go(); requestAnimationFrame(go); setTimeout(go, 350);
  }
  window.vdcFollowToEnd = followToEnd;
  function paintQP(list, pool){
    var el = document.getElementById('aiChips'); if (!el || !list || !list.length) return;
    if (!window.vdcQuickPromptsOn()) return;
    try { aiAgent._qp = list.slice(); aiAgent._qpPool = pool.slice(); } catch(e){}
    var sparkle = icon('prompt-ai-filled', 14), xIcon = icon('close-outlined', 14);
    el.innerHTML = '<div class="ai-qp">'
      + '<div class="ai-qp-hd"><span>Quick Prompts</span>'
      + '<span class="ai-qp-acts"><button type="button" class="ai-qp-x" onclick="vdcQuickPromptsOff()" data-tooltip="Don\u2019t show quick prompts again" aria-label="Don\u2019t show quick prompts again">' + icon('thumb-down-outlined', 14) + '</button>'
      + '<button type="button" class="ai-qp-x" onclick="vdcClearQuickPrompts()" aria-label="Dismiss">' + xIcon + '</button></span></div>'
      + '<div class="ai-qp-list">' + list.map(function(q){
          return '<button type="button" class="ai-chip ai-chip-qp" data-q="' + esc(q) + '" onclick="vdcQuickPromptGo(this)">' + sparkle + '<span>' + esc(q) + '</span></button>';
        }).join('') + '</div></div>';
    followToEnd();
  }

  // ── TRANSCRIPT HANDOFF, SHARED ──────────────────────────────────────────────────────────────────────────────
  // Travelling between pages carries the conversation: the destination reads vdc-ai-transcript and reopens the
  // panel over it. Only protected-data ever WROTE that key, so a click-through from Settings, Activity or Policies
  // set the handoff marker and then landed on an empty transcript — the panel simply did not come back (user
  // 2026-10-29). Lifted here verbatim from protected-data's _aiPersistTranscript so there is one implementation.
  // Reasoning modules are deliberately not carried: they are ephemeral thinking chrome.
  window.vdcPersistTranscript = function(){
    try {
      if (typeof aiAgent === 'undefined' || !aiAgent.msgs) return;
      var out = [];
      aiAgent.msgs.slice(-40).forEach(function(m){
        try {
          if (m.role === 'user' || m.role === 'agent'){
            var rec = { role: m.role, html: m.html };
            if (m.gate){
              rec.gate = { q: m.gate.q, resolved: !!m.gate.resolved, choice: m.gate.choice, decidedAt: m.gate.decidedAt,
                superseded: !!m.gate.superseded, _trail: m.gate._trail || null, _trailOpen: false, buttons: [],
                approval: m.gate.approval ? { action: m.gate.approval.action, scope: m.gate.approval.scope,
                  evidence: m.gate.approval.evidence, reversal: m.gate.approval.reversal } : null };
            }
            out.push(JSON.parse(JSON.stringify(rec)));
          } else if (m.role === 'card'){
            out.push(JSON.parse(JSON.stringify({ role: 'card', card: m.card, _accepted: !!m._accepted, actsOpen: false, open: false })));
          }
        } catch(e){}
      });
      localStorage.setItem('vdc-ai-transcript', JSON.stringify({ ts: Date.now(), msgs: out, qp: (aiAgent._qp || null) }));
    } catch(e){}
  };


  // ── THE AGENT SPEAKS, SHARED ────────────────────────────────────────────────────────────────────────────────
  // Every agent reply in the thread composes itself word by word, the same A2 motion the arrival greeting uses
  // (user 2026-10-29: "agent responses are still not consistently animating in… the text just appears"). Until
  // now ONLY the greeting typed: aiRender's agent branch emitted m.html raw, so a quick-prompt answer, a scenario
  // narration and a follow-up line all landed instantly while the greeting above them composed. One motion
  // vocabulary or none.
  //
  // RE-RENDER SAFE, like the card arrival: aiRender rebuilds #aiBody wholesale and fresh elements restart their
  // animations, so a one-shot "first render only" flag would be cut short by the very next beat (the bug that
  // made the Mark Aldridge narration appear whole). Each delay instead subtracts the ms already elapsed since the
  // message was first laid out, so a rebuild RESUMES the sentence where it had got to — words already spoken get
  // a negative delay and render settled, the rest keep their place in the queue.
  //
  // Walks text nodes only, so markup, buttons and inline SVG inside a reply are untouched; skips interactive and
  // non-text subtrees so a control's label never animates away from its button.
  var SAY_STEP = 22, SAY_WORD = 260, SAY_SKIP = { BUTTON:1, SVG:1, SCRIPT:1, STYLE:1, INPUT:1, SELECT:1, TEXTAREA:1 };
  /* word spans already baked into stored html (a transcript saved before the committed greeting was unwrapped) */
  function unword(h){ return String(h).replace(/<span class="vdc-w"[^>]*>([^<]*)<\/span>/g, '$1'); }
  window.vdcSayHtml = function(html, m, from){
    try {
      if (!html || typeof html !== 'string') return html;
      if (!m) return html;
      /* A RECORD IS NOT A REPLY. Two kinds of agent message are already-settled text and must never be composed again:
         (1) the committed arrival greeting (_arrival) — it typed itself once on the home screen, and each reasoning step then
             re-rendered the thread, re-hiding and re-typing it ("Welcome back" flashing as the steps changed); and
         (2) a message carried in from another page or restored from storage (_noSay) — history, not an arrival. The code that
             rebuilds a carried conversation sets the flag where the message is created; an earlier version GUESSED, by treating
             whatever was in the thread at the first render as carried, and that swallowed the first live reply instead. */
      if (m._arrival) return unword(html);
      if (m._noSay) return unword(html);
      if (document.body.classList.contains('ai-nofx')) return html;
      if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return html;
      if (!m._sayAt) m._sayAt = Date.now();
      var elapsed = Date.now() - m._sayAt;

      var tpl = document.createElement('div');
      tpl.innerHTML = html;
      // Collect first so the walk isn't disturbed by the replacements.
      var texts = [], walk = function(n){
        for (var c = n.firstChild; c; c = c.nextSibling){
          if (c.nodeType === 3){ if (c.nodeValue && c.nodeValue.trim()) texts.push(c); }
          else if (c.nodeType === 1 && !SAY_SKIP[c.tagName]) walk(c);
        }
      };
      walk(tpl);
      if (!texts.length) return html;

      var words = 0;
      texts.forEach(function(t){ words += t.nodeValue.split(/\s+/).filter(Boolean).length; });
      // Long replies keep the same total budget rather than taking proportionally longer to read out.
      var step = Math.min(SAY_STEP, 760 / Math.max(1, words));
      var base = from || 0;
      if (elapsed > base + words * step + SAY_WORD) return html;   // settled: nothing left to animate

      var i = 0;
      texts.forEach(function(t){
        var frag = document.createDocumentFragment();
        t.nodeValue.split(/(\s+)/).forEach(function(w){
          if (!w) return;
          if (!w.trim()){ frag.appendChild(document.createTextNode(w)); return; }
          var sp = document.createElement('span');
          sp.className = 'vdc-w';
          sp.style.animationDelay = Math.round(base + (i++) * step - elapsed) + 'ms';
          sp.textContent = w;
          frag.appendChild(sp);
        });
        t.parentNode.replaceChild(frag, t);
      });
      // No wrapper element: m.html is usually block content (<p>, lists, cards) and a <span> around it would nest
      // blocks inside an inline box. The caller puts .vdc-typing on the bubble instead — inert when no word spans
      // are present, so it can be applied unconditionally.
      m._said = true;
      return tpl.innerHTML;
    } catch(e){ return html; }
  };

  // Shared companion for every block that arrives: how long .is-arriving should stay on, and what --elapsed to
  // hand it. Lives here so the four copies of the renderer cannot drift on the timing. Returns a fragment spliced
  // INSIDE the class attribute — it closes the class and opens style — so a call site reads
  //   '<div class="aiac' + arrive + '" data-aiac=…'
  var AIAC_ARRIVAL_MS = 1260;   // --cascade-end 640 + --gap 160 + 300 slowest delay + ~160 tail
  var GATE_ARRIVAL_MS = 760;
  function arrival(o, total, lead){
    try {
      if (!o) return '';
      if (o._arrived) return '';                                   // carried/restored: renders settled
      if (document.body.classList.contains('ai-nofx')) return '';
      if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return '';
      if (!o._arriveAt) o._arriveAt = Date.now();
      var el = Date.now() - o._arriveAt;
      if (el > total + (lead || 0)){ o._arrived = true; return ''; }
      return ' is-arriving" style="--elapsed:' + el + 'ms' + (lead ? ';--lead:' + lead + 'ms' : '');
    } catch(e){ return ''; }
  }
  window.vdcCardArrival = function(m){ return arrival(m, AIAC_ARRIVAL_MS); };
  // THE APPROVAL ARRIVES TOO (user 2026-10-29: "when i click the Mark Aldridge left the company scenario… the
  // card appears immediately without animating in"). The card in that flow is the APPROVAL block, not an .aiac
  // answer card, and only .aiac had ever been given the B7 treatment — so whether a scenario's centrepiece
  // animated depended on which kind of block it happened to end in. Same contract, shorter sequence: an approval
  // is a short read (four labelled rows and a decision), not a chart to measure out. Keyed on m.gate, which is
  // the object that actually appears, so attaching a gate to an existing message still animates.
  // THE DECISION WAITS FOR THE WORDS ABOVE IT (user 2026-10-30: "the approval card appears before the text above has finished
  // animating in. i told you earlier content needs to appear linearly"). The card used to start its own clock the moment the
  // message was laid out, in parallel with the sentence that introduces it. It now carries a lead — the time vdcSayHtml
  // needs to say the message — and every delay in the card's cascade is offset by it (--lead).
  function sayMs(html){
    try {
      var tpl = document.createElement('div'); tpl.innerHTML = String(html || ''); var words = 0;
      (function walk(n){ for (var c = n.firstChild; c; c = c.nextSibling){
        if (c.nodeType === 3){ words += c.nodeValue.split(/\s+/).filter(Boolean).length; }
        else if (c.nodeType === 1 && !SAY_SKIP[c.tagName]) walk(c); } })(tpl);
      if (!words) return 0;
      return Math.round(words * Math.min(SAY_STEP, 760 / Math.max(1, words)) + SAY_WORD);
    } catch(e){ return 0; }
  }
  window.vdcGateArrival = function(g, m){
    var lead = (m && !m._noSay && !m._arrival) ? sayMs(m.html) : 0;
    return arrival(g, GATE_ARRIVAL_MS, lead);
  };

  // THE LIVE LABEL TICKS, IT DOESN'T JUMP. While a flow runs the reasoning bar is collapsed, so its header is the
  // only thing moving on screen — and it swapped text instantly every 700ms while everything around it composed.
  // Keyed on the label itself: the fade is armed when the text CHANGES, not on every aiRender, or the rebuild
  // would re-fade a line that had not moved. Same --elapsed resume as the blocks above.
  var LBL_MS = 320;
  window.vdcLabelArrival = function(m, label){
    try {
      if (!m) return '';
      if (m._lblKey !== label){ m._lblKey = label; m._lblAt = Date.now(); }
      if (document.body.classList.contains('ai-nofx')) return '';
      if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return '';
      var el = Date.now() - (m._lblAt || 0);
      if (el > LBL_MS) return '';
      return ' vdc-tick" style="--elapsed:' + el + 'ms';
    } catch(e){ return ''; }
  };

  // ── OPEN-ENDED STARTERS (user 2026-10-30) ───────────────────────────────────────────────────────────────────
  // The arrival lists only what the agent is holding for you. Under it, a quieter second tier says what ELSE it can
  // do, phrased as the general thing a person would say before they know the specifics ("help me restore
  // something"), not as a finished scenario ("restore Mark Aldridge"). Picking one opens the conversation with the
  // agent's NARROWING question; the options under the composer (Quick Prompts) are the ways to answer it. Replies
  // are authored and deliberately make no claims about the estate: they say what the agent would look at and that
  // nothing changes without a decision. The scripted scenarios on the + menu are unchanged and remain the
  // specific route. Four, per the ~4-suggestion cap that governs the staged cards.
  var STARTERS = [
    { id:'restore', topic:'Restore something', title:'Get something back', sub:'Help me restore something that has gone missing or changed.',
      ask:'Help me restore something.',
      reply:'Happy to. Tell me what went missing and roughly when, or start from one of these.',
      opts:{
        'It belongs to a person: a mailbox, files or a chat':'I’ll find the person first, then show the restore points that predate the loss so you can pick one. Nothing is restored until you approve the plan.',
        'A folder or site was changed or emptied':'I’ll open the location, compare it across restore points to find the moment it changed, and propose rolling back only that part.',
        'Records in Dynamics 365':'I’ll ask which table, then show what changed between two restore points so you can choose whole records or only specific columns.' } },
    { id:'drift', topic:'Recovery target check', title:'Check my recovery targets', sub:'Tell me where protection is falling behind what I promised.',
      ask:'Check whether my backups are meeting their recovery point targets.',
      reply:'I can compare each policy’s recovery point target with what its recent runs actually delivered. Where should I look?',
      opts:{
        'Everything I protect':'I’ll go through every policy and rank them by how far the latest recovery point is from its target, worst first, with the cause for each.',
        'One workload':'Name the workload and I’ll limit the check to its policies, including any that have no target set at all.',
        'Only what slipped this week':'I’ll show just the policies that drifted over the last seven days, whether it was a missed run or a target that is now too tight.' } },
    { id:'dashboard', topic:'Build a dashboard', title:'Build a dashboard', sub:'Help me put together a view of the things I keep checking.',
      ask:'Help me build a dashboard.',
      reply:'Let’s start from the decision it should help you make. What do you want to be able to tell at a glance?',
      opts:{
        'Whether I am protected':'I’d lead with coverage and recovery point health per workload, with anything outside its target pulled to the top.',
        'Where storage is going':'I’d show consumption by workload over time, what is growing fastest, and what a retention change would free up.',
        'What the agent has been doing':'I’d chart sessions by outcome and skill, with the decisions still waiting on you listed first.' } },
    { id:'odd', topic:'Investigate something odd', title:'Look into something odd', sub:'Something seems off. Help me work out what happened.',
      ask:'Something looks off. Help me work out what happened.',
      reply:'Tell me what you noticed, or pick the closest match and I’ll start from there.',
      opts:{
        'Backups that failed or ran slow':'I’ll line up the affected jobs by time and workload, look for what they share, and tell you whether it is one cause or several.',
        'Files or items disappearing':'I’ll look at deletion activity across your workloads, separate normal clean-up from unusual bursts, and show who or what was behind them.',
        'A policy or setting that changed':'I’ll go through recent policy and setting changes, who made each one, and what it affected, so you can undo any you did not intend.' } }
  ];
  STARTERS.forEach(function(o){ Object.keys(o.opts).forEach(function(q){ QP_ANSWERS[q] = o.opts[q]; }); });   // at load, so the options still answer after a page hop restores them
  var STARTERS_BY_ASK = {}; STARTERS.forEach(function(o){ STARTERS_BY_ASK[o.ask] = o; });
  function starterCards(t, typed){
    // READS DOWN THE PAGE IN ORDER (user 2026-10-30): the label types in like the greeting once everything above it has
    // finished, and only then do the cards rise, so nothing here is on screen while the recommendation is still arriving.
    var label = 'What else I can do for you', step = 24, words = label.split(/(\s+)/), k = 0;
    var lblHtml = !typed ? esc(label) : words.map(function(w){
      if (!w.trim()) return esc(w);
      return '<span class="vdc-w" style="animation-delay:' + (t + 60 + (k++) * step) + 'ms">' + esc(w) + '</span>';
    }).join('');
    var cardsFrom = t + 60 + k * step + 260 + 40;
    return '<div class="ai-home-label' + (typed ? ' vdc-typing' : '') + '">' + lblHtml + '</div>' + STARTERS.map(function(o, i){
      var d = typed ? ' vdc-arrive" style="animation-delay:' + (cardsFrom + i * 80) + 'ms' : '';
      return '<button type="button" class="ai-home-card' + d + '" onclick="vdcStarterGo(\'' + o.id + '\')">'
        + '<div class="ai-home-card-t">' + esc(o.title) + '</div><div class="ai-home-card-p">' + esc(o.sub) + '</div></button>';
    }).join('');
  }
  // One beat of thinking, then the narrowing question; the options then arrive as Quick Prompts. A chosen option
  // gets its authored reply through vdcQuickPromptGo (QP_ANSWERS), the same path the ROT follow-ups use.
  function beat(fn){
    aiAgent._scrollAnchor = 'bottom'; aiAgent.thinking = true;
    if (typeof aiSetBusy === 'function') aiSetBusy(true);
    if (typeof aiRender === 'function') aiRender();
    setTimeout(function(){
      aiAgent.thinking = false; fn();
      aiAgent._scrollAnchor = 'bottom';
      if (typeof aiRender === 'function') aiRender();
      if (typeof aiSetBusy === 'function') aiSetBusy(false);
    }, 780);
  }
  window.vdcStarterGo = function(id){
    if (typeof aiAgent === 'undefined' || aiAgent.busy) return;
    var o = STARTERS.filter(function(x){ return x.id === id; })[0]; if (!o) return;
    commitArrival('vdcStarterGo(\'' + id + '\')');
    aiAgent.msgs.push({ role:'user', html:o.ask });
    window.vdcSetPanelTopic(o.topic);
    (aiAgent._qpStarted = aiAgent._qpStarted || {})[o.ask] = 1;
    beat(function(){
      aiAgent.msgs.push({ role:'agent', html:'<p>' + esc(o.reply) + '</p>' });
      if (typeof window.vdcRenderQuickPrompts === 'function') window.vdcRenderQuickPrompts(Object.keys(o.opts));
    });
  };

  // ── THE ARRIVAL SCREEN, SHARED ──────────────────────────────────────────────────────────────────────────────
  // Every page with the panel shows the same greeting-and-concerns screen, so it is built here rather than copied
  // into four aiRenderHome functions (user 2026-10-29: opening the panel on Settings still pushed the full
  // recommendation, because only Protected Data had opted in). Returns '' when the agent is holding nothing, so a
  // page can fall through to its own home. Also stashes the markup for commitArrival.
  window.vdcNotifArrivalHtml = function(glyphHtml){
    var list = (typeof window.vdcNotifPending === 'function') ? window.vdcNotifPending() : [];
    if (!list.length) return '';
    // THE GREETING COMPOSES ITSELF (user 2026-10-29, variant A3 from agent-panel-motion.html). Words fade up one by one
    // rather than a character-by-character typewriter: the same "actively writing this" read, without making
    // anyone wait out 78 characters. Delays are written per word at build time — CSS cannot stagger N children.
    // ONCE PER OPEN: aiRenderHome re-runs on workload change and on +, and re-typing the greeting each time would be
    // maddening. aiOpen clears _greetTyped, so it plays on arrival and never again until the panel is reopened.
    var typed = !aiAgent._greetTyped;
    aiAgent._greetTyped = true;
    var step = 24, tEnd = 0;
    function say(txt, from){
      if (!typed) return esc(txt);
      return String(txt).split(/(\s+)/).map(function(w){
        if (!w.trim()) return esc(w);
        var d = from + (tEnd++) * step;
        return '<span class="vdc-w" style="animation-delay:' + d + 'ms">' + esc(w) + '</span>';
      }).join('');
    }
    var subTxt = 'I\u2019ve been working while you were away. '
      + (list.length === 1 ? 'There\u2019s one thing' : 'There are ' + list.length + ' things') + ' I\u2019d like you to look at.';
    var titleHtml = say('Welcome back.', 0);
    var subHtml = say(subTxt, 60);
    var cardFrom = 60 + tEnd * step + 260 + 40;   // the concerns follow the sentence that introduces them: after its LAST word has finished fading in, not when it starts
    var inner = '<span class="ai-home-glyph" aria-hidden="true">' + (glyphHtml || '') + '</span>'
      + '<div class="ai-home-title' + (typed ? ' vdc-typing' : '') + '">' + titleHtml + '</div>'
      + '<div class="ai-home-sub' + (typed ? ' vdc-typing' : '') + '">' + subHtml + '</div>'
      // Travel is marked: a concern that LEAVES for Activity carries the open-in-new glyph, one that speaks into
      // the thread does not.
      + list.map(function(o, i){
          var travels = o.kind === 'appr';
          var click = travels ? "vdcNotifGo('appr','" + o.task + "')" : "vdcNotifSpeak('" + o.id + "')";
          var glyph = travels ? '<span class="ai-home-card-nav" aria-hidden="true">' + icon('open-in-new-outlined', 14) + '</span>' : '';
          var _cd = typed ? ' style="animation-delay:' + (cardFrom + i * 80) + 'ms"' : '';
          return '<button type="button" class="ai-home-card' + (travels ? ' travels' : '') + (typed ? ' vdc-arrive' : '') + '"'
            + _cd + ' onclick="' + click + '"'
            + (travels ? ' aria-label="' + esc(o.title) + ' \u2014 opens in Agent activity"' : '') + '>'
            // A concern is a decision the agent is waiting on you for, so it wears the one "Awaiting decision" chip (user
            // 2026-10-30); the starter cards below are a menu and carry none.
            + (typeof window.vdcDecisionChip === 'function' ? '<div class="ai-home-card-st">' + window.vdcDecisionChip() + '</div>' : '')
            + '<div class="ai-home-card-t">' + esc(o.title) + glyph + '</div>'
            + '<div class="ai-home-card-p">' + esc(o.sub) + '</div></button>';
        }).join('')
      // Only when something here actually lives in Activity. With approvals staged out, this footer would send the
      // user to a lens with nothing in it.
      + (list.some(function(o){ return o.kind === 'appr'; })
          ? '<div class="ai-home-foot' + (typed ? ' vdc-arrive" style="animation-delay:' + (cardFrom + (list.length - 1) * 80 + 260) + 'ms' : '') + '"><button type="button" class="aiac-btn" onclick="vdcNotifGo(\'appr\')">Review these in Agent activity'
            + icon('open-in-new-outlined', 16) + '</button></div>'
          : '')
      + starterCards(cardFrom + (list.length - 1) * 80 + 260 + (list.some(function(o){ return o.kind === 'appr'; }) ? 260 : 0), typed);
    // THE COMMITTED COPY IS STATIC (user 2026-10-29: the greeting "restarts its animation a couple times while the
    // agent responds"). Once this block is committed into the transcript, every aiRender rebuilds #aiBody and
    // re-inserts it — and fresh elements restart their CSS animations, so the reasoning steps made the greeting
    // re-type on each beat. The live screen keeps its motion; the transcript copy is stripped of the triggers.
    try {
      var frozen = inner.replace(/ vdc-typing/g, '').replace(/ vdc-arrive/g, '')
                        .replace(/ style="animation-delay:[^"]*"/g, '')
                        /* and UNWRAP the word spans. Dropping the class and the delays was not enough: every agent bubble now carries
                           .vdc-typing, so the spans left behind in the committed greeting animated again on each re-render. */
                        .replace(/<span class="vdc-w"[^>]*>([^<]*)<\/span>/g, '$1');
      aiAgent._arrivalHtml = '<div class="ai-home is-inthread">' + frozen + '</div>';
    } catch(e){}
    return '<div class="ai-home">' + inner + '</div>';
  };

  // Speak one pending item. THE FULL CONVERSATION, NOT THE PUNCHLINE (user 2026-10-29: "i should see the agent
  // reason, respond, summarize etc rather than an immediate jump to the rendered summary card"). Picking a concern
  // reads as asking for it: the list commits as the opening turn, the ask follows as the user's, then the agent
  // thinks on screen and answers — the same beats any other scenario in the panel plays.
  window.vdcNotifSpeak = function(id){
    if (typeof aiAgent === 'undefined' || aiAgent.busy) return;
    var list = pendingVoice(); if (!list.length) return;
    var v = jget(KEY_VOICED, {});
    if (id === '__appr'){   // legacy: the collapsed catch-up item, no trace to play
      commitArrival(null); speakAppr(list.filter(function(n){ return n.task; }), v, false);
      jset(KEY_VOICED, v); aiAgent._scrollAnchor = 'bottom'; if (typeof aiRender === 'function') aiRender(); paintDot(); return;
    }
    var n = list.filter(function(x){ return x.id === id; })[0]; if (!n) return;
    commitArrival(n.id);
    if (n.topic) window.vdcSetPanelTopic(n.topic);
    aiAgent.msgs.push({ role:'user', html:askFor(n) });   // user bubbles render _aiEsc(m.html): plain text, never markup
    recs_mark(v, n);
    // The policy page already authors this whole flow for this recommendation — use it rather than a second copy.
    if (typeof window.rotGapFlow === 'function'){
      if (typeof aiRender === 'function') aiRender();
      aiAgent.msgs.pop();   // rotGapFlow pushes its own user turn
      window.rotGapFlow(); paintDot(); return;
    }
    if (typeof aiPushReasoning !== 'function'){ speakRec(v); jset(KEY_VOICED, v); if (typeof aiRender === 'function') aiRender(); paintDot(); return; }
    if (typeof aiSetBusy === 'function') aiSetBusy(true);
    aiAgent._scrollAnchor = 'bottom';
    var rs = aiPushReasoning(); rs.named = true; rs.open = false;
    ROT_STEPS.forEach(function(en, i){ setTimeout(function(){ rs.steps.push(en); if (typeof aiRender === 'function') aiRender(); }, 350 + i * 700); });
    setTimeout(function(){
      if (typeof aiFinishReasoning === 'function') aiFinishReasoning(rs);
      speakRec(v); jset(KEY_VOICED, v);
      aiAgent._scrollAnchor = 'bottom'; if (typeof aiRender === 'function') aiRender();
      if (typeof aiSetBusy === 'function') aiSetBusy(false);
      // The answer states a finding and offers a decision, but points nowhere after that — exactly the case the
      // Quick Prompts pattern exists for, so the follow-ups go here rather than on every card.
      if (typeof window.vdcRenderQuickPrompts === 'function') window.vdcRenderQuickPrompts(ROT_FOLLOWUPS);
      paintDot();
    }, 350 + ROT_STEPS.length * 700 + 400);
  };
  function recs_mark(v, n){ v[n.id] = 1; jset(KEY_VOICED, v); }

  function voiceSoon(){
    if (voiceTimer || !panelOpen()) return;
    var tries = 0;
    voiceTimer = setInterval(function(){ if (!panelOpen() || voice() || ++tries > 40){ clearInterval(voiceTimer); voiceTimer = null; } }, 700);
  }
  // Where the button goes depends on where the user already is: nothing to navigate when the destination is this page.
  window.vdcNotifGo = function(kind, id){
    // The collapsed line opens the lens, it does not answer anything — only a specific task's link marks that task read.
    markRead(kind === 'rec' ? ['rot-rec'] : id ? ['appr-' + id] : []);
    // THE PANEL TRAVELS (user 2026-10-29: "it closed the panel. the panel should remain open and carry all the
    // context of the conversation"). aiacGo('nav') is the existing conversation-led handoff — it persists the
    // transcript and sets the one-shot marker the destination reads to reopen the panel over it. A raw
    // location.href, which is what this used, bypasses that contract entirely and drops the conversation.
    if (kind === 'rec' || kind === 'rec-activate'){
      // Activating from another surface still happens ON the policy page — the policy machinery lives there. The
      // directive rides across with the transcript handoff and is consumed on landing, so the user arrives at the
      // activated policy rather than at a form they still have to act on.
      if (kind === 'rec-activate'){ try { sessionStorage.setItem('vdc-rot-activate', '1'); } catch(e){} }
      if (typeof rotShowView === 'function'){   // already here: no travel
        rotShowView(false, true);
        if (kind === 'rec-activate' && typeof window.rotActivate === 'function'){ try { sessionStorage.removeItem('vdc-rot-activate'); } catch(e){} setTimeout(window.rotActivate, 260); }
        refresh(); return;
      }
      _travel('backup-policies.html#rot-review'); return;
    }
    // No id = the collapsed catch-up line: land on the Agents lens itself rather than any one task.
    var h = id ? '#agents/' + id : '#agents';
    // Match the Activity page with OR without the extension: a static server that serves extensionless URLs makes
    // location.pathname '/activity', so an /activity\.html$/ test silently failed there and every in-page link fell through
    // to a FULL PAGE RELOAD — which closes the panel and drops the already-voiced message, reading as "the button does nothing".
    if (/\/activity(\.html)?$/.test(location.pathname)){
      // Already here: switch the lens in place. _actOpenAgentTaskLink only understands '#agents/<taskId>', so the bare
      // catch-up hash has to go through setActView — routing it to the task helper matched nothing and did nothing.
      if (!id){ if (typeof setActView === 'function') setActView('agents'); else location.hash = h; }
      else if (location.hash === h && typeof _actOpenAgentTaskLink === 'function') _actOpenAgentTaskLink(h);
      else location.hash = h;
      refresh();
    }
    else _travel('activity.html' + h);
  };
  // One door for leaving the page, so every exit keeps the panel and the thread.
  /* A page one folder below the prototypes it links to (the Agent Hub) sets window.VDC_BASE = '../'; every
     page in the root leaves it unset. Applied where the component navigates, so no consumer has to patch a link. */
  function _href(p){ return (/^([a-z][a-z0-9+.-]*:|\/|#)/i.test(p) ? p : ((window.VDC_BASE || '') + p)); }
  function _travel(dest){
    if (typeof window.aiacGo === 'function'){ window.aiacGo('nav', dest); return; }
    try { sessionStorage.setItem('vdc-ai-handoff', String(dest).split('#')[0].split('?')[0]); } catch(e){}
    window.location.href = _href(dest);
  }

  // ── panel ───────────────────────────────────────────────────────────────────────────────────────────────────
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  function dayKey(d){ return MONTHS[d.getMonth()] + ' ' + ('0' + d.getDate()).slice(-2); }
  function timeLbl(d){ var h = d.getHours() % 12 || 12, ap = d.getHours() < 12 ? 'am' : 'pm'; return MONTHS[d.getMonth()].slice(0, 3) + ' ' + d.getDate() + ' ' + d.getFullYear() + ', ' + h + ':' + ('0' + d.getMinutes()).slice(-2) + ' ' + ap; }
  // the platform's notification tile: a hexagon with a glyph (the container is the shape; the glyph is a store icon)
  function hex(glyph){
    return '<span class="vdc-np-hex"><svg viewBox="0 0 48 48" width="28" height="28" aria-hidden="true"><path d="M22 4.6a4 4 0 0 1 4 0l14 8.1a4 4 0 0 1 2 3.5v16.2a4 4 0 0 1-2 3.5l-14 8.1a4 4 0 0 1-4 0l-14-8.1a4 4 0 0 1-2-3.5V16.2a4 4 0 0 1 2-3.5z" fill="currentColor"/></svg><span class="g">' + glyph + '</span></span>';
  }
  var state = { q:'', wide:false, menu:false };
  function cards(list){
    var q = state.q.trim().toLowerCase();
    if (q) list = list.filter(function(n){ return (n.title + ' ' + n.body).toLowerCase().indexOf(q) >= 0; });
    if (!list.length) return '<div class="vdc-np-empty">' + (q ? 'No notifications match your search.' : 'You have no notifications.') + '</div>';
    var groups = [], by = {};
    list.forEach(function(n){ var k = dayKey(n.at); if (!by[k]){ by[k] = []; groups.push(k); } by[k].push(n); });
    return groups.map(function(k){
      return '<div class="vdc-np-day"><span>' + k + '</span><span class="n">' + by[k].length + ' Notification' + (by[k].length === 1 ? '' : 's') + '</span></div>'
        + by[k].map(function(n){
          var tile = n.kind === 'agent' ? '<span class="vdc-np-ai" aria-hidden="true">' + icon('ai-sparkle', 40) + '</span>' : hex(icon('settings-outlined', 14));
          return '<button type="button" class="vdc-np-card' + (n.unread ? ' is-unread' : '') + '" onclick="vdcNotifOpen(\'' + n.id + '\')">'
            + tile + '<span class="vdc-np-tx"><span class="vdc-np-hd"><span class="vdc-np-t">' + (n.unread ? '<i class="vdc-np-dot" role="img" aria-label="Unread"></i>' : '') + esc(n.title) + '</span><span class="vdc-np-w">' + esc(timeLbl(n.at)) + '</span></span>'
            + '<span class="vdc-np-b">' + esc(n.body) + '</span></span></button>';
        }).join('');
    }).join('');
  }
  function paintPanel(){
    var p = document.getElementById('vdcNp'); if (!p) return;
    var list = build(), n = list.filter(function(x){ return x.unread; }).length;
    p.classList.toggle('is-wide', state.wide);
    var kebab = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>';
    p.querySelector('.vdc-np-card-wrap').innerHTML =
        '<div class="vdc-np-side"><div class="vdc-np-side-h">0 Messages</div><div class="vdc-np-side-f"><button type="button" class="vdc-np-tab is-on" aria-current="true"><span>System Notifications</span>' + (n ? '<span class="vdc-np-count">' + (n > 9 ? '9+' : n) + '</span>' : '') + '</button></div></div>'
      + '<div class="vdc-np-main"><div class="vdc-np-top"><div><div class="vdc-np-title">Notifications</div><div class="vdc-np-sub">Visible only to you</div></div>'
      +   '<div class="vdc-np-tools"><label class="vdc-np-search"><span class="ic">' + icon('search-outlined', 20) + '</span><input type="text" id="vdcNpQ" placeholder="Search" value="' + esc(state.q) + '" aria-label="Search notifications" oninput="vdcNotifSearch(this.value)"></label>'
      +   '<button type="button" class="vdc-np-ib" data-tooltip="' + (state.wide ? 'Make smaller' : 'Make larger') + '" aria-label="Resize" onclick="vdcNotifWide()">' + icon('zoom-out-map-outlined', 16) + '</button>'
      +   '<span class="vdc-np-mw"><button type="button" class="vdc-np-ib" aria-haspopup="true" aria-label="More" onclick="vdcNotifMenu(event)">' + kebab + '</button>'
      +   '<div class="vdc-np-menu" id="vdcNpMenu"' + (state.menu ? ' style="display:block"' : '') + ' role="menu"><button type="button" role="menuitem" onclick="vdcNotifMarkAll()">Mark all as read</button><button type="button" role="menuitem" onclick="window.location.href=\'agent-settings.html#notifications\'">Notification settings</button></div></span>'
      +   '<button type="button" class="vdc-np-ib" aria-label="Close" data-tooltip="Close" onclick="vdcNotifClose()">' + icon('close-outlined', 16) + '</button></div></div>'
      + '<div class="vdc-np-list" id="vdcNpList">' + cards(list) + '</div></div>';
    if (document.activeElement && document.activeElement.id === 'vdcNpQ') return;
  }
  function ensurePanel(){
    if (document.getElementById('vdcNp')) return;
    var s = document.createElement('div'); s.id = 'vdcNpScrim'; s.className = 'vdc-np-scrim'; s.onclick = function(e){ if (e.target === s) window.vdcNotifClose(); };
    var p = document.createElement('div'); p.id = 'vdcNp'; p.className = 'vdc-np'; p.setAttribute('role', 'dialog'); p.setAttribute('aria-label', 'Notifications');
    p.innerHTML = '<div class="vdc-np-card-wrap"></div>';
    s.appendChild(p); document.body.appendChild(s);
  }
  window.vdcNotifOpenPanel = function(){
    ensurePanel(); state.q = ''; state.menu = false; paintPanel();
    document.getElementById('vdcNpScrim').classList.add('is-open');
  };
  window.vdcNotifClose = function(){ var s = document.getElementById('vdcNpScrim'); if (s) s.classList.remove('is-open'); paintBadge(); };
  window.vdcNotifToggle = function(){ var s = document.getElementById('vdcNpScrim'); if (s && s.classList.contains('is-open')) window.vdcNotifClose(); else window.vdcNotifOpenPanel(); };
  window.vdcNotifSearch = function(v){
    state.q = v; var list = build(), el = document.getElementById('vdcNpList'); if (el) el.innerHTML = cards(list);   // only the list redraws, so the field keeps focus
  };
  window.vdcNotifWide = function(){ state.wide = !state.wide; paintPanel(); };
  window.vdcNotifMenu = function(e){ e.stopPropagation(); var m = document.getElementById('vdcNpMenu'); if (!m) return; state.menu = m.style.display !== 'block'; m.style.display = state.menu ? 'block' : 'none'; };
  window.vdcNotifMarkAll = function(){ markRead(build().map(function(n){ return n.id; })); state.menu = false; refresh(); };
  window.vdcNotifOpen = function(id){
    var n = build().filter(function(x){ return x.id === id; })[0]; if (!n) return;
    markRead([id]); window.vdcNotifClose();
    if (n.href) window.location.href = _href(n.href);
  };
  document.addEventListener('click', function(e){ var m = document.getElementById('vdcNpMenu'); if (m && state.menu && !e.target.closest('.vdc-np-mw')){ state.menu = false; m.style.display = 'none'; } });
  document.addEventListener('keydown', function(e){ if (e.key === 'Escape'){ var s = document.getElementById('vdcNpScrim'); if (s && s.classList.contains('is-open')) window.vdcNotifClose(); } });

  // ── styles ──────────────────────────────────────────────────────────────────────────────────────────────────
  var css = ''
    + '.vdc-nb { position:absolute; top:-4px; right:-4px; min-width:16px; height:16px; padding:0 4px; border-radius:8px; background:var(--red, #ed2c3d); color:var(--white, #fff); font-size:11px; font-weight:500; line-height:16px; text-align:center; box-sizing:border-box; pointer-events:none; }\n'
    + '/* The assistant\'s rail icon is quiet by default: a plain sparkle. It glows and turns only when it has something to tell the user (an approval or recommendation waiting: .has-voice, set by paintDot). Hover previews the glow without the motion. */\n'
    + '.vn-ai-launcher::before { opacity:0; animation:none; transition:opacity .4s ease; }\n'
    + '.vn-ai-launcher svg { animation:none; }\n'
    + '.vn-ai-launcher:hover::before { opacity:.45; }\n'
    + '.vn-ai-launcher.has-voice::before { opacity:.85; animation:vnAiSpin 6s linear infinite; }\n'
    + '.vn-ai-launcher.has-voice svg { animation:vnAiSparklePulse 2.4s ease-in-out infinite; }\n'
    /* Row holding the catch-up's travel control. The button itself is the host page's .aiac-btn (secondary + glyph,
       the LOOK-HERE grammar) — not restyled here, so it matches every other navigate-away control on the page.
       was: .vdc-voice-more, an inline green text link — see the comment at its call site. */
    /* Arrival-screen styles ship with the component so every page gets them; identical to protected-data's copies,
       so re-declaring there is harmless. */
    /* Greeting composition — A2. Each word fades up 3px; the concern cards rise in behind the sentence. */
    + '@keyframes vdcWordIn { from { opacity:0; transform:translateY(3px); } to { opacity:1; transform:none; } }\n'
    + '.vdc-typing .vdc-w { display:inline-block; white-space:pre; animation:vdcWordIn 260ms cubic-bezier(.2,.7,.3,1) both; }\n'
    + '.ai-home .vdc-arrive { animation:aiTaskRise 260ms cubic-bezier(.2,.7,.3,1) both; }\n'
    + '@media (prefers-reduced-motion: reduce) { .vdc-typing .vdc-w, .ai-home .vdc-arrive { animation:none !important; } }\n'
    + 'body.ai-nofx .vdc-typing .vdc-w, body.ai-nofx .ai-home .vdc-arrive { animation:none !important; }\n'
    /* CARD ARRIVAL — B7 "cascade then draw" (user 2026-10-29, picked from agent-panel-motion.html). Two beats:
       the card builds in reading order (headline → sub → strip → caption → rows), then after --gap the strip and
       bars measure out from zero, and the decision lands with the last bar. The agent states the finding, pauses,
       then shows its working — the order it actually happened in. Built from the panel's own aiTaskRise easing.
       RE-RENDER SAFE (user 2026-10-29: "the card appears immediately without animating in"). aiRender rebuilds
       #aiBody wholesale, so fresh elements restart their CSS animations. The old guard was one-shot — first render
       only — which meant a card whose run pushed ANY further beat within the ~1.1s sequence (a reasoning tick, a
       follow-up line, the quick-prompt dock) lost the rest of its arrival and simply appeared. Now the card carries
       --elapsed, the ms since it was first laid out, and every delay subtracts it: a re-render resumes the sequence
       at the point it had reached instead of replaying or snapping. Past the end, aiacCardHtml drops the class. */
    + '@keyframes aiTaskRise { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:none; } }\n'
    + '@keyframes aiacDrawBar { from { transform:scaleX(0); } to { transform:scaleX(1); } }\n'
    + '@keyframes aiacStripGrow { from { transform:scaleX(0); } to { transform:scaleX(1); } }\n'
    + '.aiac.is-arriving { --cascade-end:640ms; --gap:160ms; --elapsed:0ms; animation:aiTaskRise 220ms cubic-bezier(.2,.7,.3,1) both; animation-delay:calc(0ms - var(--elapsed)); }\n'
    + '.aiac.is-arriving .aiac-headline, .aiac.is-arriving .aiac-headsub, .aiac.is-arriving .aiac-strip,\n'
    + '.aiac.is-arriving .aiac-vcap, .aiac.is-arriving .aiac-vrow, .aiac.is-arriving .aiac-decide,\n'
    + '.aiac.is-arriving .aiac-sec { animation:aiTaskRise 240ms cubic-bezier(.2,.7,.3,1) both; }\n'
    + '.aiac.is-arriving .aiac-headline { animation-delay:calc(50ms - var(--elapsed)); }\n'
    + '.aiac.is-arriving .aiac-headsub { animation-delay:calc(110ms - var(--elapsed)); }\n'
    + '.aiac.is-arriving .aiac-strip { animation-delay:calc(180ms - var(--elapsed)); }\n'
    + '.aiac.is-arriving .aiac-vcap { animation-delay:calc(250ms - var(--elapsed)); }\n'
    + '.aiac.is-arriving .aiac-vrow:nth-of-type(1) { animation-delay:calc(300ms - var(--elapsed)); }\n'
    + '.aiac.is-arriving .aiac-vrow:nth-of-type(2) { animation-delay:calc(350ms - var(--elapsed)); }\n'
    + '.aiac.is-arriving .aiac-vrow:nth-of-type(3) { animation-delay:calc(400ms - var(--elapsed)); }\n'
    + '.aiac.is-arriving .aiac-vrow:nth-of-type(n+4) { animation-delay:calc(450ms - var(--elapsed)); }\n'
    + '.aiac.is-arriving .aiac-sec { animation-delay:calc(var(--cascade-end) + var(--gap) + 240ms - var(--elapsed)); }\n'
    + '.aiac.is-arriving .aiac-decide { animation-delay:calc(var(--cascade-end) + var(--gap) + 300ms - var(--elapsed)); }\n'
    + '.aiac.is-arriving .aiac-strip span { transform-origin:left center; animation:aiacStripGrow 500ms cubic-bezier(.2,.7,.3,1) both; animation-delay:calc(var(--cascade-end) + var(--gap) - var(--elapsed)); }\n'
    + '.aiac.is-arriving .aiac-vrow .track span { transform-origin:left center; animation:aiacDrawBar 420ms cubic-bezier(.2,.7,.3,1) both; }\n'
    + '.aiac.is-arriving .aiac-vrow:nth-of-type(1) .track span { animation-delay:calc(var(--cascade-end) + var(--gap) + 80ms - var(--elapsed)); }\n'
    + '.aiac.is-arriving .aiac-vrow:nth-of-type(2) .track span { animation-delay:calc(var(--cascade-end) + var(--gap) + 150ms - var(--elapsed)); }\n'
    + '.aiac.is-arriving .aiac-vrow:nth-of-type(3) .track span { animation-delay:calc(var(--cascade-end) + var(--gap) + 220ms - var(--elapsed)); }\n'
    + '.aiac.is-arriving .aiac-vrow:nth-of-type(n+4) .track span { animation-delay:calc(var(--cascade-end) + var(--gap) + 290ms - var(--elapsed)); }\n'
    + '@media (prefers-reduced-motion: reduce) { .aiac.is-arriving, .aiac.is-arriving * { animation:none !important; } }\n'
    + 'body.ai-nofx .aiac.is-arriving, body.ai-nofx .aiac.is-arriving * { animation:none !important; }\n'
    /* APPROVAL / QUESTION ARRIVAL — the same cascade, one beat shorter. The block rises, then its labelled rows
       build in reading order and the decision buttons land last, so the user reads the proposal before the
       controls for it appear. --elapsed works exactly as it does on .aiac above. */
    + '.ai-approval.is-arriving, .ai-gate.is-arriving { --elapsed:0ms; --lead:0ms; animation:aiTaskRise 220ms cubic-bezier(.2,.7,.3,1) both; animation-delay:calc(var(--lead, 0ms) + 0ms - var(--elapsed)); }\n'
    + '.ai-approval.is-arriving .ai-approval-row, .ai-approval.is-arriving .ai-appr-trail-hd, .ai-approval.is-arriving .ai-gate-btns,\n'
    + '.ai-gate.is-arriving .ai-gate-q, .ai-gate.is-arriving .ai-gate-btns { animation:aiTaskRise 240ms cubic-bezier(.2,.7,.3,1) both; }\n'
    /* Counted with sibling chains, not :nth-of-type — the rows are divs preceded by .ai-approval-hd, which is also
       a div, so nth-of-type would start the cascade at 2 and collapse the first two rows onto one beat. */
    + '.ai-approval.is-arriving .ai-approval-row { animation-delay:calc(var(--lead, 0ms) + 120ms - var(--elapsed)); }\n'
    + '.ai-approval.is-arriving .ai-approval-row + .ai-approval-row { animation-delay:calc(var(--lead, 0ms) + 190ms - var(--elapsed)); }\n'
    + '.ai-approval.is-arriving .ai-approval-row + .ai-approval-row + .ai-approval-row { animation-delay:calc(var(--lead, 0ms) + 260ms - var(--elapsed)); }\n'
    + '.ai-approval.is-arriving .ai-approval-row + .ai-approval-row + .ai-approval-row + .ai-approval-row { animation-delay:calc(var(--lead, 0ms) + 330ms - var(--elapsed)); }\n'
    + '.ai-approval.is-arriving .ai-appr-trail-hd { animation-delay:calc(var(--lead, 0ms) + 400ms - var(--elapsed)); }\n'
    + '.ai-approval.is-arriving .ai-gate-btns { animation-delay:calc(var(--lead, 0ms) + 470ms - var(--elapsed)); }\n'
    + '.ai-gate.is-arriving .ai-gate-q { animation-delay:calc(var(--lead, 0ms) + 120ms - var(--elapsed)); }\n'
    + '.ai-gate.is-arriving .ai-gate-btns { animation-delay:calc(var(--lead, 0ms) + 260ms - var(--elapsed)); }\n'
    + '@media (prefers-reduced-motion: reduce) { .ai-approval.is-arriving, .ai-approval.is-arriving *, .ai-gate.is-arriving, .ai-gate.is-arriving * { animation:none !important; } }\n'
    + 'body.ai-nofx .ai-approval.is-arriving, body.ai-nofx .ai-approval.is-arriving *, body.ai-nofx .ai-gate.is-arriving, body.ai-nofx .ai-gate.is-arriving * { animation:none !important; }\n'
    + '.ai-reason-head span.vdc-tick { --elapsed:0ms; display:inline-block; animation:vdcWordIn 300ms cubic-bezier(.2,.7,.3,1) both; animation-delay:calc(0ms - var(--elapsed)); }\n'
    + '@media (prefers-reduced-motion: reduce) { .ai-reason-head span.vdc-tick { animation:none !important; } }\n'
    + 'body.ai-nofx .ai-reason-head span.vdc-tick { animation:none !important; }\n'
    /* Quick Prompts — same values as protected-data's copies, shipped here so every page has them. */
    + '.ai-qp { margin:0 0 8px; padding:12px 16px; border:1px solid var(--border-light,#e9e9ea); border-radius:8px; background:var(--white,#fff); }\n'
    /* The dock arrives too. #aiChips is rebuilt only by vdcRenderQuickPrompts — never by aiRender — so a plain
       one-shot animation is safe here: it runs exactly when the prompts appear, which is the moment to mark. */
    + '.ai-qp { animation:aiTaskRise 240ms cubic-bezier(.2,.7,.3,1) both; }\n'
    + '.ai-qp .ai-chip-qp { animation:aiTaskRise 240ms cubic-bezier(.2,.7,.3,1) both; }\n'
    + '.ai-qp .ai-chip-qp:nth-child(1) { animation-delay:120ms; }\n'
    + '.ai-qp .ai-chip-qp:nth-child(2) { animation-delay:180ms; }\n'
    + '.ai-qp .ai-chip-qp:nth-child(n+3) { animation-delay:240ms; }\n'
    + '@media (prefers-reduced-motion: reduce) { .ai-qp, .ai-qp .ai-chip-qp { animation:none !important; } }\n'
    + 'body.ai-nofx .ai-qp, body.ai-nofx .ai-qp .ai-chip-qp { animation:none !important; }\n'
    + '.ai-qp-hd { display:flex; align-items:center; gap:6px; font-size:12px; font-weight:500; color:var(--black-60,#626469); margin-bottom:8px; }\n'
    + '.aiac-decide { container-type:inline-size; }\n'
    + '.aiac-decide .ai-gate-btns [data-dismiss] { margin-left:auto; }   /* the decline sits apart from the two actions that move the recommendation forward */\n'
    + '@container (max-width: 303px) { .aiac-decide .ai-gate-btns [data-dismiss] { margin-left:0; } }   /* row wrapped: left-aligned on its own line */\n'
    + '.aiac-decide-done { font-size:14px; line-height:20px; font-weight:500; color:var(--em-green,#01804a); }\n'
    + '.aiac-decide-done.dismissed { color:var(--black-60,#626469); }\n'
    + '.ai-head-brand { font-size:12px; line-height:16px; font-weight:450; color:var(--black-60,#626469); }\n'
    + '.ai-head-text.has-topic .ai-head-title { line-height:22px; }\n'
    + '.ai-head-tx { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }\n'
    + '.ai-qp-acts { margin-left:auto; display:flex; align-items:center; gap:4px; }\n'
    + '.ai-qp-acts .ai-qp-x { margin-left:0; }\n'
    + '.ai-qp-x { margin-left:auto; border:none; background:none; padding:2px; cursor:pointer; color:var(--black-60,#626469); display:flex; }\n'
    + '.ai-qp-x:hover { color:var(--black-100,#1f2229); }\n'
    + '.ai-qp-list { display:flex; flex-wrap:wrap; gap:8px; }\n'
    + '.ai-chip-qp { display:inline-flex; align-items:center; gap:6px; min-height:28px; padding:4px 10px; border:none; border-radius:2px; background:var(--em-green-tint,#f6fbf9); color:var(--em-green,#01804a); font-size:16px; font-weight:500; text-align:left; cursor:pointer; font-family:inherit; }\n'
    + '.ai-chip-qp:hover { background:var(--green-s10,#e8f5ef); }\n'
    + '.ai-chip-qp svg { width:16px; height:16px; flex-shrink:0; color:var(--em-green,#01804a); }\n'
    + '.ai-home.is-inthread { padding:0; }\n'
    + '.ai-home-foot { margin-top:4px; }\n'
    + '.ai-home-foot .aiac-btn { margin-top:0; }\n'
    + '.ai-home-card-nav { display:inline-flex; vertical-align:-2px; margin-left:6px; color:var(--black-50,#8f9094); }\n'
    + '.ai-home-card.travels:hover .ai-home-card-nav { color:var(--black-80,#4c4e54); }\n'
    + '.ai-home-card.is-picked { opacity:.72; cursor:default; }\n'
    + '.ai-home-card.is-picked .ai-home-card-t { color:var(--black-60,#626469); }\n'
    + '.vdc-voice-go { margin-top:10px; }\n'
    + '.vdc-voice-go .aiac-btn { margin-top:0; }\n'
    /* DORMANT (2026-10-27): per-approval row, retired with the collapsed catch-up above. Restore only if the catch-up ever
       enumerates again. */
    + '.vdc-voice-row { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-top:8px; padding-top:8px; border-top:1px solid var(--border-light, #e4e4e7); }\n'
    + '.vdc-voice-row span { flex:1; min-width:0; }\n'
    + '.vdc-np-scrim { position:fixed; inset:var(--devjump-h, 0px) 0 0 0; z-index:1380; display:none; background:rgba(31,34,41,0.28); }\n'
    + '.vdc-np-scrim.is-open { display:block; }\n'
    + '.vdc-np { position:absolute; left:calc(72px + 24px); top:24px; bottom:24px; width:min(1120px, calc(100vw - 72px - 48px)); background:var(--white, #fff); border-radius:8px; box-shadow:0 12px 32px rgba(31,34,41,0.22); overflow:hidden; }\n'
    + '.vdc-np.is-wide { width:calc(100vw - 72px - 48px); }\n'
    + '.vdc-np-card-wrap { display:flex; height:100%; }\n'
    + '.vdc-np-side { width:240px; flex-shrink:0; border-right:1px solid var(--border-light, #e4e4e7); display:flex; flex-direction:column; }\n'
    + '.vdc-np-side-h { height:60px; padding:0 24px; display:flex; align-items:center; font-size:16px; font-weight:500; border-bottom:1px solid var(--border-light, #e4e4e7); }\n'
    + '.vdc-np-side-f { margin-top:auto; padding:8px; }\n'
    + '.vdc-np-tab { width:100%; height:44px; padding:0 16px; display:flex; align-items:center; justify-content:space-between; gap:8px; border:1px solid var(--em-green, #01804a); border-radius:4px; background:var(--white, #fff); font:inherit; font-size:16px; color:var(--black-100, #1f2229); cursor:default; }\n'
    + '.vdc-np-count { min-width:28px; height:22px; padding:0 6px; border:1px solid var(--orange, #f6772c); border-radius:4px; background:color-mix(in srgb, var(--orange, #f6772c) 14%, white); color:var(--orange, #f6772c); font-size:14px; font-weight:500; line-height:20px; text-align:center; box-sizing:border-box; }\n'
    + '.vdc-np-main { flex:1; min-width:0; display:flex; flex-direction:column; }\n'
    + '.vdc-np-top { display:flex; align-items:center; justify-content:space-between; gap:16px; padding:12px 24px; border-bottom:1px solid var(--border-light, #e4e4e7); min-height:60px; box-sizing:border-box; }\n'
    + '.vdc-np-title { font-size:20px; line-height:24px; font-weight:500; }\n'
    + '.vdc-np-sub { font-size:14px; line-height:18px; color:var(--black-60, #62656b); }\n'
    + '.vdc-np-tools { display:flex; align-items:center; gap:8px; }\n'
    + '.vdc-np-search { position:relative; width:280px; }\n'
    + '.vdc-np-search .ic { position:absolute; left:12px; top:50%; transform:translateY(-50%); display:flex; color:var(--black-80, #3d4046); pointer-events:none; }\n'
    + '.vdc-np-search input { width:100%; height:36px; padding:0 12px 0 40px; border:1px solid var(--border, #c9cacd); border-radius:4px; background:var(--form-bg, #f8f8f8); font:inherit; font-size:16px; box-sizing:border-box; outline:none; }\n'
    + '.vdc-np-search input:focus { border-color:var(--em-green, #01804a); }\n'
    + '.vdc-np-ib { width:36px; height:36px; display:inline-flex; align-items:center; justify-content:center; border:1px solid var(--border, #c9cacd); border-radius:4px; background:var(--white, #fff); color:var(--black-100, #1f2229); cursor:pointer; padding:0; }\n'
    + '.vdc-np-ib:hover { background:var(--black-5, #f1f1f2); }\n'
    + '.vdc-np-mw { position:relative; }\n'
    + '.vdc-np-menu { display:none; position:absolute; right:0; top:calc(100% + 4px); z-index:5; min-width:220px; padding:4px; background:var(--white, #fff); border:1px solid var(--border-light, #e4e4e7); border-radius:8px; box-shadow:0 8px 24px rgba(31,34,41,0.16); }\n'
    + '.vdc-np-menu button { display:block; width:100%; height:36px; padding:0 12px; border:0; border-radius:4px; background:none; font:inherit; font-size:16px; text-align:left; cursor:pointer; }\n'
    + '.vdc-np-menu button:hover { background:var(--black-5, #f1f1f2); }\n'
    + '.vdc-np-list { flex:1; overflow-y:auto; padding:8px 40px 24px; }\n'
    + '.vdc-np-day { display:flex; justify-content:center; gap:8px; padding:16px 0 12px; font-size:16px; color:var(--black-80, #3d4046); }\n'
    + '.vdc-np-day .n { color:var(--em-green, #01804a); }\n'
    + '.vdc-np-card { position:relative; display:flex; align-items:flex-start; gap:12px; width:100%; margin:0 0 8px; padding:12px 16px; text-align:left; font:inherit; color:inherit; background:var(--black-3, #f8f8f9); border:1px solid var(--border-light, #e4e4e7); border-radius:8px; cursor:pointer; box-sizing:border-box; }\n'
    + '.vdc-np-card:hover { border-color:var(--border, #c9cacd); }\n'
    + '.vdc-np-card:focus-visible { outline:2px solid var(--em-green, #01804a); outline-offset:2px; }\n'
    + '.vdc-np-hex { position:relative; flex-shrink:0; width:28px; height:28px; color:var(--em-green, #01804a); display:inline-block; }\n'
    + '.vdc-np-hex .g { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; color:var(--white, #fff); }\n'
    + '.vdc-np-tx { flex:1; min-width:0; display:flex; flex-direction:column; gap:2px; }\n'
    + '.vdc-np-hd { display:flex; align-items:baseline; justify-content:space-between; gap:16px; }\n'
    + '.vdc-np-t { font-size:16px; line-height:22px; font-weight:450; color:var(--black-100, #1f2229); }\n'
    + '.vdc-np-w { flex-shrink:0; font-size:14px; color:var(--black-60, #62656b); white-space:nowrap; }\n'
    + '.vdc-np-b { font-size:16px; line-height:22px; font-weight:300; color:var(--black-60, #62656b); }\n'
    + '.vdc-np-dot { display:inline-block; width:8px; height:8px; margin:0 8px 1px 0; border-radius:50%; background:var(--red, #ed2c3d); vertical-align:middle; }\n'
    + '.vdc-np-ai { flex-shrink:0; width:28px; height:28px; border-radius:4px; overflow:hidden; display:inline-flex; align-items:center; justify-content:center; background:var(--ai-grad, conic-gradient(from 90deg, #5bbc7b 0deg, #119ee7 57.6deg, #d83dcf 153deg, #ee6b36 234deg, #8fd131 320.4deg, #5bbc7b 360deg)); color:var(--white, #fff); }\n'
    + '.vdc-np-ai svg { width:40px; height:40px; margin:-6px; display:block; flex-shrink:0; }   /* the sparkle glyph fills only the middle of its viewBox: oversized so the mark reads at tile scale, as on the assistant\'s badges */\n'
    + '.vdc-decide { display:inline-flex; align-items:center; gap:8px; min-height:28px; padding:2px 8px 2px 4px; border-radius:2px; font-size:16px; font-weight:500; line-height:22px; white-space:nowrap; background:var(--black-5, #f8f8f9); color:var(--black-100, #1f2229); }   /* Vision Chip Default: Black/S5 on Black/S100, r2 */\n'
    + '.ai-home-card-st { margin-bottom:8px; }\n'
    + '.ai-home-card-st .vdc-decide { min-height:24px; font-size:14px; line-height:20px; }   /* the panel text is 14px: at the page chip size (16px) the chip outranked the card title below it */\n'
    + '.vdc-ai-glyph { flex-shrink:0; width:var(--g,16px); height:var(--g,16px); border-radius:2px; overflow:hidden; display:inline-flex; align-items:center; justify-content:center; background:var(--ai-grad, conic-gradient(from 90deg, #5bbc7b 0deg, #119ee7 57.6deg, #d83dcf 153deg, #ee6b36 234deg, #8fd131 320.4deg, #5bbc7b 360deg)); color:var(--white, #fff); }\n'
    + '.vdc-ai-glyph svg { width:calc(var(--g,16px) * 1.5); height:calc(var(--g,16px) * 1.5); margin:calc(var(--g,16px) * -0.25); display:block; flex-shrink:0; }\n'
    + '.vdc-decide-ai { flex-shrink:0; width:16px; height:16px; border-radius:2px; overflow:hidden; display:inline-flex; align-items:center; justify-content:center; background:var(--ai-grad, conic-gradient(from 90deg, #5bbc7b 0deg, #119ee7 57.6deg, #d83dcf 153deg, #ee6b36 234deg, #8fd131 320.4deg, #5bbc7b 360deg)); color:var(--white, #fff); }\n'
    + '.vdc-decide-ai svg { width:24px; height:24px; margin:-4px; display:block; flex-shrink:0; }   /* glyph fills only the middle of its viewBox: oversized to read at 16px */\n'
    + '.vdc-np-empty { padding:48px 0; text-align:center; font-size:16px; color:var(--black-60, #62656b); }\n'
    + '@media (max-width: 900px) { .vdc-np-side { display:none; } .vdc-np-search { width:160px; } }\n';

  function init(){
    var st = document.createElement('style'); st.id = 'vdc-notif-css'; st.textContent = css; document.head.appendChild(st);
    var b = railBtn();
    if (b){
      b.setAttribute('data-fly', 'Notifications'); b.setAttribute('aria-label', 'Notifications'); b.removeAttribute('title');
      b.onclick = function(e){ e.preventDefault(); window.vdcNotifToggle(); };
    }
    ['aiRender'].forEach(function(fn){   // every panel render re-derives decided cards from the shared state
      var orig = window[fn]; if (typeof orig !== 'function') return;
      window[fn] = function(){ var r = orig.apply(this, arguments); try { window.vdcSyncDecisions(); } catch(e){} return r; };
    });
    ['aiOpen', 'aiClose', 'aiNewChat'].forEach(function(fn){
      var orig = window[fn]; if (typeof orig !== 'function') return;
      window[fn] = function(){ var r = orig.apply(this, arguments); if (fn === 'aiNewChat') window.vdcSetPanelTopic(null); if (fn === 'aiOpen'){ restoreTopic(); if (!voice()) voiceSoon(); } paintDot(); return r; };   // told at once when the moment is quiet, else as soon as it is
    });
    paintBadge();
    window.addEventListener('storage', refresh);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', function(){ if (!document.hidden) refresh(); });
    if (location.hash === '#notifications-open') window.vdcNotifOpenPanel();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
