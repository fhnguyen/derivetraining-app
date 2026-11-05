/* ═══════════════════════════════════════════════════════════════
   TRAINDERIVE — Teams + Chat
   ───────────────────────────────────────────────────────────────
   Load AFTER athlete-tabs.js, just above </body>:

       <script src="athlete-tabs.js?v=5"></script>
       <script src="td-chat.js?v=1"></script>

   Needs chat-setup.sql run once in Supabase first.

   Coach (admin panel)
   • Teams tab: make a team, rename it, add/remove athletes, delete it.
   • Chat tab: every team chat, and a DM with every athlete.
   Athlete (Chat tab in the bottom bar)
   • A DM with the coach, plus a chat for each team they're on.
   Messages arrive live; unread counts show on the tabs.

   Who can see and send what is enforced by the database rules in
   chat-setup.sql. This file only draws it.
   ═══════════════════════════════════════════════════════════════ */
(function () {
'use strict';

const PAGE = 50;                      // messages loaded per screenful
const COLS = 'id,team_id,athlete_id,sender_id,sender_name,sender_role,body,created_at';
const GROUP_MS = 5 * 60 * 1000;       // messages this close together share one name/time label

/* ───────────────────────────────────────────────────────────────
   STYLES
   ─────────────────────────────────────────────────────────────── */
const CSS = `
/* ── Shared ─────────────────────────────────────── */
.ch-wrap { --ch-me: var(--blue); }
.ch-inbox { min-width:0; }
.ch-search {
  width:100%; background:var(--paper); border:1px solid var(--line); border-radius:4px;
  padding:10px 12px; font-family:inherit; font-size:16px; color:var(--ink); outline:none; margin-bottom:10px;
}
.ch-search:focus { border-color:var(--blue); }
.ch-list { display:flex; flex-direction:column; gap:6px; }
.ch-sec { font-size:9px; font-weight:800; letter-spacing:2px; text-transform:uppercase; color:var(--ink-3); margin:12px 2px 2px; }
.ch-sec:first-child { margin-top:0; }
.ch-item {
  display:flex; align-items:center; gap:12px; width:100%; text-align:left; font:inherit; color:inherit; cursor:pointer;
  background:var(--paper); border:1px solid var(--line); border-radius:4px; padding:12px; transition:border-color .15s, background .15s;
}
.ch-item:hover { border-color:var(--blue); }
.ch-item.on { border-color:var(--blue); background:var(--blue-soft); }
.ch-av {
  width:42px; height:42px; flex-shrink:0; border-radius:3px; display:grid; place-items:center;
  background:var(--blue); color:#fff; font-family:var(--display); font-size:22px; padding-top:2px;
}
.ch-av.team { background:var(--ink); }
.ch-av.team svg { width:22px; height:22px; }
.ch-av.coach { background:var(--gold); color:var(--ink); }
.ch-mid { flex:1; min-width:0; }
.ch-top { display:flex; align-items:baseline; gap:8px; }
.ch-title { flex:1; min-width:0; font-weight:700; font-size:14.5px; color:var(--ink); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.ch-when { font-size:11px; font-weight:600; color:var(--ink-3); flex-shrink:0; }
.ch-bot { display:flex; align-items:center; gap:8px; margin-top:3px; }
.ch-prev { flex:1; min-width:0; font-size:13px; color:var(--ink-2); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.ch-prev.none { color:var(--ink-3); font-style:italic; }
.ch-item.unread .ch-title, .ch-item.unread .ch-prev { color:var(--ink); font-weight:700; }
.ch-pill {
  flex-shrink:0; min-width:20px; height:20px; padding:0 6px; border-radius:10px; background:var(--magenta); color:#fff;
  font-size:11px; font-weight:800; line-height:20px; text-align:center;
}
.ch-tag { font-size:8.5px; font-weight:800; letter-spacing:1.4px; text-transform:uppercase; color:var(--ink-3); flex-shrink:0; }
.ch-note { text-align:center; padding:36px 16px; font-size:13.5px; line-height:1.6; color:var(--ink-3);
  background:var(--paper); border:1px solid var(--line); border-radius:4px; }
.ch-note.err { color:var(--magenta); }

.ch-thread { display:flex; flex-direction:column; min-width:0; }
.ch-th-hd { display:flex; align-items:center; gap:10px; padding:10px 0; background:var(--wash); }
.ch-back {
  width:38px; height:38px; flex-shrink:0; border:1px solid var(--line); border-radius:3px; background:var(--paper);
  color:var(--blue); font-size:17px; cursor:pointer;
}
.ch-back:hover { border-color:var(--blue); }
.ch-th-title { font-family:var(--display); font-size:26px; line-height:1; color:var(--ink); padding-top:2px;
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.ch-th-sub { font-size:9px; font-weight:800; letter-spacing:2px; text-transform:uppercase; color:var(--blue); margin-top:3px; }
.ch-msgs { flex:1; padding:8px 0 12px; }
.ch-more { display:block; margin:4px auto 12px; }
.ch-more[hidden] { display:none; }
.ch-day { text-align:center; margin:16px 0 10px; font-size:9px; font-weight:800; letter-spacing:2px; text-transform:uppercase; color:var(--ink-3); }
.ch-empty-th { text-align:center; padding:40px 16px; font-size:13.5px; color:var(--ink-3); }

.ch-m { display:flex; flex-direction:column; align-items:flex-start; margin-top:3px; }
.ch-m.gap { margin-top:12px; }
.ch-m.mine { align-items:flex-end; }
.ch-who { font-size:10px; font-weight:800; letter-spacing:1.2px; text-transform:uppercase; color:var(--ink-3); margin:0 0 4px 2px; }
.ch-who.coach { color:var(--gold-ink); }
.ch-b {
  max-width:82%; padding:9px 13px; border-radius:14px; font-size:15px; line-height:1.45;
  white-space:pre-wrap; word-break:break-word; overflow-wrap:anywhere; cursor:pointer;
  background:var(--paper); border:1px solid var(--line); color:var(--ink); border-bottom-left-radius:4px;
}
.ch-m.coach .ch-b { border-left:3px solid var(--gold); }
.ch-m.mine .ch-b { background:var(--ch-me); border-color:var(--ch-me); color:#fff; border-bottom-left-radius:14px; border-bottom-right-radius:4px; }
.ch-m.mine .ch-b a { color:#fff; }
.ch-b a { color:var(--blue); font-weight:600; }
.ch-m.pending .ch-b { opacity:.55; }
.ch-m.failed .ch-b { background:var(--paper); color:var(--ink); border-color:var(--magenta); }
.ch-t { font-size:10.5px; font-weight:600; color:var(--ink-3); margin:4px 4px 0; }
.ch-act { display:none; margin:4px 4px 0; gap:10px; }
.ch-m.act .ch-act { display:flex; }
.ch-act button, .ch-retry {
  background:none; border:0; padding:4px 0; cursor:pointer; font:inherit;
  font-size:10px; font-weight:800; letter-spacing:1.4px; text-transform:uppercase; color:var(--magenta);
}

.ch-compose {
  display:flex; align-items:flex-end; gap:8px; padding:10px 0;
  background:var(--wash); border-top:1px solid var(--line);
}
.ch-input {
  flex:1; min-width:0; resize:none; max-height:132px; min-height:44px;
  background:var(--paper); border:1px solid var(--line); border-radius:22px;
  padding:11px 16px; font-family:inherit; font-size:16px; line-height:1.35; color:var(--ink); outline:none;
}
.ch-input:focus { border-color:var(--blue); }
.ch-send {
  height:44px; padding:0 18px; flex-shrink:0; border:0; border-radius:22px; cursor:pointer;
  background:var(--blue); color:#fff; font-size:10.5px; font-weight:800; letter-spacing:2px; text-transform:uppercase;
}
.ch-send:disabled { background:var(--line); color:var(--ink-3); cursor:default; }

/* ── Athlete: one screen at a time, page scrolls ─ */
.ch-wrap.athlete:not(.is-thread) .ch-thread { display:none; }
.ch-wrap.athlete.is-thread .ch-inbox { display:none; }
#v-chat.ch-open .tb-hero { display:none; }
#v-chat.ch-open .tb-col { padding-top:0; }
.app-main:has(#v-chat.active.ch-open) { padding-bottom:calc(var(--tb-h) + var(--tb-pad)); }
.ch-wrap.athlete .ch-thread {
  min-height:calc(100dvh - var(--hd-h) - 3px - env(safe-area-inset-top, 0px) - var(--tb-h) - var(--tb-pad));
}
.ch-wrap.athlete .ch-th-hd {
  position:sticky; z-index:20; top:calc(var(--hd-h) + 3px + env(safe-area-inset-top, 0px));
  margin:0 calc(-1 * var(--gut)); padding-left:var(--gut); padding-right:var(--gut); border-bottom:1px solid var(--line);
}
.ch-wrap.athlete .ch-compose {
  position:sticky; z-index:20; bottom:calc(var(--tb-h) + var(--tb-pad));
  margin:0 calc(-1 * var(--gut)); padding-left:var(--gut); padding-right:var(--gut);
}
/* While typing, the bottom bar steps aside for the keyboard */
body.ch-typing .tabbar { display:none; }
body.ch-typing .ch-wrap.athlete .ch-compose { bottom:0; padding-bottom:calc(10px + env(safe-area-inset-bottom, 0px)); }

/* ── Coach: inbox and conversation side by side ─ */
.ch-wrap.coach {
  display:grid; grid-template-columns:300px 1fr; background:var(--paper);
  border:1px solid var(--line); border-radius:4px; overflow:hidden;
  height:calc(100dvh - 190px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px)); min-height:440px;
}
.ch-wrap.coach .ch-inbox { border-right:1px solid var(--line); background:var(--wash); padding:12px; overflow-y:auto; }
.ch-wrap.coach .ch-thread { min-height:0; }
.ch-wrap.coach .ch-th-hd { padding:10px 14px; border-bottom:1px solid var(--line); }
.ch-wrap.coach .ch-msgs { overflow-y:auto; padding:8px 16px 12px; background:var(--wash); }
.ch-wrap.coach .ch-compose { padding:10px 14px; background:var(--paper); }
.ch-wrap.coach .ch-back { display:none; }
.ch-wrap.coach .ch-pane-empty { flex:1; display:grid; place-items:center; color:var(--ink-3); font-size:13.5px; padding:24px; text-align:center; }
.ch-wrap.coach:not(.is-thread) .ch-th-hd, .ch-wrap.coach:not(.is-thread) .ch-msgs, .ch-wrap.coach:not(.is-thread) .ch-compose { display:none; }
.ch-wrap.coach.is-thread .ch-pane-empty { display:none; }
@media (max-width:760px) {
  .ch-wrap.coach { grid-template-columns:1fr; }
  .ch-wrap.coach .ch-inbox { border-right:0; }
  .ch-wrap.coach.is-thread .ch-inbox { display:none; }
  .ch-wrap.coach:not(.is-thread) .ch-thread { display:none; }
  .ch-wrap.coach .ch-back { display:block; }
}
.adm-tab { position:relative; }
.ch-tab-badge {
  display:inline-block; min-width:17px; height:17px; padding:0 5px; margin-left:6px; vertical-align:2px;
  border-radius:9px; background:var(--magenta); color:#fff; font-family:var(--sans);
  font-size:10px; font-weight:800; letter-spacing:0; line-height:17px; text-align:center;
}
.ch-tab-badge[hidden] { display:none; }
@media (max-width:480px) { .adm-tab { padding:10px 13px 9px; font-size:15px; } }

/* ── Teams (coach) ──────────────────────────────── */
.tmc-list { display:grid; gap:10px; }
.tmc { position:relative; overflow:hidden; background:var(--paper); border:1px solid var(--line); border-radius:4px; padding:18px 16px 14px; }
.tmc::before { content:''; position:absolute; top:0; left:0; right:0; height:4px; background:var(--grad); }
.tmc-hd { display:flex; align-items:baseline; justify-content:space-between; gap:12px; }
.tmc-name { font-family:var(--display); font-size:28px; line-height:1; color:var(--ink); overflow-wrap:anywhere; }
.tmc-count { font-size:9px; font-weight:800; letter-spacing:2px; text-transform:uppercase; color:var(--blue); flex-shrink:0; }
.tmc-chips { display:flex; flex-wrap:wrap; gap:6px; margin:12px 0 14px; }
.tmc-chip { font-size:12px; font-weight:600; color:var(--ink-2); background:var(--wash); border:1px solid var(--line); border-radius:3px; padding:5px 8px; }
.tmc-none { font-size:12.5px; color:var(--ink-3); font-style:italic; }
.tmc-act { display:flex; flex-wrap:wrap; gap:6px; padding-top:12px; border-top:1px solid var(--line); }

.tm-pick-tools { display:flex; align-items:center; justify-content:space-between; gap:10px; margin:2px 0 8px; }
.tm-pick-count { font-size:9px; font-weight:800; letter-spacing:2px; text-transform:uppercase; color:var(--blue); }
.tm-pick { max-height:42vh; overflow-y:auto; border:1px solid var(--line); border-radius:4px; }
.fld .tm-pick label {
  display:flex; align-items:center; gap:12px; padding:11px 12px; cursor:pointer; border-top:1px solid var(--line);
  margin:0; font-size:inherit; font-weight:400; letter-spacing:0; text-transform:none; color:inherit;
}
.fld .tm-pick label:first-child { border-top:0; }
.fld .tm-pick label:hover { background:var(--wash); }
.tm-pick input { width:18px; height:18px; accent-color:var(--blue); flex-shrink:0; }
.tm-pick-name { font-weight:600; font-size:14px; color:var(--ink); }
.tm-pick-mail { font-size:12px; color:var(--ink-3); overflow-wrap:anywhere; }
`;

const TEAM_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<circle cx="9" cy="8.5" r="3.2"/><path d="M3 19c.8-3 3.2-4.6 6-4.6s5.2 1.6 6 4.6"/><circle cx="17" cy="9.5" r="2.5"/><path d="M16 14.6c2.4.1 4.2 1.5 5 4"/></svg>';

/* ───────────────────────────────────────────────────────────────
   SMALL HELPERS
   ─────────────────────────────────────────────────────────────── */
const $ = (sel, root) => (root || document).querySelector(sel);
const sb = () => window.SB || (typeof SB !== 'undefined' ? SB : null);
const me = () => (typeof S !== 'undefined' && S.user) ? S.user : null;
const isCoach = () => !!(me() && me().role === 'coach');

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function linkify(escaped) {
  return escaped.replace(/\bhttps?:\/\/[^\s<]+/g, url => {
    const m = url.match(/^(.*?)([.,!?;:)\]]*)$/);
    return '<a href="' + m[1] + '" target="_blank" rel="noopener">' + m[1] + '</a>' + m[2];
  });
}
const initial = name => (String(name || '?').trim().charAt(0) || '?').toUpperCase();
const threadOf = row => row.team_id ? 't:' + row.team_id : 'd:' + row.athlete_id;
const firstName = n => String(n || '').trim().split(/\s+/)[0] || n;

