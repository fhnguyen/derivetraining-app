/* ============================================================================
   TRAINDERIVE — Service Worker

   Strategy:
     • App shell (html/js/json/icons) — network-first, cache as fallback.
       Keeps athletes on the newest build while still working offline.
     • Google Fonts — cache-first (they never change).
     • Everything cross-origin — never touched. In particular Supabase:
       sign-in, profiles and every call to an athlete's sheet go through
       it, and that is live data that must never be served from a cache.
   ============================================================================ */

const CACHE = 'trainderive-v10';         // ← bump this on every deploy

const SHELL = [
  './',
  './index.html',
  './supabase.js',          // the Supabase client, served from this repo
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

  // Anything else cross-origin — Supabase auth, the profiles table, and the
  // edge functions that read and write each athlete's sheet — goes straight
  // to the network. This is live data and must never be cached.
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
