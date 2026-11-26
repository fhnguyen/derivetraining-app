/* ═══════════════════════════════════════════════════════════════
   TRAINDERIVE — A photo or video on each result
   ───────────────────────────────────────────────────────────────
   An add-on, like td-chat.js. Load it AFTER athlete-tabs.js, just
   above </body>:

       <script src="athlete-tabs.js?v=25"></script>
       <script src="td-media.js?v=4"></script>
       <script src="td-chat.js?v=3"></script>

   Needs media-setup.sql run once in Supabase first.

   Athlete
   • A paperclip in the corner of each results box attaches a photo
     or video. One per section; Replace and Remove sit under it once
     it's attached.
   • Photos are shrunk on the phone (about 300 KB, location data
     removed) before they upload.
   • Videos: up to 30 seconds. They upload in 6 MB pieces, so a
     dropped connection picks up where it stopped. The screen is kept
     awake while a video uploads.
   • A section with only a photo or video counts as logged.
   • While something uploads and its section is off screen (another
     tab, another day, scrolled away), a thin strip above the bottom
     bar shows "Uploading video · 42%". Tap it to go to the section.

   Coach (athlete → day)
   • The photo or video sits under the athlete's result, with
     "Deletes <date>", a Keep button and Delete.
   • Days with a photo or video get a small mark on the calendar.
   • Once a day, while the coach panel is open, expired files and
     leftovers (cancelled uploads, deleted athletes) are removed.

   Videos delete themselves 60 days after upload, photos after 90,
   unless the coach taps Keep. Who can see and change what is enforced
   by the rules in media-setup.sql; this file only draws it.
   ═══════════════════════════════════════════════════════════════ */