function dayKey(d) { return d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate(); }
function dayLabel(d) {
  const now = new Date(), y = new Date(now); y.setDate(now.getDate() - 1);
  if (dayKey(d) === dayKey(now)) return 'Today';
  if (dayKey(d) === dayKey(y)) return 'Yesterday';
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric', year: sameYear ? undefined : 'numeric' });
}
const clock = d => d.toLocaleTimeString('en-US', { hour:'numeric', minute:'2-digit' });
function shortWhen(iso) {
  if (!iso) return '';
  const d = new Date(iso), now = new Date();
  if (dayKey(d) === dayKey(now)) return clock(d);
  const days = (now - d) / 864e5;
  if (days < 6.5) return d.toLocaleDateString('en-US', { weekday:'short' });
  return d.toLocaleDateString('en-US', { month:'short', day:'numeric' });
}

/* ───────────────────────────────────────────────────────────────
   STATE
   ─────────────────────────────────────────────────────────────── */
const C = {
  uid: null,           // whose session this is
  channel: null,
  inbox: [],           // rows from td_chat_inbox()
  inboxErr: null,
  loadedInbox: false,
  open: null,          // { thread, kind, team_id, athlete_id, title, members, msgs: [], hasMore, loading }
  view: null,          // the athlete or coach chat screen in use
  filter: '',
  tmpN: 0,
  inboxTimer: null,
  readTimer: null,
  teams: [],
};

