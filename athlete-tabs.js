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
   • Timer: Time (optional cap, rest between rounds) and Intervals
     (fixed or variable), with splits and an optional round counter.
     It keeps running while the athlete flips back to their workout,
     and the Timer tab shows the clock while they're away.
   • Account: profile, text size and sign out — moved out of the
     header, which is now just the logo and search.

   Nothing here touches Supabase or the sheet.
   ═══════════════════════════════════════════════════════════════ */
(function () {
'use strict';

// Shown at the bottom of the Account tab, so it's easy to check which
// version of this file a phone is running. Bump it with every change.
const TD_BUILD = '17';

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

.tm-face.tappable { cursor:pointer; -webkit-user-select:none; user-select:none; touch-action:manipulation; }
.tm-live { display:flex; align-items:baseline; justify-content:center; gap:10px; margin:-2px 0 10px; }
.tm-live[hidden] { display:none; }
.tm-live-lbl { font-size:10px; font-weight:800; letter-spacing:2.4px; text-transform:uppercase; color:var(--ink-3); }
.tm-live-t { font-family:var(--display); font-size:clamp(40px, 13vw, 58px); line-height:.9; color:var(--blue); font-variant-numeric:tabular-nums; }
.tm-face[data-ph="rest"] .tm-live-t { color:var(--gold-ink); }
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

.tm-laps-hd { display:flex; justify-content:space-between; align-items:center; padding:10px 0 8px; }
.tm-big {
  position:fixed; inset:0; z-index:400; display:none; align-items:center; justify-content:center;
  pointer-events:none; background:rgba(20,22,28,.55);
}
.tm-big.on { display:flex; }
.tm-big span {
  font-family:var(--display); line-height:.8; color:#fff; padding-top:.06em;
  font-size:min(60vh, 92vw); text-shadow:0 8px 40px rgba(0,0,0,.35);
  animation:tm-pop .32s cubic-bezier(.2,.9,.3,1.2);
}
.tm-big.word span { font-size:min(34vh, 38vw); letter-spacing:2px; }
.tm-big.go span { color:var(--gold-lt); }
.tm-big.rest span { color:#fff; }
.tm-big.done span { background:var(--grad); -webkit-background-clip:text; background-clip:text; color:transparent; }
@keyframes tm-pop { 0% { transform:scale(1.4); opacity:0; } 100% { transform:scale(1); opacity:1; } }
.tm-count { display:flex; align-items:center; justify-content:center; gap:10px; margin:2px 0 10px; }
.tm-count[hidden] { display:none; }
.tm-count-n { font-family:var(--display); font-size:clamp(48px, 15vw, 66px); line-height:.9; color:var(--ink); padding-top:3px; min-width:.6em; text-align:right; }
.tm-count-lbl { font-size:10px; font-weight:800; letter-spacing:2.4px; text-transform:uppercase; color:var(--ink-3); }
.tm-count-undo {
  height:32px; padding:0 10px; border:1px solid var(--line); border-radius:3px; background:var(--paper); cursor:pointer;
  font-size:11px; font-weight:800; color:var(--ink-3);
}
.tm-count-undo:hover:not(:disabled) { color:var(--magenta); border-color:var(--magenta); }
.tm-count-undo:disabled { opacity:.35; cursor:default; }
.tm-desc { display:block; font-size:12px; line-height:1.4; color:var(--ink-3); margin-top:3px; max-width:250px; }
.tm-btn.round.rest { color:var(--gold-ink); border-color:var(--gold-bdr); }
.tm-lap.rest .tm-lap-n, .tm-lap.rest .tm-lap-split { color:var(--gold-ink); }
.tm-lap-n { min-width:44px; }
.tm-var-hd, .tm-var { display:grid; grid-template-columns:18px 1fr 1fr 28px; gap:6px; align-items:center; }
.tm-var-hd { margin-bottom:2px; }
.tm-var { padding:4px 0; }
.tm-var-n { font-family:var(--display); font-size:18px; color:var(--blue); text-align:center; padding-top:2px; }
.tm-step.sm { width:100%; }
.tm-step.sm button { width:30px; height:38px; font-size:17px; flex-shrink:0; }
.tm-step.sm input { width:auto; flex:1; min-width:0; font-size:20px; }
.tm-var-del { width:28px; height:38px; border:0; background:none; color:var(--ink-3); font-size:14px; cursor:pointer; }
.tm-var-del:hover:not(:disabled) { color:var(--magenta); }
.tm-var-del:disabled { opacity:.3; cursor:default; }
.tm-var-add { align-self:flex-start; margin-top:6px; }
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

/* ── Compact month calendar (athlete) ───────────── */
/* One line: November 2026 ............ [↻][←][→], then the month. */
#v-cal .hero { padding:12px 0 16px; }
#v-cal .cal-nav { align-items:center; margin-bottom:12px; }
#v-cal .cal-month-wrap { gap:0; }
#v-cal .cal-badge { display:none !important; }
#v-cal .cal-month { font-size:clamp(28px, 8.4vw, 38px); line-height:1; padding-top:3px; white-space:nowrap; }
#v-cal .cal-arrows .btn-sm {
  position:relative; width:38px; height:38px; padding:0; margin-right:6px !important;
  font-size:0 !important; letter-spacing:0;
}
#v-cal .cal-arrows .btn-sm::before {
  content:''; width:19px; height:19px; background:currentColor;
  -webkit-mask:var(--ico) center / contain no-repeat; mask:var(--ico) center / contain no-repeat;
  --ico:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M20 12a8 8 0 1 1-2.6-5.9'/%3E%3Cpath d='M20 4v5h-5'/%3E%3C/svg%3E");
}
#v-cal .cal-arr { width:38px; }
#v-cal .cal-dow-row { margin-bottom:4px; }
#v-cal .cal-legend { margin-top:12px; padding-top:10px; gap:6px 14px; }

/* ── Workout: drop the lone "Training" heading ──── */
/* AM / PM headings stay; a single block doesn't need a label. */
#d-content .blk-lbl[data-block="Training"], #adm-day-content .blk-lbl[data-block="Training"] { display:none; }
#d-content .blk-lbl[data-block="Training"] + .blk-sections,
#adm-day-content .blk-lbl[data-block="Training"] + .blk-sections { margin-top:10px; }

/* Results autosave as you type, so Save is a quieter backup button */
#d-content .sub-row .btn-save {
  background:var(--paper); color:var(--blue); border:1px solid var(--line); box-shadow:none;
  padding:13px 24px;
}
#d-content .sub-row .btn-save:hover { border-color:var(--blue); background:var(--paper); color:var(--blue); transform:none; }

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