(function () {
'use strict';
if (window.TD_MEDIA) return;

const BUCKET        = 'td-results';
const MAX_VIDEO_SEC = 30;
const MAX_VIDEO_MB  = 100;
const MAX_PHOTO_MB  = 40;                 // before shrinking
const PHOTO_PX = 1600, PHOTO_Q = 0.82;    // longest side, JPEG quality
const POSTER_PX = 720, POSTER_Q = 0.75;   // a video's still frame
const CHUNK = 6 * 1024 * 1024;            // Supabase resumable uploads need exactly 6 MB pieces
const SIGN_SECS = 2 * 3600;               // how long a viewing link lasts
const SWEEP_EVERY_MS = 20 * 3600 * 1000;
const SWEEP_KEY = 'td_media_sweep_at';
const COLS = 'id,athlete_id,day,section,kind,path,poster_path,mime,bytes,duration_s,width,height,created_at,expires_at';

/* ───────────────────────────────────────────────────────────────
   STYLES
   ─────────────────────────────────────────────────────────────── */
const CSS = `
.md-slot { margin-top:12px; }
.md-slot:empty { display:none; }

/* The paperclip, tucked into the results box's bottom-right corner */
.md-ta-wrap { position:relative; }
.md-ta-wrap .res-ta { padding-right:46px; }
.md-clip {
  position:absolute; right:5px; bottom:9px; width:36px; height:36px;
  display:grid; place-items:center; padding:0; border:0; border-radius:3px;
  background:none; color:var(--ink-3); cursor:pointer; transition:color .15s, background .15s;
}
.md-clip:hover { color:var(--blue); background:var(--blue-soft); }
.md-clip svg { width:20px; height:20px; }
.md-clip[hidden] { display:none; }

.md-lbl { font-size:9px; font-weight:800; letter-spacing:2px; text-transform:uppercase; color:var(--blue); margin:0 0 7px 2px; }
.md-media { position:relative; max-width:440px; border-radius:4px; overflow:hidden; background:#0d0f14; }
.md-media img, .md-media video { display:block; width:100%; height:auto; max-height:62vh; object-fit:contain; background:#0d0f14; }
.md-ph { display:block; width:100%; padding:0; border:0; background:none; cursor:zoom-in; }
.md-missing { padding:18px 14px; font-size:12.5px; color:#fff; display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
.md-meta { display:flex; align-items:center; gap:6px; flex-wrap:wrap; margin-top:8px; max-width:440px; }
.md-when { flex:1; min-width:120px; font-size:11.5px; font-weight:600; color:var(--ink-3); }
.md-when.kept { color:var(--gold-ink); }
.btn-sm.md-keep.on { background:var(--gold); border-color:var(--gold); color:var(--ink); }

.md-up { display:flex; align-items:center; gap:12px; border:1px solid var(--line); border-radius:4px; padding:10px 12px; background:var(--paper); }
.md-up.err { border-color:var(--magenta); }
.md-up-thumb {
  width:54px; height:54px; flex-shrink:0; border-radius:3px; background:var(--wash) center / cover no-repeat;
  display:grid; place-items:center; color:var(--ink-3);
}
.md-up-thumb svg { width:22px; height:22px; }
.md-up-mid { flex:1; min-width:0; }
.md-up-lbl { font-size:13px; font-weight:700; color:var(--ink); }
.md-up-sub { font-size:11.5px; line-height:1.45; color:var(--ink-3); margin-top:2px; }
.md-up.err .md-up-lbl, .md-up.err .md-up-sub { color:var(--magenta); }
.md-bar { height:4px; background:var(--line); border-radius:2px; margin-top:8px; overflow:hidden; }
.md-bar i { display:block; height:100%; width:0; background:var(--blue); border-radius:2px; transition:width .25s; }
.md-up[data-st="retry"] .md-bar i { background:var(--gold); }
.md-up-acts { display:flex; flex-direction:column; gap:6px; flex-shrink:0; }

.md-lb {
  position:fixed; inset:0; z-index:700; display:flex; align-items:center; justify-content:center;
  background:rgba(10,12,16,.94); cursor:zoom-out;
  padding:calc(env(safe-area-inset-top, 0px) + 12px) 10px calc(env(safe-area-inset-bottom, 0px) + 12px);
}
.md-lb img { max-width:100%; max-height:100%; object-fit:contain; border-radius:2px; }
.md-lb-x {
  position:absolute; top:calc(env(safe-area-inset-top, 0px) + 10px); right:10px; width:44px; height:44px;
  border:0; border-radius:3px; background:rgba(255,255,255,.12); color:#fff; font-size:18px; cursor:pointer;
}

/* Upload strip: a whisper above the bottom bar while something uploads
   off screen. Tap it to go back to the section. */
.md-strip {
  position:fixed; left:0; right:0; z-index:199; bottom:calc(var(--tb-h, 50px) + var(--tb-pad, 0px));
  display:flex; justify-content:center; pointer-events:none;
  background:rgba(255,255,255,.9); backdrop-filter:blur(10px); -webkit-backdrop-filter:blur(10px);
  opacity:0; transform:translateY(6px); transition:opacity .25s, transform .25s;
}
.md-strip.on { opacity:1; transform:none; pointer-events:auto; }
.md-strip-in {
  position:relative; width:100%; max-width:560px; height:22px; padding:0 14px;
  display:flex; align-items:center; justify-content:center; gap:7px;
  background:none; border:0; cursor:pointer; font-family:var(--sans);
  font-size:8.5px; font-weight:800; letter-spacing:1.6px; text-transform:uppercase; color:var(--ink-3);
}
.md-strip-dot { width:5px; height:5px; border-radius:50%; background:var(--blue); flex-shrink:0; animation:pulse 2s ease-in-out infinite; }
.md-strip-line { position:absolute; left:0; bottom:0; height:2px; width:0; background:var(--blue); transition:width .3s; }
.md-strip[data-st="retry"] .md-strip-dot, .md-strip[data-st="retry"] .md-strip-line { background:var(--gold); }
.md-strip[data-st="err"] .md-strip-in { color:var(--magenta); }
.md-strip[data-st="err"] .md-strip-dot { background:var(--magenta); animation:none; }
.md-strip[data-st="err"] .md-strip-line { display:none; }
body.ch-typing .md-strip, html.tm-full .md-strip, #s-app:has(#v-chat.active.ch-open) .md-strip { display:none; }
body.md-strip-on:has(#s-app.active) .toast { bottom:calc(var(--tb-h, 50px) + var(--tb-pad, 0px) + 36px); }

/* Coach: a section with only a photo or video isn't "no result" */
.sec-card.md-has-media .adm-no-result { display:none; }
.sec-card .adm-result-box + .md-slot { margin-top:-2px; }

/* Coach calendar: days with a photo or video */
#detail-body .cc.md-has::after {
  content:''; position:absolute; top:4px; right:4px; width:11px; height:11px; background:var(--blue);
  -webkit-mask:var(--md-ico) center / contain no-repeat; mask:var(--md-ico) center / contain no-repeat;
  --md-ico:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M4 8h3l2-3h6l2 3h3v11H4z'/%3E%3Ccircle cx='12' cy='13' r='3.5'/%3E%3C/svg%3E");
}
#detail-body .cc.md-has.md-vid::after {
  --md-ico:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='black'%3E%3Cpath d='M7 4.5v15l12.5-7.5z'/%3E%3C/svg%3E");
}
.md-leg-ic { width:11px; height:11px; display:inline-block; background:var(--blue);
  -webkit-mask:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M4 8h3l2-3h6l2 3h3v11H4z'/%3E%3Ccircle cx='12' cy='13' r='3.5'/%3E%3C/svg%3E") center / contain no-repeat;
  mask:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M4 8h3l2-3h6l2 3h3v11H4z'/%3E%3Ccircle cx='12' cy='13' r='3.5'/%3E%3C/svg%3E") center / contain no-repeat; }
`;

const svg = inner => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" ' +
  'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + inner + '</svg>';
const ICON = {
  clip:  svg('<path d="M20.5 11.4l-8.3 8.3a5.2 5.2 0 0 1-7.4-7.4l8.6-8.6a3.5 3.5 0 0 1 4.9 4.9l-8.6 8.6a1.7 1.7 0 0 1-2.5-2.5l7.9-7.9"/>'),
  cam:   svg('<path d="M3.5 8h3.2l1.8-2.6h7l1.8 2.6h3.2v11.2H3.5z"/><circle cx="12" cy="13.3" r="3.6"/>'),
  video: svg('<rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10.5l5-3v9l-5-3z"/>'),
  photo: svg('<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="9" cy="10" r="1.8"/><path d="M20.5 16l-5-5-8.5 8.5"/>'),
};

/* ───────────────────────────────────────────────────────────────
   SMALL HELPERS
   ─────────────────────────────────────────────────────────────── */
const sb = () => window.SB || null;
const me = () => (typeof S !== 'undefined' && S.user) ? S.user : null;
const isCoach = () => !!(me() && me().role === 'coach');
const coachAthlete = () => (typeof ADM !== 'undefined' && ADM.detailUserId) || null;
const alpha = i => (typeof toAlpha === 'function' ? toAlpha(i) : String.fromCharCode(65 + i));
const toast = (m, t) => { if (typeof showToast === 'function') showToast(m, t); };
const dk = (a, iso) => a + '|' + iso;
const sk = (a, iso, sec) => a + '|' + iso + '|' + sec;
const pad = n => String(n).padStart(2, '0');
const isoOf = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const CANCEL = { cancelled: true };

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function rid() {
  try { if (crypto.randomUUID) return crypto.randomUUID().slice(0, 13); } catch (e) {}
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
function mbText(bytes) { const m = bytes / 1048576; return m < 10 ? m.toFixed(1) : String(Math.round(m)); }
function shortDate(ts) { return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }
function clock(sec) { const s = Math.round(+sec || 0); return Math.floor(s / 60) + ':' + pad(s % 60); }
function userErr(msg) { const e = new Error(msg); e.user = true; return e; }
// A problem with the file itself (too long, too big, wrong kind): trying the same file again won't help.
function fileErr(msg) { const e = userErr(msg); e.pickAnother = true; return e; }
function friendly(err) {
  const m = String((err && (err.message || err.error_description || err.error)) || err || '');
  if (/td_media_|td_result_media|schema cache|does not exist|Bucket not found/i.test(m)) return 'Photos and videos aren’t set up yet. Run media-setup.sql in Supabase.';
  if (/mime|content type|not supported/i.test(m)) return 'That kind of file can’t be uploaded. Try a different photo or video.';
  if (/maximum allowed size|too large|exceeded|413|payload/i.test(m)) return 'That file is bigger than your Supabase upload limit allows.';
  if (/network|failed to fetch|load failed|offline/i.test(m)) return 'No connection. Check your signal, then tap Try again.';
  if (/row-level security|policy|not authori|permission/i.test(m)) return 'Not allowed — try signing out and back in.';
  return m || 'Something went wrong. Tap Try again.';
}

/* ───────────────────────────────────────────────────────────────
   STATE
   ─────────────────────────────────────────────────────────────── */
const MD = {
  days:  {},   // 'athlete|iso' → { list: [rows] }  (list null = couldn't load)
  urls:  {},   // storage path → { url, exp }
  jobs:  {},   // 'athlete|iso|A' → an upload in progress
  marks: {},   // coach calendar: 'athlete|first-of-month' → { iso: 'photo'|'video' }
  warned: false,
};

const live = r => !r.expires_at || new Date(r.expires_at).getTime() > Date.now();
function rowFor(a, iso, sec) {
  const d = MD.days[dk(a, iso)];
  return (d && d.list && d.list.find(r => r.section === sec)) || null;
}
function urlOf(path) {
  const u = path && MD.urls[path];
  return u && u.exp > Date.now() ? u.url : null;
}

/* ───────────────────────────────────────────────────────────────
   LOADING + VIEWING LINKS
   ─────────────────────────────────────────────────────────────── */
async function sign(rows) {
  const client = sb();
  if (!client) return;
  const soon = Date.now() + 5 * 60 * 1000;
  const need = [...new Set(rows.flatMap(r => [r.path, r.poster_path])
    .filter(p => p && !(MD.urls[p] && MD.urls[p].exp > soon)))];
  if (!need.length) return;
  const exp = Date.now() + SIGN_SECS * 1000;
  const { data, error } = await client.storage.from(BUCKET).createSignedUrls(need, SIGN_SECS);
  if (error) { console.warn('Results media: viewing links failed —', error.message); return; }
  (data || []).forEach(d => {
    const url = d.signedUrl || d.signedURL;
    if (url && d.path) MD.urls[d.path] = { url, exp };
  });
}

async function loadDay(a, iso) {
  const client = sb();
  if (!client || !a || !iso) return;
  const { data, error } = await client.from('td_result_media').select(COLS).eq('athlete_id', a).eq('day', iso);
  if (error) {
    if (!MD.warned) { MD.warned = true; console.warn('Results media:', error.message); }
    if (!MD.days[dk(a, iso)]) MD.days[dk(a, iso)] = { list: null };
    paintDay(a, iso);
    return;
  }
  const list = (data || []).filter(live);
  await sign(list);
  MD.days[dk(a, iso)] = { list };
  paintDay(a, iso);
  afterChange(a, iso);
}

/* ───────────────────────────────────────────────────────────────
   DRAWING A SLOT
   One per section card. It shows, in order of priority: an upload in
   progress (athlete only), the photo or video, or the Add button.
   ─────────────────────────────────────────────────────────────── */
function makeSlot(mode, a, iso, idx) {
  const s = document.createElement('div');
  s.className = 'md-slot';
  const sec = alpha(idx);
  Object.assign(s.dataset, { mode, a, iso, sec, idx: String(idx), day: dk(a, iso), k: sk(a, iso, sec) });
  return s;
}
function slotsFor(sel) { return [...document.querySelectorAll('.md-slot' + sel)]; }
function paintDay(a, iso) { slotsFor('[data-day="' + dk(a, iso) + '"]').forEach(paint); }
function paintKey(k) { slotsFor('[data-k="' + k + '"]').forEach(paint); syncWake(); syncStrip(); }
function paintBarKey(k) { const j = MD.jobs[k]; if (j) slotsFor('[data-k="' + k + '"]').forEach(s => paintBar(s, j)); syncStrip(); }

function paint(slot) {
  const { a, iso, sec, mode } = slot.dataset;
  const job = mode === 'athlete' ? MD.jobs[sk(a, iso, sec)] : null;
  const day = MD.days[dk(a, iso)];
  const row = rowFor(a, iso, sec);
  const card = slot.closest('.sec-card');
  if (card) card.classList.toggle('md-has-media', !!row);

  let sig, html;
  if (job) {
    sig = ['job', job.id, job.state, job.preview ? 1 : 0, job.err || ''].join('|');
    html = jobHTML(job);
  } else if (row) {
    sig = ['row', row.id, row.expires_at, urlOf(row.path) || '', urlOf(row.poster_path) || ''].join('|');
    html = rowHTML(row, mode);
  } else {
    sig = 'none'; html = '';
  }
  // The paperclip shows once we know the section is empty, and nothing's uploading.
  const clip = mode === 'athlete' && card && card.querySelector('.md-clip');
  if (clip) clip.hidden = !(day && day.list && !row && !job);
  if (slot.dataset.sig !== sig) {
    const playing = slot.querySelector('video');
    if (playing && !playing.paused && !job && row && sig.indexOf('row|' + row.id + '|') === 0) return;   // don't yank a video someone is watching
    slot.dataset.sig = sig;
    slot.innerHTML = html;
  }
  if (job) paintBar(slot, job);
  if (row && card && !slot.dataset.opened) { slot.dataset.opened = '1'; card.classList.add('open'); }
  if (mode === 'athlete') athleteSummary(slot, row);
}

function rowHTML(row, mode) {
  const url = urlOf(row.path), poster = urlOf(row.poster_path);
  const isVid = row.kind === 'video';
  const ratio = row.width && row.height ? ' style="aspect-ratio:' + row.width + ' / ' + row.height + '"' : '';
  let media;
  if (!url) {
    media = '<div class="md-missing">Couldn’t load this ' + (isVid ? 'video' : 'photo') + '.' +
      '<button type="button" class="btn-sm" data-md="reload">Retry</button></div>';
  } else if (isVid) {
    // #t=0.1 makes Safari show the first frame when there's no still saved.
    media = '<video controls playsinline preload="metadata"' + (poster ? ' poster="' + esc(poster) + '"' : '') +
      ' src="' + esc(poster ? url : url + '#t=0.1') + '"' + ratio + '></video>';
  } else {
    media = '<button type="button" class="md-ph" data-md="zoom" aria-label="Open photo full screen">' +
      '<img src="' + esc(url) + '" alt="Photo for section ' + esc(row.section) + '"' + ratio + '></button>';
  }
  const kept = !row.expires_at;
  let when;
  if (mode === 'coach') when = kept ? 'Kept — won’t auto-delete' : 'Deletes ' + shortDate(row.expires_at);
  else when = kept ? 'Your coach is keeping this' : 'Saved until ' + shortDate(row.expires_at);

  const label = mode === 'coach'
    ? '<div class="md-lbl">Client ' + (isVid ? 'video' + (row.duration_s ? ' · ' + clock(row.duration_s) : '') : 'photo') + '</div>'
    : '';
  const acts = mode === 'coach'
    ? '<button type="button" class="btn-sm md-keep' + (kept ? ' on' : '') + '" data-md="keep">' + (kept ? 'Kept ✓' : 'Keep') + '</button>' +
      '<button type="button" class="btn-sm danger" data-md="remove">Delete</button>'
    : '<button type="button" class="btn-sm" data-md="replace">Replace</button>' +
      '<button type="button" class="btn-sm danger" data-md="remove">Remove</button>';
  return label + '<div class="md-media">' + media + '</div>' +
    '<div class="md-meta"><span class="md-when' + (kept ? ' kept' : '') + '">' + esc(when) + '</span>' + acts + '</div>';
}

function jobHTML(job) {
  const vid = job.kind === 'video';
  const lbl = {
    prep:  vid ? 'Checking your video…' : 'Getting your photo ready…',
    up:    'Uploading ' + (vid ? 'video' : 'photo'),
    retry: 'Connection dropped — retrying…',
    save:  'Saving…',
    err:   'Not added',
  }[job.state] || 'Working…';
  const sub = job.state === 'err' ? job.err
    : vid && (job.state === 'up' || job.state === 'retry') ? 'Keep the app open until this finishes'
    : '';
  const thumb = job.preview
    ? '<div class="md-up-thumb" style="background-image:url(\'' + esc(job.preview) + '\')"></div>'
    : '<div class="md-up-thumb">' + (vid ? ICON.video : ICON.photo) + '</div>';
  const err = job.state === 'err';
  const acts = err
    ? (job.pickAnother ? '<button type="button" class="btn-sm" data-md="add">Choose another</button>'
                       : '<button type="button" class="btn-sm" data-md="retry">Try again</button>') +
      '<button type="button" class="btn-sm" data-md="cancel">Dismiss</button>'
    : job.state === 'save' ? '' : '<button type="button" class="btn-sm" data-md="cancel">Cancel</button>';
  return '<div class="md-up' + (err ? ' err' : '') + '" data-st="' + job.state + '">' + thumb +
    '<div class="md-up-mid"><div class="md-up-lbl">' + esc(lbl) + '<span class="md-pct"></span></div>' +
    (sub ? '<div class="md-up-sub">' + esc(sub) + '</div>' : '') +
    (err ? '' : '<div class="md-bar"><i></i></div>') + '</div>' +
    (acts ? '<div class="md-up-acts">' + acts + '</div>' : '') + '</div>';
}

function paintBar(slot, job) {
  const bar = slot.querySelector('.md-bar i'), pct = slot.querySelector('.md-pct');
  const p = job.state === 'save' ? 1 : job.state === 'prep' ? 0.02 : Math.max(0.02, job.pct || 0);
  if (bar) bar.style.width = Math.round(p * 100) + '%';
  if (pct) pct.textContent = job.state === 'up' && job.kind === 'video' ? ' · ' + Math.floor((job.pct || 0) * 100) + '%' : '';
}

// The collapsed card shows what was logged; with only media, say so.
function athleteSummary(slot, row) {
  const card = slot.closest('.sec-card'), sum = card && card.querySelector('.sec-sum');
  if (!sum || typeof S === 'undefined') return;
  if ((S.secResults[+slot.dataset.idx] || '').trim()) return;
  sum.textContent = row ? (row.kind === 'video' ? '▶ Video' : 'Photo') : '';
}

/* ───────────────────────────────────────────────────────────────
   ATHLETE: PICK → PREPARE → UPLOAD → ATTACH
   ─────────────────────────────────────────────────────────────── */
let lastInput = null;
function pickFile(info) {
  // Made inside the tap, so iPhone allows the picker to open.
  if (lastInput) lastInput.remove();
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*,video/*';
  input.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0';
  document.body.appendChild(input);
  lastInput = input;
  input.addEventListener('change', () => {
    const f = input.files && input.files[0];
    input.remove(); if (lastInput === input) lastInput = null;
    if (f) startUpload(info, f);
  });
  input.addEventListener('cancel', () => { input.remove(); if (lastInput === input) lastInput = null; });
  input.click();
}

function kindOf(file) {
  const t = (file.type || '').toLowerCase(), n = (file.name || '').toLowerCase();
  if (t.indexOf('video/') === 0 || /\.(mov|mp4|m4v|webm|3gp)$/.test(n)) return 'video';
  if (t.indexOf('image/') === 0 || /\.(jpe?g|png|heic|heif|webp|gif)$/.test(n)) return 'photo';
  return null;
}
function videoType(file) {
  const t = (file.type || '').toLowerCase();
  const e = (((file.name || '').match(/\.([a-z0-9]+)$/i) || [])[1] || '').toLowerCase();
  if (t === 'video/quicktime' || e === 'mov') return { type: 'video/quicktime', ext: 'mov' };
  if (t === 'video/webm' || e === 'webm')     return { type: 'video/webm', ext: 'webm' };
  if (t === 'video/3gpp' || e === '3gp')      return { type: 'video/3gpp', ext: '3gp' };
  return { type: 'video/mp4', ext: 'mp4' };
}

async function startUpload(info, file) {
  const { a, iso, sec } = info, k = sk(a, iso, sec);
  const u = me();
  if (!u || u.id !== a || isCoach()) return;
  const prev = MD.jobs[k];
  if (prev && prev.state !== 'err') { toast('Already uploading this one', 'err'); return; }
  if (prev) dropJob(k);

  const kind = kindOf(file);
  const job = { id: rid(), k, a, iso, sec, file, kind: kind || 'photo', state: 'prep', pct: 0, cancelled: false };
  MD.jobs[k] = job;
  paintKey(k);

  const uploaded = [];
  try {
    if (!kind) throw fileErr('That file can’t be added. Pick a photo or a video.');
    const base = a + '/' + iso + '/' + sec + '-' + rid();
    let params;

    if (kind === 'photo') {
      if (file.size > MAX_PHOTO_MB * 1048576) throw fileErr('That photo is ' + mbText(file.size) + ' MB — too big to open. Try a screenshot of it instead.');
      const out = await shrinkPhoto(file);
      if (job.cancelled) throw CANCEL;
      job.preview = URL.createObjectURL(out.blob);
      job.state = 'up'; paintKey(k);
      const path = base + '.jpg';
      await putSmall(path, out.blob, 'image/jpeg');
      uploaded.push(path);
      params = { p_kind: 'photo', p_path: path, p_poster: null, p_mime: 'image/jpeg', p_bytes: out.blob.size,
                 p_duration: null, p_width: out.w, p_height: out.h };
    } else {
      if (file.size > MAX_VIDEO_MB * 1048576) {
        throw fileErr('That video is ' + mbText(file.size) + ' MB — the limit is ' + MAX_VIDEO_MB +
          ' MB. Trim it shorter, or film in 1080p instead of 4K.');
      }
      const meta = await videoMeta(file);
      if (job.cancelled) throw CANCEL;
      if (meta.duration && meta.duration > MAX_VIDEO_SEC + 0.5) {
        throw fileErr('Please trim video to less than ' + MAX_VIDEO_SEC + ' seconds');
      }
      if (meta.poster) job.preview = URL.createObjectURL(meta.poster);
      const vt = videoType(file);
      job.state = 'up'; paintKey(k);
      const path = base + '.' + vt.ext;
      await tusUpload(file, path, vt.type, job);
      uploaded.push(path);
      let poster = null;
      if (meta.poster && !job.cancelled) {
        try { await putSmall(base + '-poster.jpg', meta.poster, 'image/jpeg'); poster = base + '-poster.jpg'; uploaded.push(poster); }
        catch (e) { console.warn('Results media: no still frame saved —', e.message); }
      }
      params = { p_kind: 'video', p_path: path, p_poster: poster, p_mime: vt.type, p_bytes: file.size,
                 p_duration: meta.duration ? Math.round(meta.duration * 100) / 100 : null,
                 p_width: meta.w, p_height: meta.h };
    }

    if (job.cancelled) throw CANCEL;
    job.state = 'save'; paintKey(k);
    const { data, error } = await sb().rpc('td_media_attach', Object.assign({ p_day: iso, p_section: sec }, params));
    if (error) throw error;
    uploaded.length = 0;                                 // they belong to the row now
    const row = data && data.row;
    const old = (data && data.old) || [];
    if (old.length) removeObjects(old);                  // what this replaced
    const d = MD.days[dk(a, iso)] || (MD.days[dk(a, iso)] = { list: [] });
    d.list = (d.list || []).filter(r => r.section !== sec).concat(row ? [row] : []);
    if (row) await sign([row]);
    dropJob(k);
    paintKey(k);
    afterChange(a, iso);
    toast(kind === 'video' ? 'Video added' : 'Photo added', 'ok');
  } catch (err) {
    if (uploaded.length) removeObjects(uploaded);
    if (err === CANCEL || job.cancelled) { dropJob(k); paintKey(k); return; }
    if (!err.user) console.warn('Results media upload failed:', err);
    job.state = 'err';
    job.err = err.user ? err.message : friendly(err);
    job.pickAnother = !!err.pickAnother;
    paintKey(k);
  }
}

function dropJob(k) {
  const j = MD.jobs[k];
  if (!j) return;
  if (j.preview) { try { URL.revokeObjectURL(j.preview); } catch (e) {} }
  delete MD.jobs[k];
}
function cancelJob(k) {
  const j = MD.jobs[k];
  if (!j) return;
  if (j.state === 'err') { dropJob(k); paintKey(k); return; }
  j.cancelled = true;
  if (j.xhr) { try { j.xhr.abort(); } catch (e) {} }
  if (j.wake) j.wake();
}

async function putSmall(path, blob, type) {
  const { error } = await sb().storage.from(BUCKET).upload(path, blob, { contentType: type, upsert: false, cacheControl: '3600' });
  if (error) throw error;
}

function removeObjects(paths) {
  const client = sb(), list = (paths || []).filter(Boolean);
  if (!client || !list.length) return Promise.resolve();
  const runs = [];
  for (let i = 0; i < list.length; i += 100) {
    runs.push(client.storage.from(BUCKET).remove(list.slice(i, i + 100))
      .then(({ error }) => { if (error) console.warn('Results media: couldn’t delete files —', error.message); })
      .catch(e => console.warn('Results media: couldn’t delete files —', e.message)));
  }
  return Promise.all(runs);
}

/* ── Photos: shrink on the phone ──────────────────── */
// Redrawing it also leaves behind the photo's hidden details, location included.
function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve({ img, url });
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(fileErr('Couldn’t open that photo. Try a JPEG or PNG — or take a screenshot of it and add that.'));
    };
    img.src = url;
  });
}
function canvasBlob(c, q) {
  return new Promise((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error('Couldn’t process that image')), 'image/jpeg', q));
}
async function shrinkPhoto(file) {
  const { img, url } = await loadImage(file);
  try {
    const w0 = img.naturalWidth, h0 = img.naturalHeight;
    if (!w0 || !h0) throw fileErr('Couldn’t open that photo.');
    const s = Math.min(1, PHOTO_PX / Math.max(w0, h0));
    const w = Math.max(1, Math.round(w0 * s)), h = Math.max(1, Math.round(h0 * s));
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);      // transparent PNGs get a white background
    ctx.drawImage(img, 0, 0, w, h);
    const blob = await canvasBlob(c, PHOTO_Q);
    c.width = c.height = 0;                                  // hand the memory back (iPhone is strict)
    return { blob, w, h };
  } finally { URL.revokeObjectURL(url); }
}

