import { SOCKET_EVENTS } from '../services/socketService';

/**
 * Where a tapped push notification takes the user.
 *
 * Pulled out of App.js because the routing is a table, not control flow, and
 * because two of its rules were wrong in ways nothing could catch inline:
 *
 *   - the review prompt carries BOTH bookingId and postId, so a `bookingId`
 *     test placed first swallowed it and dropped the customer on the booking
 *     list; the review sheet it exists to open was unreachable.
 *   - booking pushes carry `notifType: SOCKET_EVENTS.BOOKING_REQUESTED`, whose
 *     value is 'booking.requested'. The handler compared it to
 *     'booking_requested', which the engine has never sent, so a provider
 *     tapping "new request" landed on their own requests instead of the ones
 *     they received.
 *
 * Returns `{ screen, params }`, or null when the payload names no destination.
 * Order matters: the most specific payload is matched first.
 */
export function resolveNotificationRoute(data = {}) {
  const postParams = {
    postId: data.postId,
    // post_type is carried by newer engine payloads; saved-search sends
    // `category`, and PostDetailScreen falls back to the fetched post anyway.
    postType: data.post_type ?? data.category,
  };

  // Rental finished, customer nudged to review. Has a bookingId too — this
  // must be tested before any bookingId rule or the sheet never opens.
  if (data.type === 'review_prompt' && data.postId) {
    return {
      screen: 'PostDetailScreen',
      params: {
        ...postParams,
        role: 'customer',
        openReview: true,
        bookingId: data.bookingId,
        providerId: data.providerId,
      },
    };
  }

  // A saved search matched a newly approved post.
  if (data.type === 'saved_search' && data.postId) {
    return { screen: 'PostDetailScreen', params: { ...postParams, role: 'customer' } };
  }

  if (data.bookingId) {
    // 'provider' is the received-requests view, 'customer' is own requests, so
    // the role is the *recipient's* side. The engine sends a new request and a
    // cancellation to the provider, and a response to the customer — which is
    // also how useNotificationSync labels the same three events in-app.
    const role = data.notifType === SOCKET_EVENTS.BOOKING_RESPONDED ? 'customer' : 'provider';
    return { screen: 'BookingList', params: { role } };
  }

  if (data.postId) {
    const role = data.notifType === 'new_post' ? 'admin' : 'provider';
    return { screen: 'PostDetailScreen', params: { ...postParams, role } };
  }

  // A broadcast names no post and no booking. It still has somewhere to go:
  // the in-app list, where the message itself is readable. Returning null here
  // is what made tapping a campaign push do nothing at all.
  if (data.notifType === 'broadcast') {
    return { screen: 'Notifications', params: {} };
  }

  return null;
}

/** Which query caches a notification invalidates, foregrounded or tapped. */
export function notificationTouches(data = {}) {
  return {
    bookings: Boolean(data.bookingId),
    posts: Boolean(data.postId),
  };
}