/* ───────────────────────────────────────────────────────────────
   MARKUP
   ─────────────────────────────────────────────────────────────── */
function shellHTML(mode) {
  return '<div class="ch-wrap ' + mode + '">' +
    '<div class="ch-inbox">' +
      (mode === 'coach' ? '<input type="search" class="ch-search" placeholder="Search athletes and teams" autocomplete="off">' : '') +
      '<div class="ch-list"></div>' +
    '</div>' +
    '<div class="ch-thread">' +
      (mode === 'coach' ? '<div class="ch-pane-empty">Pick a conversation</div>' : '') +
      '<div class="ch-th-hd"><button type="button" class="ch-back" aria-label="Back to conversations">&#8592;</button>' +
        '<div style="min-width:0"><div class="ch-th-title"></div><div class="ch-th-sub"></div></div></div>' +
      '<div class="ch-msgs"><button type="button" class="btn-sm ch-more" hidden>Load earlier messages</button><div class="ch-mlist"></div></div>' +
      '<form class="ch-compose" autocomplete="off">' +
        '<textarea class="ch-input" rows="1" placeholder="Message" aria-label="Message" enterkeyhint="send"></textarea>' +
        '<button type="submit" class="ch-send" disabled>Send</button>' +
      '</form>' +
    '</div>' +
  '</div>';
}

function inject() {
  const st = document.createElement('style');
  st.id = 'td-chat-css';
  st.textContent = CSS;
  document.head.appendChild(st);

  // Athlete: replace the "coming soon" card in the Chat tab.
  const col = $('#v-chat .tb-col');
  if (col) col.innerHTML = shellHTML('athlete');

  // Coach: Teams and Chat tabs in the admin panel, before Settings.
  const tabs = $('#s-admin .adm-tabs');
  const settingsBtn = tabs && [...tabs.querySelectorAll('.adm-tab')].find(b => /settings/i.test(b.textContent));
  const usersPanel = $('#adm-users');
  if (tabs && usersPanel) {
    const mk = (name, label) => {
      const b = document.createElement('button');
      b.className = 'adm-tab';
      b.setAttribute('onclick', "switchAdmTab('" + name + "',this)");
      b.innerHTML = label;
      tabs.insertBefore(b, settingsBtn || null);
    };
    mk('teams', 'Teams');
    mk('chat', 'Chat<span class="ch-tab-badge" id="adm-chat-badge" hidden></span>');

    usersPanel.insertAdjacentHTML('afterend',
      '<div id="adm-teams" class="adm-panel">' +
        '<div class="users-hd"><div class="section-title">Teams</div>' +
        '<button class="btn-add" type="button" id="td-team-new">+ New Team</button></div>' +
        '<div id="td-teams"></div>' +
      '</div>' +
      '<div id="adm-chat" class="adm-panel">' + shellHTML('coach') + '</div>');
  }

  // Team editor + delete confirm, in the app's own modal style.
  document.body.insertAdjacentHTML('beforeend',
    '<div class="modal-bg" id="m-team"><div class="modal">' +
      '<div class="modal-hd"><div class="modal-title" id="m-team-title">New Team</div>' +
        '<button class="modal-close" type="button" onclick="closeModal(\'m-team\')">&#10005;</button></div>' +
      '<div class="modal-body">' +
        '<div class="form-err" id="m-team-err"></div>' +
        '<div class="fld"><label>Team name</label><input type="text" id="m-team-name" maxlength="60" placeholder="Masters Squad"></div>' +
        '<div class="fld"><label>Athletes</label>' +
          '<input type="search" id="m-team-filter" placeholder="Search athletes" autocomplete="off" style="margin-bottom:8px">' +
          '<div class="tm-pick-tools"><span class="tm-pick-count" id="m-team-count"></span>' +
            '<button type="button" class="btn-sm" id="m-team-all">Select all</button></div>' +
          '<div class="tm-pick" id="m-team-pick"></div>' +
          '<div class="form-hint">Everyone on the team can read the whole team chat, including messages from before they joined.</div>' +
        '</div>' +
      '</div>' +
      '<div class="modal-foot"><button class="btn-cancel" type="button" onclick="closeModal(\'m-team\')">Cancel</button>' +
        '<button class="btn-confirm" type="button" id="m-team-save">Save Team</button></div>' +
    '</div></div>' +
    '<div class="modal-bg" id="m-team-del"><div class="modal">' +
      '<div class="modal-hd"><div class="modal-title">Delete Team</div>' +
        '<button class="modal-close" type="button" onclick="closeModal(\'m-team-del\')">&#10005;</button></div>' +
      '<div class="modal-body"><p style="font-size:14px;line-height:1.6;color:var(--ink-2)">Delete <strong id="m-team-del-name" style="color:var(--ink)"></strong>? ' +
        'Its chat and every message in it are deleted too. This can\'t be undone.</p></div>' +
      '<div class="modal-foot"><button class="btn-cancel" type="button" onclick="closeModal(\'m-team-del\')">Cancel</button>' +
        '<button class="btn-confirm danger-btn" type="button" id="m-team-del-go">Delete</button></div>' +
    '</div></div>');

  // Closing by tapping outside, like the app's other modals.
  ['m-team', 'm-team-del'].forEach(id => {
    const bg = document.getElementById(id);
    bg.addEventListener('click', e => { if (e.target === bg) bg.classList.remove('open'); });
  });
}

