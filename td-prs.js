/* ═══════════════════════════════════════════════════════════════
   TRAINDERIVE — Personal Records
   ───────────────────────────────────────────────────────────────
   An add-on, like td-chat.js. Load it AFTER athlete-tabs.js, just
   above </body>:

       <script src="athlete-tabs.js?v=…"></script>
       <script src="td-prs.js?v=1"></script>

   Needs prs-setup.sql run once in Supabase first.

   Athlete
   • Account → Personal Records, and a "My PRs" tab on the % button.
   • Tabs: Barbell · Gymnastics · Endurance · Benchmarks. Records first,
     then everything not logged yet.
   • A movement's page: the record and its date, a percentages chart for
     lifts, a progress line, every entry, and Add PR.
   • Lifts keep 1RM, 2RM, 3RM, 5RM and 10RM separately.
   • The % calculator fills in the athlete's max from their record when
     opened on a lift that has one, and offers their lifts as one-tap
     chips. It never guesses a max from the workout text alone.

   Coach
   • PRs on each athlete's page: see, add, correct or delete.
   • Settings → PR movements: add, rename or hide what athletes can log.

   Records are only ever entered against the fixed movement list, never
   read from the programming, so how a lift is written in the sheet
   can't split or muddle anyone's history.
   ═══════════════════════════════════════════════════════════════ */