/* ── Videos: length, size and a still frame ────────── */
async function frameJpeg(v) {
  const w0 = v.videoWidth, h0 = v.videoHeight;
  if (!w0 || !h0) return null;
  const s = Math.min(1, POSTER_PX / Math.max(w0, h0));
  const c = document.createElement('canvas');
  c.width = Math.round(w0 * s); c.height = Math.round(h0 * s);
  c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
  try { return await canvasBlob(c, POSTER_Q); } finally { c.width = c.height = 0; }
}
function videoMeta(file) {
  return new Promise(resolve => {
    const url = URL.createObjectURL(file);
    const v = document.createElement('video');
    v.muted = true; v.defaultMuted = true; v.playsInline = true; v.preload = 'auto';
    v.setAttribute('muted', ''); v.setAttribute('playsinline', '');
    v.style.cssText = 'position:fixed;left:-9999px;top:0;width:2px;height:2px;opacity:0;pointer-events:none';
    let done = false, nudged = false, grabbing = false, t2 = null;
    const facts = () => ({
      duration: isFinite(v.duration) && v.duration > 0 ? v.duration : null,
      w: v.videoWidth || null, h: v.videoHeight || null,
    });
    const finish = poster => {
      if (done) return;
      done = true; clearTimeout(t1); clearTimeout(t2);
      const out = Object.assign(facts(), { poster: poster || null });
      try { v.pause(); v.removeAttribute('src'); v.load(); } catch (e) {}
      v.remove(); URL.revokeObjectURL(url);
      resolve(out);
    };
    const grab = async () => {
      if (done || grabbing) return;
      grabbing = true;
      let p = null;
      try { p = await frameJpeg(v); } catch (e) {}
      finish(p);
    };
    const t1 = setTimeout(() => finish(null), 10000);
    v.addEventListener('loadedmetadata', () => {
      try { v.currentTime = Math.min(0.15, (isFinite(v.duration) ? v.duration : 1) / 2); } catch (e) {}
      // iPhone sometimes won't draw a frame until the video has played a moment.
      t2 = setTimeout(() => {
        if (done || nudged) return;
        nudged = true;
        try { const p = v.play(); if (p && p.then) p.then(() => v.pause()).catch(() => {}); } catch (e) {}
      }, 1500);
    });
    v.addEventListener('seeked', grab);
    v.addEventListener('timeupdate', () => { if (nudged) grab(); });
    v.addEventListener('error', () => finish(null));
    document.body.appendChild(v);
    v.src = url;
    try { v.load(); } catch (e) {}
  });
}