/* ── % Calculator ───────────────────────────────── */
.app-hd .pc-hd-btn { font-family:var(--display); font-size:20px; padding-top:2px; }
.pc-open {
  display:flex; align-items:center; gap:10px; width:100%; margin:12px 0 2px; cursor:pointer; text-align:left;
  background:var(--blue-soft); border:1px solid rgba(0,68,223,.22); border-radius:4px; padding:10px 12px;
  font:inherit; color:var(--blue); transition:background .15s, border-color .15s;
}
.pc-open:hover { border-color:var(--blue); }
.pc-open-ico { font-family:var(--display); font-size:22px; line-height:1; width:30px; height:30px; flex-shrink:0;
  display:grid; place-items:center; background:var(--blue); color:#fff; border-radius:3px; padding-top:2px; }
.pc-open-txt { flex:1; min-width:0; }
.pc-open-lbl { display:block; font-size:9.5px; font-weight:800; letter-spacing:1.8px; text-transform:uppercase; }
.pc-open-sub { display:block; font-size:13px; font-weight:600; color:var(--ink-2); margin-top:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.pc-open-chev { font-size:18px; flex-shrink:0; }

#m-pct .modal { max-width:460px; }
.pc-row2 { display:flex; gap:8px; align-items:flex-end; }
.pc-row2 .fld { flex:1; min-width:0; margin-bottom:12px; }
.pc-max {
  font-family:var(--display) !important; font-size:34px !important; line-height:1 !important; padding:8px 12px 6px !important;
  letter-spacing:.5px;
}
.pc-seg { display:flex; border:1px solid var(--line); border-radius:4px; overflow:hidden; flex-shrink:0; margin-bottom:12px; height:56px; }
.pc-seg button {
  width:52px; background:var(--paper); border:0; cursor:pointer; color:var(--ink-3);
  font-size:11px; font-weight:800; letter-spacing:1.6px; text-transform:uppercase;
}
.pc-seg button + button { border-left:1px solid var(--line); }
.pc-seg button.on { background:var(--blue); color:#fff; }
.pc-today {
  position:relative; overflow:hidden; background:#FCF5E8; border-left:4px solid var(--gold); border-radius:0 4px 4px 0;
  padding:12px 14px; margin-bottom:12px;
}
.pc-today-lbl { font-size:9px; font-weight:800; letter-spacing:2px; text-transform:uppercase; color:var(--gold-ink); }
.pc-today-val { font-family:var(--display); font-size:30px; line-height:1; color:var(--ink); margin-top:6px; }
.pc-today-pct { font-size:12.5px; font-weight:600; color:var(--ink-2); margin-top:3px; }
.pc-empty { text-align:center; padding:22px 12px; font-size:13.5px; color:var(--ink-3); background:var(--wash); border-radius:4px; }
.pc-table { border:1px solid var(--line); border-radius:4px; overflow:hidden; margin-bottom:8px; }
.pc-tr { display:flex; align-items:center; justify-content:space-between; padding:9px 14px; border-top:1px solid var(--line); }
.pc-tr:first-child { border-top:0; }
.pc-tr:nth-child(even) { background:#FAFBFE; }
.pc-pct { font-family:var(--display); font-size:21px; line-height:1; color:var(--ink-3); padding-top:2px; width:62px; }
.pc-w { font-family:var(--display); font-size:24px; line-height:1; color:var(--ink); padding-top:2px; }
.pc-w small { font-family:var(--sans); font-size:11px; font-weight:700; letter-spacing:1px; color:var(--ink-3); margin-left:4px; }
.pc-tag { flex:1; font-size:8.5px; font-weight:800; letter-spacing:1.4px; text-transform:uppercase; color:var(--gold-ink); }
.pc-tr.hit { background:#FCF5E8 !important; box-shadow:inset 4px 0 0 var(--gold); }
.pc-tr.hit .pc-pct { color:var(--gold-ink); }
.pc-tr.band { background:rgba(220,142,9,.05) !important; }
.pc-note { font-size:11.5px; line-height:1.5; color:var(--ink-3); text-align:center; padding:4px 0 10px; }

/* From a workout section: everything on one screen */
#m-pct.pc-compact .modal-hd { padding:16px 10px 10px 16px; }
#m-pct.pc-compact .modal-title { font-size:24px; }
#m-pct.pc-compact .modal-body { padding:12px 14px 4px; }
#m-pct.pc-compact .fld label { margin-bottom:4px; }
#m-pct.pc-compact .pc-row2 .fld, #m-pct.pc-compact .pc-seg { margin-bottom:10px; }
#m-pct.pc-compact .pc-max { font-size:28px !important; padding:6px 10px 4px !important; }
#m-pct.pc-compact .pc-seg { height:48px; }
#m-pct.pc-compact .pc-today { padding:8px 12px; margin-bottom:10px; display:flex; flex-wrap:wrap; align-items:baseline; gap:2px 12px; }
#m-pct.pc-compact .pc-today-lbl { width:100%; }
#m-pct.pc-compact .pc-today-val { font-size:26px; margin-top:4px; }
#m-pct.pc-compact .pc-today-pct { margin-top:0; }
#m-pct.pc-compact .pc-today > div[style] { display:none; }
#m-pct.pc-compact .pc-table { display:grid; grid-auto-flow:column; grid-template-columns:1fr 1fr; margin-bottom:12px; }
#m-pct.pc-compact .pc-tr { padding:6px 10px; border-top:1px solid var(--line); background:var(--paper); }
#m-pct.pc-compact .pc-tr.top { border-top:0; }
#m-pct.pc-compact .pc-tr.l { border-right:1px solid var(--line); }
#m-pct.pc-compact .pc-tr:nth-child(even) { background:var(--paper); }
#m-pct.pc-compact .pc-tr.alt { background:#FAFBFE; }
#m-pct.pc-compact .pc-pct { font-size:17px; width:auto; min-width:40px; }
#m-pct.pc-compact .pc-tag { flex:1; }
#m-pct.pc-compact .pc-w { font-size:20px; }
#m-pct.pc-compact .pc-w small { font-size:9.5px; margin-left:2px; }

/* ── Coach: athlete list ────────────────────────── */
#adm-users .table-wrap { display:none; }
.ros-search {
  width:100%; background:var(--paper); border:1px solid var(--line); border-radius:4px;
  padding:11px 13px; font-family:inherit; font-size:16px; color:var(--ink); outline:none; margin-bottom:10px;
}
.ros-search:focus { border-color:var(--blue); }
.ros-sec { font-size:9px; font-weight:800; letter-spacing:2px; text-transform:uppercase; color:var(--ink-3); margin:16px 2px 6px; }
.ros-sec:first-child { margin-top:2px; }
.ros-list { background:var(--paper); border:1px solid var(--line); border-radius:4px; overflow:hidden; }
.ros-row { display:flex; align-items:center; }
.ros-row + .ros-row { border-top:1px solid var(--line); }
.ros-main {
  flex:1; min-width:0; display:flex; align-items:center; gap:12px; padding:11px 4px 11px 12px;
  background:none; border:0; font:inherit; color:inherit; text-align:left; cursor:pointer;
}
.ros-main:hover { background:var(--wash); }
.ros-av {
  width:38px; height:38px; flex-shrink:0; border-radius:3px; display:grid; place-items:center;
  background:var(--blue); color:#fff; font-family:var(--display); font-size:21px; padding-top:2px;
}
.ros-row.coach .ros-av { background:var(--gold); color:var(--ink); }
.ros-mid { flex:1; min-width:0; display:flex; flex-direction:column; gap:2px; }
.ros-name { font-weight:700; font-size:15px; color:var(--ink); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.ros-sub { font-size:12.5px; color:var(--ink-3); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.ros-tag {
  flex-shrink:0; font-size:8.5px; font-weight:800; letter-spacing:1.4px; text-transform:uppercase;
  padding:4px 6px; border-radius:2px; color:var(--magenta); background:rgba(204,18,102,.07); border:1px solid rgba(204,18,102,.25);
}
.ros-tag.coach { color:var(--gold-ink); background:var(--gold-bg); border-color:var(--gold-bdr); }
.ros-chev { color:var(--ink-3); font-size:18px; flex-shrink:0; margin-left:2px; }
.ros-more {
  width:46px; align-self:stretch; flex-shrink:0; background:none; border:0; border-left:1px solid var(--line);
  color:var(--ink-3); font-size:20px; line-height:1; cursor:pointer; letter-spacing:1px;
}
.ros-more:hover { background:var(--wash); color:var(--blue); }
.ros-mail { display:flex; align-items:center; gap:6px; margin:-2px 0 10px; }
.ros-mail[hidden] { display:none; }
.ros-mail-note { flex:1; min-width:0; font-size:9px; font-weight:800; letter-spacing:1.6px; text-transform:uppercase; color:var(--ink-3);
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.ros-none { padding:28px 16px; text-align:center; font-size:13.5px; color:var(--ink-3); }
.ros-acts { display:flex; flex-direction:column; gap:8px; padding-bottom:12px; }
.ros-act {
  width:100%; height:50px; border-radius:3px; cursor:pointer; text-align:left; padding:0 16px;
  background:var(--paper); border:1px solid var(--line); color:var(--ink);
  font-family:var(--sans); font-size:14.5px; font-weight:600;
}
.ros-act:hover { border-color:var(--blue); color:var(--blue); }
.ros-act.danger { color:var(--magenta); }
.ros-act.danger:hover { border-color:var(--magenta); }

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
          '<button class="tm-mode" data-mode="fortime">Time</button>' +
          '<button class="tm-mode" data-mode="intervals">Intervals</button>' +
        '</div>' +
        '<div class="tm-face" id="tm-face" data-ph="idle">' +
          '<button class="tm-snd" id="tm-snd" type="button" aria-label="Sound on"></button>' +
          '<div class="tm-phase" id="tm-phase"></div>' +
          '<div class="tm-time" id="tm-time" aria-live="off"></div>' +
          '<div class="tm-live" id="tm-live" hidden><span class="tm-live-lbl"></span><span class="tm-live-t"></span></div>' +
          '<div class="tm-count" id="tm-count" hidden><span class="tm-count-n">0</span><span class="tm-count-lbl">Rounds</span>' +
            '<button type="button" class="tm-count-undo" id="tm-count-undo" aria-label="Take one round off">\u22121</button></div>' +
          '<div class="tm-sub" id="tm-sub"></div>' +
          '<div class="tm-bar"><i id="tm-bar"></i></div>' +
        '</div>' +
        '<div class="tm-ctrls">' +
          '<button class="tm-btn" id="tm-reset" type="button">Reset</button>' +
          '<button class="tm-btn go" id="tm-go" type="button">Start</button>' +
          '<button class="tm-btn round" id="tm-round" type="button">Split</button>' +
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
        '<div class="acc-foot">Trainderive &middot; By Frank Nguyen &middot; Build ' + TD_BUILD + '</div>' +
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
  counter: false,                             // tapping the clock counts rounds
  fortime:   { capOn: false, cap: 20 * 60, rest: false, restFixed: false, restLen: 60 },
  intervals: {
    work: 20, rest: 10, rounds: 8,
    variable: false,                          // build your own list instead
    list: [ { work: 60, rest: 30 }, { work: 45, rest: 30 }, { work: 30, rest: 30 } ],
    repeat: 1,                                // times through the list
  },
};
const TM_FIELDS = {
  'fortime.cap':        { kind:'time',  step:60, min:60, max:5999 },
  'fortime.restLen':    { kind:'time',  step:15, min:15, max:1800 },
  'intervals.work':     { kind:'time',  step:5,  min:5,  max:3600 },
  'intervals.rest':     { kind:'time',  step:5,  min:0,  max:3600 },
  'intervals.rounds':   { kind:'count', step:1,  min:1,  max:99 },
  'intervals.repeat':   { kind:'count', step:1,  min:1,  max:20 },
};
const TM_VAR_MAX = 20;
function fieldSpec(path) {
  if (TM_FIELDS[path]) return TM_FIELDS[path];
  if (/^intervals\.list\.\d+\.work$/.test(path)) return { kind:'time', step:5, min:5, max:3600 };
  if (/^intervals\.list\.\d+\.rest$/.test(path)) return { kind:'time', step:5, min:0, max:3600 };
  return null;
}
const TM_PRESETS = [
  { label:'Tabata', work:20, rest:10, rounds:8 },
  { label:'30 / 30', work:30, rest:30, rounds:10 },
  { label:'40 / 20', work:40, rest:20, rounds:10 },
  { label:'45 / 15', work:45, rest:15, rounds:8 },
];
const TM_LEADS = [0, 5, 10, 15];
const MODE_NAME = { fortime:'Time', intervals:'Intervals' };

const TM = {
  cfg: loadCfg(),
  state: 'idle',        // idle | running | paused | done
  phases: null,         // fixed when Start is pressed
  startAt: 0,           // Date.now() at start, pushed forward by pauses
  pausedAt: 0,
  endEl: 0,
  laps: [],             // { t: seconds on the workout clock, tag, kind } per split
  capHit: false,
  counterOn: false,     // "Round counter?" for this workout
  count: 0,
  restOn: false,        // Time mode with "Rest between rounds?"
  restFixed: false,     // …with a set rest length: next round starts itself
  restLen: 60,
  restEndAt: null,      // workout-clock second the current set rest ends
  inRest: false,
  round: 1,
  lastPhase: -1,
  lastCount: '',
  ticker: null,
};

function loadCfg() {
  const c = JSON.parse(JSON.stringify(TM_DEFAULT));
  try {
    const saved = JSON.parse(localStorage.getItem(TM_KEY) || 'null');
    if (saved && typeof saved === 'object') {
      ['mode', 'lead', 'sound', 'counter'].forEach(k => { if (saved[k] !== undefined) c[k] = saved[k]; });
      ['fortime', 'intervals'].forEach(k => { if (saved[k]) Object.assign(c[k], saved[k]); });
      const L = c.intervals.list;
      c.intervals.list = Array.isArray(L) && L.length
        ? L.slice(0, TM_VAR_MAX).map(x => ({ work: Math.max(5, +x.work || 30), rest: Math.max(0, +x.rest || 0) }))
        : JSON.parse(JSON.stringify(TM_DEFAULT.intervals.list));
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
  } else if (c.intervals.variable) {
    // Your own list, each with its own work and rest, repeated
    const iv = c.intervals, n = iv.list.length * iv.repeat;
    let r = 0;
    for (let s = 0; s < iv.repeat; s++) iv.list.forEach(x => {
      r++;
      p.push({ kind:'work', dur:x.work, dir:'down', round:r, of:n });
      if (x.rest > 0 && r < n) p.push({ kind:'rest', dur:x.rest, dir:'down', round:r, of:n });
    });
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
const splitsTxt = n => n + (n === 1 ? ' split' : ' splits');

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
  TM.restOn = TM.cfg.mode === 'fortime' && !!TM.cfg.fortime.rest;
  TM.restFixed = TM.restOn && !!TM.cfg.fortime.restFixed;
  TM.restLen = TM.cfg.fortime.restLen || 60;
  TM.restEndAt = null;
  TM.inRest = false; TM.round = 1;
  TM.counterOn = !!TM.cfg.counter; TM.count = 0;
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
  bigHide();
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
  TM.restOn = false; TM.inRest = false; TM.round = 1; TM.restEndAt = null;
  TM.counterOn = false; TM.count = 0;
  bigHide();
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
  bigWord(TM.capHit ? 'TIME' : 'DONE', 'done', 1400);
  setTimeout(sleepAudio, 2500);   // after the finish beeps have played
  tmRender();
}
// Split: marks the time on the workout clock (after the get-ready
// countdown). With "Rest between rounds?" on, splits alternate: end the
// round (rest starts) → start the next round.
function tmRound() {
  if (TM.state !== 'running') return;
  const el = tmElapsed(), loc = locate(TM.phases, el);
  if (loc.done || loc.ph.kind === 'ready') return;
  const t = el - leadOf(TM.phases);
  if (TM.restOn) {
    if (!TM.inRest) {
      TM.laps.push({ t, kind:'work', round: TM.round });
      TM.inRest = true;
      TM.restEndAt = TM.restFixed ? t + TM.restLen : null;
      cue.rest();
    } else {
      TM.laps.push({ t, kind:'rest', round: TM.round });   // started early, by hand
      TM.inRest = false; TM.round++; TM.restEndAt = null;
      cue.go();
    }
  } else {
    const tag = loc.ph.round ? 'Rd ' + loc.ph.round + (loc.ph.kind === 'rest' ? ' rest' : '') : '';
    TM.laps.push({ t, tag });
    tone(880, 0.08); buzz(40);
    flash('count');
  }
  tmRender();
}
// A set rest has run out: the next round starts on its own, timed to
// the exact second the rest ended.
function autoStartRound() {
  const at = TM.restEndAt;
  TM.laps.push({ t: at, kind:'rest', round: TM.round });
  TM.inRest = false; TM.round++; TM.restEndAt = null;
  cue.go();
  bigWord('GO', 'go');
  tmRender();
}

// Round counter: the big clock counts rounds; −1 undoes a stray tap.
function countRound(delta) {
  if (TM.state !== 'running' && delta > 0) return;
  const el = tmElapsed(), loc = locate(TM.phases, el);
  if (delta > 0 && (loc.done || loc.ph.kind === 'ready')) return;
  TM.count = Math.max(0, TM.count + delta);
  if (delta > 0) { tone(990, 0.09); buzz(40); flash('count'); }
  renderCount();
  lastFace = ''; tmRenderFace();
}
function renderCount() {
  const box = document.getElementById('tm-count');
  if (!box) return;
  const show = TM.counterOn && TM.state !== 'idle';
  box.hidden = !show;
  if (!show) return;
  box.querySelector('.tm-count-n').textContent = TM.count;
  box.querySelector('.tm-count-lbl').textContent = TM.count === 1 ? 'Round' : 'Rounds';
  const undo = box.querySelector('.tm-count-undo');
  undo.disabled = !TM.count || TM.state === 'idle';
}

// The Split button only shows while a clock is running (or paused),
// and wakes up when the get-ready countdown ends.
function syncSplitBtn() {
  const b = document.getElementById('tm-round');
  if (!b) return;
  const live = TM.state === 'running' || TM.state === 'paused';
  b.style.display = live ? '' : 'none';
  b.textContent = TM.restOn ? (TM.inRest ? 'Start Rd ' + (TM.round + 1) : 'Rest') : 'Split';
  b.classList.toggle('rest', TM.restOn && TM.inRest);
  const loc = live ? locate(TM.phases, tmElapsed()) : null;
  b.disabled = TM.state !== 'running' || !loc || loc.done || loc.ph.kind === 'ready';
}
// Work and rest so far, for Time with rest between rounds.
function workRest() {
  const lead = TM.phases ? leadOf(TM.phases) : 0;
  const now = Math.max(0, tmElapsed() - lead);
  let work = 0, rest = 0, prev = 0;
  TM.laps.forEach(l => { const d = l.t - prev; prev = l.t; if (l.kind === 'rest') rest += d; else work += d; });
  if (TM.inRest) rest += now - prev; else work += now - prev;
  return { work, rest };
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

  // A set rest ran out → next round starts itself
  const wc = el - leadOf(TM.phases);
  if (TM.restOn && TM.inRest && TM.restEndAt != null && wc >= TM.restEndAt) { autoStartRound(); return; }

  // Phase changed: cue it, unless the phone was asleep through it.
  if (loc.i !== TM.lastPhase) {
    syncSplitBtn();
    if (loc.inPh < 1.5) {
      if (loc.ph.kind === 'work') { cue.go(); bigWord('GO', 'go'); }
      else if (loc.ph.kind === 'rest') { cue.rest(); bigWord('REST', 'rest'); }
    }
    TM.lastPhase = loc.i;
  }

  // Countdown to the next change: 3-2-1 beeps, 5-4-3-2-1 on screen.
  let rem = null, key0 = loc.i;
  if (TM.restOn && TM.inRest && TM.restEndAt != null) { rem = TM.restEndAt - wc; key0 = 'r' + TM.round; }
  else if (loc.ph.dur !== Infinity) rem = loc.remain;
  if (rem != null) {
    const n = Math.ceil(rem);
    const key = key0 + ':' + n;
    if (n >= 1 && n <= 3 && key !== TM.lastCount && (n - rem) < 0.6) cue.count();
    TM.lastCount = key;
    if (n >= 1 && n <= 5) bigCount(n); else bigIdle();
  } else bigIdle();

  tmRenderFace();
  tmTabLabel();
}

/* ── Big 5-4-3-2-1 / GO on screen ──────────────────── */
// Shown on top of whatever tab the athlete is on; taps go straight
// through to the app underneath.
const BIG = { el: null, shown: '', wordUntil: 0, timer: null };
function bigEl() {
  if (BIG.el) return BIG.el;
  const app = document.getElementById('s-app');
  if (!app) return null;
  BIG.el = document.createElement('div');
  BIG.el.className = 'tm-big'; BIG.el.setAttribute('aria-hidden', 'true');
  app.appendChild(BIG.el);
  return BIG.el;
}
function bigSet(text, cls) {
  const el = bigEl();
  if (!el) return;
  if (BIG.shown !== text + '|' + cls) {
    BIG.shown = text + '|' + cls;
    el.className = 'tm-big on ' + cls;
    el.innerHTML = '<span></span>';           // fresh element restarts the pop
    el.firstChild.textContent = text;
  }
}
function bigCount(n) { if (Date.now() < BIG.wordUntil) return; bigSet(String(n), 'num'); }
function bigWord(word, cls, ms) {
  BIG.wordUntil = Date.now() + (ms || 900);
  bigSet(word, 'word ' + cls);
  clearTimeout(BIG.timer);
  BIG.timer = setTimeout(() => { if (Date.now() >= BIG.wordUntil) bigHide(); }, (ms || 900) + 20);
}
function bigIdle() { if (Date.now() >= BIG.wordUntil && BIG.shown) bigHide(); }
function bigHide() {
  BIG.shown = ''; BIG.wordUntil = 0; clearTimeout(BIG.timer);
  if (BIG.el) { BIG.el.className = 'tm-big'; BIG.el.innerHTML = ''; }
}

/* ── What the face shows ───────────────────────────── */
function faceState() {
  const c = TM.cfg, mode = c.mode, iv = c.intervals;
  const ivCount = iv.variable ? iv.list.length * iv.repeat : iv.rounds;

  if (TM.state === 'idle') {
    let sub, t;
    if (mode === 'fortime') {
      t = 0;
      sub = (c.fortime.capOn ? 'Time cap ' + fmt(c.fortime.cap) : 'Counts up until you stop it') +
            (c.fortime.rest ? ' \u00B7 rest between rounds' : '');
    } else {
      t = iv.variable ? iv.list[0].work : iv.work;
      sub = ivCount + (iv.variable ? ' intervals' : (ivCount === 1 ? ' round' : ' rounds')) + ' \u00B7 ' +
            fmt(totalOf(buildPhases(Object.assign({}, c, { lead: 0 }))));
    }
    return { ph:'idle', label: MODE_NAME[mode], time: fmt(t), sub, bar: null };
  }

  const phases = TM.phases, lead = leadOf(phases);
  const wr = () => { const x = workRest(); return 'Work ' + fmt(x.work) + ' \u00B7 Rest ' + fmt(x.rest); };

  if (TM.state === 'done') {
    const workTime = TM.endEl - lead;
    if (mode === 'fortime') return { ph:'done', label: TM.capHit ? 'Time Cap' : 'Done', time: fmt(workTime),
      sub: TM.restOn ? wr() : (TM.counterOn ? roundsTxt(TM.count) : TM.laps.length ? splitsTxt(TM.laps.length) : 'Nice work'), bar: null };
    return { ph:'done', label:'Done', time: fmt(workTime),
      sub: ivCount + (iv.variable ? ' intervals' : ' rounds') + ' complete', bar: 1 };
  }

  const el = tmElapsed(), loc = locate(phases, el);
  if (loc.done) return { ph:'done', label:'Done', time: fmt(totalOf(phases) - lead), sub:'', bar: 1 };
  const ph = loc.ph;
  const time = ph.dir === 'up' ? fmt(loc.inPh) : fmt(Math.ceil(loc.remain - 1e-6));

  if (ph.kind === 'ready') return { ph:'ready', label:'Get Ready', time, sub: MODE_NAME[mode] + ' starts', bar: loc.inPh / ph.dur };

  if (mode === 'fortime') {
    const capOn = ph.dur !== Infinity;
    if (TM.restOn) {
      return { ph: TM.inRest ? 'rest' : 'work', label: TM.inRest ? 'Rest' : 'Round ' + TM.round, time,
        sub: TM.laps.length ? wr() : (TM.counterOn ? 'Tap Rest to start your rest' : 'Tap the clock to start your rest'), bar: capOn ? loc.inPh / ph.dur : null };
    }
    const bits = [];
    if (TM.laps.length) bits.push(splitsTxt(TM.laps.length));
    if (capOn) bits.push('cap ' + fmt(ph.dur));
    return { ph:'work', label:'Time', time, sub: bits.join(' \u00B7 ') || (TM.counterOn ? 'Tap the clock after each round' : 'Tap the clock to split'), bar: capOn ? loc.inPh / ph.dur : null };
  }
  const left = fmt(Math.ceil(totalOf(phases) - el - 1e-6)) + ' left';
  return { ph: ph.kind, label: ph.kind === 'rest' ? 'Rest' : 'Work', time,
    sub: (iv.variable ? 'Interval ' : 'Round ') + ph.round + ' of ' + ph.of + ' \u00B7 ' + left, bar: loc.inPh / ph.dur };
}

// Each digit gets a fixed-width box, so the clock doesn't wobble
// as the numbers change.
function timeHTML(t) {
  return t.split('').map(ch => ch === ':' ? '<span class="c">:</span>' : '<span class="d">' + ch + '</span>').join('');
}

let lastFace = '';
// The split running right now, like a watch: time since the last split
// (or since the start). Shows the moment the clock starts, so a rest
// after a split counts up in plain view.
function renderLiveSplit() {
  const box = document.getElementById('tm-live'), face = document.getElementById('tm-face');
  if (!box || !face) return;
  const live = TM.state === 'running' || TM.state === 'paused';
  face.classList.toggle('tappable', TM.state === 'running');
  if (!live || !TM.phases) { box.hidden = true; return; }
  const el = tmElapsed(), loc = locate(TM.phases, el);
  if (loc.done || loc.ph.kind === 'ready') { box.hidden = true; return; }
  const wcNow = el - leadOf(TM.phases);
  const since = wcNow - (TM.laps.length ? TM.laps[TM.laps.length - 1].t : 0);
  box.hidden = false;
  if (TM.restOn && TM.inRest && TM.restEndAt != null) {
    box.querySelector('.tm-live-lbl').textContent = 'Next round in';
    box.querySelector('.tm-live-t').textContent = fmt(Math.ceil(TM.restEndAt - wcNow - 1e-6));
    return;
  }
  box.querySelector('.tm-live-lbl').textContent = TM.restOn
    ? (TM.inRest ? 'Rest ' + TM.round : 'Round ' + TM.round)
    : 'Split ' + (TM.laps.length + 1);
  box.querySelector('.tm-live-t').textContent = fmt(since);
}

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
  renderLiveSplit();
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
  return '<div class="tm-row"><span class="tm-lbl">' + label + '</span>' + stepBox(path, label) + '</div>';
}
function stepBox(path, label, small) {
  const f = fieldSpec(path), v = cfgGet(path);
  return '<div class="tm-step' + (small ? ' sm' : '') + '">' +
      '<button type="button" data-step="' + path + '" data-dir="-1" aria-label="Less">\u2212</button>' +
      '<input type="text" inputmode="' + (f.kind === 'count' ? 'numeric' : 'text') + '" data-field="' + path + '" value="' +
        (f.kind === 'count' ? v : fmt(v)) + '" aria-label="' + label + '" autocomplete="off">' +
      '<button type="button" data-step="' + path + '" data-dir="1" aria-label="More">+</button>' +
    '</div>';
}
function toggleRow(label, desc, attr, on) {
  return '<div class="tm-row"><span><span class="tm-lbl">' + label + '</span>' +
    (desc ? '<span class="tm-desc">' + desc + '</span>' : '') + '</span>' +
    '<label class="toggle"><input type="checkbox" ' + attr + (on ? ' checked' : '') + '>' +
    '<span class="toggle-slider"></span></label></div>';
}

function setupHTML() {
  const c = TM.cfg, rows = [];
  if (c.mode === 'fortime') {
    rows.push(toggleRow('Time cap', '', 'data-cap', c.fortime.capOn));
    if (c.fortime.capOn) rows.push(stepperHTML('fortime.cap', 'Cap'));
    rows.push(toggleRow('Rest between rounds?', 'Split ends the round and starts your rest; split again to start the next round.', 'data-restopt', c.fortime.rest));
    if (c.fortime.rest) {
      rows.push(toggleRow('Set rest length?', 'Rest counts down and the next round starts automatically.', 'data-restfixed', c.fortime.restFixed));
      if (c.fortime.restFixed) rows.push(stepperHTML('fortime.restLen', 'Rest length'));
    }
  } else {
    const iv = c.intervals;
    rows.push(toggleRow('Variable intervals?', 'Set a different work and rest for each interval.', 'data-variable', iv.variable));
    if (iv.variable) {
      rows.push('<div class="tm-row stack"><div class="tm-var-hd"><span class="tm-lbl">#</span><span class="tm-lbl">Work</span><span class="tm-lbl">Rest</span><span></span></div>' +
        iv.list.map((x, i) => '<div class="tm-var"><span class="tm-var-n">' + (i + 1) + '</span>' +
          stepBox('intervals.list.' + i + '.work', 'Work ' + (i + 1), true) +
          stepBox('intervals.list.' + i + '.rest', 'Rest ' + (i + 1), true) +
          '<button type="button" class="tm-var-del" data-var-del="' + i + '" aria-label="Remove interval ' + (i + 1) + '"' +
            (iv.list.length === 1 ? ' disabled' : '') + '>\u2715</button></div>').join('') +
        (iv.list.length < TM_VAR_MAX ? '<button type="button" class="tm-chip tm-var-add" data-var-add>+ Add interval</button>' : '') +
        '</div>');
      rows.push(stepperHTML('intervals.repeat', 'Repeat list'));
    } else {
      rows.push('<div class="tm-row stack"><span class="tm-lbl">Presets</span><div class="tm-chips">' +
        TM_PRESETS.map((p, i) => '<button type="button" class="tm-chip' +
          (p.work === iv.work && p.rest === iv.rest && p.rounds === iv.rounds ? ' on' : '') +
          '" data-preset="' + i + '">' + p.label + '</button>').join('') + '</div></div>');
      rows.push(stepperHTML('intervals.work', 'Work'));
      rows.push(stepperHTML('intervals.rest', 'Rest'));
      rows.push(stepperHTML('intervals.rounds', 'Rounds'));
    }
  }
  rows.push(toggleRow('Round counter?', 'Tap the big clock to count a round.', 'data-counter', c.counter));
  rows.push('<div class="tm-row"><span class="tm-lbl">Countdown</span><div class="tm-chips">' +
    TM_LEADS.map(s => '<button type="button" class="tm-chip' + (c.lead === s ? ' on' : '') + '" data-lead="' + s + '">' +
      (s ? s + 's' : 'Off') + '</button>').join('') + '</div></div>');
  return rows.join('') + '<div class="tm-sum">' + summary() + '</div>';
}

function summary() {
  const c = TM.cfg, iv = c.intervals;
  if (c.mode === 'fortime') return (c.fortime.capOn ? 'Counts up and stops at ' + fmt(c.fortime.cap) : 'Counts up until you pause it') +
    (c.fortime.rest ? (c.fortime.restFixed ? '. ' + fmtShort(c.fortime.restLen) + ' rest, then the next round starts by itself.' : '. Rest is timed separately.') : '');
  const total = fmt(totalOf(buildPhases(Object.assign({}, c, { lead: 0 })))) + ' total';
  if (iv.variable) return iv.list.length + (iv.list.length === 1 ? ' interval' : ' intervals') +
    (iv.repeat > 1 ? ' \u00D7 ' + iv.repeat : '') + ' \u00B7 ' + total;
  return fmtShort(iv.work) + ' on' + (iv.rest ? ' / ' + fmtShort(iv.rest) + ' off' : '') + ' \u00D7 ' + iv.rounds + ' \u00B7 ' + total;
}

function lapsHTML() {
  if (!TM.laps.length) return '';
  let prev = 0;
  const rows = TM.laps.map((l, i) => { const split = l.t - prev; prev = l.t;
    return { n: l.kind ? (l.kind === 'rest' ? 'Rest' : 'Rd ' + l.round) : i + 1, rest: l.kind === 'rest', split, at: l.t, tag: l.tag }; }).reverse();
  return '<div class="tm-laps-hd"><span class="tm-lbl">' + (TM.restOn ? 'Rounds' : 'Splits') + ' \u00B7 ' +
    (TM.restOn ? TM.laps.filter(l => l.kind === 'work').length : TM.laps.length) + '</span>' +
    '<button type="button" class="btn-sm tm-copy" data-copy-splits>Copy</button></div>' +
    rows.map(r => '<div class="tm-lap' + (r.rest ? ' rest' : '') + '"><span class="tm-lap-n">' + r.n + '</span>' +
      '<span class="tm-lap-split">' + fmt(r.split) + '</span><span class="tm-lap-at">at ' + fmt(r.at) + (r.tag ? ' \u00B7 ' + r.tag : '') + '</span></div>').join('');
}

// The workout as text for the results box:
//   Round 1: 3:30
//   Round 2: 3:34, rest 1:29      ← rests only when they weren't all the same
//   Total: 12:40
// When the clock was paused or finished without a last split, that last
// stretch counts as the final round.
function splitsText() {
  const lead = TM.phases ? leadOf(TM.phases) : 0;
  const end = Math.max(0, tmElapsed() - lead);
  const stopped = TM.state !== 'running';
  const rounds = [];
  let prev = 0;
  if (TM.restOn) {
    TM.laps.forEach(l => {
      const d = l.t - prev; prev = l.t;
      if (l.kind === 'work') rounds.push({ work: d, rest: null });
      else if (rounds.length) rounds[rounds.length - 1].rest = d;
    });
    if (stopped && !TM.inRest && end - prev >= 1) rounds.push({ work: end - prev, rest: null });
  } else {
    TM.laps.forEach(l => { rounds.push({ work: l.t - prev, rest: null }); prev = l.t; });
    if (stopped && end - prev >= 1) rounds.push({ work: end - prev, rest: null });
  }
  const rests = rounds.filter(r => r.rest != null).map(r => Math.round(r.rest));
  const showRest = new Set(rests).size > 1;
  const lines = rounds.map((r, i) => 'Round ' + (i + 1) + ': ' + fmt(r.work) +
    (showRest && r.rest != null ? ', rest ' + fmt(r.rest) : ''));
  if (lines.length) lines.push('Total: ' + fmt(end));
  return lines.join('\n');
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

  syncSplitBtn();
  renderCount();

  const snd = document.getElementById('tm-snd');
  snd.innerHTML = c.sound ? ICON.sound : ICON.muted;
  snd.setAttribute('aria-label', c.sound ? 'Sound on' : 'Sound off');

  const laps = document.getElementById('tm-laps');
  const lh = lapsHTML();
  laps.hidden = !lh;
  laps.innerHTML = lh;

  const k = document.getElementById('tm-kicker');
  if (k) k.textContent = idle ? 'Workout clock' : MODE_NAME[c.mode];

  lastFace = '';
  tmRenderFace();
  tmTabLabel();
}

function commitField(input) {
  const path = input.dataset.field, f = fieldSpec(path);
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
    // Tapping the clock face records a split / round (not the sound button).
    if (t.closest('#tm-count-undo')) { countRound(-1); return; }
    if (t.closest('#tm-face') && !t.closest('#tm-snd')) {
      if (TM.state === 'running') { if (TM.counterOn) countRound(1); else tmRound(); }
      return;
    }
    const mode = t.closest('[data-mode]');
    if (mode && TM.state === 'idle') { TM.cfg.mode = mode.dataset.mode; saveCfg(); tmRender(); return; }

    const step = t.closest('[data-step]');
    if (step) {
      const path = step.dataset.step, f = fieldSpec(path), dir = +step.dataset.dir;
      const cur = cfgGet(path);
      // Snap to the step, so 0:47 then + goes to 0:50, not 0:52.
      const next = dir > 0 ? Math.floor(cur / f.step) * f.step + f.step : Math.ceil(cur / f.step) * f.step - f.step;
      cfgSet(path, Math.min(f.max, Math.max(f.min, next)));
      tmRender();
      return;
    }

    const pre = t.closest('[data-preset]');
    if (pre) { const p = TM_PRESETS[+pre.dataset.preset]; Object.assign(TM.cfg.intervals, { work:p.work, rest:p.rest, rounds:p.rounds }); saveCfg(); tmRender(); return; }

    if (t.closest('[data-var-add]')) {
      const L = TM.cfg.intervals.list, last = L[L.length - 1];
      if (L.length < TM_VAR_MAX) L.push({ work: last.work, rest: last.rest });
      saveCfg(); tmRender(); return;
    }
    const del = t.closest('[data-var-del]');
    if (del) {
      const L = TM.cfg.intervals.list;
      if (L.length > 1) L.splice(+del.dataset.varDel, 1);
      saveCfg(); tmRender(); return;
    }

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
    if (t.closest('[data-copy-splits]')) {
      const text = splitsText();
      copyText(text).then(ok => showToast(ok ? 'Splits copied \u2014 paste them into your results' : 'Couldn\u2019t copy \u2014 your browser blocked it', ok ? 'ok' : 'err'));
      return;
    }
    if (t.closest('#tm-round')) { tmRound(); return; }
    if (t.closest('#tm-snd'))   {
      TM.cfg.sound = !TM.cfg.sound; saveCfg();
      if (TM.cfg.sound) { unlockAudio(); tone(880, 0.08); setTimeout(sleepAudio, 600); }
      tmRender();
    }
  });

  view.addEventListener('change', e => {
    if (e.target.matches('[data-cap]')) { cfgSet('fortime.capOn', e.target.checked); tmRender(); return; }
    if (e.target.matches('[data-restopt]')) { cfgSet('fortime.rest', e.target.checked); tmRender(); return; }
    if (e.target.matches('[data-restfixed]')) { cfgSet('fortime.restFixed', e.target.checked); tmRender(); return; }
    if (e.target.matches('[data-variable]')) { cfgSet('intervals.variable', e.target.checked); tmRender(); return; }
    if (e.target.matches('[data-counter]')) { TM.cfg.counter = e.target.checked; saveCfg(); tmRender(); return; }
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
injectCalc();          // % button in the top bar, there from the start
patchMainScript();
wireTimer();
tmRender();
if (typeof applyTextScale === 'function') applyTextScale();

/* ───────────────────────────────────────────────────────────────
   % CALCULATOR
   Opens from the % button in the top bar, or from a section whose
   programming mentions percentages ("5x3 @ 60-65%", "4 @ 165 (72%)").
   The athlete enters their max once per lift; it's remembered on this
   device, and the chart shows every 5% plus the workout's own numbers.
   ─────────────────────────────────────────────────────────────── */
const PC_PREFS_KEY = 'td_calc_prefs';
const PC = { key: '', pcts: [], ranges: [], unit: 'lb' };

function pcMaxesKey() { return 'td_maxes_' + ((typeof S !== 'undefined' && S.user) ? S.user.id : 'anon'); }
function pcLoad(k, fallback) { try { return JSON.parse(localStorage.getItem(k)) || fallback; } catch (e) { return fallback; } }
function pcSave(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

// Percentages written in a section: "60-65%", "60 to 65%", "60%-65%", "72%".
function pcFind(text) {
  const out = { pcts: [], ranges: [] };
  const s = String(text || '');
  const re = /(\d{1,3}(?:\.\d+)?)\s*%?\s*(?:-|–|—|to)\s*(\d{1,3}(?:\.\d+)?)\s*%|(\d{1,3}(?:\.\d+)?)\s*%/gi;
  let m;
  while ((m = re.exec(s))) {
    if (m[3] != null) {
      const v = parseFloat(m[3]);
      if (v >= 20 && v <= 120) out.pcts.push(v);
    } else {
      const a = parseFloat(m[1]), b = parseFloat(m[2]);
      if (a >= 20 && b <= 120 && a < b) { out.ranges.push([a, b]); out.pcts.push(a, b); }
    }
  }
  out.pcts = [...new Set(out.pcts)].sort((x, y) => x - y);
  return out;
}

// Lift name for the title, and a key that groups "Back Squat" days together.
function pcLiftOf(title) {
  const clean = String(typeof stripInline === 'function' ? stripInline(title) : title)
    .replace(/^[A-Za-z]{1,3}[.):\-]\s+/, '').trim();
  const k = typeof liftKey === 'function' ? liftKey(clean) : null;
  return { name: clean, key: (k || clean).toLowerCase() };
}

function pcFmt(n) { return (Math.round(n * 10) / 10).toString(); }
// Exact, shown to the nearest tenth (pcFmt) — no rounding to plates.
function pcWeight(max, pct) { return max * pct / 100; }

function injectCalc() {
  const right = document.querySelector('#s-app .app-hd .hd-right');
  if (right && !document.getElementById('pc-hd-btn')) {
    const b = document.createElement('button');
    b.id = 'pc-hd-btn'; b.className = 'hd-icon pc-hd-btn'; b.type = 'button';
    b.title = 'Percentage calculator'; b.setAttribute('aria-label', 'Percentage calculator');
    b.textContent = '%';
    b.addEventListener('click', () => openCalc(null));
    right.insertBefore(b, right.firstChild);
  }
  if (document.getElementById('m-pct')) return;
  document.body.insertAdjacentHTML('beforeend',
    '<div class="modal-bg" id="m-pct"><div class="modal">' +
      '<div class="modal-hd"><div class="modal-title">% Calculator</div>' +
        '<button class="modal-close" type="button" onclick="closeModal(\'m-pct\')" aria-label="Close">&#10005;</button></div>' +
      '<div class="modal-body">' +
        '<div class="pc-row2"><div class="fld"><label for="pc-max">Your max (1RM)</label>' +
          '<input type="text" id="pc-max" class="pc-max" inputmode="decimal" placeholder="0" autocomplete="off"></div>' +
          '<div class="pc-seg" role="group" aria-label="Units"><button type="button" data-unit="lb">lb</button><button type="button" data-unit="kg">kg</button></div></div>' +
        '<div id="pc-out"></div>' +
      '</div>' +
    '</div></div>');

  const bg = document.getElementById('m-pct');
  bg.addEventListener('click', e => { if (e.target === bg) closeModal('m-pct'); });
  document.getElementById('pc-max').addEventListener('input', e => {
    const v = parseFloat(String(e.target.value).replace(',', '.'));
    // Remembered quietly: per section lift (so a squat day reopens with the
    // squat number), and as the last number for the top-bar button.
    if (v > 0) {
      if (PC.key) { const maxes = pcLoad(pcMaxesKey(), {}); maxes[PC.key] = { max: v, unit: PC.unit }; pcSave(pcMaxesKey(), maxes); }
      const p = pcLoad(PC_PREFS_KEY, {}); p.lastMax = v; p.unit = PC.unit; pcSave(PC_PREFS_KEY, p);
    }
    renderCalc(false);
  });
  bg.querySelector('.pc-seg').addEventListener('click', e => {
    const b = e.target.closest('[data-unit]');
    if (!b || b.dataset.unit === PC.unit) return;
    setUnit(b.dataset.unit);
    const maxes = pcLoad(pcMaxesKey(), {});
    if (PC.key && maxes[PC.key]) { maxes[PC.key].unit = PC.unit; pcSave(pcMaxesKey(), maxes); }
    renderCalc(true);
  });
}

function setUnit(u) {
  PC.unit = u === 'kg' ? 'kg' : 'lb';
  const p = pcLoad(PC_PREFS_KEY, {}); p.unit = PC.unit; pcSave(PC_PREFS_KEY, p);
}

function openCalc(section) {
  injectCalc();
  const prefs = pcLoad(PC_PREFS_KEY, {});
  PC.unit = prefs.unit === 'kg' ? 'kg' : 'lb';
  let start = '';
  if (section) {
    PC.key = pcLiftOf(section.title).key;
    const f = pcFind(section.text);
    PC.pcts = f.pcts; PC.ranges = f.ranges;
    const saved = pcLoad(pcMaxesKey(), {})[PC.key];
    if (saved) { start = saved.max; if (saved.unit !== PC.unit) setUnit(saved.unit); }
  } else {
    PC.key = ''; PC.pcts = []; PC.ranges = [];
    if (prefs.lastMax > 0) start = prefs.lastMax;
  }
  const box = document.getElementById('pc-max');
  box.value = start ? pcFmt(start) : '';
  renderCalc(true);
  PC.compact = !!section;
  document.getElementById('m-pct').classList.toggle('pc-compact', PC.compact);
  renderCalc(true);
  openModal('m-pct');
  // Number selected, so typing replaces it.
  setTimeout(() => { box.focus(); box.select(); }, 80);
}

function renderCalc(full) {
  if (full) {
    document.querySelectorAll('#m-pct [data-unit]').forEach(b => b.classList.toggle('on', b.dataset.unit === PC.unit));
  }

  const out = document.getElementById('pc-out');
  const max = parseFloat(String(document.getElementById('pc-max').value).replace(',', '.'));
  if (!(max > 0)) {
    out.innerHTML = '<div class="pc-empty">Enter your max to see your weights' +
      (PC.pcts.length ? ' for ' + PC.pcts.map(p => pcFmt(p) + '%').join(', ') : '') + '.</div>';
    return;
  }
  const u = PC.unit;
  let html = '';

  // The workout's own numbers, up top
  if (PC.pcts.length) {
    const parts = [];
    const inRange = new Set();
    PC.ranges.forEach(([a, b]) => { inRange.add(a); inRange.add(b);
      parts.push({ label: pcFmt(a) + '–' + pcFmt(b) + '%', val: pcFmt(pcWeight(max, a)) + '–' + pcFmt(pcWeight(max, b)) }); });
    PC.pcts.filter(p => !inRange.has(p)).forEach(p => parts.push({ label: pcFmt(p) + '%', val: pcFmt(pcWeight(max, p)) }));
    html += '<div class="pc-today"><div class="pc-today-lbl">In this workout</div>' +
      parts.map(x => '<div class="pc-today-val">' + x.val + ' <small style="font-family:var(--sans);font-size:12px;font-weight:700;color:var(--ink-3)">' + u + '</small></div>' +
        '<div class="pc-today-pct">' + x.label + ' of ' + pcFmt(max) + ' ' + u + '</div>').join('<div style="height:8px"></div>') + '</div>';
  }

  // Every 5% from 40 to 100, plus any of the workout's own numbers in between
  const top = Math.max(100, ...PC.pcts.map(p => Math.ceil(p / 5) * 5));
  const rows = new Set();
  for (let p = 40; p <= top; p += 5) rows.add(p);
  PC.pcts.forEach(p => rows.add(p));
  const isBand = p => PC.ranges.some(([a, b]) => p > a && p < b);
  const sorted = [...rows].sort((a, b) => a - b);
  // From a workout section: two columns, read down the left then the
  // right, so the whole chart fits on one screen.
  const perCol = PC.compact ? Math.ceil(sorted.length / 2) : sorted.length;
  html += '<div class="pc-table"' + (PC.compact ? ' style="grid-template-rows:repeat(' + perCol + ', auto)"' : '') + '>' +
    sorted.map((p, i) => {
      const hit = PC.pcts.includes(p);
      const cls = (hit ? ' hit' : isBand(p) ? ' band' : '') +
        (PC.compact ? ((i % perCol) % 2 ? ' alt' : '') + (i < perCol ? ' l' : '') + (i % perCol === 0 ? ' top' : '') : '');
      return '<div class="pc-tr' + cls + '">' +
        '<span class="pc-pct">' + pcFmt(p) + '%</span>' +
        '<span class="pc-tag">' + (hit && !PC.compact ? 'Today' : '') + '</span>' +
        '<span class="pc-w">' + pcFmt(pcWeight(max, p)) + '<small>' + u + '</small></span></div>';
    }).join('') + '</div>' +
    (PC.compact ? '' : '<div class="pc-note">Your max is saved on this phone.</div>');
  out.innerHTML = html;
}

// A Calculator button on sections whose programming mentions percentages.
(function hookSections() {
  const orig = window.buildSecCard;
  if (typeof orig !== 'function') return;
  window.buildSecCard = function (text) {
    const card = orig.apply(this, arguments);
    try {
      const f = pcFind(text);
      if (!f.pcts.length) return card;
      const title = String(text).trim().split('\n')[0];
      const btn = document.createElement('button');
      btn.type = 'button'; btn.className = 'pc-open';
      const what = f.ranges.length ? f.ranges.map(([a, b]) => pcFmt(a) + '–' + pcFmt(b) + '%') : [];
      const singles = f.pcts.filter(p => !f.ranges.some(([a, b]) => p === a || p === b)).map(p => pcFmt(p) + '%');
      btn.innerHTML = '<span class="pc-open-ico">%</span><span class="pc-open-txt"><span class="pc-open-lbl">Calculator</span>' +
        '<span class="pc-open-sub"></span></span><span class="pc-open-chev">&#8250;</span>';
      // With a saved max, preview the weights right on the button: "60–65% · 185–195 lb"
      const saved = pcLoad(pcMaxesKey(), {})[pcLiftOf(title).key];
      let preview = ' · enter your max';
      if (saved) {
        const w = p => pcFmt(saved.max * p / 100);
        const ws = f.ranges.map(([a, b]) => w(a) + '–' + w(b))
          .concat(f.pcts.filter(p => !f.ranges.some(([a, b]) => p === a || p === b)).map(w));
        preview = ' · ' + ws.join(', ') + ' ' + saved.unit;
      }
      btn.querySelector('.pc-open-sub').textContent = what.concat(singles).join(', ') + preview;
      btn.addEventListener('click', e => { e.stopPropagation(); openCalc({ title, text }); });
      const body = card.querySelector('.sec-body'), t = body && body.querySelector('.t-text');
      if (t) t.after(btn); else if (body) body.prepend(btn);
    } catch (e) { console.warn('Calculator button:', e); }
    return card;
  };
})();

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
   COACH: ATHLETE LIST
   Replaces the wide table with a list that works on a phone. The
   table is still drawn (hidden), so everything that updates it keeps
   working; Edit still has every detail, spreadsheet included.
   ─────────────────────────────────────────────────────────────── */
let rosterQuery = '';
let rosterActId = null;

function rosterRow(u) {
  const isCoachRow = u.role === 'coach';
  const row = document.createElement('div');
  row.className = 'ros-row' + (isCoachRow ? ' coach' : '');
  row.innerHTML =
    '<button type="button" class="ros-main"><span class="ros-av"></span>' +
      '<span class="ros-mid"><span class="ros-name"></span><span class="ros-sub"></span></span>' +
      (isCoachRow ? '<span class="ros-tag coach">Coach</span>'
                  : (u.spreadsheetId ? '' : '<span class="ros-tag">No sheet</span>') + '<span class="ros-chev">&#8250;</span>') +
    '</button>' +
    '<button type="button" class="ros-more" aria-label="More options">&#8943;</button>';
  row.querySelector('.ros-av').textContent = (u.name || '?').trim().charAt(0).toUpperCase() || '?';
  row.querySelector('.ros-name').textContent = u.name || 'Unnamed';
  row.querySelector('.ros-sub').textContent = u.email || '';
  row.querySelector('.ros-main').addEventListener('click', () => {
    if (isCoachRow) openEditUser(u.id);        // coaches have no program to view
    else adminViewUser(u.id);
  });
  row.querySelector('.ros-more').addEventListener('click', () => openRosterActions(u.id));
  return row;
}

// ── Emails for a batch message ──────────────────────────────────
// "a@x.com, b@y.com" works pasted into the To or BCC line of Gmail,
// Apple Mail and Outlook.
function emailList(people) {
  const seen = new Set();
  return people.map(p => String(p.email || '').trim()).filter(e => {
    const k = e.toLowerCase();
    if (!e || !/@/.test(e) || seen.has(k)) return false;
    seen.add(k); return true;
  });
}
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch (e) {}
  try {                                          // older browsers
    const ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy'); ta.remove(); return ok;
  } catch (e) { return false; }
}
async function copyEmails(people, what) {
  const list = emailList(people);
  if (!list.length) { showToast('No emails to copy', 'err'); return; }
  const ok = await copyText(list.join(', '));
  showToast(ok ? 'Copied ' + list.length + (list.length === 1 ? ' email' : ' emails') + (what ? ' \u00B7 ' + what : '')
               : 'Couldn\u2019t copy \u2014 your browser blocked it', ok ? 'ok' : 'err');
}
// Opens the mail app with everyone in BCC, so no one sees the others' addresses.
function emailAll(people) {
  const list = emailList(people);
  if (!list.length) { showToast('No emails to send to', 'err'); return; }
  const me = (typeof S !== 'undefined' && S.user && S.user.email) || '';
  window.TD_EMAILS.open('mailto:' + encodeURIComponent(me) + '?bcc=' + list.map(encodeURIComponent).join(','));
}
window.TD_EMAILS = { copy: copyEmails, emailAll, list: emailList, open: url => { window.location.href = url; } };

function rosterAthletes() {
  const q = rosterQuery.trim().toLowerCase();
  return (window.PROFILES || []).filter(u => u.role !== 'coach' &&
    (!q || ((u.name || '') + ' ' + (u.email || '')).toLowerCase().includes(q)));
}
function renderRosterBar() {
  const bar = document.getElementById('ros-mail');
  if (!bar) return;
  const n = emailList(rosterAthletes()).length;
  const filtered = !!rosterQuery.trim();
  bar.hidden = !n;
  bar.querySelector('[data-mail="copy"]').textContent = 'Copy ' + (filtered ? n + ' ' : 'all ') + (n === 1 ? 'email' : 'emails');
  bar.querySelector('.ros-mail-note').textContent = n + (n === 1 ? ' email' : ' emails') + (filtered ? ' \u00B7 matching search' : '');
}

function renderRoster() {
  renderRosterBar();
  const box = document.getElementById('td-roster');
  if (!box) return;
  const all = (window.PROFILES || []).slice().sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  const q = rosterQuery.trim().toLowerCase();
  const match = u => !q || ((u.name || '') + ' ' + (u.email || '')).toLowerCase().includes(q);
  const athletes = all.filter(u => u.role !== 'coach' && match(u));
  const coaches = all.filter(u => u.role === 'coach' && match(u));
  box.innerHTML = '';
  if (!all.length) { box.innerHTML = '<div class="ros-list"><div class="ros-none">No athletes yet — tap + Add User.</div></div>'; return; }
  if (!athletes.length && !coaches.length) {
    const none = document.createElement('div');
    none.className = 'ros-list';
    none.innerHTML = '<div class="ros-none"></div>';
    none.firstChild.textContent = 'No one matches “' + rosterQuery.trim() + '”.';
    box.appendChild(none);
    return;
  }
  const section = (label, people) => {
    if (!people.length) return;
    const h = document.createElement('div');
    h.className = 'ros-sec';
    h.textContent = label + ' · ' + people.length;
    const list = document.createElement('div');
    list.className = 'ros-list';
    people.forEach(u => list.appendChild(rosterRow(u)));
    box.appendChild(h); box.appendChild(list);
  };
  section('Athletes', athletes);
  section(coaches.length === 1 ? 'Coach' : 'Coaches', coaches);
}

function openRosterActions(id) {
  const u = (window.PROFILES || []).find(p => p.id === id);
  if (!u) return;
  rosterActId = id;
  const isCoachRow = u.role === 'coach';
  const self = typeof S !== 'undefined' && S.user && S.user.id === id;
  document.getElementById('m-ros-title').textContent = u.name || 'Unnamed';
  const show = (sel, on) => { document.querySelector(sel).hidden = !on; };
  show('[data-ros="view"]', !isCoachRow);
  show('[data-ros="msg"]', !isCoachRow && !!(window.TD_CHAT && window.TD_CHAT.open));
  show('[data-ros="del"]', !self);
  openModal('m-ros');
}

function setupRoster() {
  const panel = document.getElementById('adm-users');
  if (!panel || typeof window.renderUserTable !== 'function' || document.getElementById('td-roster')) return;
  const hd = panel.querySelector('.users-hd');
  const holder = document.createElement('div');
  holder.innerHTML = '<input type="search" class="ros-search" placeholder="Search athletes" autocomplete="off" aria-label="Search athletes">' +
                     '<div class="ros-mail" id="ros-mail" hidden><span class="ros-mail-note"></span>' +
                       '<button type="button" class="btn-sm" data-mail="copy">Copy all emails</button>' +
                       '<button type="button" class="btn-sm" data-mail="send">Email all</button></div>' +
                     '<div id="td-roster"></div>';
  if (hd) hd.after(...holder.childNodes); else panel.prepend(...holder.childNodes);
  panel.querySelector('.ros-search').addEventListener('input', e => { rosterQuery = e.target.value; renderRoster(); });
  panel.querySelector('#ros-mail').addEventListener('click', e => {
    const b = e.target.closest('[data-mail]');
    if (!b) return;
    const people = rosterAthletes();
    if (b.dataset.mail === 'copy') copyEmails(people);
    else emailAll(people);
  });

  document.body.insertAdjacentHTML('beforeend',
    '<div class="modal-bg" id="m-ros"><div class="modal" style="max-width:420px">' +
      '<div class="modal-hd"><div class="modal-title" id="m-ros-title"></div>' +
        '<button class="modal-close" type="button" onclick="closeModal(\'m-ros\')">&#10005;</button></div>' +
      '<div class="modal-body"><div class="ros-acts">' +
        '<button type="button" class="ros-act" data-ros="view">View program</button>' +
        '<button type="button" class="ros-act" data-ros="msg">Message</button>' +
        '<button type="button" class="ros-act" data-ros="edit">Edit details &amp; spreadsheet</button>' +
        '<button type="button" class="ros-act danger" data-ros="del">Delete</button>' +
      '</div></div></div></div>');
  const sheet = document.getElementById('m-ros');
  sheet.addEventListener('click', e => {
    if (e.target === sheet) { closeModal('m-ros'); return; }
    const b = e.target.closest('[data-ros]');
    if (!b || !rosterActId) return;
    const id = rosterActId;
    closeModal('m-ros');
    if (b.dataset.ros === 'view') adminViewUser(id);
    else if (b.dataset.ros === 'msg') window.TD_CHAT.open('d:' + id);
    else if (b.dataset.ros === 'edit') openEditUser(id);
    else if (b.dataset.ros === 'del') openDeleteUser(id);
  });

  const orig = window.renderUserTable;
  window.renderUserTable = function () {
    try { orig.apply(this, arguments); } catch (e) { console.warn(e); }
    renderRoster();
  };
  renderRoster();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setupRoster);
else setTimeout(setupRoster, 0);

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
