/* ============================================================================
   TRAINDERIVE — Coach Programming Editor  (v2 — calendar-first design)

   Matches the approved mockup:
     • Admin athlete calendar: empty days show a "+" on hover and are clickable
     • Day view opens in EDIT mode for empty days, VIEW mode for programmed
       days (with an "✎ Edit Programming" button to switch)
     • Editor: gold Daily Note field, editable section cards (title + body),
       ↑ ↓ ✕ per card, dashed "+ Add Section", "🌙 Add PM Block",
       "⧉ Copy Another Day", raw sheet-text preview, Save to Sheet
     • "+ New Week" button beside the month arrows

   INSTALL
     Add ONE line to index.html, immediately before </body>
     (after your main <script> block):

         <script src="coach-editor.js"></script>

     No other changes to index.html. This file wraps the admin functions
     it needs (adminOpenDay, renderDetailBody).

   REQUIRES
     The Apps Script actions from coach-actions.gs deployed in each
     athlete's sheet ('training' and 'newWeek'), and that athlete's
     Script URL + Secret saved in Admin → Edit User.
   ============================================================================ */
(function () {
  'use strict';
  if (window.__tdCoachEditor) return;
  window.__tdCoachEditor = true;

  var DIVIDER = '____________________';
  var SEC_SEP = '+';
  var BAD_LINE = /^(?:\+\s*|_{5,})$/;
  var WORKER   = 'https://trainderive.frank-467.workers.dev/?url=';
  var CODETABS = 'https://api.codetabs.com/v1/proxy?quest=';

  var EDIT = { iso: null, model: null, mode: 'view', dirty: false };

  function esc(s)        { return window.escH(String(s == null ? '' : s)); }
  function currentUser() { return USERS.find(function (u) { return u.id === ADM.detailUserId; }); }
  function currentMap()  { return (ADM.cache[ADM.detailUserId] || {}).dayMap || {}; }
  function canWrite()    { var u = currentUser(); return !!(u && u.scriptUrl && u.scriptSecret); }

  /* ── coach clipboard — persists across days AND athletes ── */
  var CLIP_KEY = 'td_clipboard';
  function getClip()  { try { return JSON.parse(localStorage.getItem(CLIP_KEY) || 'null'); } catch (e) { return null; } }
  function clearClip(){ localStorage.removeItem(CLIP_KEY); }
  function clone(o)   { return JSON.parse(JSON.stringify(o)); }
  function setClip(type, label, payload) {
    localStorage.setItem(CLIP_KEY, JSON.stringify({ type: type, label: label, payload: payload, at: Date.now() }));
    window.showToast('Copied: ' + label, 'ok');
  }
  function clipLabel(c) {
    var t = c.type === 'day' ? 'Day' : c.type === 'block' ? 'Block' : 'Section';
    return t + ' · ' + c.label;
  }
  function chipHtml(clip) {
    if (!clip) return '';
    return '<span class="td-chip' + (clip.type === 'day' ? '' : ' gold') + '">📋 ' +
      esc(clipLabel(clip)) +
      '<button class="cx" data-td="clip-clear" title="Clear clipboard">✕</button></span>';
  }
  function modelHasContent(m) {
    if ((m.note || '').trim()) return true;
    return m.blocks.some(function (b) {
      return b.sections.some(function (s) { return (s.title || '').trim() || (s.body || '').trim(); });
    });
  }

  /* ══════════════════════ 1. TEXT ⇄ MODEL ══════════════════════
     model = { note:'', blocks:[ { sections:[ {title,body}, … ] } ] }        */

  function sanitise(text) {
    return String(text).split('\n').map(function (l) {
      return BAD_LINE.test(l.trim()) ? l.replace(/[+_]/g, '-') : l;
    }).join('\n');
  }

  function secText(s) {
    var t = (s.title || '').trim();
    var b = (s.body || '').replace(/\s+$/, '');
    if (!t && !b.trim()) return '';
    return sanitise(t ? (b.trim() ? t + '\n' + b : t) : b);
  }

  function serialize(m) {
    var body = m.blocks.map(function (b) {
      return b.sections.map(secText).filter(function (t) { return t.trim(); })
        .join('\n' + SEC_SEP + '\n');
    }).filter(function (t) { return t.trim(); })
      .join('\n' + DIVIDER + '\n');
    var note = (m.note || '').trim();
    if (!body && !note) return '';
    return note ? 'NOTE: ' + sanitise(note) + '\n' + SEC_SEP + '\n' + body : body;
  }

  function rawToSec(raw) {
    var lines = String(raw).split('\n');
    return { title: (lines[0] || '').trim(), body: lines.slice(1).join('\n').replace(/^\n+/, '') };
  }

  function dayToModel(day) {
    var blocks = (day.blocks || []).map(function (b) {
      return { sections: b.sections.map(rawToSec) };
    });
    if (!blocks.length) blocks = [{ sections: [{ title: '', body: '' }] }];
    return { note: day.dailyNote || '', blocks: blocks };
  }

  function textToParts(raw) {
    var dailyNote = null, content = raw;
    if (raw && /^NOTE:/i.test(raw)) {
      var lines = raw.split('\n'), noteLines = [], i = 0;
      while (i < lines.length) {
        var t = lines[i].trim();
        if (i === 0) { noteLines.push(t.replace(/^NOTE:\s*/i, '')); i++; continue; }
        if (/^[+]$/.test(t) || /^_{5,}$/.test(t)) break;
        noteLines.push(lines[i]); i++;
      }
      dailyNote = noteLines.join('\n').trim();
      content = lines.slice(i).join('\n').trim();
    }
    return { dailyNote: dailyNote, blocks: content ? window.parseTrainingBlocks(content) : [] };
  }

  /* ══════════════════════ 2. NETWORK ══════════════════════ */

  async function post(scriptUrl, payload) {
    var targets = [WORKER + encodeURIComponent(scriptUrl), CODETABS + encodeURIComponent(scriptUrl)];
    for (var i = 0; i < targets.length; i++) {
      try {
        var ctrl = new AbortController();
        var tid = setTimeout(function () { ctrl.abort(); }, 10000);
        var res = await fetch(targets[i], {
          method: 'POST', signal: ctrl.signal,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        clearTimeout(tid);
        if (!res.ok) continue;
        var txt = await res.text();
        try { return JSON.parse(txt); } catch (e) { return { ok: true, unconfirmed: true }; }
      } catch (e) { /* next proxy */ }
    }
    try {
      fetch(scriptUrl, { method: 'POST', mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload) }).catch(function () {});
    } catch (e) {}
    return { ok: true, unconfirmed: true };
  }

  /* ══════════════════════ 3. STYLES ══════════════════════ */

  var CSS = '' +
  '.td-toolbar{display:flex;align-items:center;gap:.6rem;flex-wrap:wrap;margin-bottom:1rem}' +
  '.td-btn{background:var(--accent);color:#fff;border:none;font-family:var(--mono);font-size:.6rem;letter-spacing:.12em;text-transform:uppercase;padding:.48rem .9rem;border-radius:var(--r);cursor:pointer;transition:background .15s}' +
  '.td-btn:hover{background:var(--accent-lt)}' +
  '.td-btn.big{font-family:var(--disp);font-size:1rem;letter-spacing:.1em;padding:.6rem 1.4rem;text-transform:none}' +
  '.td-btn.ghost{background:none;border:1px solid var(--border);color:var(--muted2)}' +
  '.td-btn.ghost:hover{border-color:var(--accent);color:var(--accent);background:none}' +
  '.td-btn:disabled{background:var(--border);color:var(--muted);cursor:not-allowed}' +
  '.td-st{font-family:var(--mono);font-size:.62rem;letter-spacing:.06em;color:var(--muted2)}' +
  '.td-st.ok{color:var(--accent)}.td-st.err{color:var(--danger)}' +

  '.td-note{background:#fdf6e8;border-left:4px solid var(--gold);border-radius:0 var(--r) var(--r) 0;padding:.7rem .9rem;margin-bottom:1.2rem}' +
  '.td-note-lbl{font-family:var(--mono);font-size:.56rem;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:var(--gold);margin-bottom:.35rem;display:flex;justify-content:space-between;flex-wrap:wrap;gap:.3rem}' +
  '.td-note-lbl .opt{font-weight:400;opacity:.6;letter-spacing:.08em}' +
  '.td-note-ta{width:100%;background:transparent;border:none;outline:none;font-family:var(--sans);font-size:16px;line-height:1.6;color:var(--text);resize:none;overflow:hidden;min-height:28px}' +
  '.td-note-ta::placeholder{color:#c9a86a}' +

  '.td-blk{margin-bottom:1.4rem}' +
  '.td-bar{display:flex;align-items:center;gap:.6rem;color:#fff;border-radius:4px 4px 0 0;padding:.3rem .65rem;font-family:var(--mono);font-size:.6rem;letter-spacing:.18em;text-transform:uppercase}' +
  '.td-bar.am{background:var(--accent)}.td-bar.pm{background:var(--gold)}' +
  '.td-bar .x{margin-left:auto;background:none;border:none;color:rgba(255,255,255,.7);cursor:pointer;font-size:.75rem;padding:.1rem .3rem}' +
  '.td-bar .x:hover{color:#fff}' +
  '.td-body{border:1.5px solid;border-top:none;border-radius:0 0 6px 6px;padding:.6rem .6rem .2rem}' +
  '.td-blk.am .td-body{border-color:rgba(40,100,215,.35);background:rgba(40,100,215,.02)}' +
  '.td-blk.pm .td-body{border-color:rgba(215,155,40,.45);background:rgba(215,155,40,.02)}' +

  '.td-sec{background:var(--surf);border:1px solid var(--border);border-left:3px solid var(--accent);border-radius:var(--r);margin-bottom:.55rem;overflow:hidden;transition:box-shadow .15s}' +
  '.td-sec:hover{box-shadow:0 2px 8px rgba(0,0,0,.07)}' +
  '.td-sec[data-c="1"]{border-left-color:var(--gold)}' +
  '.td-sec[data-c="2"]{border-left-color:#C0288A}' +
  '.td-sec[data-c="3"]{border-left-color:#28A87A}' +
  '.td-sec-hd{display:flex;align-items:center;gap:.55rem;padding:.5rem .7rem;background:rgba(40,100,215,.04)}' +
  '.td-sec[data-c="1"] .td-sec-hd{background:rgba(215,155,40,.05)}' +
  '.td-sec[data-c="2"] .td-sec-hd{background:rgba(192,40,138,.04)}' +
  '.td-sec[data-c="3"] .td-sec-hd{background:rgba(40,168,122,.04)}' +
  '.td-sec-n{font-family:var(--mono);font-size:.56rem;letter-spacing:.1em;color:var(--muted);min-width:1.1rem}' +
  '.td-title{flex:1;background:transparent;border:none;outline:none;font-family:var(--sans);font-size:16px;font-weight:500;color:var(--text);min-width:0}' +
  '.td-title::placeholder{color:var(--muted)}' +
  '.td-acts{display:flex;gap:.2rem}' +
  '.td-mini{background:none;border:1px solid transparent;color:var(--muted);font-size:.7rem;width:1.7rem;height:1.7rem;display:flex;align-items:center;justify-content:center;cursor:pointer;border-radius:3px;transition:color .12s,border-color .12s}' +
  '.td-mini:hover{color:var(--accent);border-color:var(--border)}' +
  '.td-mini.del:hover{color:var(--danger)}' +
  '.td-sec-bd{padding:.55rem .7rem .7rem;background:#faf9f6;border-top:1px solid var(--border)}' +
  '.td-ta{width:100%;background:#f5f0e8;border:1px solid var(--border);border-radius:var(--r);color:var(--text);font-family:var(--sans);font-size:16px;line-height:1.7;padding:.55rem .65rem;resize:none;overflow:hidden;outline:none;transition:border-color .15s;min-height:56px}' +
  '.td-ta:focus{border-color:var(--accent)}' +
  '.td-ta::placeholder{color:var(--muted)}' +

  '.td-add-sec{width:100%;background:none;border:1.5px dashed var(--border2);border-radius:var(--r);color:var(--muted2);font-family:var(--mono);font-size:.62rem;letter-spacing:.12em;text-transform:uppercase;padding:.55rem;cursor:pointer;margin-bottom:.55rem;transition:border-color .15s,color .15s,background .15s}' +
  '.td-add-sec:hover{border-color:var(--accent);color:var(--accent);background:rgba(40,100,215,.04)}' +
  '.td-add-pm{background:none;border:1.5px dashed var(--gold-bdr);border-radius:var(--r);color:var(--gold);font-family:var(--mono);font-size:.62rem;letter-spacing:.12em;text-transform:uppercase;padding:.55rem 1rem;cursor:pointer;transition:background .15s}' +
  '.td-add-pm:hover{background:var(--gold-bg)}' +

  '.td-prev-toggle{background:none;border:none;color:var(--muted2);font-family:var(--mono);font-size:.6rem;letter-spacing:.1em;text-transform:uppercase;cursor:pointer;text-decoration:underline dotted;padding:0}' +
  '.td-prev-toggle:hover{color:var(--accent)}' +
  '.td-prev{display:none;font-family:var(--mono);font-size:.68rem;line-height:1.6;white-space:pre-wrap;background:#f5f0e8;border:1px solid var(--border);border-radius:var(--r);padding:.7rem;margin-top:.6rem;color:var(--muted2);max-height:220px;overflow:auto}' +
  '.td-prev.on{display:block}' +

  '.td-chip{display:inline-flex;align-items:center;gap:.45rem;font-family:var(--mono);font-size:.58rem;letter-spacing:.1em;text-transform:uppercase;color:var(--accent);background:var(--accent-bg);border:1px solid var(--accent-bdr);border-radius:2px;padding:.28rem .55rem;max-width:100%;overflow:hidden}' +
  '.td-chip.gold{color:var(--gold);background:var(--gold-bg);border-color:var(--gold-bdr)}' +
  '.td-chip .cx{background:none;border:none;color:inherit;cursor:pointer;font-size:.7rem;padding:0 0 0 .2rem;opacity:.7;line-height:1}' +
  '.td-chip .cx:hover{opacity:1}' +
  '.td-paste-sec{width:100%;background:none;border:1.5px dashed var(--gold-bdr);border-radius:var(--r);color:var(--gold);font-family:var(--mono);font-size:.62rem;letter-spacing:.12em;text-transform:uppercase;padding:.55rem;cursor:pointer;margin-bottom:.55rem;transition:background .15s}' +
  '.td-paste-sec:hover{background:var(--gold-bg)}' +

  '#detail-body .cc{position:relative}' +
  '.td-plus{position:absolute;width:20px;height:20px;border-radius:50%;background:var(--accent);color:#fff;font-size:.85rem;line-height:1;display:flex;align-items:center;justify-content:center;opacity:0;transform:scale(.6);transition:opacity .13s,transform .13s;pointer-events:none}' +
  '#detail-body .cc.td-empty:hover .td-plus{opacity:1;transform:scale(1)}' +
  '#detail-body .cc.td-empty:hover .cn{opacity:.25}' +
  '#detail-body .cc.td-empty{cursor:pointer}' +
  '#detail-body .cc.td-empty:hover{border-color:var(--accent)}';

  (function injectCSS() {
    if (document.getElementById('td-css')) return;
    var s = document.createElement('style');
    s.id = 'td-css'; s.textContent = CSS;
    document.head.appendChild(s);
  })();

  /* ══════════════════════ 4. DAY VIEW (view / edit modes) ══════════════════════ */

  window.adminOpenDay = function (iso) {
    var dm = currentMap();
    var day = dm[iso];
    if (!day) { window.showToast('No column for that date — use + New Week', 'err'); return; }

    ADM.selDate = iso;
    EDIT.iso = iso;
    EDIT.mode = (day.isRestDay || !day.blocks || !day.blocks.length) ? 'edit' : 'view';
    EDIT.model = dayToModel(day);
    EDIT.dirty = false;

    document.getElementById('detail-body').style.display = 'none';
    document.getElementById('adm-day-view').classList.add('active');

    var d = new Date(iso + 'T12:00:00');
    document.getElementById('adm-day-title').textContent =
      d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

    window.adminRenderWeekNav(iso);
    enhanceWeekNav(iso);
    renderDay();
    document.getElementById('adm-day-view').scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  function renderDay() {
    var dm = currentMap();
    var day = dm[EDIT.iso];
    if (!day) return;

    document.getElementById('adm-day-sub').textContent = day.tabName + '  ·  ' +
      (EDIT.mode === 'edit'
        ? (day.isRestDay ? 'New day — nothing saved yet' : 'Editing programming')
        : (day.isRestDay ? 'Rest day' : 'Training day'));

    var host = document.getElementById('adm-day-content');

    var old = document.getElementById('td-toolbar');
    if (old) old.remove();
    var bar = document.createElement('div');
    bar.className = 'td-toolbar'; bar.id = 'td-toolbar';
    host.parentNode.insertBefore(bar, host);

    if (EDIT.mode === 'view') {
      var clip = getClip();
      bar.innerHTML = '<button class="td-btn" data-td="edit">✎ &nbsp;Edit Programming</button>' +
        '<button class="td-btn ghost" data-td="copy-day">⧉ Copy Day</button>' +
        (clip && clip.type === 'day' ? '<button class="td-btn ghost" data-td="paste-day">📋 Paste Day</button>' : '') +
        chipHtml(clip);
      window.adminRenderDayContent(day);
    } else {
      if (!canWrite()) {
        bar.innerHTML = '<span class="td-st err">This athlete needs an Apps Script URL + Secret ' +
          '(Admin → Users → Edit) before programming can be written to their sheet.</span>' +
          (day.isRestDay ? '' : ' <button class="td-btn ghost" data-td="cancel">Back to view</button>');
        window.adminRenderDayContent(day);
        return;
      }
      bar.innerHTML =
        '<button class="td-btn big" data-td="save">Save to Sheet</button>' +
        (day.isRestDay ? '' : '<button class="td-btn ghost" data-td="cancel">Cancel</button>') +
        '<span class="td-st" id="td-st">' + (EDIT.dirty ? 'Unsaved changes' : '') + '</span>';
      renderEditor(host);
    }
  }

  function renderEditor(host) {
    var m = EDIT.model;
    var clip = getClip();
    var h = '';

    h += '<div class="td-note"><div class="td-note-lbl"><span>📋 Daily Note</span>' +
         '<span class="opt">optional — gold banner on athlete\u2019s day</span></div>' +
         '<textarea class="td-note-ta" data-td="note" rows="1" ' +
         'placeholder="e.g. Deload week — keep everything crisp and submaximal.">' +
         esc(m.note) + '</textarea></div>';

    var g = 0;
    m.blocks.forEach(function (b, bi) {
      var isPM = m.blocks.length > 1 && bi > 0;
      h += '<div class="td-blk ' + (isPM ? 'pm' : 'am') + '">';
      h += '<div class="td-bar ' + (isPM ? 'pm' : 'am') + '">' +
           (isPM ? '🌙' : '☀') + ' &nbsp;' +
           (m.blocks.length === 1 ? 'TRAINING' : (bi === 0 ? 'AM' : 'PM')) +
           '<button class="x" data-td="copy-blk" data-bi="' + bi + '" title="Copy this whole block">⧉</button>' +
           (bi > 0 ? '<button class="x" data-td="del-blk" data-bi="' + bi + '" title="Remove block" style="margin-left:0">✕</button>' : '') +
           '</div>';
      h += '<div class="td-body">';
      b.sections.forEach(function (s, si) {
        h += '<div class="td-sec" data-c="' + (g % 4) + '">';
        h += '<div class="td-sec-hd"><span class="td-sec-n">' + window.toAlpha(g) + '</span>';
        h += '<input class="td-title" data-td="title" data-bi="' + bi + '" data-si="' + si + '" ' +
             'placeholder="Section title — e.g. A) Back Squat" value="' + esc(s.title).replace(/"/g, '&quot;') + '">';
        h += '<div class="td-acts">';
        h += '<button class="td-mini" data-td="copy-sec" data-bi="' + bi + '" data-si="' + si + '" title="Copy section">⧉</button>';
        if (si > 0) h += '<button class="td-mini" data-td="move" data-bi="' + bi + '" data-si="' + si + '" data-dir="-1" title="Move up">↑</button>';
        if (si < b.sections.length - 1) h += '<button class="td-mini" data-td="move" data-bi="' + bi + '" data-si="' + si + '" data-dir="1" title="Move down">↓</button>';
        h += '<button class="td-mini del" data-td="del-sec" data-bi="' + bi + '" data-si="' + si + '" title="Delete section">✕</button>';
        h += '</div></div>';
        h += '<div class="td-sec-bd"><textarea class="td-ta" data-td="body" data-bi="' + bi + '" data-si="' + si + '" ' +
             'placeholder="Sets, reps, %, rest, cues…&#10;Paste a YouTube link → athlete gets an inline player">' +
             esc(s.body) + '</textarea></div></div>';
        g++;
      });
      h += '<button class="td-add-sec" data-td="add-sec" data-bi="' + bi + '">+ &nbsp;Add Section</button>';
      if (clip && (clip.type === 'section' || clip.type === 'block')) {
        h += '<button class="td-paste-sec" data-td="paste-sec" data-bi="' + bi + '">📋 &nbsp;Paste ' +
             (clip.type === 'block' ? 'Block (' + clip.payload.sections.length + ' sections)' : 'Section') +
             ' Here</button>';
      }
      h += '</div></div>';
    });

    h += '<div style="display:flex;gap:.6rem;flex-wrap:wrap;align-items:center;margin:.4rem 0 1rem">';
    if (m.blocks.length < 2) h += '<button class="td-add-pm" data-td="add-pm">🌙 &nbsp;Add PM Block</button>';
    h += '<button class="td-btn ghost" data-td="copy-day">⧉ Copy This Day</button>';
    if (clip && clip.type === 'day') h += '<button class="td-btn ghost" data-td="paste-day">📋 Paste Day</button>';
    h += '<button class="td-btn ghost" data-td="copy">⧉ Copy Another Day…</button>';
    h += '<button class="td-prev-toggle" data-td="prev-toggle">Show raw sheet text</button>';
    h += '</div>';
    if (clip) h += '<div style="margin:-.4rem 0 1rem">' + chipHtml(clip) + '</div>';
    h += '<div class="td-prev" id="td-prev"></div>';

    host.innerHTML = h;
    host.querySelectorAll('textarea').forEach(grow);
  }

  function grow(ta) {
    ta.style.height = 'auto';
    ta.style.height = Math.max(ta.scrollHeight, ta.classList.contains('td-note-ta') ? 28 : 56) + 'px';
  }

  function setSt(msg, cls) {
    var el = document.getElementById('td-st');
    if (el) { el.textContent = msg; el.className = 'td-st' + (cls ? ' ' + cls : ''); }
  }

  function markDirty() { EDIT.dirty = true; setSt('Unsaved changes', ''); buildPrev(); }

  function buildPrev() {
    var p = document.getElementById('td-prev');
    if (!p || !p.classList.contains('on')) return;
    p.textContent = serialize(EDIT.model) || '(empty — saving clears the cell)';
  }

  /* ── delegated events ── */

  document.addEventListener('input', function (e) {
    var t = e.target;
    if (!t.dataset || !t.dataset.td) return;
    var m = EDIT.model;
    if (t.dataset.td === 'note')  { m.note = t.value; markDirty(); grow(t); }
    if (t.dataset.td === 'title') { m.blocks[+t.dataset.bi].sections[+t.dataset.si].title = t.value; markDirty(); }
    if (t.dataset.td === 'body')  { m.blocks[+t.dataset.bi].sections[+t.dataset.si].body = t.value; markDirty(); grow(t); }
  });

  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-td]');
    if (!btn) return;
    var act = btn.dataset.td;
    var m = EDIT.model;
    var bi = btn.dataset.bi != null ? +btn.dataset.bi : null;
    var si = btn.dataset.si != null ? +btn.dataset.si : null;

    if (act === 'edit')    { EDIT.mode = 'edit'; EDIT.model = dayToModel(currentMap()[EDIT.iso]); EDIT.dirty = false; renderDay(); }
    if (act === 'cancel')  { EDIT.mode = 'view'; EDIT.dirty = false; renderDay(); }
    if (act === 'add-sec') { m.blocks[bi].sections.push({ title: '', body: '' }); markDirty(); renderDay(); focusLastTitle(bi); }
    if (act === 'del-sec') { m.blocks[bi].sections.splice(si, 1);
                             if (!m.blocks[bi].sections.length) m.blocks[bi].sections.push({ title: '', body: '' });
                             markDirty(); renderDay(); }
    if (act === 'move')    { var d = +btn.dataset.dir, a = m.blocks[bi].sections;
                             var tmp = a[si]; a[si] = a[si + d]; a[si + d] = tmp;
                             markDirty(); renderDay(); }
    if (act === 'add-pm')  { m.blocks.push({ sections: [{ title: '', body: '' }] }); markDirty(); renderDay(); }
    if (act === 'del-blk') { m.blocks.splice(bi, 1); markDirty(); renderDay(); }
    if (act === 'copy')    { openCopyPicker(); }
    if (act === 'copy-sec'){ var s = m.blocks[bi].sections[si];
                             setClip('section', (s.title || 'Untitled section').slice(0, 40), clone(s));
                             renderDay(); }
    if (act === 'copy-blk'){ var blk = m.blocks[bi];
                             var lbl = m.blocks.length === 1 ? 'Training' : (bi === 0 ? 'AM' : 'PM');
                             setClip('block', lbl + ' (' + blk.sections.length + ' sections)', clone(blk));
                             renderDay(); }
    if (act === 'copy-day'){ copyCurrentDay(); }
    if (act === 'paste-sec'){ var c1 = getClip();
                             if (c1) {
                               var secs = c1.type === 'block' ? c1.payload.sections : [c1.payload];
                               secs.forEach(function (s2) { m.blocks[bi].sections.push(clone(s2)); });
                               markDirty(); renderDay();
                               setSt('Pasted — review, then save', '');
                             } }
    if (act === 'paste-day'){ pasteDay(); }
    if (act === 'clip-clear'){ clearClip(); renderDay(); }
    if (act === 'prev-toggle') { var p = document.getElementById('td-prev'); p.classList.toggle('on'); buildPrev(); }
    if (act === 'save')    { doSave(btn); }
  });

  function focusLastTitle(bi) {
    var blks = document.querySelectorAll('#adm-day-content .td-blk');
    if (!blks[bi]) return;
    var ins = blks[bi].querySelectorAll('.td-title');
    if (ins.length) ins[ins.length - 1].focus();
  }

  /* ── save ── */

  async function doSave(btn) {
    var u = currentUser();
    var day = currentMap()[EDIT.iso];
    if (!u || !day) return;

    var text = serialize(EDIT.model);
    var trainingRowIdx = (day.trainingRowIdx != null) ? day.trainingRowIdx : (day.resultsRowIdx - 1);

    btn.disabled = true;
    setSt('Saving…', '');

    var res = await post(u.scriptUrl, {
      secret: u.scriptSecret || '',
      action: 'training',
      sheetName: day.tabName,
      trainingRowIdx: trainingRowIdx,
      colIndex: day.colIndex,
      expectDate: day.dateStr,
      text: text,
      athleteName: u.name || 'Athlete',
      dateLabel: EDIT.iso
    });

    btn.disabled = false;

    if (!res || res.ok !== true) {
      setSt((res && res.error) ? res.error : 'Save failed — nothing was written', 'err');
      return;
    }

    var parts = textToParts(text);
    day.dailyNote = parts.dailyNote;
    day.blocks = parts.blocks;
    day.isRestDay = !text.trim();
    EDIT.dirty = false;
    EDIT.mode = day.isRestDay ? 'edit' : 'view';

    window.showToast(res.unconfirmed ? 'Sent to sheet' : 'Workout saved to sheet ✓', 'ok');
    renderDay();
    setSt(res.unconfirmed ? 'Sent — refresh to confirm' : 'Saved to sheet ✓', 'ok');
  }

  /* ── clipboard: copy / paste whole days ── */

  function copyCurrentDay() {
    var day = currentMap()[EDIT.iso];
    if (!day) return;
    // In edit mode copy what's in the editor (including unsaved edits);
    // in view mode copy what the sheet currently holds.
    var model = (EDIT.mode === 'edit') ? clone(EDIT.model) : dayToModel(day);
    if (!modelHasContent(model)) { window.showToast('Nothing to copy — day is empty', 'err'); return; }
    setClip('day', niceDate(EDIT.iso), model);
    renderDay();
  }

  function pasteDay() {
    var c = getClip();
    if (!c || c.type !== 'day') return;
    var day = currentMap()[EDIT.iso];
    if (EDIT.mode !== 'edit') {
      EDIT.mode = 'edit';
      EDIT.model = dayToModel(day);
    }
    if (modelHasContent(EDIT.model)) { pasteDayModal(c); return; }
    EDIT.model = clone(c.payload);
    EDIT.dirty = true;
    renderDay();
    setSt('Pasted — review, then save', '');
  }

  function pasteDayModal(c) {
    var bg = document.createElement('div');
    bg.className = 'modal-bg open';
    bg.innerHTML =
      '<div class="modal" style="max-width:440px"><div class="modal-hd">' +
      '<div class="modal-title">Paste Day</div><button class="modal-close" data-x="1">✕</button></div>' +
      '<div class="modal-body"><p style="font-family:var(--mono);font-size:.75rem;line-height:1.6;color:var(--muted2)">' +
      'This day already has programming. Paste <strong style="color:var(--text)">' + esc(c.label) +
      '</strong> over it, or add its sections to the end?</p></div>' +
      '<div class="modal-foot"><button class="btn-cancel" data-x="1">Cancel</button>' +
      '<button class="btn-cancel" id="td-paste-append">Add to End</button>' +
      '<button class="btn-confirm" id="td-paste-replace">Replace Day</button></div></div>';
    document.body.appendChild(bg);

    bg.addEventListener('click', function (ev) {
      if (ev.target === bg || ev.target.dataset.x) { bg.remove(); return; }
      if (ev.target.id === 'td-paste-replace') {
        EDIT.model = clone(c.payload);
      } else if (ev.target.id === 'td-paste-append') {
        var last = EDIT.model.blocks[EDIT.model.blocks.length - 1];
        c.payload.blocks.forEach(function (b) {
          b.sections.forEach(function (s) { last.sections.push(clone(s)); });
        });
        if (!(EDIT.model.note || '').trim() && (c.payload.note || '').trim()) {
          EDIT.model.note = c.payload.note;
        }
      } else return;
      bg.remove();
      EDIT.dirty = true;
      renderDay();
      setSt('Pasted — review, then save', '');
    });
  }

  /* ── copy another day ── */

  function niceDate(iso) {
    return new Date(iso + 'T12:00:00')
      .toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  }

  function openCopyPicker() {
    var dm = currentMap();
    var days = Object.keys(dm).filter(function (k) {
      return dm[k] && !dm[k].isRestDay && k !== EDIT.iso;
    }).sort().reverse().slice(0, 90);
    if (!days.length) { window.showToast('No other programmed days to copy', 'err'); return; }

    var opts = days.map(function (k) {
      return '<option value="' + k + '">' + niceDate(k) + '</option>';
    }).join('');

    var bg = document.createElement('div');
    bg.className = 'modal-bg open';
    bg.innerHTML =
      '<div class="modal" style="max-width:420px"><div class="modal-hd">' +
      '<div class="modal-title">Copy a Day</div><button class="modal-close" data-x="1">✕</button></div>' +
      '<div class="modal-body"><div class="fld"><label>Copy programming from</label>' +
      '<select id="td-copy-sel">' + opts + '</select></div>' +
      '<div class="form-hint">Replaces what\u2019s in the editor. Nothing is written to the sheet until you press Save.</div>' +
      '</div><div class="modal-foot"><button class="btn-cancel" data-x="1">Cancel</button>' +
      '<button class="btn-confirm" id="td-copy-go">Load Into Editor</button></div></div>';
    document.body.appendChild(bg);

    bg.addEventListener('click', function (ev) {
      if (ev.target === bg || ev.target.dataset.x) { bg.remove(); return; }
      if (ev.target.id === 'td-copy-go') {
        var src = dm[document.getElementById('td-copy-sel').value];
        EDIT.model = dayToModel(src);
        EDIT.dirty = true;
        EDIT.mode = 'edit';
        bg.remove();
        renderDay();
        setSt('Loaded — review, then save', '');
      }
    });
  }

  /* ══════════════════════ 5. NEW WEEK ══════════════════════ */

  function openNewWeek() {
    var u = currentUser();
    var dm = currentMap();
    var keys = Object.keys(dm).sort();
    if (!u || !u.scriptUrl) { window.showToast('Athlete needs an Apps Script URL first', 'err'); return; }
    if (!keys.length) { window.showToast('Load a sheet with at least one week first', 'err'); return; }

    var template = dm[keys[keys.length - 1]];
    var dateRowIdx = template.resultsRowIdx - 2;

    var bg = document.createElement('div');
    bg.className = 'modal-bg open';
    bg.innerHTML =
      '<div class="modal" style="max-width:420px"><div class="modal-hd">' +
      '<div class="modal-title">New Week</div><button class="modal-close" data-x="1">✕</button></div>' +
      '<div class="modal-body"><div class="form-err" id="td-nw-err"></div>' +
      '<div class="fld"><label>Tab</label><input type="text" id="td-nw-tab" value="' + esc(template.tabName) + '"></div>' +
      '<div class="fld"><label>Week starts</label><input type="date" id="td-nw-start"></div>' +
      '<div class="form-hint">Copies the layout of the last week to the bottom of the sheet and writes seven new date headers. Training, Results and Feel rows start blank.</div>' +
      '</div><div class="modal-foot"><button class="btn-cancel" data-x="1">Cancel</button>' +
      '<button class="btn-confirm" id="td-nw-go">Create Week</button></div></div>';
    document.body.appendChild(bg);

    bg.addEventListener('click', async function (ev) {
      if (ev.target === bg || ev.target.dataset.x) { bg.remove(); return; }
      if (ev.target.id !== 'td-nw-go') return;
      var start = document.getElementById('td-nw-start').value;
      var tab = document.getElementById('td-nw-tab').value.trim();
      var err = document.getElementById('td-nw-err');
      if (!start) { err.textContent = 'Pick a start date.'; return; }
      if (!tab) { err.textContent = 'Tab name is required.'; return; }
      ev.target.disabled = true; ev.target.textContent = 'Creating…';

      var res = await post(u.scriptUrl, {
        secret: u.scriptSecret || '', action: 'newWeek',
        sheetName: tab, templateRowIdx: dateRowIdx,
        startDate: start, numDays: 7
      });
      bg.remove();
      if (res && res.ok) {
        window.showToast('Week added — reloading sheet', 'ok');
        window.adminRefreshDetail();
      } else {
        window.showToast((res && res.error) || 'Could not create week', 'err');
      }
    });
  }

  /* ══════════════════════ 6. CALENDAR + WEEK NAV ENHANCEMENT ══════════════════════ */

  var _origDetail = window.renderDetailBody;
  window.renderDetailBody = function () {
    _origDetail.apply(this, arguments);
    enhanceCalendar();
    addNewWeekButton();
  };

  function enhanceCalendar() {
    var dm = currentMap();
    var grid = document.querySelector('#detail-body .cal-grid');
    if (!grid) return;
    var y = ADM.detailMonth.getFullYear(), mo = ADM.detailMonth.getMonth();
    grid.querySelectorAll('.cc').forEach(function (cell) {
      if (cell.classList.contains('emp')) return;
      var n = cell.querySelector('.cn'); if (!n) return;
      var iso = y + '-' + String(mo + 1).padStart(2, '0') + '-' +
                String(parseInt(n.textContent, 10)).padStart(2, '0');
      if (!dm[iso]) { cell.title = 'No column for this date — use + New Week'; return; }
      if (cell.getAttribute('onclick')) return; // already-programmed day, app handles it
      cell.classList.add('td-empty');
      cell.title = 'Empty — click to write programming';
      var plus = document.createElement('div');
      plus.className = 'td-plus'; plus.textContent = '+';
      cell.appendChild(plus);
      cell.addEventListener('click', function () { window.adminOpenDay(iso); });
    });
  }

  function enhanceWeekNav(selISO) {
    var dm = currentMap();
    var nav = document.getElementById('adm-week-nav');
    if (!nav) return;
    var sel = new Date(selISO + 'T12:00:00');
    var start = new Date(sel); start.setDate(sel.getDate() - sel.getDay());
    nav.querySelectorAll('.wn-day').forEach(function (cell, i) {
      var d = new Date(start); d.setDate(start.getDate() + i);
      var iso = window.isoFmt(d);
      if (!dm[iso] || cell.getAttribute('onclick') || iso === selISO) return;
      cell.style.cursor = 'pointer';
      cell.addEventListener('click', function () { window.adminOpenDay(iso); });
    });
  }

  function addNewWeekButton() {
    var nav = document.querySelector('#adm-detail .adm-cal-nav .cal-arrows');
    if (!nav || document.getElementById('td-newweek')) return;
    var b = document.createElement('button');
    b.id = 'td-newweek'; b.className = 'btn-sm';
    b.style.marginRight = '.4rem';
    b.textContent = '+ New Week';
    b.onclick = openNewWeek;
    nav.insertBefore(b, nav.firstChild);
  }
})();