/* ── Resumable upload (tus) ───────────────────────── */
// Straight to Supabase's storage server, 6 MB at a time. If a piece
// fails it asks the server how much arrived and carries on from there.
function storageBase() {
  const u = String(window.SB_URL || '').replace(/\/+$/, '');
  const m = /^https:\/\/([a-z0-9]+)\.supabase\.co$/i.exec(u);
  return m ? 'https://' + m[1] + '.storage.supabase.co' : u;
}
async function authHeaders() {
  const { data } = await sb().auth.getSession();
  const session = data && data.session;
  if (!session) throw userErr('You’ve been signed out. Sign in again, then add it again.');
  return { authorization: 'Bearer ' + session.access_token, apikey: window.SB_KEY };
}
const b64 = s => btoa(unescape(encodeURIComponent(s)));
function serverMsg(text) {
  try { const j = JSON.parse(text); return j.message || j.error || ''; } catch (e) { return String(text || '').slice(0, 160); }
}
function pause(ms, job) {
  return new Promise(res => {
    const done = () => { clearTimeout(t); job.wake = null; res(); };
    const t = setTimeout(done, ms);
    job.wake = done;
  });
}

async function tusUpload(file, path, type, job) {
  const endpoint = storageBase() + '/storage/v1/upload/resumable';
  const meta = [['bucketName', BUCKET], ['objectName', path], ['contentType', type], ['cacheControl', '3600']]
    .map(([k, v]) => k + ' ' + b64(v)).join(',');
  let res;
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers: Object.assign(await authHeaders(), {
        'Tus-Resumable': '1.0.0', 'Upload-Length': String(file.size), 'Upload-Metadata': meta, 'x-upsert': 'false',
      }),
    });
  } catch (e) { throw userErr('No connection. Check your signal, then tap Try again.'); }
  if (res.status !== 201) {
    const msg = serverMsg(await res.text().catch(() => ''));
    throw new Error(msg || 'Upload refused (HTTP ' + res.status + ')');
  }
  const loc = res.headers.get('Location');
  if (!loc) throw new Error('The upload server didn’t say where to send the video');
  job.tusUrl = new URL(loc, endpoint).href;

  let offset = 0, fails = 0;
  while (offset < file.size) {
    if (job.cancelled) throw CANCEL;
    try {
      offset = await tusPatch(job, file, offset);
      fails = 0;
      if (job.state !== 'up') { job.state = 'up'; paintKey(job.k); }
    } catch (e) {
      if (e === CANCEL || job.cancelled) throw CANCEL;
      if (e.fatal) throw e;
      if (++fails > 8) throw userErr('The upload keeps dropping out. Check your connection, then tap Try again.');
      job.state = 'retry'; paintKey(job.k);
      await pause(Math.min(20000, 1500 * Math.pow(2, fails - 1)), job);   // or sooner, when the phone is back online
      if (job.cancelled) throw CANCEL;
      try { offset = await tusOffset(job); } catch (e2) { if (e2.fatal) throw e2; }
    }
  }
}