function viewFor(mode) {
  const wrap = mode === 'coach' ? $('#adm-chat .ch-wrap') : $('#v-chat .ch-wrap');
  if (!wrap) return null;
  return {
    mode, wrap,
    list:   $('.ch-list', wrap),
    search: $('.ch-search', wrap),
    title:  $('.ch-th-title', wrap),
    sub:    $('.ch-th-sub', wrap),
    msgs:   $('.ch-msgs', wrap),
    mlist:  $('.ch-mlist', wrap),
    more:   $('.ch-more', wrap),
    form:   $('.ch-compose', wrap),
    input:  $('.ch-input', wrap),
    send:   $('.ch-send', wrap),
    // The athlete screen scrolls the whole page; the coach's message pane scrolls on its own.
    scroller: mode === 'coach' ? $('.ch-msgs', wrap) : (document.scrollingElement || document.documentElement),
  };
}

/* ───────────────────────────────────────────────────────────────
   START / STOP — one live connection per signed-in person
   ─────────────────────────────────────────────────────────────── */
function start() {
  const u = me(), client = sb();
  if (!u || !client) return;
  if (C.uid === u.id) return;
  stop();
  C.uid = u.id;
  C.view = viewFor(isCoach() ? 'coach' : 'athlete');

  try {
    C.channel = client.channel('td-chat-' + u.id)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'td_messages' }, p => onInsert(p.new))
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'td_messages' }, p => onDelete(p.old))
      .subscribe(status => {
        // After a dropped connection comes back, catch up on anything missed.
        if (status === 'SUBSCRIBED' && C.loadedInbox) catchUp();
      });
  } catch (e) { console.warn('Chat: live updates unavailable —', e.message); }

  refreshInbox();
}

function stop() {
  const client = sb();
  if (C.channel && client) { try { client.removeChannel(C.channel); } catch (e) {} }
  clearTimeout(C.inboxTimer); clearTimeout(C.readTimer);
  Object.assign(C, { uid: null, channel: null, inbox: [], inboxErr: null, loadedInbox: false, open: null, filter: '', teams: [] });
  ['athlete', 'coach'].forEach(m => {
    const v = viewFor(m);
    if (!v) return;
    v.wrap.classList.remove('is-thread');
    v.list.innerHTML = '';
    v.mlist.innerHTML = '';
    v.input.value = '';
    if (v.search) v.search.value = '';
  });
  const vc = $('#v-chat'); if (vc) vc.classList.remove('ch-open');
  document.body.classList.remove('ch-typing');
  setBadges(0);
}

/* ───────────────────────────────────────────────────────────────
   INBOX
   ─────────────────────────────────────────────────────────────── */
async function refreshInbox() {
  const client = sb();
  if (!client || !C.uid) return;
  const uid = C.uid;
  const { data, error } = await client.rpc('td_chat_inbox');
  if (uid !== C.uid) return;                        // signed out meanwhile
  if (error) {
    C.inboxErr = /td_chat_inbox|function|schema cache/i.test(error.message)
      ? 'Chat isn’t set up yet. Run chat-setup.sql in Supabase.'
      : 'Couldn’t load messages. ' + error.message;
    console.warn('Chat inbox:', error.message);
  } else {
    C.inboxErr = null;
    C.inbox = data || [];
    // A conversation on screen is read as it arrives.
    if (C.open && threadVisible()) {
      const row = C.inbox.find(r => r.thread === C.open.thread);
      if (row && row.unread) { row.unread = 0; markRead(C.open.thread); }
    }
  }
  C.loadedInbox = true;
  renderInbox();
  updateBadges();
}
function scheduleInbox(ms) {
  clearTimeout(C.inboxTimer);
  C.inboxTimer = setTimeout(refreshInbox, ms == null ? 350 : ms);
}

function totalUnread() { return C.inbox.reduce((n, r) => n + (r.unread || 0), 0); }
function updateBadges() { setBadges(totalUnread()); }
function setBadges(n) {
  if (window.TD_TABS) window.TD_TABS.setChatBadge(isCoach() ? 0 : n);
  const b = document.getElementById('adm-chat-badge');
  if (b) { b.hidden = !(isCoach() && n > 0); b.textContent = n > 99 ? '99+' : String(n || ''); }
}

function previewOf(r) {
  if (!r.last_at) return { txt: r.kind === 'team' ? 'No messages yet' : (isCoach() ? 'Start a conversation' : 'Say hi to your coach'), none: true };
  const body = String(r.last_body || '').replace(/\s+/g, ' ');
  if (r.last_sender_id === C.uid) return { txt: 'You: ' + body };
  if (r.kind === 'team') return { txt: firstName(r.last_sender) + ': ' + body };
  return { txt: body };
}

