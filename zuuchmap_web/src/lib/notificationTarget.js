/**
 * Where a notification row leads. Shared by the bell dropdown and the
 * notifications page so a row opens the same place from either — and mirrors
 * `resolveNotificationRoute` in the app.
 *
 * Returns null for rows that are about nothing in particular (a stats ping).
 */
export function targetFor(n, { isAdmin = false } = {}) {
  if (!n) return null
  // An explicit url wins — the engine sets one on every push payload.
  if (n.url) return n.url
  // Messages first: a message notification also carries a postId, and the
  // thread — not the listing — is what the reader is being called to.
  if (n.conversationId) return `/messages/${n.conversationId}`
  if (n.reportId || n.kind === 'report' || n.notifType === 'report') return isAdmin ? '/admin/reports' : null
  if (n.postId) return isAdmin && n.role === 'admin' ? `/admin/posts/${n.postId}` : `/posts/${n.postId}`
  if (n.bookingRole === 'provider') return '/provider/bookings'
  if (n.bookingRole === 'customer') return '/customer/bookings'
  if (n.role === 'broadcast') return '/notifications'
  return null
}