async function tusPatch(job, file, offset) {
  const hdrs = await authHeaders();
  const end = Math.min(offset + CHUNK, file.size);
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    job.xhr = xhr;
    xhr.open('PATCH', job.tusUrl);
    Object.keys(hdrs).forEach(h => xhr.setRequestHeader(h, hdrs[h]));
    xhr.setRequestHeader('Tus-Resumable', '1.0.0');
    xhr.setRequestHeader('Upload-Offset', String(offset));
    xhr.setRequestHeader('Content-Type', 'application/offset+octet-stream');
    xhr.timeout = 120000;
    xhr.upload.onprogress = ev => { job.pct = (offset + (ev.loaded || 0)) / file.size; paintBarKey(job.k); };
    xhr.onload = () => {
      job.xhr = null;
      if (xhr.status === 204 || xhr.status === 200) {
        const n = parseInt(xhr.getResponseHeader('Upload-Offset'), 10);
        const next = isFinite(n) ? n : end;
        job.pct = next / file.size; paintBarKey(job.k);
        resolve(next);
        return;
      }
      const err = new Error(serverMsg(xhr.responseText) || 'Upload failed (HTTP ' + xhr.status + ')');
      // 4xx means the server won't take it, except the ones worth retrying.
      err.fatal = xhr.status >= 400 && xhr.status < 500 && [401, 408, 409, 423, 429].indexOf(xhr.status) === -1;
      reject(err);
    };
    xhr.onerror = () => { job.xhr = null; reject(new Error('network')); };
    xhr.ontimeout = () => { job.xhr = null; reject(new Error('network')); };
    xhr.onabort = () => { job.xhr = null; reject(CANCEL); };
    xhr.send(file.slice(offset, end));
  });
}