(function () {
'use strict';
if (window.TD_PRS) return;

const CATS = [
  { id: 'barbell',    label: 'Barbell' },
  { id: 'gymnastics', label: 'Gymnastics' },
  { id: 'endurance',  label: 'Endurance' },
  { id: 'benchmark',  label: 'Benchmarks' },
];
const SCORES = { weight: 'Heaviest weight', time: 'Fastest time', reps: 'Most reps', rounds: 'Rounds + reps' };
const RMS = [1, 2, 3, 5, 10];
const LB_PER_KG = 2.20462262;
const MOVES_KEY = 'td_pr_moves_v1';
const PREFS_KEY = 'td_calc_prefs';          // shared with the % calculator: lb or kg
const M_COLS = 'id,slug,name,category,grp,score,description,sort,hidden';
const R_COLS = 'id,athlete_id,movement_id,value,unit,reps,done_on,note,created_at';
const GRID = [105, 100, 95, 90, 85, 80, 75, 70, 65, 60, 55, 50, 45, 40, 35, 30];

/* ───────────────────────────────────────────────────────────────
   STYLES
   ─────────────────────────────────────────────────────────────── */
const CSS = `
#m-prs .modal { max-width:560px; }
#m-prs .modal-body { padding:0; }
.pr-host { padding:14px 16px 0; min-height:240px; }
#pc-prs-host { padding:0; min-height:200px; }
.pr-top { display:flex; gap:8px; align-items:center; margin-bottom:10px; }
.pr-search { flex:1; min-width:0; background:var(--paper); border:1px solid var(--line); border-radius:4px;
  padding:10px 12px; font:inherit; font-size:16px; color:var(--ink); outline:none; }
.pr-search:focus { border-color:var(--blue); }
.pr-seg { display:flex; border:1px solid var(--line); border-radius:4px; overflow:hidden; flex-shrink:0; height:42px; }
.pr-seg button { min-width:42px; padding:0 10px; background:var(--paper); border:0; cursor:pointer; color:var(--ink-3);
  font:800 11px var(--sans); letter-spacing:1.4px; text-transform:uppercase; }
.pr-seg button + button { border-left:1px solid var(--line); }
.pr-seg button.on { background:var(--blue); color:#fff; }
.pr-cats { display:flex; gap:4px; overflow-x:auto; margin:0 -16px 12px; padding:0 16px; scrollbar-width:none; }
.pr-cats::-webkit-scrollbar { display:none; }
.pr-cat { flex-shrink:0; background:none; border:0; border-bottom:3px solid transparent; padding:8px 8px 7px; cursor:pointer;
  font-family:var(--display); font-size:19px; letter-spacing:1px; line-height:1; color:var(--ink-3); }
.pr-cat.on { color:var(--ink); border-bottom-color:var(--blue); }
.pr-sec { font-size:9px; font-weight:800; letter-spacing:2px; text-transform:uppercase; color:var(--ink-3); margin:14px 2px 6px; }
.pr-sec:first-child { margin-top:2px; }
.pr-list { background:var(--paper); border:1px solid var(--line); border-radius:4px; overflow:hidden; }
.pr-row { display:flex; align-items:center; gap:10px; width:100%; padding:12px 12px; background:none; border:0;
  border-top:1px solid var(--line); font:inherit; color:inherit; text-align:left; cursor:pointer; }
.pr-row:first-child { border-top:0; }
.pr-row:hover { background:var(--wash); }
.pr-medal { width:22px; height:22px; flex-shrink:0; color:var(--gold); }
.pr-row.empty .pr-medal { color:var(--line); }
.pr-row-mid { flex:1; min-width:0; }
.pr-row-name { display:block; font-weight:700; font-size:14.5px; color:var(--ink); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.pr-row-sub { display:block; font-size:11.5px; color:var(--ink-3); margin-top:1px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.pr-row.empty .pr-row-name { color:var(--ink-2); font-weight:600; }
.pr-row-val { font-family:var(--display); font-size:22px; line-height:1; color:var(--ink); padding-top:2px; white-space:nowrap; }
.pr-row.empty .pr-row-val { font-family:var(--sans); font-size:10px; font-weight:800; letter-spacing:1.4px; text-transform:uppercase; color:var(--blue); }
.pr-row-ch { color:var(--ink-3); font-size:17px; flex-shrink:0; }
.pr-tag { display:inline-block; font-size:8.5px; font-weight:800; letter-spacing:1.2px; text-transform:uppercase; vertical-align:2px;
  padding:2px 5px; border-radius:2px; color:var(--ink-3); border:1px solid var(--line); margin-left:5px; }
.pr-tag.hid { color:var(--magenta); border-color:rgba(204,18,102,.3); }
.pr-none { padding:30px 14px; text-align:center; font-size:13.5px; line-height:1.6; color:var(--ink-3); }
.pr-err { padding:22px 14px; text-align:center; font-size:13.5px; line-height:1.6; color:var(--magenta); }
.pr-foot-note { font-size:11.5px; line-height:1.5; color:var(--ink-3); text-align:center; padding:14px 6px 18px; }

.pr-back { display:inline-flex; align-items:center; gap:6px; background:none; border:0; cursor:pointer; padding:4px 0 10px;
  font:800 9.5px var(--sans); letter-spacing:1.8px; text-transform:uppercase; color:var(--blue); }
.pr-h { font-family:var(--display); font-size:34px; line-height:.95; color:var(--ink); }
.pr-h-sub { font-size:12px; color:var(--ink-3); margin:4px 0 2px; }
.pr-desc { font-size:13px; line-height:1.55; color:var(--ink-2); margin-top:6px; }
.pr-rms { display:flex; gap:6px; flex-wrap:wrap; margin:12px 0 0; }
.pr-chip { font:800 10px var(--sans); letter-spacing:1.3px; text-transform:uppercase; padding:8px 10px; cursor:pointer;
  border:1px solid var(--line); border-radius:3px; background:var(--paper); color:var(--ink-2); }
.pr-chip.on { background:var(--blue-soft); border-color:var(--blue); color:var(--blue); }
.pr-chip.dim { opacity:.55; }
.pr-hero { display:flex; align-items:center; gap:12px; margin:12px 0 4px; padding:14px; background:var(--paper);
  border:1px solid var(--line); border-left:4px solid var(--gold); border-radius:0 4px 4px 0; }
.pr-hero .pr-medal { width:30px; height:30px; }
.pr-hero-val { font-family:var(--display); font-size:40px; line-height:.9; color:var(--ink); padding-top:3px; }
.pr-hero-val small { font-family:var(--sans); font-size:13px; font-weight:700; color:var(--ink-3); margin-left:4px; }
.pr-hero-mid { flex:1; min-width:0; }
.pr-hero-date { font-size:12px; font-weight:600; color:var(--ink-3); margin-top:5px; }
.pr-hero.none { border-left-color:var(--line); }
.pr-hero.none .pr-hero-val { font-size:24px; color:var(--ink-3); }
.pr-h2 { display:flex; align-items:center; justify-content:space-between; gap:10px; margin:20px 2px 8px; }
.pr-h2 span { font-family:var(--display); font-size:22px; line-height:1; color:var(--ink); padding-top:2px; }
.pr-grid { display:grid; grid-template-columns:repeat(4, 1fr); border:1px solid var(--line); border-radius:4px; overflow:hidden; background:var(--paper); }
.pr-cell { text-align:center; padding:9px 4px 8px; border-top:1px solid var(--line); border-left:1px solid var(--line); }
.pr-cell:nth-child(-n+4) { border-top:0; }
.pr-cell:nth-child(4n+1) { border-left:0; }
.pr-cell b { display:block; font-family:var(--display); font-weight:400; font-size:20px; line-height:1; color:var(--ink); padding-top:2px; }
.pr-cell i { display:block; font-style:normal; font-size:10.5px; font-weight:700; color:var(--ink-3); margin-top:3px; }
.pr-cell.hundred { background:#FCF5E8; }
.pr-cell.hundred b { color:var(--gold-ink); }
@media (max-width:360px) { .pr-grid { grid-template-columns:repeat(3, 1fr); }
  .pr-cell:nth-child(-n+4) { border-top:1px solid var(--line); } .pr-cell:nth-child(-n+3) { border-top:0; }
  .pr-cell:nth-child(4n+1) { border-left:1px solid var(--line); } .pr-cell:nth-child(3n+1) { border-left:0; } }
.pr-grid-note { font-size:11.5px; color:var(--ink-3); margin:6px 2px 0; }
.pr-chart { background:var(--paper); border:1px solid var(--line); border-radius:4px; padding:8px 6px 4px; }
.pr-chart svg { display:block; width:100%; height:auto; overflow:visible; }
.pr-ents { background:var(--paper); border:1px solid var(--line); border-radius:4px; overflow:hidden; }
.pr-ent { display:flex; align-items:center; gap:10px; width:100%; padding:11px 12px; border:0; border-top:1px solid var(--line);
  background:none; font:inherit; color:inherit; text-align:left; cursor:pointer; }
.pr-ent:first-child { border-top:0; }
.pr-ent:hover { background:var(--wash); }
.pr-ent-val { font-family:var(--display); font-size:22px; line-height:1; color:var(--ink); padding-top:2px; min-width:88px; }
.pr-ent-mid { flex:1; min-width:0; }
.pr-ent-date { display:block; font-size:12.5px; font-weight:600; color:var(--ink-2); }
.pr-ent-note { display:block; font-size:12px; color:var(--ink-3); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.pr-best { font:800 8.5px var(--sans); letter-spacing:1.3px; text-transform:uppercase; color:var(--gold-ink);
  border:1px solid var(--gold); border-radius:2px; padding:3px 5px; flex-shrink:0; }
.pr-bar { position:sticky; bottom:0; z-index:3; display:flex; gap:8px; margin:16px -16px 0; padding:12px 16px calc(12px + env(safe-area-inset-bottom, 0px));
  background:var(--paper); border-top:1px solid var(--line); }
.pr-bar .btn-main { flex:1; width:auto; }
.pr-bar .btn-sm { height:auto; }

.pr-form .fld { margin-bottom:12px; }
.pr-big { font-family:var(--display) !important; font-size:34px !important; line-height:1 !important; padding:8px 12px 6px !important; }
.pr-pair { display:flex; gap:8px; align-items:flex-end; }
.pr-pair .fld { flex:1; min-width:0; }
.pr-pair .pr-seg { height:56px; margin-bottom:12px; }
.pr-plus { font-family:var(--display); font-size:30px; color:var(--ink-3); padding-bottom:22px; }
.pr-warn { background:#FCF5E8; border-left:4px solid var(--gold); border-radius:0 4px 4px 0; padding:10px 12px; margin:4px 0 12px;
  font-size:13px; line-height:1.5; color:var(--ink-2); }
.pr-ferr { font-size:12.5px; font-weight:600; color:var(--magenta); min-height:16px; margin:0 0 8px; }
.pr-del { color:var(--magenta) !important; }

/* % calculator: Calculator | My PRs */
.pr-pct-tabs { display:flex; border:1px solid var(--line); border-radius:4px; overflow:hidden; margin:0 0 14px; }
.pr-pct-tabs button { flex:1; padding:11px 0 9px; background:var(--paper); border:0; cursor:pointer; color:var(--ink-3);
  font-family:var(--display); font-size:19px; letter-spacing:1px; line-height:1; }
.pr-pct-tabs button + button { border-left:1px solid var(--line); }
.pr-pct-tabs button.on { background:var(--blue); color:#fff; }
#m-pct.pc-compact .pr-pct-tabs { margin-bottom:10px; }
#m-pct.pc-compact .pr-pct-tabs button { padding:8px 0 6px; font-size:17px; }
#m-pct.pr-on-prs .pc-row2, #m-pct.pr-on-prs #pc-out, #m-pct.pr-on-prs #pc-use { display:none !important; }
#m-pct:not(.pr-on-prs) #pc-prs-host { display:none; }
.pr-use { display:flex; gap:6px; overflow-x:auto; margin:-4px 0 12px; padding-bottom:2px; scrollbar-width:none; }
.pr-use::-webkit-scrollbar { display:none; }
.pr-use:empty { display:none; }
.pr-use .pr-chip { flex-shrink:0; text-transform:none; letter-spacing:0; font-size:12px; font-weight:700; }
.pr-use .pr-chip b { font-family:var(--display); font-weight:400; font-size:16px; margin-left:4px; vertical-align:-1px; }
.pr-from { font-size:12px; font-weight:600; color:var(--gold-ink); margin:-6px 0 10px 2px; }
.pr-from:empty { display:none; }

/* Account row */
.acc-pr-ico { width:36px; height:36px; flex-shrink:0; border-radius:3px; background:var(--gold-bg); color:var(--gold-ink);
  display:grid; place-items:center; }
.acc-pr-ico svg { width:22px; height:22px; }
.acc-row.acc-pr { justify-content:flex-start; }
.acc-row.acc-pr > div { flex:1; min-width:0; }

/* Coach: PRs button on an athlete's page */
#pr-coach-btn { height:38px; }
`;

const svg = inner => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" ' +
  'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + inner + '</svg>';
const MEDAL = svg('<circle cx="12" cy="9" r="6"/><path d="M12 6.2l.9 1.8 2 .3-1.4 1.4.3 2-1.8-.9-1.8.9.3-2-1.4-1.4 2-.3z" fill="currentColor" stroke="none"/><path d="M8.5 14l-1.8 6.5L12 18l5.3 2.5L15.5 14"/>');

/* ───────────────────────────────────────────────────────────────
   SMALL HELPERS
   ─────────────────────────────────────────────────────────────── */
const sb = () => window.SB || (typeof SB !== 'undefined' ? SB : null);
const me = () => (typeof S !== 'undefined' && S.user) ? S.user : null;
const isCoach = () => !!(me() && me().role === 'coach');
const toast = (m, t) => { if (typeof showToast === 'function') showToast(m, t); };
const pad = n => String(n).padStart(2, '0');
const todayISO = () => { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
const tenth = n => (Math.round((n + (n >= 0 ? 1e-9 : -1e-9)) * 10) / 10).toString();
function dateText(iso, year) {
  if (!iso) return '';
  const d = new Date(String(iso).slice(0, 10) + 'T12:00:00');
  const opts = { month: 'short', day: 'numeric' };
  if (year || d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
  return d.toLocaleDateString('en-US', opts);
}
// "Back Squat", "back squat", "Clean and Jerk" and "Clean & Jerk" all match.
const norm = s => String(s || '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
function friendly(err) {
  const m = String((err && (err.message || err.error)) || err || '');
  if (/td_prs|td_pr_movements|schema cache|does not exist/i.test(m)) return 'Personal records aren’t set up yet. Run prs-setup.sql in Supabase.';
  if (/td_pr_movements_name|duplicate key/i.test(m)) return 'There’s already a movement with that name.';
  if (/network|failed to fetch|load failed/i.test(m)) return 'No connection. Check your signal and try again.';
  if (/row-level security|permission|not authori/i.test(m)) return 'Not allowed — try signing out and back in.';
  return m || 'Something went wrong.';
}

/* ── Units + scores ────────────────────────────────── */
function prefs() { try { return JSON.parse(localStorage.getItem(PREFS_KEY)) || {}; } catch (e) { return {}; } }
function viewUnit() { return prefs().unit === 'kg' ? 'kg' : 'lb'; }
// Each lift shows in its own unit: the one picked on its page, else the
// unit its latest record was logged in, else the athlete's usual unit.
// So Olympic lifts can live in kg while squats stay in lb.
const UNITS_KEY = 'td_pr_units';
function unitPrefs() { try { return JSON.parse(localStorage.getItem(UNITS_KEY)) || {}; } catch (e) { return {}; } }
function unitFor(move, who) {
  const p = unitPrefs()[move.id];
  if (p === 'kg' || p === 'lb') return p;
  const latest = who ? recsFor(who, move.id)[0] : null;
  return latest && latest.unit ? latest.unit : viewUnit();
}
function setUnitFor(move, u) {
  const p = unitPrefs(); p[move.id] = u === 'kg' ? 'kg' : 'lb';
  try { localStorage.setItem(UNITS_KEY, JSON.stringify(p)); } catch (e) {}
}
function setViewUnit(u) { const p = prefs(); p.unit = u === 'kg' ? 'kg' : 'lb'; try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch (e) {} }
const toKg = (v, u) => u === 'kg' ? v : v / LB_PER_KG;
const fromKg = (kg, u) => u === 'kg' ? kg : kg * LB_PER_KG;
// A logged weight in the unit asked for: as typed when the units match,
// so 225 lb stays exactly 225 rather than going via kg and back.
const inUnit = (r, u) => r.unit === u ? r.value : fromKg(toKg(r.value, r.unit), u);
// Epley, only to estimate a 1RM when there's no real one.
const est1 = (kg, reps) => reps > 1 ? kg * (1 + reps / 30) : kg;

function fmtTime(sec) {
  const s = Math.round(sec), h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, x = s % 60;
  return h ? h + ':' + pad(m) + ':' + pad(x) : m + ':' + pad(x);
}
// "3:45" → 225, "1:02:03" → 3723. The iPhone number pad has no colon,
// so a dot or comma works too ("19.48"), and plain digits read as
// minutes and seconds ("1948" → 19:48, "45" → 45 seconds).
function parseTime(t) {
  let s = String(t || '').trim().replace(/\s+/g, '').replace(/[.,;]/g, ':');
  if (/^\d+$/.test(s)) {
    if (s.length <= 2) return parseInt(s, 10) || null;
    s = s.length <= 4 ? s.slice(0, -2) + ':' + s.slice(-2) : s.slice(0, -4) + ':' + s.slice(-4, -2) + ':' + s.slice(-2);
  }
  const m = /^(?:(\d+):)?(\d{1,2}):(\d{1,2})$/.exec(s);
  if (!m) return null;
  const sec = parseInt(m[3], 10), min = parseInt(m[2], 10), hr = m[1] ? parseInt(m[1], 10) : 0;
  if (sec >= 60 || (m[1] && min >= 60)) return null;
  return hr * 3600 + min * 60 + sec;
}

// What sorts a record: bigger is always better.
function rank(r, move) {
  if (move.score === 'weight') return toKg(r.value, r.unit);
  if (move.score === 'time') return -r.value;
  if (move.score === 'rounds') return r.value * 10000 + (r.reps || 0);
  return r.value;
}
function show(r, move, unit, bare) {
  if (!r) return '';
  if (move.score === 'weight') {
    const u = unit || unitFor(move, r.athlete_id);
    return tenth(inUnit(r, u)) + (bare ? '' : ' ' + u);
  }
  if (move.score === 'time') return fmtTime(r.value);
  if (move.score === 'rounds') return r.value + ' + ' + (r.reps || 0);
  return r.value + (bare ? '' : (r.value === 1 ? ' rep' : ' reps'));
}
const rmTag = r => r.reps > 1 ? r.reps + 'RM' : '1RM';

/* ───────────────────────────────────────────────────────────────
   STATE + LOADING
   ─────────────────────────────────────────────────────────────── */
const P = {
  moves: null, movesAt: 0,
  recs: {},            // athlete id → [rows] (newest first)
  loading: {},
  host: null,          // where the screens are drawn
  ctx: null,           // { who, mode: 'athlete'|'coach'|'manage', name }
  view: 'list', cat: 'barbell', q: '', moveId: null, editId: null, rm: 1,
  formWarned: false,
  err: null,
};
const moveById = id => (P.moves || []).find(m => m.id === id) || null;

async function loadMoves(force) {
  if (!P.moves) { try { const c = JSON.parse(localStorage.getItem(MOVES_KEY)); if (Array.isArray(c) && c.length) P.moves = c; } catch (e) {} }
  if (P.moves && !force && Date.now() - P.movesAt < 5 * 60 * 1000) return P.moves;
  const { data, error } = await sb().from('td_pr_movements').select(M_COLS).order('sort');
  if (error) { if (!P.moves || force) throw error; return P.moves; }
  P.moves = (data || []).slice().sort((a, b) => (a.sort || 0) - (b.sort || 0) || String(a.name).localeCompare(b.name));
  P.movesAt = Date.now();
  try { localStorage.setItem(MOVES_KEY, JSON.stringify(P.moves)); } catch (e) {}
  return P.moves;
}
async function loadRecs(who, force) {
  if (P.recs[who] && !force) return P.recs[who];
  if (P.loading[who]) return P.loading[who];
  P.loading[who] = (async () => {
    const { data, error } = await sb().from('td_prs').select(R_COLS).eq('athlete_id', who).order('done_on', { ascending: false });
    if (error) throw error;
    P.recs[who] = (data || []).map(r => Object.assign(r, { value: Number(r.value), reps: r.reps == null ? null : Number(r.reps) }))
      .sort((a, b) => String(b.done_on).localeCompare(String(a.done_on)) || String(b.created_at || '').localeCompare(String(a.created_at || '')));
    return P.recs[who];
  })();
  try { return await P.loading[who]; } finally { delete P.loading[who]; }
}
const recsFor = (who, moveId) => (P.recs[who] || []).filter(r => r.movement_id === moveId);

// The record to show for a movement: a lift's best 1RM (or, with none
// yet, its best rep max); otherwise the best score.
function headline(who, move) {
  const rs = recsFor(who, move.id);
  if (!rs.length) return null;
  if (move.score === 'weight') {
    const ones = rs.filter(r => (r.reps || 1) === 1);
    const pool = ones.length ? ones : rs;
    return pool.reduce((b, r) => (!b || est1(toKg(r.value, r.unit), r.reps || 1) > est1(toKg(b.value, b.unit), b.reps || 1)) ? r : b, null);
  }
  return rs.reduce((b, r) => (!b || rank(r, move) > rank(b, move)) ? r : b, null);
}
function bestFor(rs, move) { return rs.reduce((b, r) => (!b || rank(r, move) > rank(b, move)) ? r : b, null); }
// For the calculator and the % chart: a real 1RM, else an estimate.
// oneVal(one, 'lb') gives it in a unit.
const oneVal = (one, u) => inUnit(one.rec, u) * (one.est ? 1 + (one.rec.reps || 1) / 30 : 1);
function oneRM(who, move) {
  const rs = recsFor(who, move.id);
  const ones = rs.filter(r => (r.reps || 1) === 1);
  if (ones.length) { const b = bestFor(ones, move); return { kg: toKg(b.value, b.unit), est: false, rec: b }; }
  if (!rs.length) return null;
  const b = rs.reduce((x, r) => (!x || est1(toKg(r.value, r.unit), r.reps) > est1(toKg(x.value, x.unit), x.reps)) ? r : x, null);
  return { kg: est1(toKg(b.value, b.unit), b.reps), est: true, rec: b };
}

// The % calculator remembered maxes on this phone before PRs existed.
// The first time an athlete opens their PRs, those become 1RM records
// on lifts they haven't logged yet.
async function importCalcMaxes(who) {
  const flag = 'td_prs_imported_' + who;
  try { if (localStorage.getItem(flag)) return; } catch (e) { return; }
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem('td_maxes_' + who)) || {}; } catch (e) {}
  const rows = [];
  Object.keys(saved).forEach(k => {
    const s = saved[k];
    if (!s || !(s.max > 0)) return;
    const move = matchMove(k);
    if (!move || move.score !== 'weight' || recsFor(who, move.id).length || rows.some(r => r.movement_id === move.id)) return;
    rows.push({ athlete_id: who, movement_id: move.id, value: Math.round(s.max * 100) / 100, unit: s.unit === 'kg' ? 'kg' : 'lb',
                reps: 1, done_on: todayISO(), note: 'Moved over from the % calculator' });
  });
  try { localStorage.setItem(flag, '1'); } catch (e) {}
  if (!rows.length) return;
  const { error } = await sb().from('td_prs').insert(rows);
  if (error) { console.warn('PRs: couldn’t bring over calculator maxes —', error.message); return; }
  await loadRecs(who, true);
  toast('Your saved calculator maxes are now in My PRs', 'ok');
}

// A section title or calculator key → the movement it names, or null.
function matchMove(text) {
  if (!P.moves) return null;
  const lifts = P.moves.filter(m => m.category === 'barbell' && m.score === 'weight');
  const t = ' ' + norm(typeof stripInline === 'function' ? stripInline(text) : text) + ' ';
  // Longest name found in the title wins: "Hang Power Clean" before "Clean",
  // "Clean & Jerk" before "Clean".
  const hit = lifts.slice().sort((a, b) => norm(b.name).length - norm(a.name).length)
    .find(m => t.indexOf(' ' + norm(m.name) + ' ') !== -1);
  if (hit) return hit;
  // Then the app's own lift names ("rdl", "squat clean" …), if one is a movement.
  const k = typeof liftKey === 'function' ? norm(liftKey(text) || '') : '';
  return (k && lifts.find(m => norm(m.name) === k)) || null;
}

/* ───────────────────────────────────────────────────────────────
   SCREENS
   ─────────────────────────────────────────────────────────────── */
function mount(host, ctx, view) {
  P.host = host;
  P.ctx = ctx;
  P.view = view || 'list';
  P.q = ''; P.moveId = null; P.editId = null; P.formWarned = false; P.err = null;
  render();
  refresh();
}

async function refresh() {
  const ctx = P.ctx;
  if (!ctx || !sb()) return;
  try {
    await loadMoves();
    if (ctx.who) { await loadRecs(ctx.who); if (ctx.mode === 'athlete') await importCalcMaxes(ctx.who); }
    P.err = null;
  } catch (e) {
    P.err = friendly(e);
  }
  if (P.ctx === ctx) render();
  renderAccountRow();
}

function render() {
  const host = P.host;
  if (!host || !host.isConnected) return;
  const keepScroll = scroller(host);
  const y = keepScroll ? keepScroll.scrollTop : 0;
  let html;
  if (P.err && !P.moves) html = '<div class="pr-err">' + esc(P.err) + '</div>';
  else if (!P.moves) html = '<div class="sbox"><div class="spinner"></div><p>Loading records…</p></div>';
  else if (P.view === 'manage') html = manageHTML();
  else if (P.view === 'mform') html = mformHTML();
  else if (P.view === 'move') html = moveHTML();
  else if (P.view === 'form') html = formHTML();
  else html = listHTML();
  host.innerHTML = html;
  const title = document.getElementById('m-prs-title');
  if (title && host.id === 'm-prs-host') {
    title.textContent = P.ctx && P.ctx.mode === 'manage' ? 'PR Movements'
      : P.ctx && P.ctx.mode === 'coach' ? (P.ctx.name || 'Athlete') + '’s PRs' : 'Personal Records';
  }
  if (keepScroll && P.keepY) keepScroll.scrollTop = y;
  P.keepY = false;
  const first = host.querySelector('[data-pr-focus]');
  if (first) setTimeout(() => { first.focus(); if (first.select) first.select(); }, 60);
}
function scroller(el) { return el.closest('.modal'); }
function go(view, extra) {
  Object.assign(P, { view, formWarned: false }, extra || {});
  render();
  const sc = P.host && scroller(P.host);
  if (sc) sc.scrollTop = 0;
}

/* ── List ─────────────────────────────────────────── */
function visibleMoves(who) {
  return (P.moves || []).filter(m => !m.hidden || (who && recsFor(who, m.id).length));
}
function rowHTML(m, who) {
  const h = who ? headline(who, m) : null;
  const sub = h ? dateText(h.done_on) + (m.score === 'weight' && (h.reps || 1) > 1 ? ' · ' + rmTag(h) : '') : (m.grp || '');
  return '<button type="button" class="pr-row' + (h ? '' : ' empty') + '" data-pr-open="' + esc(m.id) + '">' +
    '<span class="pr-medal">' + MEDAL + '</span>' +
    '<span class="pr-row-mid"><span class="pr-row-name">' + esc(m.name) + '</span>' +
      (sub ? '<span class="pr-row-sub">' + esc(sub) + '</span>' : '') + '</span>' +
    '<span class="pr-row-val">' + (h ? esc(show(h, m)) : 'Add') + '</span><span class="pr-row-ch">&#8250;</span></button>';
}
function listHTML() {
  const who = P.ctx.who, q = norm(P.q);
  let html = '<div class="pr-top"><input type="search" class="pr-search" placeholder="Search lifts, runs, benchmarks" value="' + esc(P.q) +
    '" data-pr-q autocomplete="off" aria-label="Search"></div>';
  if (P.err) html += '<div class="pr-err">' + esc(P.err) + '</div>';
  const all = visibleMoves(who);
  if (q) {
    const hits = all.filter(m => norm(m.name).indexOf(q) !== -1 || norm(m.grp).indexOf(q) !== -1);
    html += hits.length ? '<div class="pr-list">' + hits.map(m => rowHTML(m, who)).join('') + '</div>'
      : '<div class="pr-list"><div class="pr-none">Nothing called “' + esc(P.q) + '” yet.' +
        (P.ctx.mode === 'athlete' ? '<br>Ask your coach to add it.' : '') + '</div></div>';
    return html;
  }
  html += '<div class="pr-cats" role="tablist">' + CATS.map(c => '<button type="button" class="pr-cat' + (c.id === P.cat ? ' on' : '') +
    '" data-pr-cat="' + c.id + '">' + c.label + '</button>').join('') + '</div>';
  const inCat = all.filter(m => m.category === P.cat);
  const done = inCat.filter(m => headline(who, m)), todo = inCat.filter(m => !headline(who, m));
  if (done.length) {
    html += '<div class="pr-sec">' + (P.ctx.mode === 'coach' ? 'Records' : 'Your records') + ' · ' + done.length + '</div>' +
      '<div class="pr-list">' + done.map(m => rowHTML(m, who)).join('') + '</div>';
  }
  const groups = [];
  todo.forEach(m => { const g = m.grp || ''; let x = groups.find(y => y.g === g); if (!x) groups.push(x = { g, ms: [] }); x.ms.push(m); });
  groups.forEach((x, i) => {
    html += '<div class="pr-sec">' + esc(x.g || 'More') + (done.length && i === 0 ? ' · not logged yet' : '') + '</div>' +
      '<div class="pr-list">' + x.ms.map(m => rowHTML(m, who)).join('') + '</div>';
  });
  if (!inCat.length) html += '<div class="pr-list"><div class="pr-none">Nothing in this list yet.</div></div>';
  html += '<div class="pr-foot-note">' + (P.ctx.mode === 'athlete'
    ? 'Missing something? Ask your coach to add it to the list.'
    : 'Add or rename movements in Settings → PR movements.') + '</div>';
  return html;
}
function unitSeg(move) {
  const u = unitFor(move, P.ctx && P.ctx.who);
  return '<div class="pr-seg" role="group" aria-label="Weight units"><button type="button" data-pr-unit="lb" class="' + (u === 'lb' ? 'on' : '') +
    '">lb</button><button type="button" data-pr-unit="kg" class="' + (u === 'kg' ? 'on' : '') + '">kg</button></div>';
}

/* ── One movement ─────────────────────────────────── */
function moveHTML() {
  const m = moveById(P.moveId), who = P.ctx.who;
  if (!m) return '<button type="button" class="pr-back" data-pr-back>&#8249; All records</button><div class="pr-none">That movement isn’t on the list any more.</div>';
  const all = recsFor(who, m.id);
  const lift = m.score === 'weight';
  const rmsHave = [...new Set(all.map(r => r.reps || 1))];
  if (lift && P.rm !== 1 && !rmsHave.includes(P.rm)) P.rm = 1;
  const rs = lift ? all.filter(r => (r.reps || 1) === P.rm) : all;
  const best = bestFor(rs, m);
  let html = '<button type="button" class="pr-back" data-pr-back>&#8249; All records</button>' +
    '<div class="pr-h">' + esc(m.name) + (m.hidden ? '<span class="pr-tag hid">Hidden</span>' : '') + '</div>' +
    '<div class="pr-h-sub">' + esc([CATS.find(c => c.id === m.category).label, m.grp, SCORES[m.score]].filter(Boolean).join(' · ')) + '</div>' +
    (m.description ? '<div class="pr-desc">' + esc(m.description) + '</div>' : '');

  if (lift) {
    html += '<div class="pr-rms">' + RMS.map(n => '<button type="button" class="pr-chip' + (n === P.rm ? ' on' : '') +
      (rmsHave.includes(n) ? '' : ' dim') + '" data-pr-rm="' + n + '">' + n + 'RM</button>').join('') + '</div>';
  }
  html += best
    ? '<div class="pr-hero"><span class="pr-medal">' + MEDAL + '</span><div class="pr-hero-mid"><div class="pr-hero-val">' +
        esc(show(best, m, null, lift)) + (lift ? '<small>' + unitFor(m, who) + '</small>' : '') + '</div>' +
        '<div class="pr-hero-date">' + (lift ? P.rm + 'RM · ' : '') + esc(dateText(best.done_on, true)) + '</div></div>' +
        (lift ? unitSeg(m) : '') + '</div>'
    : '<div class="pr-hero none"><div class="pr-hero-mid"><div class="pr-hero-val">No ' + (lift ? P.rm + 'RM' : 'record') + ' yet</div>' +
        '<div class="pr-hero-date">' + (P.ctx.mode === 'coach' ? 'Add one for them below.' : 'Add your first one below.') + '</div></div>' +
        (lift ? unitSeg(m) : '') + '</div>';

  // Percentages, always of the 1RM (a real one, or estimated from a rep max)
  if (lift) {
    const one = oneRM(who, m);
    if (one) {
      const u = unitFor(m, who), w = oneVal(one, u);
      html += '<div class="pr-h2"><span>Percentages</span>' +
        (P.ctx.mode === 'athlete' && document.getElementById('m-pct') ? '<button type="button" class="btn-sm" data-pr-calc>Use in calculator</button>' : '') + '</div>' +
        '<div class="pr-grid">' + GRID.map(p => '<div class="pr-cell' + (p === 100 ? ' hundred' : '') + '"><b>' + tenth(w * p / 100) +
          '</b><i>' + p + '%</i></div>').join('') + '</div>' +
        '<div class="pr-grid-note">' + (one.est
          ? 'Of an estimated 1RM of ' + tenth(w) + ' ' + u + ', from your ' + rmTag(one.rec) + '. Log a 1RM for exact numbers.'
          : 'Of your 1RM, ' + tenth(w) + ' ' + u + '.') + '</div>';
    }
  }

  if (rs.length >= 2) html += '<div class="pr-h2"><span>Progress</span></div><div class="pr-chart">' + chartSVG(rs, m) + '</div>';

  html += '<div class="pr-h2"><span>History</span>' + (all.length ? '<span style="font-family:var(--sans);font-size:11px;font-weight:700;color:var(--ink-3)">' +
    all.length + (all.length === 1 ? ' entry' : ' entries') + '</span>' : '') + '</div>';
  if (all.length) {
    const bestIds = new Set();
    if (lift) rmsHave.forEach(n => { const b = bestFor(all.filter(r => (r.reps || 1) === n), m); if (b) bestIds.add(b.id); });
    else { const b = bestFor(all, m); if (b) bestIds.add(b.id); }
    html += '<div class="pr-ents">' + all.map(r => '<button type="button" class="pr-ent" data-pr-edit="' + esc(r.id) + '">' +
      '<span class="pr-ent-val">' + esc(show(r, m)) + '</span>' +
      '<span class="pr-ent-mid"><span class="pr-ent-date">' + esc(dateText(r.done_on, true)) + (lift ? ' · ' + rmTag(r) : '') + '</span>' +
        (r.note ? '<span class="pr-ent-note">' + esc(r.note) + '</span>' : '') + '</span>' +
      (bestIds.has(r.id) ? '<span class="pr-best">' + (lift && rmsHave.length > 1 ? rmTag(r) + ' best' : 'Record') + '</span>' : '') +
      '</button>').join('') + '</div>';
  } else {
    html += '<div class="pr-ents"><div class="pr-none">Nothing logged yet.</div></div>';
  }
  html += '<div class="pr-bar"><button type="button" class="btn-main" data-pr-add>Add PR</button></div>';
  return html;
}

// Progress over time. Better is always up, so a faster time climbs too.
function chartSVG(rs, m) {
  const pts = rs.slice().sort((a, b) => String(a.done_on).localeCompare(String(b.done_on)) || String(a.created_at || '').localeCompare(String(b.created_at || '')));
  const W = 320, H = 150, L = 8, R = 8, T = 26, B = 24;
  const xs = pts.map(r => new Date(String(r.done_on).slice(0, 10) + 'T12:00:00').getTime());
  const ys = pts.map(r => rank(r, m));
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const X = t => x1 === x0 ? (L + (W - L - R) * (pts.length > 1 ? xs.indexOf(t) / (pts.length - 1) : .5)) : L + (t - x0) / (x1 - x0) * (W - L - R);
  const Y = v => y1 === y0 ? T + (H - T - B) / 2 : T + (1 - (v - y0) / (y1 - y0)) * (H - T - B);
  const P2 = pts.map((r, i) => [x1 === x0 ? L + (W - L - R) * (pts.length > 1 ? i / (pts.length - 1) : .5) : X(xs[i]), Y(ys[i])]);
  const line = P2.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const showLbl = i => pts.length <= 6 || i === 0 || i === pts.length - 1 || ys[i] === y1;
  const lbl = (p, r, i) => {
    const t = esc(show(r, m, null, true));
    const anchor = i === 0 ? 'start' : i === pts.length - 1 ? 'end' : 'middle';
    return '<text x="' + p[0].toFixed(1) + '" y="' + (p[1] - 9).toFixed(1) + '" text-anchor="' + anchor +
      '" font-size="11" font-weight="700" fill="var(--blue)" font-family="DM Sans, sans-serif">' + t + '</text>';
  };
  const mo = r => new Date(String(r.done_on).slice(0, 10) + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
  return '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Progress chart">' +
    '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + (H - B + 6) + '" y2="' + (H - B + 6) + '" stroke="var(--line)"/>' +
    '<path d="' + line + '" fill="none" stroke="var(--blue)" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>' +
    P2.map((p, i) => '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="' + (ys[i] === y1 ? 5 : 3.6) +
      '" fill="' + (ys[i] === y1 ? 'var(--gold)' : 'var(--blue)') + '" stroke="#fff" stroke-width="1.5"/>').join('') +
    P2.map((p, i) => showLbl(i) ? lbl(p, pts[i], i) : '').join('') +
    '<text x="' + L + '" y="' + (H - 4) + '" font-size="10.5" fill="var(--ink-3)" font-family="DM Sans, sans-serif">' + mo(pts[0]) + '</text>' +
    (pts.length > 1 ? '<text x="' + (W - R) + '" y="' + (H - 4) + '" text-anchor="end" font-size="10.5" fill="var(--ink-3)" font-family="DM Sans, sans-serif">' + mo(pts[pts.length - 1]) + '</text>' : '') +
    '</svg>';
}

/* ── Add / edit a record ──────────────────────────── */
function formHTML() {
  const m = moveById(P.moveId);
  if (!m) return listHTML();
  const r = P.editId ? (P.recs[P.ctx.who] || []).find(x => x.id === P.editId) : null;
  const u = r && r.unit ? r.unit : unitFor(m, P.ctx.who);
  const reps = r ? (r.reps || 1) : P.rm || 1;
  let fields;
  if (m.score === 'weight') {
    fields = '<div class="pr-pair"><div class="fld"><label for="pr-v">Weight</label>' +
        '<input type="text" id="pr-v" class="pr-big" inputmode="decimal" autocomplete="off" placeholder="0" value="' + (r ? esc(tenth(r.value)) : '') + '" data-pr-focus></div>' +
        '<div class="pr-seg" role="group" aria-label="Units" data-pr-funit><button type="button" data-u="lb" class="' + (u === 'lb' ? 'on' : '') +
        '">lb</button><button type="button" data-u="kg" class="' + (u === 'kg' ? 'on' : '') + '">kg</button></div></div>' +
      '<div class="fld"><label>Reps</label><div class="pr-rms" style="margin:0" data-pr-freps>' + RMS.map(n =>
        '<button type="button" class="pr-chip' + (n === reps ? ' on' : '') + '" data-n="' + n + '">' + n + 'RM</button>').join('') +
        (RMS.includes(reps) ? '' : '<button type="button" class="pr-chip on" data-n="' + reps + '">' + reps + 'RM</button>') + '</div></div>';
  } else if (m.score === 'time') {
    fields = '<div class="fld"><label for="pr-v">Time</label><input type="text" id="pr-v" class="pr-big" inputmode="decimal" autocomplete="off" ' +
      'placeholder="m:ss" value="' + (r ? fmtTime(r.value) : '') + '" data-pr-focus><div class="form-hint">Minutes and seconds, like 3:45 or 1:02:30. A dot works too: 3.45</div></div>';
  } else if (m.score === 'rounds') {
    fields = '<div class="pr-pair"><div class="fld"><label for="pr-v">Rounds</label><input type="text" id="pr-v" class="pr-big" inputmode="numeric" autocomplete="off" placeholder="0" value="' +
      (r ? r.value : '') + '" data-pr-focus></div><span class="pr-plus">+</span>' +
      '<div class="fld"><label for="pr-r">Extra reps</label><input type="text" id="pr-r" class="pr-big" inputmode="numeric" autocomplete="off" placeholder="0" value="' +
      (r ? (r.reps || 0) : '') + '"></div></div>';
  } else {
    fields = '<div class="fld"><label for="pr-v">Reps</label><input type="text" id="pr-v" class="pr-big" inputmode="numeric" autocomplete="off" placeholder="0" value="' +
      (r ? r.value : '') + '" data-pr-focus></div>';
  }
  return '<button type="button" class="pr-back" data-pr-back-move>&#8249; ' + esc(m.name) + '</button>' +
    '<div class="pr-h">' + (r ? 'Edit record' : 'Add PR') + '</div><div class="pr-h-sub">' + esc(m.name) + '</div>' +
    '<div class="pr-form" style="margin-top:14px">' + fields +
      '<div class="fld"><label for="pr-d">Date</label><input type="date" id="pr-d" max="' + todayISO() + '" value="' + esc(r ? String(r.done_on).slice(0, 10) : todayISO()) + '"></div>' +
      '<div class="fld"><label for="pr-n">Note <span style="font-weight:400;opacity:.6">(optional)</span></label>' +
        '<input type="text" id="pr-n" maxlength="200" autocomplete="off" placeholder="Belt, touch-and-go, Rx…" value="' + esc(r && r.note ? r.note : '') + '"></div>' +
      '<div id="pr-warn"></div><div class="pr-ferr" id="pr-ferr"></div>' +
    '</div>' +
    '<div class="pr-bar"><button type="button" class="btn-main" data-pr-save>' + (r ? 'Save changes' : 'Save PR') + '</button>' +
      (r ? '<button type="button" class="btn-sm pr-del" data-pr-del>Delete</button>' : '') + '</div>';
}

function readForm(m) {
  const val = id => (document.getElementById(id) || {}).value || '';
  const err = msg => { document.getElementById('pr-ferr').textContent = msg; return null; };
  const out = { done_on: val('pr-d') || todayISO(), note: val('pr-n').trim() || null };
  if (out.done_on > todayISO()) return err('That date hasn’t happened yet.');
  if (m.score === 'weight') {
    const v = parseFloat(val('pr-v').replace(',', '.'));
    if (!(v > 0)) return err('Enter the weight.');
    const u = (P.host.querySelector('[data-pr-funit] .on') || {}).dataset;
    out.unit = u && u.u === 'kg' ? 'kg' : 'lb';
    if (toKg(v, out.unit) > 600) return err('That’s more than anyone has lifted. Check the number and the lb / kg.');
    out.value = Math.round(v * 100) / 100;
    const n = (P.host.querySelector('[data-pr-freps] .on') || {}).dataset;
    out.reps = n ? parseInt(n.n, 10) : 1;
  } else if (m.score === 'time') {
    const s = parseTime(val('pr-v'));
    if (!s) return err('Type the time like 3:45 (minutes and seconds).');
    out.value = s;
  } else if (m.score === 'rounds') {
    const rd = val('pr-v').trim(), rp = val('pr-r').trim() || '0';
    if (!/^\d+$/.test(rd) || !/^\d+$/.test(rp)) return err('Rounds and reps are whole numbers.');
    out.value = parseInt(rd, 10); out.reps = parseInt(rp, 10);
    if (out.value === 0 && out.reps === 0) return err('Enter your rounds and reps.');
  } else {
    const rp = val('pr-v').trim();
    if (!/^\d+$/.test(rp) || parseInt(rp, 10) === 0) return err('Reps are a whole number.');
    out.value = parseInt(rp, 10);
  }
  return out;
}

// Before saving something far beyond the athlete's best, ask once.
function unlikely(rec, m, prev) {
  if (!prev) return null;
  const a = rank(rec, m), b = rank(prev, m);
  if (m.score === 'time') { if (rec.value < prev.value / 1.5) return 'That’s much faster than ' + show(prev, m) + ', the best so far.'; return null; }
  if (b > 0 && a > b * (m.score === 'weight' ? 1.5 : 2)) return 'That’s far more than ' + show(prev, m) + ', the best so far.';
  return null;
}

async function saveForm(btn) {
  const m = moveById(P.moveId), who = P.ctx.who;
  if (!m || !who) return;
  const f = readForm(m);
  if (!f) return;
  const all = recsFor(who, m.id).filter(r => r.id !== P.editId);
  const pool = m.score === 'weight' ? all.filter(r => (r.reps || 1) === f.reps) : all;
  const prev = bestFor(pool, m);
  const rec = Object.assign({ unit: null, reps: null }, f);
  const doubt = unlikely(rec, m, prev);
  if (doubt && !P.formWarned) {
    P.formWarned = true;
    document.getElementById('pr-warn').innerHTML = '<div class="pr-warn">' + esc(doubt) + ' Check the number' +
      (m.score === 'weight' ? ' and lb / kg' : '') + ', then tap Save again to keep it.</div>';
    return;
  }
  btn.disabled = true;
  const client = sb();
  const row = { value: rec.value, unit: m.score === 'weight' ? rec.unit : null, reps: rec.reps, done_on: rec.done_on, note: rec.note };
  const res = P.editId
    ? await client.from('td_prs').update(row).eq('id', P.editId)
    : await client.from('td_prs').insert(Object.assign({ athlete_id: who, movement_id: m.id }, row));
  btn.disabled = false;
  if (res.error) { document.getElementById('pr-ferr').textContent = friendly(res.error); return; }
  const isNew = !P.editId;
  await loadRecs(who, true).catch(() => {});
  if (m.score === 'weight') P.rm = rec.reps || 1;
  const nowBest = bestFor(m.score === 'weight' ? recsFor(who, m.id).filter(r => (r.reps || 1) === (rec.reps || 1)) : recsFor(who, m.id), m);
  const beat = isNew && prev && nowBest && rank(nowBest, m) > rank(prev, m) && rank(rec, m) >= rank(nowBest, m);
  const what = show(Object.assign({ athlete_id: who }, rec), m) + (m.score === 'weight' && rec.reps > 1 ? ' ' + rmTag(rec) : '');
  toast(!isNew ? 'Updated' : beat ? 'New PR! ' + what : !prev ? 'Logged — ' + m.name + ' ' + what : 'Saved', 'ok');
  go('move', { editId: null });
  renderAccountRow();
  renderUse();
}

async function deleteRec(btn) {
  if (!btn.dataset.armed) {
    btn.dataset.armed = '1'; btn.textContent = 'Tap again to delete';
    setTimeout(() => { if (btn.isConnected) { delete btn.dataset.armed; btn.textContent = 'Delete'; } }, 3500);
    return;
  }
  btn.disabled = true;
  const { error } = await sb().from('td_prs').delete().eq('id', P.editId);
  if (error) { btn.disabled = false; document.getElementById('pr-ferr').textContent = friendly(error); return; }
  await loadRecs(P.ctx.who, true).catch(() => {});
  toast('Deleted', 'ok');
  go('move', { editId: null });
  renderAccountRow();
  renderUse();
}

/* ── Coach: the movement list ─────────────────────── */
function manageHTML() {
  const inCat = (P.moves || []).filter(m => m.category === P.cat);
  const groups = [];
  inCat.forEach(m => { const g = m.grp || ''; let x = groups.find(y => y.g === g); if (!x) groups.push(x = { g, ms: [] }); x.ms.push(m); });
  return '<div class="pr-desc" style="margin:0 2px 12px">Athletes log records only against this list, so each lift keeps one history. ' +
      'Hiding takes it off their list without losing anyone’s records.</div>' +
    (P.err ? '<div class="pr-err">' + esc(P.err) + '</div>' : '') +
    '<div class="pr-cats">' + CATS.map(c => '<button type="button" class="pr-cat' + (c.id === P.cat ? ' on' : '') + '" data-pr-cat="' + c.id + '">' + c.label + '</button>').join('') + '</div>' +
    groups.map(x => '<div class="pr-sec">' + esc(x.g || 'More') + '</div><div class="pr-list">' + x.ms.map(m =>
      '<button type="button" class="pr-row' + (m.hidden ? ' empty' : '') + '" data-pr-medit="' + esc(m.id) + '">' +
        '<span class="pr-row-mid"><span class="pr-row-name">' + esc(m.name) + (m.hidden ? '<span class="pr-tag hid">Hidden</span>' : '') + '</span>' +
        '<span class="pr-row-sub">' + esc(SCORES[m.score]) + '</span></span><span class="pr-row-ch">&#8250;</span></button>').join('') + '</div>').join('') +
    (inCat.length ? '' : '<div class="pr-list"><div class="pr-none">Nothing in this list yet.</div></div>') +
    '<div class="pr-bar"><button type="button" class="btn-main" data-pr-madd>+ Add movement</button></div>';
}
function mformHTML() {
  const m = P.editId ? moveById(P.editId) : null;
  const cat = m ? m.category : P.cat;
  const groups = [...new Set((P.moves || []).filter(x => x.category === cat).map(x => x.grp).filter(Boolean))];
  return '<button type="button" class="pr-back" data-pr-back-manage>&#8249; PR movements</button>' +
    '<div class="pr-h">' + (m ? 'Edit movement' : 'Add movement') + '</div>' +
    '<div class="pr-form" style="margin-top:14px">' +
      '<div class="fld"><label for="pm-name">Name</label><input type="text" id="pm-name" maxlength="60" autocomplete="off" value="' + esc(m ? m.name : '') + '" placeholder="Zercher Squat" data-pr-focus></div>' +
      '<div class="fld"><label for="pm-cat">List</label><select id="pm-cat">' + CATS.map(c => '<option value="' + c.id + '"' + (c.id === cat ? ' selected' : '') + '>' + c.label + '</option>').join('') + '</select></div>' +
      '<div class="fld"><label for="pm-grp">Heading <span style="font-weight:400;opacity:.6">(optional)</span></label><input type="text" id="pm-grp" maxlength="40" autocomplete="off" list="pm-grps" value="' + esc(m && m.grp ? m.grp : '') + '" placeholder="Squat, Olympic, Girls, Open…">' +
        '<datalist id="pm-grps">' + groups.map(g => '<option value="' + esc(g) + '">').join('') + '</datalist></div>' +
      '<div class="fld"><label for="pm-score">Score</label><select id="pm-score">' + Object.keys(SCORES).map(s => '<option value="' + s + '"' +
        ((m ? m.score : (cat === 'barbell' ? 'weight' : cat === 'endurance' ? 'time' : cat === 'gymnastics' ? 'reps' : 'time')) === s ? ' selected' : '') + '>' + SCORES[s] + '</option>').join('') + '</select>' +
        (m ? '<div class="form-hint">Can’t change once anyone has logged a record for it.</div>' : '') + '</div>' +
      '<div class="fld"><label for="pm-desc">Description <span style="font-weight:400;opacity:.6">(optional)</span></label><textarea id="pm-desc" maxlength="600" rows="3" placeholder="21-15-9: thrusters, pull-ups">' + esc(m && m.description ? m.description : '') + '</textarea></div>' +
      (m ? '<div class="setting-row" style="border-bottom:1px solid var(--line);margin-bottom:12px"><div><div class="setting-label">Hidden</div><div class="setting-desc">Off athletes’ lists. Records already logged stay.</div></div>' +
        '<label class="toggle"><input type="checkbox" id="pm-hidden"' + (m.hidden ? ' checked' : '') + '><span class="toggle-slider"></span></label></div>' : '') +
      '<div class="pr-ferr" id="pr-ferr"></div>' +
    '</div>' +
    '<div class="pr-bar"><button type="button" class="btn-main" data-pr-msave>' + (m ? 'Save' : 'Add to the list') + '</button></div>';
}
async function saveMove(btn) {
  const v = id => (document.getElementById(id) || {}).value || '';
  const name = v('pm-name').trim().replace(/\s+/g, ' ');
  const errEl = document.getElementById('pr-ferr');
  if (!name) { errEl.textContent = 'Give it a name.'; return; }
  const m = P.editId ? moveById(P.editId) : null;
  const clash = (P.moves || []).find(x => norm(x.name) === norm(name) && (!m || x.id !== m.id));
  if (clash) { errEl.textContent = 'There’s already “' + clash.name + '”' + (clash.hidden ? ' (hidden — open it and turn Hidden off)' : '') + '.'; return; }
  const row = { name, category: v('pm-cat'), grp: v('pm-grp').trim() || null, score: v('pm-score'), description: v('pm-desc').trim() || null };
  if (m) row.hidden = !!(document.getElementById('pm-hidden') || {}).checked;
  btn.disabled = true;
  let res;
  if (m) res = await sb().from('td_pr_movements').update(row).eq('id', m.id);
  else {
    const same = (P.moves || []).filter(x => x.category === row.category);
    row.sort = same.reduce((n, x) => Math.max(n, x.sort || 0), 0) + 1;
    row.slug = norm(name).replace(/ /g, '-').slice(0, 40) + '-' + Math.random().toString(36).slice(2, 6);
    res = await sb().from('td_pr_movements').insert(row);
  }
  btn.disabled = false;
  if (res.error) { errEl.textContent = friendly(res.error); return; }
  await loadMoves(true).catch(() => {});
  P.cat = row.category;
  toast(m ? 'Saved' : name + ' added', 'ok');
  go('manage', { editId: null });
}

/* ───────────────────────────────────────────────────────────────
   EVENTS (one listener for every place the screens are drawn)
   ─────────────────────────────────────────────────────────────── */
function onClick(e) {
  const t = e.target;
  if (!P.host || !P.host.contains(t)) return;
  const at = sel => t.closest(sel);
  let b;
  if ((b = at('[data-pr-cat]'))) { P.cat = b.dataset.prCat; render(); return; }
  if ((b = at('[data-pr-unit]'))) { const m = moveById(P.moveId); if (m) setUnitFor(m, b.dataset.prUnit); else setViewUnit(b.dataset.prUnit); P.keepY = true; render(); renderAccountRow(); return; }
  if ((b = at('[data-pr-open]'))) { const m = moveById(b.dataset.prOpen); P.rm = 1; if (m && m.score === 'weight') { const h = headline(P.ctx.who, m); if (h) P.rm = h.reps || 1; } go('move', { moveId: b.dataset.prOpen }); return; }
  if (at('[data-pr-back]')) { go('list', { moveId: null }); return; }
  if (at('[data-pr-back-move]')) { go('move', { editId: null }); return; }
  if ((b = at('[data-pr-rm]'))) { P.rm = parseInt(b.dataset.prRm, 10); P.keepY = true; render(); return; }
  if (at('[data-pr-add]')) { go('form', { editId: null }); return; }
  if ((b = at('[data-pr-edit]'))) { go('form', { editId: b.dataset.prEdit }); return; }
  if ((b = at('[data-pr-save]'))) { saveForm(b); return; }
  if ((b = at('[data-pr-del]'))) { deleteRec(b); return; }
  if ((b = at('[data-pr-funit] [data-u]'))) { b.parentElement.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); return; }
  if ((b = at('[data-pr-freps] [data-n]'))) { b.parentElement.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); P.formWarned = false; document.getElementById('pr-warn').innerHTML = ''; return; }
  if (at('[data-pr-calc]')) { useInCalc(); return; }
  if ((b = at('[data-pr-medit]'))) { go('mform', { editId: b.dataset.prMedit }); return; }
  if (at('[data-pr-madd]')) { go('mform', { editId: null }); return; }
  if (at('[data-pr-back-manage]')) { go('manage', { editId: null }); return; }
  if ((b = at('[data-pr-msave]'))) { saveMove(b); return; }
}
function onInput(e) {
  if (!P.host || !P.host.contains(e.target)) return;
  if (e.target.matches('[data-pr-q]')) {
    P.q = e.target.value;
    const pos = e.target.selectionStart;
    render();
    const box = P.host.querySelector('[data-pr-q]');
    if (box) { box.focus(); try { box.setSelectionRange(pos, pos); } catch (x) {} }
    return;
  }
  if (e.target.closest('.pr-form') && P.formWarned && e.target.id === 'pr-v') { P.formWarned = false; const w = document.getElementById('pr-warn'); if (w) w.innerHTML = ''; }
}
function onKey(e) {
  if (e.key !== 'Enter' || !P.host || !P.host.contains(e.target) || !e.target.closest('.pr-form') || e.target.tagName === 'TEXTAREA') return;
  e.preventDefault();
  const b = P.host.querySelector('[data-pr-save], [data-pr-msave]');
  if (b) b.click();
}

/* ───────────────────────────────────────────────────────────────
   WHERE IT LIVES
   ─────────────────────────────────────────────────────────────── */
function injectModal() {
  if (document.getElementById('m-prs')) return;
  document.body.insertAdjacentHTML('beforeend',
    '<div class="modal-bg" id="m-prs"><div class="modal">' +
      '<div class="modal-hd"><div class="modal-title" id="m-prs-title">Personal Records</div>' +
        '<button class="modal-close" type="button" data-pr-close aria-label="Close">&#10005;</button></div>' +
      '<div class="modal-body"><div class="pr-host" id="m-prs-host"></div></div>' +
    '</div></div>');
  const bg = document.getElementById('m-prs');
  bg.addEventListener('click', e => {
    if (e.target === bg || e.target.closest('[data-pr-close]')) closeModal('m-prs');
  });
}
function openPRs(ctx, view) {
  injectModal();
  openModal('m-prs');
  mount(document.getElementById('m-prs-host'), ctx, view);
}
function openMine() {
  const u = me();
  if (!u || isCoach()) return;
  openPRs({ who: u.id, mode: 'athlete' });
}

/* ── Account: Personal Records row ─────────────────── */
function injectAccountRow() {
  const col = document.querySelector('#v-account .tb-col');
  if (!col || document.getElementById('acc-prs')) return;
  const card = document.createElement('div');
  card.className = 'acc-card';
  card.id = 'acc-prs';
  card.innerHTML = '<button class="acc-row acc-pr" type="button" style="border-top:0">' +
    '<span class="acc-pr-ico">' + MEDAL + '</span>' +
    '<div><div class="acc-row-lbl">Personal Records</div><div class="acc-row-desc" id="acc-prs-desc">Your lifts, gymnastics, runs and benchmarks</div></div>' +
    '<span class="acc-chev">&#8250;</span></button>';
  card.querySelector('button').addEventListener('click', openMine);
  const first = col.querySelector('.acc-card');
  if (first) first.after(card); else col.prepend(card);
}
function renderAccountRow() {
  const el = document.getElementById('acc-prs-desc'), u = me();
  if (!el || !u || isCoach()) return;
  const rs = P.recs[u.id];
  if (!rs || !P.moves) return;
  const n = new Set(rs.map(r => r.movement_id)).size;
  if (!n) { el.textContent = 'Your lifts, gymnastics, runs and benchmarks'; return; }
  const latest = rs[0], m = moveById(latest.movement_id);
  el.textContent = n + (n === 1 ? ' movement' : ' movements') + ' logged' + (m ? ' · latest: ' + m.name + ' ' + show(latest, m) : '');
}

/* ── % calculator: tabs, "use my PR", fill from a record ── */
let calcSection = null;     // title of the section the calculator was opened from
let pendingFill = null;     // { one, label, moveId } to put in once the calculator opens

function calcUnit() {
  const on = document.querySelector('#m-pct .pc-seg .on');
  return on && on.dataset.unit === 'kg' ? 'kg' : 'lb';
}
function fillCalc(one, label) {
  const box = document.getElementById('pc-max');
  if (!box) return;
  box.value = tenth(oneVal(one, calcUnit()));
  box.dispatchEvent(new Event('input', { bubbles: true }));
  const from = document.getElementById('pc-from');
  if (from) from.textContent = label || '';
}
function setCalcTab(tab) {
  const bg = document.getElementById('m-pct');
  if (!bg) return;
  if (bg.classList.contains('pr-on-prs') !== (tab === 'prs')) bg.classList.toggle('pr-on-prs', tab === 'prs');
  bg.querySelectorAll('[data-pct-tab]').forEach(b => b.classList.toggle('on', b.dataset.pctTab === tab));
  const t = bg.querySelector('.modal-title');
  if (t) t.textContent = tab === 'prs' ? 'My PRs' : '% Calculator';
  if (tab === 'prs') {
    const u = me();
    if (u) mount(document.getElementById('pc-prs-host'), { who: u.id, mode: 'athlete' });
  } else if (P.host && P.host.id === 'pc-prs-host') {
    P.host = null;
  }
}
function injectCalcTabs() {
  const bg = document.getElementById('m-pct');
  if (!bg || bg.querySelector('.pr-pct-tabs')) return !!bg;
  const body = bg.querySelector('.modal-body');
  body.insertAdjacentHTML('afterbegin', '<div class="pr-pct-tabs" role="tablist"><button type="button" data-pct-tab="calc" class="on">Calculator</button>' +
    '<button type="button" data-pct-tab="prs">My PRs</button></div>');
  const row = body.querySelector('.pc-row2');
  if (row) row.insertAdjacentHTML('afterend', '<div class="pr-from" id="pc-from"></div><div class="pr-use" id="pc-use"></div>');
  body.insertAdjacentHTML('beforeend', '<div class="pr-host" id="pc-prs-host"></div>');
  bg.addEventListener('click', e => {
    const tb = e.target.closest('[data-pct-tab]');
    if (tb) { setCalcTab(tb.dataset.pctTab); return; }
    const chip = e.target.closest('[data-pr-use]');
    if (chip) {
      const m = moveById(chip.dataset.prUse), u = me();
      const one = m && u ? oneRM(u.id, m) : null;
      if (one) {
        fillCalc(one, 'From your ' + m.name + (one.est ? ' (estimated from your ' + rmTag(one.rec) + ')' : ' PR · ' + dateText(one.rec.done_on)));
        bg.querySelectorAll('[data-pr-use]').forEach(x => x.classList.toggle('on', x === chip));
      }
    }
  });
  // Typing a number by hand: it's no longer "from your PR".
  const box = document.getElementById('pc-max');
  if (box) box.addEventListener('input', e => { if (e.isTrusted) { const f = document.getElementById('pc-from'); if (f) f.textContent = ''; bg.querySelectorAll('[data-pr-use].on').forEach(x => x.classList.remove('on')); } });
  // Switching lb / kg in the calculator keeps the same weight.
  const seg = bg.querySelector('.pc-seg');
  if (seg) seg.addEventListener('click', () => setTimeout(renderUse, 0));
  new MutationObserver(() => { if (bg.classList.contains('open')) onCalcOpen(); else onCalcClose(); })
    .observe(bg, { attributes: true, attributeFilter: ['class'] });
  return true;
}
let calcWasOpen = false;
async function onCalcOpen() {
  if (calcWasOpen) return;
  calcWasOpen = true;
  setCalcTab('calc');
  const from = document.getElementById('pc-from');
  if (from) from.textContent = '';
  const u = me();
  if (!u || isCoach()) return;
  const section = calcSection; calcSection = null;
  const fill = pendingFill; pendingFill = null;
  const box = document.getElementById('pc-max'), before = box ? box.value : '';
  try { await loadMoves(); await loadRecs(u.id); } catch (e) { return; }
  renderUse();
  if (!document.getElementById('m-pct').classList.contains('open')) return;
  if (fill) { fillCalc(fill.one, fill.label); markChip(fill.moveId); return; }
  if (!section) return;
  const m = matchMove(section), one = m ? oneRM(u.id, m) : null;
  if (!one || (box && box.value !== before)) return;      // nothing logged, or they've started typing
  fillCalc(one, 'From your ' + m.name + (one.est ? ' (estimated from your ' + rmTag(one.rec) + ')' : ' PR · ' + dateText(one.rec.done_on)));
  markChip(m.id);
}
function onCalcClose() {
  if (!calcWasOpen) return;
  calcWasOpen = false;
  const bg = document.getElementById('m-pct');
  // Only touch the class if it's there: changing it at all would wake this
  // watcher again.
  if (bg && bg.classList.contains('pr-on-prs')) bg.classList.remove('pr-on-prs');
  if (P.host && P.host.id === 'pc-prs-host') P.host = null;
}
function markChip(id) { document.querySelectorAll('#pc-use [data-pr-use]').forEach(x => x.classList.toggle('on', x.dataset.prUse === id)); }
// One-tap chips: the athlete's lifts with a record, most recent first.
function renderUse() {
  const box = document.getElementById('pc-use'), u = me();
  if (!box || !u || isCoach() || !P.moves || !P.recs[u.id]) { if (box) box.innerHTML = ''; return; }
  const seen = new Set(), chips = [];
  P.recs[u.id].forEach(r => {
    const m = moveById(r.movement_id);
    if (!m || m.score !== 'weight' || seen.has(m.id)) return;
    seen.add(m.id);
    const one = oneRM(u.id, m);
    if (one) chips.push({ m, w: tenth(oneVal(one, calcUnit())) });
  });
  const on = (box.querySelector('.on') || {}).dataset;
  box.innerHTML = chips.slice(0, 12).map(c => '<button type="button" class="pr-chip' + (on && on.prUse === c.m.id ? ' on' : '') +
    '" data-pr-use="' + esc(c.m.id) + '">' + esc(c.m.name) + '<b>' + c.w + '</b></button>').join('');
}
// "Use in calculator" from a lift's page.
function useInCalc() {
  const m = moveById(P.moveId), u = me();
  const one = m && u ? oneRM(u.id, m) : null;
  if (!one) return;
  const label = 'From your ' + m.name + (one.est ? ' (estimated from your ' + rmTag(one.rec) + ')' : ' PR · ' + dateText(one.rec.done_on));
  if (P.host && P.host.id === 'pc-prs-host') { setCalcTab('calc'); fillCalc(one, label); markChip(m.id); return; }
  closeModal('m-prs');
  pendingFill = { one, label, moveId: m.id };
  const btn = document.getElementById('pc-hd-btn');
  if (btn) btn.click();
}

/* ── Coach: PRs on an athlete's page, movement list in Settings ── */
function injectCoach() {
  const right = document.querySelector('#adm-detail .detail-hd > div:last-child');
  if (right && !document.getElementById('pr-coach-btn')) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'btn-sm'; b.id = 'pr-coach-btn'; b.textContent = 'PRs';
    b.title = 'Personal records';
    b.addEventListener('click', () => {
      const id = typeof ADM !== 'undefined' ? ADM.detailUserId : null;
      const u = id && (window.PROFILES || []).find(p => p.id === id);
      if (u) openPRs({ who: u.id, mode: 'coach', name: (u.name || '').split(' ')[0] || u.name });
    });
    right.insertBefore(b, right.querySelector('#detail-refresh-btn'));
  }
  const panel = document.getElementById('adm-settings');
  if (panel && !document.getElementById('pr-moves-row')) {
    const row = document.createElement('div');
    row.className = 'setting-row'; row.id = 'pr-moves-row';
    row.innerHTML = '<div><div class="setting-label">PR movements</div><div class="setting-desc">The lifts, gymnastics, runs and benchmarks athletes can log records for</div></div>' +
      '<button class="btn-sm" type="button">Manage</button>';
    row.querySelector('button').addEventListener('click', () => { P.cat = 'barbell'; openPRs({ who: null, mode: 'manage' }, 'manage'); });
    const anchor = panel.querySelector('.setting-row');
    if (anchor) anchor.after(row); else panel.appendChild(row);
  }
}

/* ───────────────────────────────────────────────────────────────
   GO
   ─────────────────────────────────────────────────────────────── */
if (typeof S === 'undefined' || typeof openModal !== 'function') {
  console.warn('td-prs.js must load after the main script in index.html');
  return;
}
const st = document.createElement('style');
st.id = 'td-prs-css';
st.textContent = CSS;
document.head.appendChild(st);
document.addEventListener('click', onClick);
document.addEventListener('input', onInput);
document.addEventListener('keydown', onKey);
// Which section the calculator is opened from (its button sits inside the card).
document.addEventListener('click', e => {
  const b = e.target.closest && e.target.closest('.pc-open');
  if (!b) return;
  const card = b.closest('.sec-card'), t = card && card.querySelector('.sec-t');
  calcSection = t ? t.textContent : null;
}, true);
document.addEventListener('click', e => { if (e.target.closest && e.target.closest('#pc-hd-btn')) calcSection = null; }, true);

function setup() {
  injectModal();
  injectAccountRow();
  injectCalcTabs();
  injectCoach();
}
setup();
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup);
setTimeout(setup, 0);

// The Account tab shows a count once records have loaded.
const acc = document.getElementById('v-account');
if (acc) new MutationObserver(() => {
  const u = me();
  if (!acc.classList.contains('active') || !u || isCoach()) return;
  injectAccountRow();
  Promise.all([loadMoves(), loadRecs(u.id)]).then(renderAccountRow).catch(() => {});
}).observe(acc, { attributes: true, attributeFilter: ['class'] });

// Coach: the PRs button goes on whichever athlete is open.
const _view = window.adminViewUser;
if (typeof _view === 'function') {
  window.adminViewUser = function () { const r = _view.apply(this, arguments); injectCoach(); return r; };
}

// Signing out forgets everyone's records on this device.
['doLogout', 'doAdminLogout'].forEach(fn => {
  const orig = window[fn];
  if (typeof orig !== 'function') return;
  window[fn] = function () {
    P.recs = {}; P.host = null; P.ctx = null;
    try { closeModal('m-prs'); } catch (e) {}
    return orig.apply(this, arguments);
  };
});

window.TD_PRS = { state: () => P, open: openMine, openFor: openPRs, reload: () => { P.recs = {}; P.movesAt = 0; } };
})();
