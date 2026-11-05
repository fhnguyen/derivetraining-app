/* ═══════════════════════════════════════════════════════════════
   TRAINDERIVE — coach notifications (service worker part)
   Put this file next to sw.js, and add this as the FIRST line of sw.js:

       importScripts('push-sw.js');

   It shows a notification when an athlete messages the coach, groups
   messages from the same conversation into one notification, and opens
   that conversation when the notification is tapped.
   ═══════════════════════════════════════════════════════════════ */

self.addEventListener('push', event => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch (e) { d = { body: event.data ? event.data.text() : '' }; }
  const tag = d.thread || 'td-chat';

  event.waitUntil((async () => {
    // A second message in the same conversation replaces the first,
    // with a count, instead of stacking up on the lock screen.
    const open = await self.registration.getNotifications({ tag });
    const count = open.reduce((n, x) => n + ((x.data && x.data.count) || 1), 0) + 1;
    open.forEach(x => x.close());

    await self.registration.showNotification(d.title || 'New message', {
      body: count > 1 ? count + ' new messages · ' + (d.body || '') : (d.body || ''),
      tag,
      renotify: true,
      icon: new URL('icon-192.png', self.registration.scope).href,
      badge: new URL('icon-192.png', self.registration.scope).href,
      data: { thread: d.thread || null, count },
    });
    // A dot on the home-screen icon; the app sets the exact number when opened.
    try { if (self.navigator.setAppBadge) await self.navigator.setAppBadge(); } catch (e) {}
  })());
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const thread = event.notification.data && event.notification.data.thread;

  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of wins) {
      if ('focus' in w) {
        await w.focus();
        w.postMessage({ type: 'td-open-thread', thread });
        return;
      }
    }
    const url = new URL('./', self.registration.scope);
    if (thread) url.searchParams.set('open', thread);
    url.hash = 'admin';
    await self.clients.openWindow(url.href);
  })());
});

// Lets the app check that this file is loaded.
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'td-push-ping' && event.ports && event.ports[0]) {
    event.ports[0].postMessage({ tdPush: true });
  }
});