function itemHTML(r) {
  const p = previewOf(r);
  const on = C.open && C.open.thread === r.thread;
  const av = r.kind === 'team'
    ? '<div class="ch-av team">' + TEAM_ICON + '</div>'
    : '<div class="ch-av' + (isCoach() ? '' : ' coach') + '">' + esc(initial(r.title)) + '</div>';
  return '<button type="button" class="ch-item' + (r.unread ? ' unread' : '') + (on ? ' on' : '') + '" data-thread="' + esc(r.thread) + '">' +
    av + '<div class="ch-mid"><div class="ch-top"><span class="ch-title">' + esc(r.title) + '</span>' +
    (r.kind === 'team' ? '<span class="ch-tag">Team · ' + r.members + '</span>' : '') +
    '<span class="ch-when">' + esc(shortWhen(r.last_at)) + '</span></div>' +
    '<div class="ch-bot"><span class="ch-prev' + (p.none ? ' none' : '') + '">' + esc(p.txt) + '</span>' +
    (r.unread ? '<span class="ch-pill">' + (r.unread > 99 ? '99+' : r.unread) + '</span>' : '') +
    '</div></div></button>';
}

function renderInbox() {
  const v = C.view;
  if (!v) return;
  if (C.inboxErr) { v.list.innerHTML = '<div class="ch-note err">' + esc(C.inboxErr) + '</div>'; return; }
  if (!C.loadedInbox) { v.list.innerHTML = '<div class="sbox"><div class="spinner"></div><p>Loading messages…</p></div>'; return; }

  let rows = C.inbox;
  const q = C.filter.trim().toLowerCase();
  if (q) rows = rows.filter(r => r.title.toLowerCase().includes(q));

  if (!rows.length) {
    v.list.innerHTML = '<div class="ch-note">' + (q ? 'No one matches “' + esc(C.filter.trim()) + '”.'
      : 'No conversations yet.') + '</div>';
    return;
  }

  if (isCoach() && !q) {
    // Active conversations first, then everyone you haven't messaged yet.
    const active = rows.filter(r => r.last_at), quiet = rows.filter(r => !r.last_at);
    v.list.innerHTML =
      (active.length ? '<div class="ch-sec">Recent</div>' + active.map(itemHTML).join('') : '') +
      (quiet.length ? '<div class="ch-sec">' + (active.length ? 'Everyone else' : 'Teams and athletes') + '</div>' + quiet.map(itemHTML).join('') : '');
  } else {
    v.list.innerHTML = rows.map(itemHTML).join('');
  }
}

/* ───────────────────────────────────────────────────────────────
   A CONVERSATION
   ─────────────────────────────────────────────────────────────── */
function threadVisible() {
  if (!C.open || document.visibilityState !== 'visible') return false;
  if (isCoach()) return !!($('#s-admin.active') && $('#adm-chat.active'));
  return !!$('#v-chat.active');
}

async function openThread(thread) {
  const v = C.view, client = sb();
  if (!v || !client) return;
  const row = C.inbox.find(r => r.thread === thread);
  if (!row) return;

  C.open = { thread, kind: row.kind, team_id: row.team_id, athlete_id: row.athlete_id,
             title: row.title, members: row.members, msgs: [], hasMore: false, loading: true };
  v.wrap.classList.add('is-thread');
  if (v.mode === 'athlete') { $('#v-chat').classList.add('ch-open'); }

  v.title.textContent = row.title;
  v.sub.textContent = row.kind === 'team'
    ? 'Team chat · ' + row.members + (row.members === 1 ? ' athlete' : ' athletes')
    : (isCoach() ? 'Direct message' : 'Your coach');
  v.input.value = draftGet(thread);
  growInput();
  v.more.hidden = true;
  v.mlist.innerHTML = '<div class="sbox"><div class="spinner"></div></div>';
  renderInbox();
  if (v.mode === 'athlete') window.scrollTo(0, 0);

  const { data, error } = await threadQuery().order('created_at', { ascending: false }).order('id', { ascending: false }).limit(PAGE);
  if (!C.open || C.open.thread !== thread) return;
  C.open.loading = false;
  if (error) { v.mlist.innerHTML = '<div class="ch-note err">Couldn’t load messages. ' + esc(error.message) + '</div>'; return; }
  C.open.msgs = (data || []).reverse();
  C.open.hasMore = (data || []).length === PAGE;
  renderMsgs();
  scrollBottom(true);
  if (row.unread) { row.unread = 0; updateBadges(); renderInbox(); }
  markRead(thread);
  if (!matchMedia('(pointer: coarse)').matches) v.input.focus();
}

function closeThread() {
  const v = C.view;
  if (!v || !C.open) return;
  draftSet(C.open.thread, v.input.value);
  C.open = null;
  v.wrap.classList.remove('is-thread');
  v.input.blur();
  if (v.mode === 'athlete') {
    $('#v-chat').classList.remove('ch-open');
    document.body.classList.remove('ch-typing');
    window.scrollTo(0, 0);
  }
  renderInbox();
}

function threadQuery() {
  const q = sb().from('td_messages').select(COLS);
  return C.open.kind === 'team' ? q.eq('team_id', C.open.team_id) : q.eq('athlete_id', C.open.athlete_id);
}

async function loadEarlier() {
  const v = C.view, o = C.open;
  if (!o || !o.msgs.length) return;
  v.more.disabled = true;
  const oldest = o.msgs.find(m => !m.tmp);
  const { data, error } = await threadQuery().lt('created_at', oldest.created_at)
    .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(PAGE);
  v.more.disabled = false;
  if (C.open !== o || error) return;
  const sc = v.scroller, before = sc.scrollHeight;
  o.msgs = (data || []).reverse().concat(o.msgs);
  o.hasMore = (data || []).length === PAGE;
  renderMsgs();
  sc.scrollTop += sc.scrollHeight - before;          // keep the reader where they were
}

// Anything that arrived while the phone was asleep or offline.
async function catchUp() {
  scheduleInbox(0);
  const o = C.open;
  if (!o || o.loading) return;
  const last = [...o.msgs].reverse().find(m => !m.tmp);
  let q = threadQuery();
  if (last) q = q.gt('created_at', last.created_at);
  const { data } = await q.order('created_at', { ascending: true }).limit(200);
  if (C.open !== o || !data || !data.length) return;
  data.forEach(addMsg);
  if (threadVisible()) markRead(o.thread);
}

