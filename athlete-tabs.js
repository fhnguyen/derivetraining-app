/* ═══════════════════════════════════════════════════════════════
   TRAINDERIVE — athlete tab bar + workout timer
   ───────────────────────────────────────────────────────────────
   An add-on, like coach-editor.js. Load it AFTER the main script
   in index.html, just above </body>:

       <script src="athlete-tabs.js"></script>

   What it does
   • Adds a bottom bar to the athlete app: Train · Chat · Timer · Account
     (Chat appears by itself once td-chat.js is loaded after this file).
   • Train is the calendar + day view exactly as before.
   • Timer: For Time (optional cap), AMRAP, EMOM and Intervals.
     It keeps running while the athlete flips back to their workout,
     and the Timer tab shows the clock while they're away.
   • Account: profile, text size and sign out — moved out of the
     header, which is now just the logo and search.

   Nothing here touches Supabase or the sheet.
   ═══════════════════════════════════════════════════════════════ */
(function () {
'use strict';

let chatOn = false;   // td-chat.js switches this on via TD_TABS.enableChat()

// The main script rewrites the address on startup, so note now
// whether the app was opened straight onto one of the new tabs.
const BOOT_HASH = location.hash;

/* ───────────────────────────────────────────────────────────────
   STYLES
   ─────────────────────────────────────────────────────────────── */
const CSS = `
/* Header: logo + search only. Text size, account and sign out
   live on the Account tab now. */
.app-hd .tt-wrap, .app-hd .acct-btn, .app-hd .btn-ghost { display:none !important; }

/* Space under the buttons. On iPhones with a home bar the safe area is
   about 34pt; the bar only needs to clear the indicator line itself,
   so it sits about 18pt lower than the full safe area. */
:root { --tb-h:50px; --tb-pad:max(4px, calc(env(safe-area-inset-bottom, 0px) - 18px)); }

.app-main { padding-bottom:calc(var(--tb-h) + var(--tb-pad) + 20px); }

/* ── Bottom bar ─────────────────────────────────── */
.tabbar {
  position:fixed; left:0; right:0; bottom:0; z-index:200;
  display:flex; justify-content:center;
  background:rgba(255,255,255,0.96);
  backdrop-filter:blur(12px); -webkit-backdrop-filter:blur(12px);
  border-top:1px solid var(--line);
  box-shadow:0 -6px 20px rgba(20,22,28,0.05);
  padding:0 env(safe-area-inset-right, 0px) var(--tb-pad) env(safe-area-inset-left, 0px);
}
.tabbar-in { display:flex; width:100%; max-width:560px; }
.tab {
  flex:1; position:relative; min-width:0; height:var(--tb-h);
  display:flex; flex-direction:column; align-items:center; justify-content:center; gap:3px;
  background:none; border:0; cursor:pointer; color:var(--ink-3);
  font-family:var(--sans); font-size:9px; font-weight:800; letter-spacing:1.6px; text-transform:uppercase;
  transition:color .15s;
}
.tab svg { width:21px; height:21px; flex-shrink:0; }
.tab::before {
  content:''; position:absolute; top:-1px; left:26%; right:26%; height:3px; border-radius:0 0 2px 2px;
  background:var(--grad); transform:scaleX(0); transition:transform .25s;
}
.tab.active { color:var(--blue); }
.tab.active::before { transform:scaleX(1); }
.tab:hover:not(.active) { color:var(--ink); }
.tab-lbl { font-variant-numeric:tabular-nums; white-space:nowrap; }
.tab-dot {
  display:none; position:absolute; top:6px; left:calc(50% + 9px);
  width:8px; height:8px; border-radius:50%; background:var(--gold);
  box-shadow:0 0 0 2px var(--paper); animation:pulse 2s ease-in-out infinite;
}
.tab.live .tab-dot { display:block; }
.tab[hidden] { display:none !important; }
.tab-badge {
  position:absolute; top:4px; left:calc(50% + 6px); min-width:17px; height:17px; padding:0 5px;
  border-radius:9px; background:var(--magenta); color:#fff; box-shadow:0 0 0 2px var(--paper);
  font-size:10px; font-weight:800; letter-spacing:0; line-height:17px; text-align:center;
}
.tab-badge[hidden] { display:none; }
.tab.live:not(.active) .tab-lbl { color:var(--gold-ink); letter-spacing:1px; font-size:10.5px; }

/* Toast and the install banner sit above the bar */
body:has(#s-app.active) .toast { bottom:calc(var(--tb-h) + var(--tb-pad) + 14px); }
#s-app.active ~ .install-banner { bottom:calc(var(--tb-h) + var(--tb-pad)); padding-bottom:16px; }

/* Shared page column for the new tabs */
.tb-col { width:min(calc(100% - 2 * var(--gut)), 560px); margin:0 auto; padding-top:18px; }
.tb-hero .day-hd { margin-bottom:0; }

/* ── Timer ──────────────────────────────────────── */
.tm-modes { display:flex; background:var(--paper); border:1px solid var(--line); border-radius:3px; overflow:hidden; margin-bottom:12px; }
.tm-mode {
  flex:1; min-width:0; font-family:var(--display); font-size:18px; letter-spacing:1.2px; line-height:1;
  padding:12px 0 10px; background:none; border:0; color:var(--ink-3); cursor:pointer;
  transition:background .15s, color .15s;
}
.tm-mode { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.tm-mode + .tm-mode { border-left:1px solid var(--line); }
@media (max-width:360px) {
  .tm-mode { font-size:15px; letter-spacing:.6px; }
  .tm-btn { letter-spacing:1.4px; }
  .tm-step button { width:40px; }
  .tm-step input { width:70px; }
}
.tm-mode:hover:not(.active):not(:disabled) { background:var(--wash); color:var(--ink); }
.tm-mode.active { background:var(--blue); color:#fff; }
.tm-mode:disabled:not(.active) { opacity:.4; cursor:default; }

.tm-face {
  --ph:var(--blue); --ph-ink:var(--blue);
  position:relative; overflow:hidden; text-align:center;
  background:var(--paper); border:1px solid var(--line); border-radius:4px;
  padding:28px 16px 22px; margin-bottom:10px; transition:border-color .2s;
}
.tm-face::before { content:''; position:absolute; top:0; left:0; right:0; height:5px; background:var(--ph); transition:background .2s; }
.tm-face[data-ph="ready"] { --ph:var(--ink); --ph-ink:var(--ink); }
.tm-face[data-ph="rest"]  { --ph:var(--gold); --ph-ink:var(--gold-ink); border-color:var(--gold-bdr); }
.tm-face[data-ph="done"]  { --ph:var(--magenta); --ph-ink:var(--magenta); }
.tm-face[data-ph="done"]::before { background:var(--grad); }
.tm-face[data-ph="rest"] .tm-time { color:var(--gold-ink); }
.tm-phase { font-size:10px; font-weight:800; letter-spacing:3.5px; text-transform:uppercase; color:var(--ph-ink); min-height:13px; }
.tm-time {
  font-family:var(--display); font-size:clamp(96px, 32vw, 168px); line-height:.86; color:var(--ink);
  margin:14px 0 8px; white-space:nowrap; transition:opacity .2s;
}
.tm-time .d { display:inline-block; width:.5em; text-align:center; }
.tm-time .c { display:inline-block; width:.24em; text-align:center; }
.tm-face.paused .tm-time { opacity:.4; }
@keyframes tm-fl-count { 0% { box-shadow:inset 0 0 0 3px var(--ph); } 100% { box-shadow:inset 0 0 0 0 transparent; } }
@keyframes tm-fl-big   { 0% { background:var(--ph); } 100% { background:var(--paper); } }
@keyframes tm-fl-ink   { 0% { color:#fff; } 100% { color:inherit; } }
.tm-face.fl-count { animation:tm-fl-count .45s ease-out; }
.tm-face.fl-big   { animation:tm-fl-big .6s ease-out; }
.tm-face.fl-big .tm-time, .tm-face.fl-big .tm-phase, .tm-face.fl-big .tm-sub { animation:tm-fl-ink .6s ease-out; }
.tm-sub { font-size:13.5px; font-weight:600; color:var(--ink-2); min-height:19px; }
.tm-bar { height:4px; background:var(--line); border-radius:2px; margin:18px 4px 0; overflow:hidden; }
.tm-bar i { display:block; height:100%; width:0; background:var(--ph); border-radius:2px; }
.tm-face.no-bar .tm-bar { visibility:hidden; }
.tm-snd {
  position:absolute; top:12px; right:10px; width:38px; height:38px;
  display:grid; place-items:center; background:none; border:0; border-radius:3px;
  color:var(--ink-3); cursor:pointer; transition:color .15s, background .15s;
}
.tm-snd:hover { background:var(--wash); color:var(--ink); }
.tm-snd svg { width:20px; height:20px; }

.tm-ctrls { display:flex; gap:8px; margin-bottom:14px; }
.tm-btn {
  flex:1; min-width:0; height:58px; border-radius:3px; cursor:pointer;
  border:1px solid var(--line); background:var(--paper); color:var(--ink-2);
  font-family:var(--sans); font-size:11px; font-weight:800; letter-spacing:2.2px; text-transform:uppercase;
  transition:background .15s, color .15s, border-color .15s, opacity .15s;
}
.tm-btn:hover:not(:disabled) { border-color:var(--blue); color:var(--blue); }
.tm-btn.go { flex:1.7; background:var(--blue); border-color:var(--blue); color:#fff; box-shadow:0 4px 16px rgba(0,68,223,0.26); }
.tm-btn.go:hover { background:var(--blue-deep); color:#fff; }
.tm-btn.go.pause { background:var(--gold); border-color:var(--gold); color:var(--ink); box-shadow:0 4px 16px rgba(220,142,9,0.3); }
.tm-btn.round { color:var(--blue); }
.tm-btn:disabled { opacity:.35; cursor:default; }

.tm-card { background:var(--paper); border:1px solid var(--line); border-radius:4px; padding:4px 16px; margin-bottom:12px; }
.tm-card[hidden] { display:none; }
.tm-row { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:12px 0; }
.tm-row + .tm-row { border-top:1px solid var(--line); }
.tm-row.stack { flex-direction:column; align-items:stretch; gap:9px; }
.tm-lbl { font-size:9px; font-weight:800; letter-spacing:2px; text-transform:uppercase; color:var(--ink-3); }
.tm-step { display:flex; border:1px solid var(--line); border-radius:3px; overflow:hidden; flex-shrink:0; }
.tm-step button {
  width:44px; height:44px; background:var(--wash); border:0; cursor:pointer;
  font-size:20px; line-height:1; color:var(--ink-2); transition:background .15s, color .15s;
}
.tm-step button:hover { background:var(--blue); color:#fff; }
.tm-step input {
  width:78px; border:0; border-left:1px solid var(--line); border-right:1px solid var(--line);
  text-align:center; font-family:var(--display); font-size:25px; padding-top:3px;
  color:var(--ink); background:var(--paper); outline:none;
}
.tm-step input:focus { background:var(--blue-soft); }
.tm-chips { display:flex; flex-wrap:wrap; gap:6px; }
.tm-chip {
  font-family:var(--sans); font-size:9.5px; font-weight:800; letter-spacing:1.4px; text-transform:uppercase;
  padding:9px 11px; border:1px solid var(--line); border-radius:3px; background:var(--paper);
  color:var(--ink-2); cursor:pointer; transition:border-color .15s, color .15s, background .15s;
}
.tm-chip:hover { border-color:var(--blue); color:var(--blue); }
.tm-chip.on { background:var(--blue-soft); border-color:var(--blue); color:var(--blue); }
.tm-sum { font-size:12.5px; line-height:1.5; color:var(--ink-3); text-align:center; padding:12px 0 10px; border-top:1px solid var(--line); }

.tm-laps-hd { display:flex; justify-content:space-between; padding:12px 0 8px; }
.tm-lap { display:flex; align-items:baseline; gap:10px; padding:10px 0; border-top:1px solid var(--line); }
.tm-lap-n { font-family:var(--display); font-size:19px; color:var(--blue); width:28px; }
.tm-lap-split { font-family:var(--display); font-size:22px; color:var(--ink); flex:1; }
.tm-lap-at { font-size:11.5px; font-weight:600; color:var(--ink-3); }

/* ── Account ────────────────────────────────────── */
.acc-card { background:var(--paper); border:1px solid var(--line); border-radius:4px; overflow:hidden; margin-bottom:12px; }
.acc-prof { display:flex; align-items:center; gap:14px; padding:18px 16px; }
.acc-av {
  width:56px; height:56px; flex-shrink:0; border-radius:3px; background:var(--blue); color:#fff;
  font-family:var(--display); font-size:32px; display:grid; place-items:center; padding-top:3px;
}
.acc-name { font-family:var(--display); font-size:30px; line-height:.95; color:var(--ink); overflow-wrap:anywhere; }
.acc-email { font-size:12.5px; color:var(--ink-3); margin-top:5px; overflow-wrap:anywhere; }
.acc-row {
  display:flex; align-items:center; justify-content:space-between; gap:14px; width:100%;
  padding:15px 16px; border:0; border-top:1px solid var(--line); background:none;
  font:inherit; color:inherit; text-align:left;
}
button.acc-row { cursor:pointer; transition:background .15s; }
button.acc-row:hover { background:var(--wash); }
.acc-row-lbl { font-weight:600; font-size:14px; color:var(--ink); }
.acc-row-desc { font-size:12px; line-height:1.45; color:var(--ink-3); margin-top:2px; }
.acc-chev { color:var(--ink-3); font-size:16px; flex-shrink:0; }
.acc-tt.tt-pop { display:flex !important; position:static; box-shadow:none; border:0; padding:0; flex-shrink:0; }
.acc-out {
  width:100%; height:52px; margin-top:4px; border-radius:3px; cursor:pointer;
  background:var(--paper); border:1px solid var(--line); color:var(--magenta);
  font-family:var(--sans); font-size:10.5px; font-weight:800; letter-spacing:2.4px; text-transform:uppercase;
  transition:background .15s, color .15s, border-color .15s;
}
.acc-out:hover { background:var(--magenta); border-color:var(--magenta); color:#fff; }
.acc-foot { text-align:center; font-size:9px; font-weight:700; letter-spacing:2.5px; text-transform:uppercase; color:var(--ink-3); padding:22px 0 6px; }

/* ── Compact day header (athlete) ───────────────── */
/* One line: [calendar] Thursday, November 5 [refresh], then the week. */
#v-day .hero { padding:10px 0 12px; }
#v-day .hero-in {
  display:grid; grid-template-columns:auto minmax(0, 1fr) auto; align-items:center; column-gap:10px; row-gap:10px;
}
#v-day .hero-bar { display:contents; }
#v-day .day-hd { grid-column:2; grid-row:1; margin:0; display:block; min-width:0; }
#v-day .day-sub { display:none; }
#v-day .day-title {
  font-size:clamp(28px, 8.4vw, 38px); line-height:1; padding-top:3px;
  white-space:nowrap; overflow:hidden;
}
#v-day #week-nav { grid-column:1 / -1; grid-row:2; }
#v-day .back-btn { grid-column:1; grid-row:1; }
#v-day #day-refresh-btn { grid-column:3; grid-row:1; }

/* Icon-only buttons, same size, words kept for screen readers */
#v-day .back-btn, #v-day #day-refresh-btn, #adm-detail .detail-back, #detail-refresh-btn, #adm-day-view .adm-day-back {
  position:relative; width:38px; height:38px; padding:0; margin:0; flex-shrink:0;
  font-size:0 !important; letter-spacing:0; color:var(--blue);
  background:var(--paper); border:1px solid var(--line); border-radius:3px; box-shadow:none;
  display:inline-flex; align-items:center; justify-content:center;
}
#v-day .back-btn:hover, #v-day #day-refresh-btn:hover, #adm-detail .detail-back:hover, #detail-refresh-btn:hover, #adm-day-view .adm-day-back:hover {
  border-color:var(--blue); background:var(--paper); color:var(--blue);
}
#v-day .back-btn::before, #adm-day-view .adm-day-back::before, #v-day #day-refresh-btn::before, #detail-refresh-btn::before, #adm-detail .detail-back::before {
  content:''; width:19px; height:19px; background:currentColor;
  -webkit-mask:var(--ico) center / contain no-repeat; mask:var(--ico) center / contain no-repeat;
}
#v-day .back-btn, #adm-day-view .adm-day-back {
  --ico:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='3.5' y='5' width='17' height='15.5' rx='2'/%3E%3Cpath d='M3.5 10h17M8 3v4M16 3v4'/%3E%3C/svg%3E");
}
#v-day #day-refresh-btn, #detail-refresh-btn {
  --ico:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M20 12a8 8 0 1 1-2.6-5.9'/%3E%3Cpath d='M20 4v5h-5'/%3E%3C/svg%3E");
}
#adm-detail .detail-back {
  --ico:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M15 5l-7 7 7 7'/%3E%3C/svg%3E");
}
#v-day #day-refresh-btn:disabled, #detail-refresh-btn:disabled { opacity:.5; }
#v-day #day-refresh-btn:disabled::before, #detail-refresh-btn:disabled::before { animation:spin .8s linear infinite; }

/* Shorter week strip (athlete and coach) */
.week-nav .wn-day { padding:6px 0 5px; gap:2px; border-top-width:3px; }
.week-nav .wn-n { font-size:clamp(19px, 5.4vw, 25px); }
.week-nav .wn-d { font-size:8px; }
.week-nav .wn-arr { flex-basis:28px; }

/* Less space before the first block */
#d-content { padding-top:12px; }
#d-content .logged-badge { margin-bottom:4px; }
#d-content > .logged-badge + .blk-wrap > .blk-lbl,
#d-content > .daily-note + .blk-wrap > .blk-lbl { margin-top:12px; }

/* ── Coach: an athlete's program, without the clutter ── */
#adm-detail[style*="block"] {
  display:grid !important; grid-template-columns:auto minmax(0, 1fr); align-items:center; column-gap:10px;
}
#adm-detail > * { grid-column:1 / -1; }
#adm-detail > .detail-back { grid-column:1; grid-row:1; }
#adm-detail > .detail-hd {
  grid-column:2; grid-row:1; margin:0; flex-wrap:nowrap; align-items:center; gap:10px; min-width:0;
}
#adm-detail .detail-hd > div:first-child { min-width:0; flex:1; }
#adm-detail .detail-name {
  font-size:clamp(24px, 7vw, 34px); line-height:1; padding-top:3px;
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
}
#adm-detail .detail-meta, #adm-detail .refresh-indicator { display:none !important; }
#adm-detail .adm-cal-nav { margin:14px 0 12px; align-items:center; }
#adm-detail .adm-cal-month { font-size:clamp(22px, 6vw, 30px); }
/* Inside a day, the month controls aren't needed */
#adm-detail:has(#adm-day-view.active) .adm-cal-nav { display:none; }
#adm-detail #adm-day-view.active {
  display:grid; grid-template-columns:auto minmax(0, 1fr); align-items:center; column-gap:10px; row-gap:10px; margin-top:12px;
}
#adm-day-view > * { grid-column:1 / -1; order:0 !important; }
#adm-day-view > .adm-day-back { grid-column:1; grid-row:1; align-self:center; }
#adm-day-view > .day-hd {
  grid-column:2; grid-row:1; margin:0; padding:0; border:0; background:none; display:block; min-width:0;
}
#adm-day-view .day-sub { display:none; }
#adm-day-view .day-title {
  font-size:clamp(26px, 7.6vw, 34px) !important; line-height:1; padding-top:3px;
  white-space:nowrap; overflow:hidden;
}
#adm-day-view > .week-nav { grid-row:2; margin:0 !important; }
#adm-day-view > #adm-day-content { grid-row:3; }

/* ── Coach panel: bottom bar on phones and tablets ─ */
#adm-tabbar { display:none; }
.adm-mobile-only { display:none !important; }
@media (max-width:899px) {
  #adm-tabbar { display:flex; }
  #s-admin .adm-tabs { display:none; }
  #s-admin .adm-hd .tt-wrap, #s-admin .adm-hd .btn-ghost, #adm-hd-name { display:none !important; }
  #s-admin .adm-main { padding-bottom:calc(var(--tb-h) + var(--tb-pad) + 24px); }
  /* Chat fills the screen between the header and the bar */
  #s-admin .ch-wrap.coach {
    height:calc(100dvh - var(--hd-h) - 3px - env(safe-area-inset-top, 0px) - 40px - var(--tb-h) - var(--tb-pad));
    min-height:360px;
  }
  body:has(#s-admin.active) .toast { bottom:calc(var(--tb-h) + var(--tb-pad) + 14px); }
  .adm-mobile-only { display:revert !important; }
  .setting-row.adm-mobile-only { display:flex !important; }
  .acc-out.adm-mobile-only { display:block !important; margin-top:22px; }
}

/* ── Chat (placeholder until messaging is built) ── */
.chat-empty { text-align:center; padding:48px 20px; background:var(--paper); border:1px solid var(--line); border-radius:4px; }
.chat-empty h2 { font-family:var(--display); font-weight:400; font-size:30px; line-height:1; color:var(--ink); margin-bottom:8px; }
.chat-empty p { font-size:13.5px; line-height:1.6; color:var(--ink-2); }
`;

/* ───────────────────────────────────────────────────────────────
   ICONS
   ─────────────────────────────────────────────────────────────── */
const svg = inner => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" ' +
  'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + inner + '</svg>';
const ICON = {
  train:   svg('<path d="M6.5 6.5v11M17.5 6.5v11M3.5 9.5v5M20.5 9.5v5M6.5 12h11"/>'),
  chat:    svg('<path d="M20.5 11.5a8 8 0 0 1-11.8 7L4 19.8l1.3-4.4A8 8 0 1 1 20.5 11.5z"/>'),
  timer:   svg('<circle cx="12" cy="13.5" r="7.5"/><path d="M12 13.5V9.6M9.8 2.5h4.4M18.6 6.9l1.6-1.6"/>'),
  account: svg('<circle cx="12" cy="8.3" r="4"/><path d="M4.5 20.5c1.2-3.7 4.1-5.6 7.5-5.6s6.3 1.9 7.5 5.6"/>'),
  sound:   svg('<path d="M4 9.5h3.4L12 5.6v12.8l-4.6-3.9H4z"/><path d="M15.6 9a4.2 4.2 0 0 1 0 6M18.2 6.4a7.8 7.8 0 0 1 0 11.2"/>'),
  muted:   svg('<path d="M4 9.5h3.4L12 5.6v12.8l-4.6-3.9H4z"/><path d="M16 9.6l4.8 4.8M20.8 9.6L16 14.4"/>'),
};

const TABS = [
  { id:'train',   label:'Train'   },
  { id:'chat',    label:'Chat' },
  { id:'timer',   label:'Timer'   },
  { id:'account', label:'Account' },
];
const TAB_ROUTES = ['chat', 'timer', 'account'];

/* ───────────────────────────────────────────────────────────────
   MARKUP
   ─────────────────────────────────────────────────────────────── */
function pageHero(title, sub, subId) {
  return '<section class="hero tb-hero"><div class="hero-photo" aria-hidden="true"></div><div class="hero-in">' +
    '<div class="day-hd"><div class="day-title">' + title + '</div>' +
    '<div class="day-sub"' + (subId ? ' id="' + subId + '"' : '') + '>' + sub + '</div></div></div></section>';
}

function injectMarkup() {
  const st = document.createElement('style');
  st.id = 'athlete-tabs-css';
  st.textContent = CSS;
  document.head.appendChild(st);

  const main = document.querySelector('#s-app .app-main');
  const app  = document.getElementById('s-app');
  if (!main || !app) { console.warn('athlete-tabs: athlete screen not found'); return false; }

  main.insertAdjacentHTML('beforeend',
    // Chat
    '<div id="v-chat" class="view">' + pageHero('Chat', 'Messages') +
      '<div class="tb-col"><div class="chat-empty"><h2>Coming soon</h2>' +
      '<p>Messages with your coach and your training group will live here.</p></div></div></div>' +

    // Timer
    '<div id="v-timer" class="view">' + pageHero('Timer', 'Workout clock', 'tm-kicker') +
      '<div class="tb-col">' +
        '<div class="tm-modes" id="tm-modes">' +
          '<button class="tm-mode" data-mode="fortime">For Time</button>' +
          '<button class="tm-mode" data-mode="amrap">AMRAP</button>' +
          '<button class="tm-mode" data-mode="emom">EMOM</button>' +
          '<button class="tm-mode" data-mode="intervals">Intervals</button>' +
        '</div>' +
        '<div class="tm-face" id="tm-face" data-ph="idle">' +
          '<button class="tm-snd" id="tm-snd" type="button" aria-label="Sound on"></button>' +
          '<div class="tm-phase" id="tm-phase"></div>' +
          '<div class="tm-time" id="tm-time" aria-live="off"></div>' +
          '<div class="tm-sub" id="tm-sub"></div>' +
          '<div class="tm-bar"><i id="tm-bar"></i></div>' +
        '</div>' +
        '<div class="tm-ctrls">' +
          '<button class="tm-btn" id="tm-reset" type="button">Reset</button>' +
          '<button class="tm-btn go" id="tm-go" type="button">Start</button>' +
          '<button class="tm-btn round" id="tm-round" type="button">+ Round</button>' +
        '</div>' +
        '<div class="tm-card" id="tm-setup"></div>' +
        '<div class="tm-card" id="tm-laps" hidden></div>' +
      '</div>' +
    '</div>' +

    // Account
    '<div id="v-account" class="view">' + pageHero('Account', 'Trainderive') +
      '<div class="tb-col">' +
        '<div class="acc-card">' +
          '<div class="acc-prof"><div class="acc-av" id="acc-av">A</div>' +
            '<div style="min-width:0"><div class="acc-name" id="acc-name"></div><div class="acc-email" id="acc-email"></div></div></div>' +
          '<button class="acc-row" type="button" onclick="openAccountSettings()">' +
            '<div><div class="acc-row-lbl">Profile &amp; password</div>' +
            '<div class="acc-row-desc">Change your name, email or password</div></div>' +
            '<span class="acc-chev">&#8250;</span></button>' +
        '</div>' +
        '<div class="acc-card">' +
          '<div class="acc-row"><div><div class="acc-row-lbl">Text size</div>' +
            '<div class="acc-row-desc">For your workouts and results</div></div>' +
            '<div class="tt-pop acc-tt">' +
              '<button class="tt-step" onclick="stepTextSize(-1)" aria-label="Smaller text"><span style="font-size:13px">T</span></button>' +
              '<div class="tt-level"></div>' +
              '<button class="tt-step" onclick="stepTextSize(1)" aria-label="Larger text"><span style="font-size:22px">T</span></button>' +
            '</div></div>' +
        '</div>' +
        '<button class="acc-out" type="button" onclick="doLogout()">Sign Out</button>' +
        '<div class="acc-foot">Trainderive &middot; By Frank Nguyen</div>' +
      '</div>' +
    '</div>');

  const bar = document.createElement('nav');
  bar.className = 'tabbar';
  bar.setAttribute('aria-label', 'Main');
  bar.innerHTML = '<div class="tabbar-in">' + TABS.map(t =>
    '<button class="tab' + (t.id === 'train' ? ' active' : '') + '" id="tab-' + t.id + '" data-tab="' + t.id + '" type="button"' +
      (t.id === 'chat' && !chatOn ? ' hidden' : '') + '>' +
      ICON[t.id] + '<span class="tab-lbl" id="tab-' + t.id + '-lbl">' + t.label + '</span><span class="tab-dot"></span>' +
      (t.id === 'chat' ? '<span class="tab-badge" id="tab-chat-badge" hidden></span>' : '') +
    '</button>').join('') + '</div>';
  app.appendChild(bar);
  bar.addEventListener('click', e => {
    const b = e.target.closest('[data-tab]');
    if (b) tabGo(b.dataset.tab);
  });
  return true;
}

/* ───────────────────────────────────────────────────────────────
   NAVIGATION
   Train keeps its existing routes (#cal, #day/…); the new tabs get
   #chat, #timer and #account. Leaving Train and coming back shows it
   exactly as it was left, scroll position and half-typed results
   included, unless the program changed in the meantime.
   ─────────────────────────────────────────────────────────────── */
function viewActive(id) { const v = document.getElementById(id); return !!(v && v.classList.contains('active')); }
function trainActive()  { return viewActive('v-cal') || viewActive('v-day'); }

function showView(id) {
  document.querySelectorAll('#s-app .view').forEach(v => v.classList.toggle('active', v.id === id));
}

function setActiveTab(id) {
  document.querySelectorAll('#s-app .tabbar .tab').forEach(t => t.classList.toggle('active', t.dataset.tab === id));
  tmTabLabel();
}

function tabGo(tab) {
  if (tab === 'train') {
    if (trainActive()) {
      // Already here: a second tap goes back to today.
      window.scrollTo(0, 0);
      const lt = S.lastTrain;
      if (!(lt && lt.route === 'day' && lt.date === isoToday())) openBestDay(null);
      return;
    }
    const lt = S.lastTrain;
    if (!lt) { openBestDay(null); return; }
    if (S.trainStale) { navTo(lt.route, lt.date ? { date: lt.date } : {}); return; }
    const hash = lt.route === 'day' ? '#day/' + lt.date : '#cal';
    history.pushState(lt.route === 'day' ? { route:'day', date: lt.date } : { route:'cal' }, '', hash);
    showView(lt.route === 'day' ? 'v-day' : 'v-cal');
    setActiveTab('train');
    const y = S.trainScroll || 0;
    requestAnimationFrame(() => window.scrollTo(0, y));
    return;
  }

  if (viewActive('v-' + tab)) {
    window.scrollTo(0, 0);
    document.dispatchEvent(new CustomEvent('td:tabreselect', { detail: tab }));   // e.g. Chat → back to the inbox
    return;
  }
  if (trainActive()) {
    S.trainScroll = window.scrollY;
    if (viewActive('v-day') && S.selDate) saveDraft(S.selDate);   // nothing typed is lost
  }
  navTo(tab);
  window.scrollTo(0, 0);
}

function patchMainScript() {
  const _applyRoute = window.applyRoute;
  window.applyRoute = function (route, opts) {
    opts = opts || {};
    if (TAB_ROUTES.indexOf(route) !== -1) {
      if (!S.user) { history.replaceState({ route:'login' }, '', '#login'); showScreen('s-login'); return; }
      if (S.user.role === 'coach') { _applyRoute('admin'); return; }
      if (route === 'chat' && !chatOn) route = 'timer';
      showScreen('s-app');
      showView('v-' + route);
      setActiveTab(route);
      if (route === 'account') renderAccount();
      if (route === 'timer')   tmRender();
      return;
    }
    _applyRoute(route, opts);
    if (route === 'cal' || route === 'day') {
      S.lastTrain  = route === 'day' ? { route:'day', date: opts.date } : { route:'cal' };
      S.trainStale = false;
      ['v-chat', 'v-timer', 'v-account'].forEach(id => {
        const v = document.getElementById(id); if (v) v.classList.remove('active');
      });
      setActiveTab('train');
    }
  };

  // Opened straight onto a tab (e.g. #timer saved to the home screen):
  // land there once the program has loaded instead of on today.
  const _openBestDay = window.openBestDay;
  window.openBestDay = function (target) {
    if (S.pendingTab) {
      let tab = S.pendingTab;
      if (tab === 'chat' && !chatOn) tab = 'timer';
      S.pendingTab = null;
      S.lastTrain  = null;    // Train picks the best day when first opened
      navTo(tab);
      return;
    }
    _openBestDay(target);
  };

  // A background refresh while the athlete is on another tab is
  // applied when they come back to Train, not underneath them.
  const _refresh = window.refreshCurrentView;
  window.refreshCurrentView = function () {
    if (trainActive()) { _refresh(); return; }
    S.trainStale = true;
  };

  const _showHeader = window.showAthleteHeader;
  window.showAthleteHeader = function (user) {
    _showHeader(user);
    renderAccount();
  };

  const _logout = window.doLogout;
  window.doLogout = async function () {
    tmReset();
    S.pendingTab = null; S.lastTrain = null; S.trainStale = false; S.trainScroll = 0;
    await _logout();
    showView('v-cal');
    setActiveTab('train');
  };

  const m = /^#(chat|timer|account)$/.exec(BOOT_HASH);
  if (m) S.pendingTab = m[1];
}

/* ───────────────────────────────────────────────────────────────
   ACCOUNT
   ─────────────────────────────────────────────────────────────── */
function renderAccount() {
  const u = S.user;
  if (!u) return;
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set('acc-name',  u.name || 'Athlete');
  set('acc-email', u.email || '');
  set('acc-av',    (u.name || '?').charAt(0).toUpperCase());
  if (typeof applyTextScale === 'function') applyTextScale();
}

/* ───────────────────────────────────────────────────────────────
   TIMER — the clock
   All timing comes from the wall clock, never from counting ticks,
   so it stays exact through a locked phone or a backgrounded app.
   ─────────────────────────────────────────────────────────────── */
const TM_KEY = 'td_timer_v1';
const TM_DEFAULT = {
  mode: 'fortime',
  lead: 10,                                   // get-ready countdown, seconds
  sound: true,
  fortime:   { capOn: false, cap: 20 * 60 },
  amrap:     { dur: 12 * 60 },
  emom:      { every: 60, rounds: 10 },
  intervals: { work: 20, rest: 10, rounds: 8 },
};
const TM_FIELDS = {
  'fortime.cap':      { kind:'time',  step:60, min:60, max:5999 },
  'amrap.dur':        { kind:'time',  step:60, min:60, max:5999 },
  'emom.every':       { kind:'time',  step:15, min:15, max:1200 },
  'emom.rounds':      { kind:'count', step:1,  min:1,  max:99 },
  'intervals.work':   { kind:'time',  step:5,  min:5,  max:3600 },
  'intervals.rest':   { kind:'time',  step:5,  min:0,  max:3600 },
  'intervals.rounds': { kind:'count', step:1,  min:1,  max:99 },
};
const TM_PRESETS = [
  { label:'Tabata', work:20, rest:10, rounds:8 },
  { label:'30 / 30', work:30, rest:30, rounds:10 },
  { label:'40 / 20', work:40, rest:20, rounds:10 },
  { label:'45 / 15', work:45, rest:15, rounds:8 },
];
const TM_LEADS = [0, 5, 10, 15];
const MODE_NAME = { fortime:'For Time', amrap:'AMRAP', emom:'EMOM', intervals:'Intervals' };

const TM = {
  cfg: loadCfg(),
  state: 'idle',        // idle | running | paused | done
  phases: null,         // fixed when Start is pressed
  startAt: 0,           // Date.now() at start, pushed forward by pauses
  pausedAt: 0,
  endEl: 0,
  laps: [],             // seconds into the work, one per tapped round
  capHit: false,
  lastPhase: -1,
  lastCount: '',
  ticker: null,
};

function loadCfg() {
  const c = JSON.parse(JSON.stringify(TM_DEFAULT));
  try {
    const saved = JSON.parse(localStorage.getItem(TM_KEY) || 'null');
    if (saved && typeof saved === 'object') {
      ['mode', 'lead', 'sound'].forEach(k => { if (saved[k] !== undefined) c[k] = saved[k]; });
      ['fortime', 'amrap', 'emom', 'intervals'].forEach(k => { if (saved[k]) Object.assign(c[k], saved[k]); });
    }
  } catch (e) {}
  if (!MODE_NAME[c.mode]) c.mode = 'fortime';
  return c;
}
function saveCfg() { try { localStorage.setItem(TM_KEY, JSON.stringify(TM.cfg)); } catch (e) {} }
function cfgGet(path) { return path.split('.').reduce((o, k) => o[k], TM.cfg); }
function cfgSet(path, v) {
  const ks = path.split('.'), last = ks.pop();
  ks.reduce((o, k) => o[k], TM.cfg)[last] = v;
  saveCfg();
}

// The whole workout as a list of phases.
function buildPhases(c) {
  const p = [];
  if (c.lead > 0) p.push({ kind:'ready', dur:c.lead, dir:'down' });
  if (c.mode === 'fortime') {
    p.push({ kind:'work', dur: c.fortime.capOn ? c.fortime.cap : Infinity, dir:'up' });
  } else if (c.mode === 'amrap') {
    p.push({ kind:'work', dur:c.amrap.dur, dir:'down' });
  } else if (c.mode === 'emom') {
    for (let r = 1; r <= c.emom.rounds; r++) p.push({ kind:'work', dur:c.emom.every, dir:'down', round:r, of:c.emom.rounds });
  } else {
    const iv = c.intervals;
    for (let r = 1; r <= iv.rounds; r++) {
      p.push({ kind:'work', dur:iv.work, dir:'down', round:r, of:iv.rounds });
      if (iv.rest > 0 && r < iv.rounds) p.push({ kind:'rest', dur:iv.rest, dir:'down', round:r, of:iv.rounds });
    }
  }
  return p;
}

// Where `el` seconds lands in the phase list.
function locate(phases, el) {
  let t = 0;
  for (let i = 0; i < phases.length; i++) {
    const ph = phases[i];
    if (el < t + ph.dur) return { i, ph, inPh: el - t, remain: t + ph.dur - el, start: t };
    t += ph.dur;
  }
  return { done: true, i: phases.length, total: t };
}
const totalOf = phases => phases.reduce((s, p) => s + p.dur, 0);
const leadOf  = phases => (phases[0] && phases[0].kind === 'ready') ? phases[0].dur : 0;

function tmElapsed() {
  if (TM.state === 'running') return (Date.now() - TM.startAt) / 1000;
  if (TM.state === 'paused')  return (TM.pausedAt - TM.startAt) / 1000;
  if (TM.state === 'done')    return TM.endEl;
  return 0;
}

function fmt(sec) {
  sec = Math.max(0, Math.floor(sec));
  const h = Math.floor(sec / 3600), m = Math.floor(sec / 60) % 60, s = sec % 60;
  return h ? h + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0')
           : m + ':' + String(s).padStart(2, '0');
}
function fmtShort(sec) {
  if (sec < 60) return sec + 's';
  if (sec % 60 === 0) return (sec / 60) + ' min';
  return fmt(sec);
}
const roundsTxt = n => n + (n === 1 ? ' round' : ' rounds');

/* ── Sound ─────────────────────────────────────────── */
// Beeps play OVER the athlete's music, never instead of it. "ambient"
// tells the phone this sound mixes with other audio (and, like other
// ambient sounds, follows the Silent switch). Must be set before any
// sound starts. Safari 16.4+; older phones ignore it.
function setAmbientAudio() {
  try { if (navigator.audioSession && navigator.audioSession.type !== 'ambient') navigator.audioSession.type = 'ambient'; } catch (e) {}
}
setAmbientAudio();

let audio = null;
function unlockAudio() {
  try {
    setAmbientAudio();
    if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
    // iOS only lets sound play after it has played something inside a tap.
    const b = audio.createBuffer(1, 1, 22050), src = audio.createBufferSource();
    src.buffer = b; src.connect(audio.destination); src.start(0);
  } catch (e) { audio = null; }
}
// iPhone can stop a web app's sound after the screen locks or another
// app plays audio. Wake it back up before every beep.
// Only while a workout is on the clock, so the app isn't holding the
// phone's audio while someone is just reading their programming.
function wakeAudio(force) {
  if (!force && TM.state !== 'running' && TM.state !== 'paused') return;
  try { if (audio && audio.state !== 'running') audio.resume(); } catch (e) {}
}
// Let go of the phone's audio once the clock stops.
function sleepAudio() {
  if (TM.state === 'running' || TM.state === 'paused') return;
  try { if (audio && audio.state === 'running') audio.suspend(); } catch (e) {}
}
function tone(freq, dur, at) {
  if (!audio || !TM.cfg.sound) return;
  wakeAudio(true);
  try {
    const t = audio.currentTime + (at || 0);
    const o = audio.createOscillator(), g = audio.createGain();
    o.type = 'square'; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.18, t + 0.01);
    g.gain.setValueAtTime(0.18, t + dur - 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(audio.destination);
    o.start(t); o.stop(t + dur + 0.02);
  } catch (e) {}
}
const buzz = ms => { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) {} };
// A visual cue alongside every beep, for a phone on silent or a loud gym.
function flash(kind) {
  const f = document.getElementById('tm-face');
  if (!f) return;
  f.classList.remove('fl-count', 'fl-big');
  void f.offsetWidth;             // restart the animation if it's mid-flash
  f.classList.add(kind === 'count' ? 'fl-count' : 'fl-big');
}
const cue = {
  count: () => { tone(660, 0.12); flash('count'); },
  go:    () => { tone(990, 0.55); buzz(250); flash('big'); },
  rest:  () => { tone(520, 0.55); buzz(250); flash('big'); },
  end:   () => { tone(990, 0.22); tone(990, 0.22, 0.3); tone(1320, 0.7, 0.6); buzz([200, 100, 200, 100, 400]); flash('big'); },
};

/* ── Keep the screen on while the clock runs ───────── */
let wake = null;
async function keepAwake(on) {
  try {
    if (on && !wake && 'wakeLock' in navigator) {
      wake = await navigator.wakeLock.request('screen');
      wake.addEventListener('release', () => { wake = null; });
    } else if (!on && wake) {
      const w = wake; wake = null; await w.release();
    }
  } catch (e) { wake = null; }
}

/* ── Controls ──────────────────────────────────────── */
function tmStart() {
  unlockAudio();
  TM.phases = buildPhases(TM.cfg);
  TM.startAt = Date.now();
  TM.laps = []; TM.capHit = false; TM.endEl = 0;
  TM.lastPhase = -1; TM.lastCount = '';
  TM.state = 'running';
  keepAwake(true);
  startTicker();
  tmTick();
  tmRender();
}
function tmPause() {
  if (TM.state !== 'running') return;
  TM.pausedAt = Date.now();
  TM.state = 'paused';
  stopTicker();
  tmRender();
}
function tmResume() {
  if (TM.state !== 'paused') return;
  unlockAudio();
  TM.startAt += Date.now() - TM.pausedAt;
  TM.state = 'running';
  keepAwake(true);
  startTicker();
  tmTick();
  tmRender();
}
function tmReset() {
  stopTicker();
  keepAwake(false);
  TM.state = 'idle'; TM.phases = null; TM.laps = []; TM.capHit = false;
  sleepAudio();
  tmRender();
}
function tmFinish(el, capHit) {
  TM.state = 'done';
  TM.endEl = el;
  TM.capHit = !!capHit;
  stopTicker();
  keepAwake(false);
  cue.end();
  setTimeout(sleepAudio, 2500);   // after the finish beeps have played
  tmRender();
}
function tmRound() {
  if (TM.state !== 'running') return;
  const loc = locate(TM.phases, tmElapsed());
  if (loc.done || loc.ph.kind !== 'work') return;
  TM.laps.push(loc.inPh);
  tone(880, 0.08); buzz(40);
  tmRender();
}
function startTicker() { stopTicker(); TM.ticker = setInterval(tmTick, 100); }
function stopTicker()  { if (TM.ticker) { clearInterval(TM.ticker); TM.ticker = null; } }

function tmTick() {
  if (TM.state !== 'running') return;
  const el = tmElapsed();
  const loc = locate(TM.phases, el);
  if (loc.done) {
    const work = TM.phases[TM.phases.length - 1];
    tmFinish(loc.total, TM.cfg.mode === 'fortime' && work && work.dur !== Infinity);
    return;
  }

  // Phase changed: cue it, unless the phone was asleep through it.
  if (loc.i !== TM.lastPhase) {
    if (loc.inPh < 1.5) {
      if (loc.ph.kind === 'work') cue.go();
      else if (loc.ph.kind === 'rest') cue.rest();
    }
    TM.lastPhase = loc.i;
  }

  // 3-2-1 before the end of every timed phase.
  if (loc.ph.dur !== Infinity) {
    const n = Math.ceil(loc.remain);
    const key = loc.i + ':' + n;
    if (n >= 1 && n <= 3 && key !== TM.lastCount && (n - loc.remain) < 0.6) cue.count();
    TM.lastCount = key;
  }

  tmRenderFace();
  tmTabLabel();
}

/* ── What the face shows ───────────────────────────── */
function faceState() {
  const c = TM.cfg, mode = c.mode;

  if (TM.state === 'idle') {
    const sub = {
      fortime:   c.fortime.capOn ? 'Time cap ' + fmt(c.fortime.cap) : 'Counts up until you stop it',
      amrap:     'As many rounds as possible',
      emom:      roundsTxt(c.emom.rounds) + ' \u00B7 ' + fmt(c.emom.every * c.emom.rounds),
      intervals: roundsTxt(c.intervals.rounds) + ' \u00B7 ' + fmt(totalOf(buildPhases(Object.assign({}, c, { lead: 0 })))),
    }[mode];
    const t = { fortime: 0, amrap: c.amrap.dur, emom: c.emom.every, intervals: c.intervals.work }[mode];
    return { ph:'idle', label: MODE_NAME[mode], time: fmt(t), sub, bar: null };
  }

  const phases = TM.phases, lead = leadOf(phases);

  if (TM.state === 'done') {
    const workTime = TM.endEl - lead;
    if (mode === 'fortime') return { ph:'done', label: TM.capHit ? 'Time Cap' : 'Done', time: fmt(workTime),
      sub: TM.laps.length ? roundsTxt(TM.laps.length) : 'Nice work', bar: null };
    if (mode === 'amrap')   return { ph:'done', label:'Time', time: '0:00',
      sub: TM.laps.length ? roundsTxt(TM.laps.length) : 'AMRAP complete', bar: 1 };
    const n = mode === 'emom' ? c.emom.rounds : c.intervals.rounds;
    return { ph:'done', label:'Done', time: fmt(workTime), sub: roundsTxt(n) + ' complete', bar: 1 };
  }

  const el = tmElapsed(), loc = locate(phases, el);
  if (loc.done) return { ph:'done', label:'Done', time: fmt(totalOf(phases) - lead), sub:'', bar: 1 };
  const ph = loc.ph;
  const time = ph.dir === 'up' ? fmt(loc.inPh) : fmt(Math.ceil(loc.remain - 1e-6));

  if (ph.kind === 'ready') return { ph:'ready', label:'Get Ready', time, sub: MODE_NAME[mode] + ' starts', bar: loc.inPh / ph.dur };

  const left = fmt(Math.ceil(totalOf(phases) - el - 1e-6)) + ' left';
  if (mode === 'fortime') {
    const capOn = ph.dur !== Infinity;
    const bits = [];
    if (TM.laps.length) bits.push(roundsTxt(TM.laps.length));
    if (capOn) bits.push('cap ' + fmt(ph.dur));
    return { ph:'work', label:'For Time', time, sub: bits.join(' \u00B7 ') || 'Tap + Round as you go', bar: capOn ? loc.inPh / ph.dur : null };
  }
  if (mode === 'amrap') {
    return { ph:'work', label:'AMRAP', time,
      sub: TM.laps.length ? roundsTxt(TM.laps.length) : 'Tap + Round as you go', bar: loc.inPh / ph.dur };
  }
  return { ph: ph.kind, label: mode === 'emom' ? 'EMOM' : (ph.kind === 'rest' ? 'Rest' : 'Work'), time,
    sub: 'Round ' + ph.round + ' of ' + ph.of + ' \u00B7 ' + left, bar: loc.inPh / ph.dur };
}

// Each digit gets a fixed-width box, so the clock doesn't wobble
// as the numbers change.
function timeHTML(t) {
  return t.split('').map(ch => ch === ':' ? '<span class="c">:</span>' : '<span class="d">' + ch + '</span>').join('');
}

let lastFace = '';
function tmRenderFace() {
  const f = faceState();
  const face = document.getElementById('tm-face');
  if (!face) return;
  const sig = [f.ph, f.label, f.time, f.sub, TM.state].join('|');
  if (sig !== lastFace) {
    lastFace = sig;
    face.dataset.ph = f.ph;
    face.classList.toggle('paused', TM.state === 'paused');
    face.classList.toggle('no-bar', f.bar === null);
    document.getElementById('tm-phase').textContent = TM.state === 'paused' ? 'Paused \u00B7 ' + f.label : f.label;
    document.getElementById('tm-time').innerHTML = timeHTML(f.time);
    document.getElementById('tm-sub').textContent = f.sub;
  }
  document.getElementById('tm-bar').style.width = (f.bar === null ? 0 : Math.min(1, Math.max(0, f.bar)) * 100) + '%';
}

// While the clock runs, the Timer tab shows it — handy when flipping
// back to the workout mid-session.
function tmTabLabel() {
  const tab = document.getElementById('tab-timer'), lbl = document.getElementById('tab-timer-lbl');
  if (!tab || !lbl) return;
  const live = TM.state === 'running' || TM.state === 'paused';
  tab.classList.toggle('live', live);
  lbl.textContent = (live && !tab.classList.contains('active')) ? faceState().time : 'Timer';
}

/* ── Controls + setup panel ────────────────────────── */
function stepperHTML(path, label) {
  const f = TM_FIELDS[path], v = cfgGet(path);
  return '<div class="tm-row"><span class="tm-lbl">' + label + '</span>' +
    '<div class="tm-step">' +
      '<button type="button" data-step="' + path + '" data-dir="-1" aria-label="Less">\u2212</button>' +
      '<input type="text" inputmode="' + (f.kind === 'count' ? 'numeric' : 'text') + '" data-field="' + path + '" value="' +
        (f.kind === 'count' ? v : fmt(v)) + '" aria-label="' + label + '" autocomplete="off">' +
      '<button type="button" data-step="' + path + '" data-dir="1" aria-label="More">+</button>' +
    '</div></div>';
}

function setupHTML() {
  const c = TM.cfg, rows = [];
  if (c.mode === 'fortime') {
    rows.push('<div class="tm-row"><span class="tm-lbl">Time cap</span>' +
      '<label class="toggle"><input type="checkbox" data-cap ' + (c.fortime.capOn ? 'checked' : '') + '>' +
      '<span class="toggle-slider"></span></label></div>');
    if (c.fortime.capOn) rows.push(stepperHTML('fortime.cap', 'Cap'));
  } else if (c.mode === 'amrap') {
    rows.push(stepperHTML('amrap.dur', 'Duration'));
  } else if (c.mode === 'emom') {
    rows.push(stepperHTML('emom.every', 'Every'));
    rows.push(stepperHTML('emom.rounds', 'Rounds'));
  } else {
    const iv = c.intervals;
    rows.push('<div class="tm-row stack"><span class="tm-lbl">Presets</span><div class="tm-chips">' +
      TM_PRESETS.map((p, i) => '<button type="button" class="tm-chip' +
        (p.work === iv.work && p.rest === iv.rest && p.rounds === iv.rounds ? ' on' : '') +
        '" data-preset="' + i + '">' + p.label + '</button>').join('') + '</div></div>');
    rows.push(stepperHTML('intervals.work', 'Work'));
    rows.push(stepperHTML('intervals.rest', 'Rest'));
    rows.push(stepperHTML('intervals.rounds', 'Rounds'));
  }
  rows.push('<div class="tm-row"><span class="tm-lbl">Countdown</span><div class="tm-chips">' +
    TM_LEADS.map(s => '<button type="button" class="tm-chip' + (c.lead === s ? ' on' : '') + '" data-lead="' + s + '">' +
      (s ? s + 's' : 'Off') + '</button>').join('') + '</div></div>');
  return rows.join('') + '<div class="tm-sum">' + summary() + '</div>';
}

function summary() {
  const c = TM.cfg;
  if (c.mode === 'fortime') return c.fortime.capOn ? 'Counts up and stops at ' + fmt(c.fortime.cap) : 'Counts up until you pause it';
  if (c.mode === 'amrap')   return fmt(c.amrap.dur) + ' on the clock, counting down';
  if (c.mode === 'emom')    return 'A new round every ' + fmtShort(c.emom.every) + ', ' + c.emom.rounds + ' times \u00B7 ' + fmt(c.emom.every * c.emom.rounds) + ' total';
  const iv = c.intervals;
  return fmtShort(iv.work) + ' on' + (iv.rest ? ' / ' + fmtShort(iv.rest) + ' off' : '') + ' \u00D7 ' + iv.rounds +
    ' \u00B7 ' + fmt(totalOf(buildPhases(Object.assign({}, c, { lead: 0 })))) + ' total';
}

function lapsHTML() {
  if (!TM.laps.length) return '';
  let prev = 0;
  const rows = TM.laps.map((t, i) => { const split = t - prev; prev = t; return { n: i + 1, split, at: t }; }).reverse();
  return '<div class="tm-laps-hd"><span class="tm-lbl">Rounds</span><span class="tm-lbl">' + TM.laps.length + '</span></div>' +
    rows.map(r => '<div class="tm-lap"><span class="tm-lap-n">' + r.n + '</span>' +
      '<span class="tm-lap-split">' + fmt(r.split) + '</span><span class="tm-lap-at">at ' + fmt(r.at) + '</span></div>').join('');
}

function tmRender() {
  const c = TM.cfg, idle = TM.state === 'idle';
  const modes = document.getElementById('tm-modes');
  if (!modes) return;

  modes.querySelectorAll('.tm-mode').forEach(b => {
    b.classList.toggle('active', b.dataset.mode === c.mode);
    b.disabled = !idle;
  });

  const setup = document.getElementById('tm-setup');
  setup.hidden = !idle;
  // Don't redraw underneath a box the athlete is typing in.
  const typing = document.activeElement && setup.contains(document.activeElement) &&
                 document.activeElement.matches('[data-field]');
  if (idle && !typing) setup.innerHTML = setupHTML();

  const go = document.getElementById('tm-go');
  go.textContent = { idle:'Start', running:'Pause', paused:'Resume', done:'Go Again' }[TM.state];
  go.classList.toggle('pause', TM.state === 'running');

  const reset = document.getElementById('tm-reset');
  reset.disabled = idle || TM.state === 'running';    // pause first, so a stray tap can't wipe a workout

  const round = document.getElementById('tm-round');
  round.style.display = (c.mode === 'fortime' || c.mode === 'amrap') ? '' : 'none';
  round.disabled = TM.state !== 'running';

  const snd = document.getElementById('tm-snd');
  snd.innerHTML = c.sound ? ICON.sound : ICON.muted;
  snd.setAttribute('aria-label', c.sound ? 'Sound on' : 'Sound off');

  const laps = document.getElementById('tm-laps');
  const lh = (c.mode === 'fortime' || c.mode === 'amrap') ? lapsHTML() : '';
  laps.hidden = !lh;
  laps.innerHTML = lh;

  const k = document.getElementById('tm-kicker');
  if (k) k.textContent = idle ? 'Workout clock' : MODE_NAME[c.mode];

  lastFace = '';
  tmRenderFace();
  tmTabLabel();
}

function commitField(input) {
  const path = input.dataset.field, f = TM_FIELDS[path];
  const txt = String(input.value).trim();
  let v = null;
  if (f.kind === 'count') {
    if (/^\d+$/.test(txt)) v = parseInt(txt, 10);
  } else {
    const m = txt.match(/^(\d{1,3})\s*[:.]\s*(\d{1,2})$/);
    if (m) v = parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
    else if (/^\d+$/.test(txt)) v = parseInt(txt, 10) * (f.step >= 60 ? 60 : 1);   // "12" = 12 min for caps, 12 s for work/rest
  }
  if (v !== null) cfgSet(path, Math.min(f.max, Math.max(f.min, v)));
  input.blur();
  tmRender();
}

function wireTimer() {
  const view = document.getElementById('v-timer');
  if (!view) return;

  view.addEventListener('click', e => {
    const t = e.target;
    const mode = t.closest('[data-mode]');
    if (mode && TM.state === 'idle') { TM.cfg.mode = mode.dataset.mode; saveCfg(); tmRender(); return; }

    const step = t.closest('[data-step]');
    if (step) {
      const path = step.dataset.step, f = TM_FIELDS[path], dir = +step.dataset.dir;
      const cur = cfgGet(path);
      // Snap to the step, so 0:47 then + goes to 0:50, not 0:52.
      const next = dir > 0 ? Math.floor(cur / f.step) * f.step + f.step : Math.ceil(cur / f.step) * f.step - f.step;
      cfgSet(path, Math.min(f.max, Math.max(f.min, next)));
      tmRender();
      return;
    }

    const pre = t.closest('[data-preset]');
    if (pre) { const p = TM_PRESETS[+pre.dataset.preset]; Object.assign(TM.cfg.intervals, { work:p.work, rest:p.rest, rounds:p.rounds }); saveCfg(); tmRender(); return; }

    const lead = t.closest('[data-lead]');
    if (lead) { TM.cfg.lead = +lead.dataset.lead; saveCfg(); tmRender(); return; }

    if (t.closest('#tm-go')) {
      if (TM.state === 'idle') tmStart();
      else if (TM.state === 'running') tmPause();
      else if (TM.state === 'paused') tmResume();
      else { tmReset(); tmStart(); }
      return;
    }
    if (t.closest('#tm-reset')) { tmReset(); return; }
    if (t.closest('#tm-round')) { tmRound(); return; }
    if (t.closest('#tm-snd'))   {
      TM.cfg.sound = !TM.cfg.sound; saveCfg();
      if (TM.cfg.sound) { unlockAudio(); tone(880, 0.08); setTimeout(sleepAudio, 600); }
      tmRender();
    }
  });

  view.addEventListener('change', e => {
    if (e.target.matches('[data-cap]')) { cfgSet('fortime.capOn', e.target.checked); tmRender(); return; }
    if (e.target.matches('[data-field]')) commitField(e.target);
  });
  view.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.matches('[data-field]')) { e.preventDefault(); commitField(e.target); }
  });
  view.addEventListener('focusin', e => { if (e.target.matches('[data-field]')) e.target.select(); });

  // Space bar starts and pauses on a laptop.
  document.addEventListener('keydown', e => {
    if (e.key !== ' ' || !viewActive('v-timer')) return;
    if (e.target.closest('input, textarea, select, button')) return;
    e.preventDefault();
    document.getElementById('tm-go').click();
  });

  // iPhone sometimes only lets sound restart during a tap, so any tap
  // in the app (switching tabs, typing a result) wakes it up too.
  document.addEventListener('touchend', () => wakeAudio(), { passive: true });
  document.addEventListener('click', () => wakeAudio());

  // Back from the lock screen or another app: catch the clock up at
  // once and ask for the screen to stay on again.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    wakeAudio();
    if (TM.state === 'running') { keepAwake(true); tmTick(); }
    else if (TM.state === 'paused') keepAwake(true);
  });
}

