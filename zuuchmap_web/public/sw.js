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
  let path = '/'
  if (data.conversationId) path = `/messages/${data.conversationId}`
  else if (data.type === 'booking' && data.bookingId) path = '/provider/bookings'
  else if (data.postId) path = `/posts/${data.postId}`

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Reuse an open tab where possible — opening a second copy of the app
      // loses whatever the user was in the middle of in the first.
      for (const client of clients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(path)
          return client.focus()
        }
      }
      return self.clients.openWindow(path)
    })
  )
})