/* ── Drawing messages ──────────────────────────────── */
function msgHTML(m, prev) {
  const d = new Date(m.created_at);
  const mine = m.sender_id === C.uid;
  const fromCoach = m.sender_role === 'coach';
  const newDay = !prev || dayKey(new Date(prev.created_at)) !== dayKey(d);
  const sameRun = prev && !newDay && prev.sender_id === m.sender_id && (d - new Date(prev.created_at)) < GROUP_MS;
  const showName = !mine && !sameRun && C.open.kind === 'team';
  const canDelete = !m.tmp && (mine || isCoach());

  let h = newDay ? '<div class="ch-day">' + esc(dayLabel(d)) + '</div>' : '';
  h += '<div class="ch-m' + (mine ? ' mine' : '') + (fromCoach && !mine ? ' coach' : '') + (sameRun ? '' : ' gap') +
       (m.tmp ? (m.failed ? ' failed' : ' pending') : '') + '" data-id="' + esc(m.id) + '">';
  if (showName) h += '<div class="ch-who' + (fromCoach ? ' coach' : '') + '">' + esc(fromCoach ? (m.sender_name + ' · Coach') : m.sender_name) + '</div>';
  h += '<div class="ch-b">' + linkify(esc(m.body)) + '</div>';
  if (m.failed) h += '<div class="ch-t">Not sent · <button type="button" class="ch-retry" data-retry="' + esc(m.id) + '">Try again</button></div>';
  else h += '<div class="ch-t" data-t>' + (m.tmp ? 'Sending…' : esc(clock(d))) + '</div>';
  if (canDelete) h += '<div class="ch-act"><button type="button" data-del="' + esc(m.id) + '">Delete</button></div>';
  return h + '</div>';
}

function renderMsgs() {
  const v = C.view, o = C.open;
  if (!v || !o) return;
  v.more.hidden = !o.hasMore;
  if (!o.msgs.length) {
    v.mlist.innerHTML = '<div class="ch-empty-th">' + (o.kind === 'team'
      ? 'No messages in ' + esc(o.title) + ' yet.'
      : (isCoach() ? 'No messages with ' + esc(firstName(o.title)) + ' yet.' : 'Questions about your training? Ask here.')) + '</div>';
    return;
  }
  let h = '';
  o.msgs.forEach((m, i) => { h += msgHTML(m, o.msgs[i - 1]); });
  v.mlist.innerHTML = h;
  // Only the last message in a run of quick messages shows its time.
  const nodes = [...v.mlist.querySelectorAll('.ch-m')];
  nodes.forEach((n, i) => {
    const next = nodes[i + 1], t = n.querySelector('[data-t]');
    if (t && next && !next.classList.contains('gap') && !n.classList.contains('pending')) t.style.display = 'none';
  });
}

function nearBottom() {
  const sc = C.view.scroller;
  return sc.scrollHeight - sc.scrollTop - sc.clientHeight < 160;
}
function scrollBottom(force) {
  const v = C.view;
  if (!v) return;
  requestAnimationFrame(() => { v.scroller.scrollTop = v.scroller.scrollHeight; });
}

function addMsg(row) {
  const o = C.open;
  if (!o || threadOf(row) !== o.thread) return false;
  if (o.msgs.some(m => String(m.id) === String(row.id))) return false;
  // My own message coming back: swap it in for the "Sending…" copy.
  if (row.sender_id === C.uid) {
    const t = o.msgs.find(m => m.tmp && !m.failed && m.body === row.body);
    if (t) { t.resolvedId = row.id; Object.assign(t, row, { tmp: false }); renderMsgs(); return true; }
  }
  const stick = nearBottom() || row.sender_id === C.uid;
  o.msgs.push(row);
  o.msgs.sort((a, b) => (a.tmp ? 1 : 0) - (b.tmp ? 1 : 0) || new Date(a.created_at) - new Date(b.created_at));
  renderMsgs();
  if (stick) scrollBottom();
  return true;
}

/* ── Live updates ──────────────────────────────────── */
function onInsert(row) {
  if (!row || !C.uid) return;
  const shown = addMsg(row);
  if (shown && threadVisible() && row.sender_id !== C.uid) markRead(threadOf(row));
  // Update the list (preview, order, unread) without a full reload every keystroke.
  const r = C.inbox.find(x => x.thread === threadOf(row));
  if (r) {
    r.last_body = row.body; r.last_at = row.created_at; r.last_sender = row.sender_name; r.last_sender_id = row.sender_id;
    if (row.sender_id !== C.uid && !(shown && threadVisible())) r.unread = (r.unread || 0) + 1;
    C.inbox.sort((a, b) => (b.last_at ? new Date(b.last_at) : 0) - (a.last_at ? new Date(a.last_at) : 0));
    renderInbox(); updateBadges();
  } else {
    scheduleInbox();                                  // e.g. just added to a team
  }
}
function onDelete(old) {
  if (!old || old.id == null) return;
  if (C.open) {
    const n = C.open.msgs.length;
    C.open.msgs = C.open.msgs.filter(m => String(m.id) !== String(old.id));
    if (C.open.msgs.length !== n) renderMsgs();
  }
  scheduleInbox();
}

function markRead(thread) {
  clearTimeout(C.readTimer);
  C.readTimer = setTimeout(async () => {
    const client = sb();
    if (!client || !C.uid) return;
    const { error } = await client.rpc('td_chat_mark_read', { p_thread: thread });
    if (error) console.warn('Chat: mark read failed —', error.message);
  }, 250);
}

/* ── Sending ───────────────────────────────────────── */
async function send(retryOf) {
  const v = C.view, o = C.open, client = sb();
  if (!v || !o || !client) return;
  let msg;
  if (retryOf) {
    msg = retryOf; msg.failed = false;
  } else {
    const body = v.input.value.trim();
    if (!body) return;
    msg = { id: 'tmp-' + (++C.tmpN), tmp: true, body, sender_id: C.uid, sender_name: me().name, sender_role: me().role,
            created_at: new Date().toISOString(), team_id: o.team_id, athlete_id: o.athlete_id };
    o.msgs.push(msg);
    v.input.value = '';
    draftSet(o.thread, '');
    growInput();
  }
  renderMsgs();
  scrollBottom();

  const payload = o.kind === 'team' ? { team_id: o.team_id, body: msg.body } : { athlete_id: o.athlete_id, body: msg.body };
  const { data, error } = await client.from('td_messages').insert(payload).select(COLS).single();
  if (C.open !== o) return;
  if (error) {
    msg.failed = true;
    console.warn('Chat: send failed —', error.message);
    renderMsgs();
    return;
  }
  if (msg.resolvedId != null) return;               // the live update already swapped it in
  const dup = o.msgs.find(m => !m.tmp && String(m.id) === String(data.id));
  if (dup) o.msgs = o.msgs.filter(m => m !== msg);
  else Object.assign(msg, data, { tmp: false });
  renderMsgs();
  onInsert(data);                                    // keep the inbox preview current
}

async function deleteMsg(id) {
  const o = C.open, client = sb();
  if (!o || !client) return;
  const { error } = await client.from('td_messages').delete().eq('id', id);
  if (error) { showToast('Couldn’t delete that message', 'err'); return; }
  o.msgs = o.msgs.filter(m => String(m.id) !== String(id));
  renderMsgs();
  scheduleInbox(0);
}