/* ───────────────────────────────────────────────────────────────
   START
   ─────────────────────────────────────────────────────────────── */
if (typeof S === 'undefined' || typeof applyRoute !== 'function') {
  console.warn('athlete-tabs.js must load after the main script in index.html');
  return;
}
if (!injectMarkup()) return;
patchMainScript();
wireTimer();
tmRender();
if (typeof applyTextScale === 'function') applyTextScale();

/* ───────────────────────────────────────────────────────────────
   DAY TITLE THAT ALWAYS FITS
   The date stays big. If the full date doesn't fit on one line, it
   steps down to a shorter form instead of being cut off:
     Wednesday, September 30 → Wednesday, Sep 30 → Wed, Sep 30
   ─────────────────────────────────────────────────────────────── */
function fitDayTitle(el, iso) {
  if (!el) return;
  iso = iso || el.dataset.iso;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) return;
  el.dataset.iso = iso;
  const d = new Date(iso + 'T12:00:00');
  const forms = [
    { weekday:'long',  month:'long',  day:'numeric' },
    { weekday:'long',  month:'short', day:'numeric' },
    { weekday:'short', month:'short', day:'numeric' },
  ].map(f => d.toLocaleDateString('en-US', f));
  el.title = forms[0];
  if (!el.clientWidth) { el.textContent = forms[0]; return; }   // not on screen yet; fitted when it is
  for (const text of forms) {
    el.textContent = text;
    if (el.scrollWidth <= el.clientWidth + 1) return;
  }
}
function fitTitles() { ['d-title', 'adm-day-title'].forEach(id => fitDayTitle(document.getElementById(id))); }
['_openDay', 'adminOpenDay'].forEach(fn => {
  const orig = window[fn];
  if (typeof orig !== 'function') return;
  window[fn] = function (iso) {
    const r = orig.apply(this, arguments);
    fitDayTitle(document.getElementById(fn === '_openDay' ? 'd-title' : 'adm-day-title'), iso);
    return r;
  };
});
let fitTimer = null;
window.addEventListener('resize', () => { clearTimeout(fitTimer); fitTimer = setTimeout(fitTitles, 120); });
if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitTitles);   // once Bebas Neue has loaded

