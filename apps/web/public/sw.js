// Web push for Zuuchmap. Plain JS, no build step; the app registers it only when the engine has a VAPID key.
// Each push body is the engine's JSON: { title, body, data: { notification_id, kind, data, url } }.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: 'ZuuchMap', body: event.data ? event.data.text() : '' };
  }
  const data = payload.data || {};
  event.waitUntil(
    self.registration.showNotification(payload.title || 'ZuuchMap', {
      body: payload.body || '',
      data,
      icon: '/apple-touch-icon.png',
      badge: '/favicon-32.png',
      // The same notification id replaces itself (a saved search that gains a match) instead of stacking.
      tag: data.notification_id || data.kind || 'zuuchmap',
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (list) => {
      const open = list.find((c) => c.url.startsWith(self.location.origin));
      if (open) {
        await open.focus();
        if ('navigate' in open) return open.navigate(url).catch(() => self.clients.openWindow(url));
        return undefined;
      }
      return self.clients.openWindow(url);
    }),
  );
});