/* ── Composer ──────────────────────────────────────── */
const DRAFTS = {};
const draftGet = t => DRAFTS[t] || '';
const draftSet = (t, s) => { if (s) DRAFTS[t] = s; else delete DRAFTS[t]; };

function growInput() {
  const v = C.view;
  if (!v) return;
  v.input.style.height = 'auto';
  v.input.style.height = Math.min(v.input.scrollHeight + 2, 132) + 'px';
  v.send.disabled = !v.input.value.trim();
}

function wire(mode) {
  const v = viewFor(mode);
  if (!v) return;

  v.list.addEventListener('click', e => {
    const it = e.target.closest('[data-thread]');
    if (it && C.view === viewForCache(mode)) openThread(it.dataset.thread);
  });
  if (v.search) v.search.addEventListener('input', () => { C.filter = v.search.value; renderInbox(); });
  $('.ch-back', v.wrap).addEventListener('click', closeThread);
  v.more.addEventListener('click', loadEarlier);

  v.form.addEventListener('submit', e => { e.preventDefault(); send(); });
  v.input.addEventListener('input', growInput);
  v.input.addEventListener('keydown', e => {
    // Enter sends on a keyboard; on a phone, Return is a new line and Send sends.
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && !matchMedia('(pointer: coarse)').matches) {
      e.preventDefault(); send();
    }
  });
  // Keep the keyboard up when Send is tapped.
  v.send.addEventListener('pointerdown', e => { if (document.activeElement === v.input) e.preventDefault(); });
  if (mode === 'athlete') {
    v.input.addEventListener('focus', () => document.body.classList.add('ch-typing'));
    v.input.addEventListener('blur', () => setTimeout(() => {
      if (document.activeElement !== v.input) document.body.classList.remove('ch-typing');
    }, 50));
  }

  v.mlist.addEventListener('click', e => {
    const retry = e.target.closest('[data-retry]');
    if (retry) { const m = C.open && C.open.msgs.find(x => String(x.id) === retry.dataset.retry); if (m) send(m); return; }
    const del = e.target.closest('[data-del]');
    if (del) {
      if (del.dataset.armed) { deleteMsg(del.dataset.del); return; }
      del.dataset.armed = '1'; del.textContent = 'Tap again to delete';
      return;
    }
    if (e.target.closest('a')) return;
    const b = e.target.closest('.ch-b');
    if (b) {
      const m = b.parentElement;
      if (!m.querySelector('.ch-act')) return;
      const was = m.classList.contains('act');
      v.mlist.querySelectorAll('.ch-m.act').forEach(x => x.classList.remove('act'));
      if (!was) m.classList.add('act');
    }
  });
}
function viewForCache(mode) { return C.view && C.view.mode === mode ? C.view : null; }

/* ───────────────────────────────────────────────────────────────
   TEAMS (coach)
   ─────────────────────────────────────────────────────────────── */
function athletes() {
  return (window.PROFILES || []).filter(p => p.role !== 'coach').slice().sort((a, b) => (a.name || '').localeCompare(b.name || ''));
}

async function loadTeams() {
  const box = document.getElementById('td-teams');
  if (!box) return;
  if (!C.teams.length) box.innerHTML = '<div class="sbox"><div class="spinner"></div><p>Loading teams…</p></div>';
  if (!(window.PROFILES || []).length && typeof loadProfiles === 'function') await loadProfiles();
  const { data, error } = await sb().from('td_teams').select('id,name,created_at,td_team_members(athlete_id)').order('name');
  if (error) {
    box.innerHTML = '<div class="ch-note err">' + esc(/td_teams|schema cache|relation/i.test(error.message)
      ? 'Teams aren’t set up yet. Run chat-setup.sql in Supabase.' : 'Couldn’t load teams. ' + error.message) + '</div>';
    return;
  }
  C.teams = (data || []).map(t => ({ id: t.id, name: t.name, members: (t.td_team_members || []).map(m => m.athlete_id) }));
  renderTeams();
}

function renderTeams() {
  const box = document.getElementById('td-teams');
  if (!box) return;
  if (!C.teams.length) {
    box.innerHTML = '<div class="ch-note">No teams yet. Make one with <strong>+ New Team</strong> and it gets its own team chat.</div>';
    return;
  }
  const byId = {};
  (window.PROFILES || []).forEach(p => { byId[p.id] = p; });
  box.innerHTML = '<div class="tmc-list">' + C.teams.map(t => {
    const names = t.members.map(id => byId[id] ? byId[id].name : 'Unknown').sort((a, b) => a.localeCompare(b));
    return '<div class="tmc"><div class="tmc-hd"><div class="tmc-name">' + esc(t.name) + '</div>' +
      '<div class="tmc-count">' + names.length + (names.length === 1 ? ' athlete' : ' athletes') + '</div></div>' +
      '<div class="tmc-chips">' + (names.length ? names.map(n => '<span class="tmc-chip">' + esc(n) + '</span>').join('')
        : '<span class="tmc-none">No athletes yet</span>') + '</div>' +
      '<div class="tmc-act">' +
        '<button class="btn-sm" type="button" data-team-chat="' + t.id + '">Open Chat</button>' +
        '<button class="btn-sm" type="button" data-team-edit="' + t.id + '">Edit</button>' +
        '<button class="btn-sm danger" type="button" data-team-del="' + t.id + '">Delete</button>' +
      '</div></div>';
  }).join('') + '</div>';
}

let editingTeam = null;   // null = new team
let pickSel = new Set();

function openTeamEditor(id) {
  const t = id ? C.teams.find(x => x.id === id) : null;
  editingTeam = t ? t.id : null;
  pickSel = new Set(t ? t.members : []);
  document.getElementById('m-team-title').textContent = t ? 'Edit Team' : 'New Team';
  document.getElementById('m-team-name').value = t ? t.name : '';
  document.getElementById('m-team-filter').value = '';
  document.getElementById('m-team-err').textContent = '';
  renderPicker();
  openModal('m-team');
  if (!t) setTimeout(() => document.getElementById('m-team-name').focus(), 50);
}

function renderPicker() {
  const q = document.getElementById('m-team-filter').value.trim().toLowerCase();
  const list = athletes();
  const shown = q ? list.filter(a => (a.name + ' ' + a.email).toLowerCase().includes(q)) : list;
  const pick = document.getElementById('m-team-pick');
  pick.innerHTML = shown.length ? shown.map(a =>
    '<label><input type="checkbox" value="' + esc(a.id) + '"' + (pickSel.has(a.id) ? ' checked' : '') + '>' +
    '<div style="min-width:0"><div class="tm-pick-name">' + esc(a.name || 'Unnamed') + '</div>' +
    '<div class="tm-pick-mail">' + esc(a.email || '') + '</div></div></label>').join('')
    : '<div class="ch-empty-th">' + (list.length ? 'No athletes match.' : 'No athletes yet — add them on the Users tab.') + '</div>';
  document.getElementById('m-team-count').textContent = pickSel.size + ' selected';
  const allBtn = document.getElementById('m-team-all');
  const allOn = shown.length && shown.every(a => pickSel.has(a.id));
  allBtn.textContent = allOn ? 'Clear' : 'Select all';
  allBtn.style.visibility = shown.length ? '' : 'hidden';
}

