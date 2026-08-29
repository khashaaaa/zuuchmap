/**
 * Service worker — web push only.
 *
 * Deliberately not a caching/offline worker: the app is a live marketplace and
 * a stale cached listing is worse than a slow one. Its whole job is to receive
 * a push while the tab is closed, which is the case the site could not handle
 * at all before — a provider working from the browser missed every booking
 * request and every approval the moment they navigated away.
 */

// Take over immediately rather than waiting for every tab to close: a worker
// that only activates on the next visit cannot deliver the notification that
// prompted the user to allow notifications.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

self.addEventListener('push', (event) => {
  let payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch {
    payload = { title: 'ZuuchMap', body: event.data?.text?.() ?? '' }
  }

  const title = payload.title || 'ZuuchMap'
  const options = {
    body: payload.body || '',
    icon: '/favicon.svg',
    badge: '/favicon.svg',
    data: payload.data || {},
    // Collapses repeats of the same subject rather than stacking them: three
    // messages in one thread should be one line in the tray, not three.
    tag: payload.data?.conversationId || payload.data?.type || undefined,
    renotify: Boolean(payload.data?.conversationId),
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const data = event.notification.data || {}

  // Land on the thing the notification was about, not the home page.
  // The engine sets `url` on every payload; the mapping below only covers
  // pushes minted before it did.
  let path = '/'
  if (typeof data.url === 'string' && data.url.startsWith('/')) path = data.url
  else if (data.conversationId) path = `/messages/${data.conversationId}`
  // A booking lands on the recipient's list, and which side that is (provider
  // or customer) is not known here — the notifications page can route it.
  else if (data.bookingId || String(data.notifType || '').startsWith('booking.')) path = '/notifications'
  else if (data.postId) path = `/posts/${data.postId}`

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Reuse an open tab where possible — opening a second copy of the app
      // loses whatever the user was in the middle of in the first.
      const target = new URL(path, self.location.origin).href
      const client = clients.find((c) => c.url.startsWith(self.location.origin) && 'focus' in c)
      if (client) {
        const focused = client.focus()
        // `navigate` only works on a controlled client; an uncontrolled one
        // (first load before this worker claimed it) falls through to a new
        // window rather than doing nothing.
        if ('navigate' in client) {
          return client.navigate(target).catch(() => self.clients.openWindow(target))
        }
        return focused
      }
      return self.clients.openWindow(target)
    })
  )
})
