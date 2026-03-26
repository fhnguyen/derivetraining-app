// TRAINDERIVE Service Worker
// Cache name includes a version — change this string on every deploy
// to force all clients to fetch fresh files immediately.
const CACHE = 'trainderive-v1';

// Files to cache for offline use
const PRECACHE = [
  '/',
  '/index.html',
];

// ── Install: cache core files ────────────────────────────────────
self.addEventListener('install', e => {
  // Skip waiting so the new SW activates immediately
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(PRECACHE))
  );
});

// ── Activate: delete old caches ──────────────────────────────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE).map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: network-first strategy ────────────────────────────────
// Always try the network first so updates are picked up immediately.
// Only fall back to cache if the network is unavailable (offline).
self.addEventListener('fetch', e => {
  // Only handle GET requests for same-origin or CDN resources
  if (e.request.method !== 'GET') return;

  // Don't intercept Google Sheets API calls, Apps Script, or fonts
  const url = e.request.url;
  if (
    url.includes('docs.google.com') ||
    url.includes('script.google.com') ||
    url.includes('googleapis.com') ||
    url.includes('corsproxy.io') ||
    url.includes('allorigins.win') ||
    url.includes('codetabs.com')
  ) return;

  e.respondWith(
    fetch(e.request)
      .then(res => {
        // Cache a copy of the fresh response
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then(cache => cache.put(e.request, clone));
        }
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