async function saveTeam() {
  const err = document.getElementById('m-team-err');
  const name = document.getElementById('m-team-name').value.trim();
  err.textContent = '';
  if (!name) { err.textContent = 'Give the team a name.'; return; }
  const btn = document.getElementById('m-team-save');
  btn.disabled = true; btn.textContent = 'Saving…';
  const done = msg => { btn.disabled = false; btn.textContent = 'Save Team'; if (msg) err.textContent = msg; };
  const client = sb();

  let id = editingTeam;
  if (id) {
    const { error } = await client.from('td_teams').update({ name }).eq('id', id);
    if (error) return done(error.message);
  } else {
    const { data, error } = await client.from('td_teams').insert({ name }).select('id').single();
    if (error) return done(error.message);
    id = data.id;
  }

  const before = new Set(editingTeam ? (C.teams.find(t => t.id === editingTeam) || { members: [] }).members : []);
  const add = [...pickSel].filter(a => !before.has(a));
  const remove = [...before].filter(a => !pickSel.has(a));
  if (remove.length) {
    const { error } = await client.from('td_team_members').delete().eq('team_id', id).in('athlete_id', remove);
    if (error) return done('Saved the name, but couldn’t remove athletes: ' + error.message);
  }
  if (add.length) {
    const { error } = await client.from('td_team_members').insert(add.map(a => ({ team_id: id, athlete_id: a })));
    if (error) return done('Saved the name, but couldn’t add athletes: ' + error.message);
  }

  done();
  closeModal('m-team');
  showToast(editingTeam ? 'Team updated' : 'Team created', 'ok');
  await loadTeams();
  scheduleInbox(0);
}

let deletingTeam = null;
function openTeamDelete(id) {
  const t = C.teams.find(x => x.id === id);
  if (!t) return;
  deletingTeam = id;
  document.getElementById('m-team-del-name').textContent = t.name;
  openModal('m-team-del');
}
async function confirmTeamDelete() {
  const { error } = await sb().from('td_teams').delete().eq('id', deletingTeam);
  if (error) { showToast('Couldn’t delete: ' + error.message, 'err'); return; }
  closeModal('m-team-del');
  if (C.open && C.open.team_id === deletingTeam) closeThread();
  showToast('Team deleted', 'ok');
  await loadTeams();
  scheduleInbox(0);
}

async function openTeamChat(id) {
  const btn = [...document.querySelectorAll('#s-admin .adm-tab')].find(b => /chat/i.test(b.textContent));
  if (btn) btn.click();
  if (!C.inbox.some(r => r.thread === 't:' + id)) await refreshInbox();
  openThread('t:' + id);
}

function wireTeams() {
  const panel = document.getElementById('adm-teams');
  if (!panel) return;
  document.getElementById('td-team-new').addEventListener('click', () => openTeamEditor(null));
  panel.addEventListener('click', e => {
    const ed = e.target.closest('[data-team-edit]'); if (ed) { openTeamEditor(ed.dataset.teamEdit); return; }
    const dl = e.target.closest('[data-team-del]');  if (dl) { openTeamDelete(dl.dataset.teamDel); return; }
    const ch = e.target.closest('[data-team-chat]'); if (ch) { openTeamChat(ch.dataset.teamChat); }
  });
  document.getElementById('m-team-filter').addEventListener('input', renderPicker);
  document.getElementById('m-team-pick').addEventListener('change', e => {
    if (e.target.type !== 'checkbox') return;
    if (e.target.checked) pickSel.add(e.target.value); else pickSel.delete(e.target.value);
    renderPicker();
  });
  document.getElementById('m-team-all').addEventListener('click', () => {
    const q = document.getElementById('m-team-filter').value.trim().toLowerCase();
    const shown = athletes().filter(a => !q || (a.name + ' ' + a.email).toLowerCase().includes(q));
    const allOn = shown.every(a => pickSel.has(a.id));
    shown.forEach(a => { if (allOn) pickSel.delete(a.id); else pickSel.add(a.id); });
    renderPicker();
  });
  document.getElementById('m-team-name').addEventListener('keydown', e => { if (e.key === 'Enter') saveTeam(); });
  document.getElementById('m-team-save').addEventListener('click', saveTeam);
  document.getElementById('m-team-del-go').addEventListener('click', confirmTeamDelete);
}

/* ───────────────────────────────────────────────────────────────
   HOOKS INTO THE APP
   ─────────────────────────────────────────────────────────────── */
function hook() {
  const _applyRoute = window.applyRoute;
  window.applyRoute = function (route, opts) {
    _applyRoute(route, opts);
    if (me()) start();
    if (route === 'chat' && C.view && C.view.mode === 'athlete') {
      if (C.loadedInbox) scheduleInbox(0);
      if (C.open) { scrollBottom(); markRead(C.open.thread); }
    }
  };

  const _switch = window.switchAdmTab;
  window.switchAdmTab = function (name, btn) {
    _switch(name, btn);
    if (name === 'teams') loadTeams();
    if (name === 'chat') {
      start();
      if (C.loadedInbox) scheduleInbox(0);
      if (C.open) { scrollBottom(); markRead(C.open.thread); }
    }
  };

  ['doLogout', 'doAdminLogout'].forEach(fn => {
    const orig = window[fn];
    if (typeof orig !== 'function') return;
    window[fn] = async function () { stop(); return orig.apply(this, arguments); };
  });

  // Tapping Chat while already on it goes back to the list.
  document.addEventListener('td:tabreselect', e => { if (e.detail === 'chat') closeThread(); });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && C.uid) catchUp();
  });
}

/* ───────────────────────────────────────────────────────────────
   GO
   ─────────────────────────────────────────────────────────────── */
if (typeof S === 'undefined' || typeof applyRoute !== 'function') {
  console.warn('td-chat.js must load after the main script in index.html');
  return;
}
inject();
wire('athlete');
wire('coach');
wireTeams();
hook();
if (window.TD_TABS) window.TD_TABS.enableChat();
else console.warn('td-chat.js: load athlete-tabs.js before this file to get the Chat tab');
if (me()) start();

window.TD_CHAT = { state: () => C, refresh: refreshInbox };
})();