async function tusOffset(job) {
  const res = await fetch(job.tusUrl, {
    method: 'HEAD', cache: 'no-store',
    headers: Object.assign(await authHeaders(), { 'Tus-Resumable': '1.0.0' }),
  });
  if (res.status === 404 || res.status === 410) {
    const e = userErr('That upload expired. Tap Try again to start it over.'); e.fatal = true; throw e;
  }
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const n = parseInt(res.headers.get('Upload-Offset'), 10);
  if (!isFinite(n)) throw new Error('No offset');
  return n;
}

/* ── Keep the screen on while something uploads ────── */
let wl = null, wlAsking = false;
async function syncWake() {
  const busy = Object.values(MD.jobs).some(j => j.state === 'prep' || j.state === 'up' || j.state === 'retry' || j.state === 'save');
  try {
    if (busy && !wl && !wlAsking && 'wakeLock' in navigator && document.visibilityState === 'visible') {
      wlAsking = true;
      wl = await navigator.wakeLock.request('screen');
      wl.addEventListener('release', () => { wl = null; });
    } else if (!busy && wl) {
      const w = wl; wl = null; await w.release();
    }
  } catch (e) { wl = null; }
  wlAsking = false;
}
function uploading() { return Object.values(MD.jobs).some(j => j.state !== 'err'); }

/* ── Upload strip ─────────────────────────────────── */
// Shown only while the section being uploaded to is off screen: another
// tab, another day, or scrolled away. Its own card already shows progress.
let strip = null, stripQueued = false;
function stripEl() {
  if (strip) return strip;
  const app = document.getElementById('s-app');
  if (!app) return null;
  strip = document.createElement('div');
  strip.className = 'md-strip';
  strip.setAttribute('role', 'status');
  strip.innerHTML = '<button type="button" class="md-strip-in"><span class="md-strip-dot"></span>' +
    '<span class="md-strip-txt"></span><span class="md-strip-line"></span></button>';
  strip.addEventListener('click', () => { if (strip.job) goToJob(strip.job); });
  app.appendChild(strip);
  return strip;
}
function slotOnScreen(job) {
  const app = document.getElementById('s-app'), day = document.getElementById('v-day');
  if (!app || !app.classList.contains('active') || !day || !day.classList.contains('active')) return false;
  if (typeof S === 'undefined' || S.selDate !== job.iso) return false;
  const s = slotsFor('[data-k="' + job.k + '"]')[0];
  if (!s) return false;
  const r = s.getBoundingClientRect();
  return r.height > 0 && r.bottom > 60 && r.top < window.innerHeight - 70;
}
function syncStrip() {
  if (stripQueued) return;
  stripQueued = true;
  requestAnimationFrame(() => { stripQueued = false; drawStrip(); });
}
function drawStrip() {
  const u = me();
  const jobs = Object.values(MD.jobs).filter(j => u && j.a === u.id);
  jobs.forEach(j => { if (j.state === 'err' && slotOnScreen(j)) j.seen = true; });   // a failure, once seen, stops nagging
  const active = jobs.filter(j => j.state !== 'err');
  const failed = jobs.filter(j => j.state === 'err' && !j.seen);
  const show = (active.length && !active.every(slotOnScreen)) || failed.length;
  const el = show ? stripEl() : strip;
  document.body.classList.toggle('md-strip-on', !!show);
  if (!el) return;
  el.classList.toggle('on', !!show);
  if (!show) { el.job = null; return; }

  let st, txt, pct = 0;
  if (active.length) {
    const what = active.length > 1 ? active.length + ' files' : active[0].kind;
    const bytes = active.reduce((n, j) => n + (j.file ? j.file.size : 0), 0) || 1;
    pct = active.reduce((n, j) => n + (j.file ? j.file.size : 0) * (j.state === 'save' ? 1 : j.pct || 0), 0) / bytes;
    st = active.some(j => j.state === 'retry') ? 'retry' : 'up';
    txt = st === 'retry' ? 'Reconnecting…'
        : active.every(j => j.state === 'save') ? 'Saving ' + what + '…'
        : active.every(j => j.state === 'prep') ? 'Preparing ' + what + '…'
        : 'Uploading ' + what + (pct > 0.01 ? ' · ' + Math.floor(pct * 100) + '%' : '');
    el.job = active[0];
  } else {
    st = 'err';
    txt = (failed[0].kind === 'video' ? 'Video' : 'Photo') + ' not added · Tap to see why';
    el.job = failed[0];
  }
  el.dataset.st = st;
  el.querySelector('.md-strip-txt').textContent = txt;
  el.querySelector('.md-strip-line').style.width = Math.round(Math.max(0.02, pct) * 100) + '%';
}
function goToJob(job) {
  const reveal = () => {
    const s = slotsFor('[data-k="' + job.k + '"]')[0];
    if (!s) return;
    const card = s.closest('.sec-card');
    if (card) card.classList.add('open');
    s.scrollIntoView({ behavior: 'smooth', block: 'center' });
    syncStrip();
  };
  const day = document.getElementById('v-day');
  if (day && day.classList.contains('active') && S.selDate === job.iso) { reveal(); return; }
  // Back to the day as it was left (typing included) if that's where it was, else open it.
  if (S.lastTrain && S.lastTrain.route === 'day' && S.lastTrain.date === job.iso && !S.trainStale && window.TD_TABS) window.TD_TABS.go('train');
  else if (typeof navTo === 'function') navTo('day', { date: job.iso });
  setTimeout(reveal, 150);
}

