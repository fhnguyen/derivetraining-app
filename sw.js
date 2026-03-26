// TRAINDERIVE Service Worker
const CACHE = 'trainderive-v4';

// On install — skip waiting immediately, take control right away
self.addEventListener('install', e => {
  self.skipWaiting();
});

// On activate — delete ALL old caches, claim all clients
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Fetch strategy:
// - index.html → ALWAYS network, never cache (ensures latest code)
// - everything else → network first, cache fallback for offline
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;

  const url = new URL(e.request.url);

  // Never intercept external APIs
  if (
    url.hostname.includes('google') ||
    url.hostname.includes('corsproxy') ||
    url.hostname.includes('allorigins') ||
    url.hostname.includes('codetabs') ||
    url.hostname.includes('fonts.g')
  ) return;

  // index.html — always fetch fresh, never serve from cache
  if (url.pathname === '/' || url.pathname.endsWith('index.html')) {
    e.respondWith(
      fetch(e.request, { cache: 'no-store' }).catch(() => caches.match(e.request))
    );
    return;
  }

  // Everything else (icons, manifest, sw) — network first, cache fallback
  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
