/* ============================================================================
   TRAINDERIVE — Service Worker

   IMPORTANT: I have not seen your existing sw.js, so this is a complete,
   working replacement rather than a merge. If your current sw.js has custom
   logic you want to keep, do NOT use this file — instead make two small edits
   to your own:
       1. add 'coach-editor.js' to the pre-cache list
       2. bump the CACHE version string
   That is all the coach editor needs from the service worker.

   Strategy used here:
     • App shell (html/js/json/icons) — network-first, cache as fallback.
       Keeps athletes on the newest build while still working offline.
     • Google Fonts — cache-first (they never change).
     • Everything cross-origin (Apps Script, the Cloudflare worker, Google
       Sheets, codetabs) — never touched. Live data must not be cached.
   ============================================================================ */

const CACHE = 'trainderive-v8';          // ← bump this on every deploy

const SHELL = [
  './',
  './index.html',
  './coach-editor.js',
  './manifest.json',
  './icon-192.png'
];

/* ── install: pre-cache the shell ─────────────────────────────────────────── */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      // addAll fails the whole install if any one file 404s, so add
      // individually and tolerate misses (e.g. a missing icon).
      .then(cache => Promise.all(
        SHELL.map(url => cache.add(url).catch(err => {
          console.warn('SW: skipped pre-cache for', url, err.message);
        }))
      ))
      .then(() => self.skipWaiting())   // activate immediately
  );
});

/* ── activate: drop old caches ────────────────────────────────────────────── */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

/* ── fetch ────────────────────────────────────────────────────────────────── */
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;                 // never cache POSTs

  const url = new URL(req.url);

  // Google Fonts — cache-first
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.match(req).then(hit => {
        if (hit) return hit;
        return fetch(req).then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
          return res;
        });
        // If offline and uncached, the rejection propagates and the browser
        // falls back to system fonts — which is correct. Returning undefined
        // from respondWith would throw instead.
      })
    );
    return;
  }

  // Anything else cross-origin (Apps Script, worker proxy, Sheets, codetabs)
  // goes straight to the network — this is live data, never cache it.
  if (url.origin !== self.location.origin) return;

  // App shell — network-first, fall back to cache when offline
  event.respondWith(
    fetch(req)
      .then(res => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then(hit => hit || caches.match('./index.html')))
  );
});