/* ───────────────────────────────────────────────────────────────
   COACH PANEL BOTTOM BAR
   Mirrors the panel's own tab buttons (Users, Teams, Chat, Settings —
   whatever is there), so tapping a bottom tab is the same as tapping
   the top one, and the Chat badge follows along.
   ─────────────────────────────────────────────────────────────── */
const ADM_ICON = {
  users:    svg('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.9-3.6 3.5-5.6 6.5-5.6s5.6 2 6.5 5.6"/><path d="M16.5 8h5M16.5 12h5M18.5 16h3"/>'),
  teams:    svg('<circle cx="9" cy="8.5" r="3.2"/><path d="M3 19c.8-3 3.2-4.6 6-4.6s5.2 1.6 6 4.6"/><circle cx="17" cy="9.5" r="2.5"/><path d="M16 14.6c2.4.1 4.2 1.5 5 4"/>'),
  chat:     ICON.chat,
  settings: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
};
const ADM_LABEL = { users: 'Athletes' };

function admTop() { const a = document.getElementById('s-admin'); return a && a.querySelector('.adm-tabs'); }
function admName(btn) { return (/switchAdmTab\(\s*'(\w+)'/.exec(btn.getAttribute('onclick') || '') || [])[1] || ''; }

function buildAdminBar() {
  const admin = document.getElementById('s-admin'), top = admTop();
  if (!admin || !top) return;
  let bar = document.getElementById('adm-tabbar');
  if (!bar) {
    bar = document.createElement('nav');
    bar.id = 'adm-tabbar';
    bar.className = 'tabbar';
    bar.setAttribute('aria-label', 'Coach');
    bar.innerHTML = '<div class="tabbar-in"></div>';
    admin.appendChild(bar);
    bar.addEventListener('click', e => {
      const b = e.target.closest('[data-adm]');
      if (!b) return;
      const src = top.querySelectorAll('.adm-tab')[+b.dataset.adm];
      if (src) { src.click(); window.scrollTo(0, 0); }
    });
  }
  const inner = bar.firstElementChild;
  inner.innerHTML = '';
  [...top.querySelectorAll('.adm-tab')].forEach((src, i) => {
    const name = admName(src);
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'tab'; b.dataset.adm = i; b.dataset.name = name;
    b.innerHTML = (ADM_ICON[name] || ADM_ICON.settings) + '<span class="tab-lbl"></span><span class="tab-badge" hidden></span>';
    b.querySelector('.tab-lbl').textContent = ADM_LABEL[name] || (src.firstChild ? src.firstChild.textContent.trim() : name);
    inner.appendChild(b);
  });
  syncAdminBar();
}

function syncAdminBar() {
  const top = admTop(), bar = document.getElementById('adm-tabbar');
  if (!top || !bar) return;
  const srcs = [...top.querySelectorAll('.adm-tab')], tabs = [...bar.querySelectorAll('.tab')];
  if (srcs.length !== tabs.length) { buildAdminBar(); return; }
  // An open athlete counts as being on Athletes.
  const anyActive = srcs.some(s => s.classList.contains('active'));
  tabs.forEach((t, i) => {
    const src = srcs[i];
    t.classList.toggle('active', src.classList.contains('active') || (!anyActive && t.dataset.name === 'users'));
    const from = src.querySelector('.ch-tab-badge'), to = t.querySelector('.tab-badge');
    to.hidden = !from || from.hidden || !from.textContent;
    to.textContent = from ? from.textContent : '';
  });
}

// Text size and Sign Out leave the header on phones, so they live in Settings.
function addAdminSettingsExtras() {
  const panel = document.getElementById('adm-settings');
  if (!panel || panel.querySelector('.adm-mobile-only')) return;
  panel.insertAdjacentHTML('beforeend',
    '<div class="setting-row adm-mobile-only"><div><div class="setting-label">Text size</div>' +
      '<div class="setting-desc">For programming and results</div></div>' +
      '<div class="tt-pop acc-tt">' +
        '<button class="tt-step" onclick="stepTextSize(-1)" aria-label="Smaller text"><span style="font-size:13px">T</span></button>' +
        '<div class="tt-level"></div>' +
        '<button class="tt-step" onclick="stepTextSize(1)" aria-label="Larger text"><span style="font-size:22px">T</span></button>' +
      '</div></div>' +
    '<button class="acc-out adm-mobile-only" type="button" onclick="doAdminLogout()">Sign Out</button>');
  if (typeof applyTextScale === 'function') applyTextScale();
}

function setupAdminBar() {
  const top = admTop();
  if (!top) return;
  addAdminSettingsExtras();
  buildAdminBar();
  // Follow every change to the top tabs: which is active, new tabs, badge counts.
  let queued = false;
  const later = () => { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; syncAdminBar(); }); };
  new MutationObserver(later).observe(top, { subtree: true, childList: true, attributes: true, characterData: true });
}
// After every add-on (e.g. td-chat.js adding Teams and Chat) has run.
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setupAdminBar);
else setTimeout(setupAdminBar, 0);

// For td-chat.js
window.TD_TABS = {
  enableChat() {
    chatOn = true;
    const b = document.getElementById('tab-chat');
    if (b) b.hidden = false;
  },
  setChatBadge(n) {
    const el = document.getElementById('tab-chat-badge');
    if (!el) return;
    el.hidden = !(n > 0);
    el.textContent = n > 99 ? '99+' : String(n || '');
  },
  go: tabGo,
};

// For testing in the console.
window.TD_TIMER = { buildPhases, locate, fmt, state: () => TM };
})();