/* ───────────────────────────────────────────────────────────────
   REMOVE + KEEP
   ─────────────────────────────────────────────────────────────── */
async function removeRow(a, iso, sec) {
  const row = rowFor(a, iso, sec);
  if (!row) return;
  const { data, error } = await sb().rpc('td_media_remove', { p_id: row.id });
  if (error) { toast('Couldn’t remove it: ' + friendly(error), 'err'); return; }
  removeObjects(Array.isArray(data) ? data : [row.path, row.poster_path]);
  const d = MD.days[dk(a, iso)];
  if (d && d.list) d.list = d.list.filter(r => r.id !== row.id);
  paintDay(a, iso);
  afterChange(a, iso);
  toast(row.kind === 'video' ? 'Video removed' : 'Photo removed', 'ok');
}

async function toggleKeep(a, iso, sec, btn) {
  const row = rowFor(a, iso, sec);
  if (!row) return;
  const keep = !!row.expires_at;
  btn.disabled = true;
  const { data, error } = await sb().rpc('td_media_keep', { p_id: row.id, p_keep: keep });
  btn.disabled = false;
  if (error) { toast('Couldn’t change that: ' + friendly(error), 'err'); return; }
  row.expires_at = data || null;
  paintDay(a, iso);
  toast(keep ? 'Kept — it won’t auto-delete' : 'Will delete ' + shortDate(row.expires_at), 'ok');
}

function zoom(url) {
  if (!url) return;
  const lb = document.createElement('div');
  lb.className = 'md-lb';
  lb.innerHTML = '<img alt=""><button type="button" class="md-lb-x" aria-label="Close">✕</button>';
  lb.querySelector('img').src = url;
  lb.addEventListener('click', () => lb.remove());
  document.body.appendChild(lb);
}
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') document.querySelectorAll('.md-lb').forEach(x => x.remove());
});

function arm(btn, text) {
  const was = btn.textContent;
  btn.dataset.armed = '1';
  btn.textContent = text;
  setTimeout(() => { if (btn.isConnected && btn.dataset.armed) { delete btn.dataset.armed; btn.textContent = was; } }, 3500);
}

document.addEventListener('click', e => {
  const b = e.target.closest && e.target.closest('[data-md]');
  if (!b) return;
  const card = b.closest('.sec-card');
  const slot = b.closest('.md-slot') || (card && card.querySelector('.md-slot'));
  if (!slot) return;
  const { a, iso, sec, mode, k } = slot.dataset;
  const act = b.dataset.md;
  if (act === 'add' || act === 'replace') { if (mode === 'athlete') pickFile({ a, iso, sec }); return; }
  if (act === 'cancel') { cancelJob(k); return; }
  if (act === 'retry')  { const j = MD.jobs[k]; if (j) startUpload({ a, iso, sec }, j.file); return; }
  if (act === 'remove') {
    if (!b.dataset.armed) { arm(b, mode === 'coach' ? 'Tap again to delete' : 'Tap again to remove'); return; }
    b.disabled = true;
    removeRow(a, iso, sec);
    return;
  }
  if (act === 'keep')   { toggleKeep(a, iso, sec, b); return; }
  if (act === 'zoom')   { const r = rowFor(a, iso, sec); if (r) zoom(urlOf(r.path)); return; }
  if (act === 'reload') { if (MD.days[dk(a, iso)]) MD.days[dk(a, iso)].list = null; loadDay(a, iso); }
});

/* ───────────────────────────────────────────────────────────────
   KNOCK-ON EFFECTS IN THE ATHLETE'S DAY
   ─────────────────────────────────────────────────────────────── */
function dayHasMedia(a, iso) {
  const d = MD.days[dk(a, iso)];
  return !!(d && d.list && d.list.length) ||
    Object.values(MD.jobs).some(j => j.a === a && j.iso === iso && j.state !== 'err');
}

function afterChange(a, iso) {
  const u = me();
  if (!u || isCoach() || u.id !== a || typeof S === 'undefined' || S.selDate !== iso) return;
  window.refreshProgress();
  // A day with a photo or video on it is a logged day: it can't be moved.
  if (dayHasMedia(a, iso)) {
    document.querySelectorAll('#d-content [onclick*="openMovePicker"]').forEach(btn => {
      const wrap = btn.parentElement;
      if (wrap && wrap.parentElement && wrap.parentElement.id === 'd-content') wrap.remove(); else btn.remove();
    });
  }
}

/* ───────────────────────────────────────────────────────────────
   COACH: CALENDAR MARKS + DAILY CLEAN-UP
   ─────────────────────────────────────────────────────────────── */
function applyMarks(marks, y, mo) {
  const grid = document.querySelector('#detail-body .cal-grid');
  if (!grid) return;
  let any = false;
  grid.querySelectorAll('.cc').forEach(cell => {
    const n = cell.querySelector('.cn');
    if (!n || cell.classList.contains('emp')) return;
    const iso = y + '-' + pad(mo + 1) + '-' + pad(parseInt(n.textContent, 10));
    cell.classList.toggle('md-has', !!marks[iso]);
    cell.classList.toggle('md-vid', marks[iso] === 'video');
    if (marks[iso]) any = true;
  });
  const legend = document.querySelector('#detail-body .cal-legend');
  if (legend && any && !legend.querySelector('.md-leg')) {
    legend.insertAdjacentHTML('beforeend', '<div class="leg md-leg"><span class="md-leg-ic"></span>Photo / video</div>');
  }
}
async function markMonth() {
  const a = coachAthlete(), client = sb();
  if (!a || !client || typeof ADM === 'undefined' || !ADM.detailMonth) return;
  const m = ADM.detailMonth, y = m.getFullYear(), mo = m.getMonth();
  const first = isoOf(new Date(y, mo, 1)), last = isoOf(new Date(y, mo + 1, 0));
  const key = a + '|' + first;
  if (MD.marks[key]) applyMarks(MD.marks[key], y, mo);
  const { data, error } = await client.from('td_result_media').select('day,kind,expires_at')
    .eq('athlete_id', a).gte('day', first).lte('day', last);
  if (error) return;
  const marks = {};
  (data || []).filter(live).forEach(r => { marks[r.day] = marks[r.day] === 'video' || r.kind === 'video' ? 'video' : 'photo'; });
  MD.marks[key] = marks;
  if (coachAthlete() === a && ADM.detailMonth.getFullYear() === y && ADM.detailMonth.getMonth() === mo) applyMarks(marks, y, mo);
}

let sweeping = false;
async function sweep() {
  if (!isCoach() || sweeping || !sb()) return;
  let last = 0;
  try { last = +localStorage.getItem(SWEEP_KEY) || 0; } catch (e) {}
  if (Date.now() - last < SWEEP_EVERY_MS) return;
  sweeping = true;
  try {
    for (let round = 0; round < 10; round++) {
      const { data, error } = await sb().rpc('td_media_sweep', { p_limit: 200 });
      if (error) { console.warn('Results media clean-up:', error.message); return; }
      const names = (data || []).map(r => (r && typeof r === 'object') ? r.obj : r).filter(Boolean);
      if (names.length) await removeObjects(names);
      if (names.length < 200) break;
    }
    try { localStorage.setItem(SWEEP_KEY, String(Date.now())); } catch (e) {}
  } finally { sweeping = false; }
}

/* ───────────────────────────────────────────────────────────────
   HOOKS INTO THE APP
   ─────────────────────────────────────────────────────────────── */
function hook() {
  // Athlete: a slot in every section card.
  const _build = window.buildSecCard;
  window.buildSecCard = function (text, idx) {
    const card = _build.apply(this, arguments);
    try {
      const u = me();
      if (u && !isCoach() && S.selDate) {
        const body = card.querySelector('.sec-body');
        if (body) {
          // Paperclip inside the results box: wrap the box so it can sit in its corner.
          const ta = body.querySelector('.res-ta');
          if (ta) {
            const wrap = document.createElement('div');
            wrap.className = 'md-ta-wrap';
            ta.parentNode.insertBefore(wrap, ta);
            wrap.appendChild(ta);
            wrap.insertAdjacentHTML('beforeend',
              '<button type="button" class="md-clip" data-md="add" hidden aria-label="Attach a photo or video" ' +
              'title="Attach a photo or video (videos up to ' + MAX_VIDEO_SEC + ' seconds)">' + ICON.clip + '</button>');
          }
          const slot = makeSlot('athlete', u.id, S.selDate, idx);
          body.appendChild(slot);
          paint(slot);
        }
      }
    } catch (e) { console.warn('Results media:', e); }
    return card;
  };

  // Coach: the same, under the athlete's result.
  const _abuild = window.adminBuildSecCard;
  if (typeof _abuild === 'function') {
    window.adminBuildSecCard = function (text, idx, blockLabel, secIdx, day) {
      const card = _abuild.apply(this, arguments);
      try {
        const a = coachAthlete();
        if (a && day && day.isoDate) {
          const body = card.querySelector('.sec-body');
          const slot = makeSlot('coach', a, day.isoDate, idx);
          const box = body && body.querySelector('.adm-result-box');
          if (box) box.after(slot); else if (body) body.appendChild(slot);
          paint(slot);
        }
      } catch (e) { console.warn('Results media:', e); }
      return card;
    };
  }

  // Opening a day fetches what's on it.
  const _open = window._openDay;
  window._openDay = function (iso) {
    const r = _open.apply(this, arguments);
    const u = me();
    if (u && !isCoach()) loadDay(u.id, iso);
    return r;
  };
  const _aopen = window.adminOpenDay;
  if (typeof _aopen === 'function') {
    window.adminOpenDay = function (iso) {
      const r = _aopen.apply(this, arguments);
      const a = coachAthlete();
      if (a) loadDay(a, iso);
      return r;
    };
  }

  const _detail = window.renderDetailBody;
  if (typeof _detail === 'function') {
    window.renderDetailBody = function () {
      const r = _detail.apply(this, arguments);
      markMonth();
      return r;
    };
  }

  // "Logged 3 of 5" counts a section with only a photo or video.
  window.refreshProgress = function () {
    const el = document.getElementById('day-progress');
    const day = S.dayMap[S.selDate];
    if (!el || !day || !day.blocks) return;
    const total = day.blocks.reduce((n, b) => n + b.sections.length, 0);
    const u = me();
    let done = 0;
    for (let i = 0; i < total; i++) {
      if ((S.secResults[i] || '').trim() || (u && rowFor(u.id, S.selDate, alpha(i)))) done++;
    }
    el.innerHTML = done >= total && total > 0 ? '✓ &nbsp;All ' + total + ' logged' : 'Logged ' + done + ' of ' + total;
  };

  const _sum = window.updateSecSummary;
  if (typeof _sum === 'function') {
    window.updateSecSummary = function (idx) {
      _sum.apply(this, arguments);
      const u = me();
      if (!u || !S.selDate || (S.secResults[idx] || '').trim()) return;
      const row = rowFor(u.id, S.selDate, alpha(idx));
      const card = document.querySelectorAll('#d-content .sec-card')[idx];
      const sum = card && card.querySelector('.sec-sum');
      if (row && sum) sum.textContent = row.kind === 'video' ? '▶ Video' : 'Photo';
    };
  }

  // A day with media on it stays put.
  const _move = window.openMovePicker;
  if (typeof _move === 'function') {
    window.openMovePicker = function (iso) {
      const u = me();
      if (u && dayHasMedia(u.id, iso)) { toast('Remove the photo or video on this day before moving it', 'err'); return; }
      return _move.apply(this, arguments);
    };
  }

  // Coach panel: tidy up once a day.
  const _route = window.applyRoute;
  window.applyRoute = function (route) {
    const r = _route.apply(this, arguments);
    if (route === 'admin') setTimeout(sweep, 4000);
    syncStrip();
    return r;
  };

  // The strip follows the athlete around: scrolling, switching tabs.
  window.addEventListener('scroll', syncStrip, { passive: true });
  window.addEventListener('resize', syncStrip);
  document.addEventListener('click', () => setTimeout(syncStrip, 60), true);

  // Signing out drops everything, uploads included.
  ['doLogout', 'doAdminLogout'].forEach(fn => {
    const orig = window[fn];
    if (typeof orig !== 'function') return;
    window[fn] = function () {
      Object.keys(MD.jobs).forEach(k => { cancelJob(k); dropJob(k); });
      MD.days = {}; MD.urls = {}; MD.marks = {};
      return orig.apply(this, arguments);
    };
  });

  // Back from the lock screen or another app: pick uploads straight back
  // up, and refresh any viewing links that are about to run out.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    Object.values(MD.jobs).forEach(j => { if (j.wake) j.wake(); });
    syncWake();
    syncStrip();
    refreshLinks();
  });
  window.addEventListener('online', () => Object.values(MD.jobs).forEach(j => { if (j.wake) j.wake(); }));
  window.addEventListener('beforeunload', e => { if (uploading()) { e.preventDefault(); e.returnValue = ''; } });
}

async function refreshLinks() {
  const slots = slotsFor('');
  const rows = [];
  new Set(slots.map(s => s.dataset.day)).forEach(d => { const x = MD.days[d]; if (x && x.list) rows.push(...x.list); });
  if (!rows.length) return;
  await sign(rows);
  slots.forEach(paint);
}

/* ───────────────────────────────────────────────────────────────
   GO
   ─────────────────────────────────────────────────────────────── */
if (typeof S === 'undefined' || typeof applyRoute !== 'function' || typeof buildSecCard !== 'function') {
  console.warn('td-media.js must load after the main script in index.html');
  return;
}
const st = document.createElement('style');
st.id = 'td-media-css';
st.textContent = CSS;
document.head.appendChild(st);
hook();

window.TD_MEDIA = { state: () => MD, reload: loadDay, sweep: () => { try { localStorage.removeItem(SWEEP_KEY); } catch (e) {} return sweep(); } };
})();
