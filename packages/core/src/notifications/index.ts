// One renderer for a notification's words and destination: the engine uses it for push and
// e-mail copy (through `translator`), both clients for the notification centre (through i18next).
import type { NotificationData, NotificationKind } from '../api/index.js';

/** i18next's `t` with interpolation options. */
export type NotifyT = (key: string, options?: Record<string, unknown>) => string;

export interface NotificationCopy { title: string; body: string }

/** `2026-10-12` → `10.12`, the short form Figma I3 uses in a sentence. */
const monthDay = (ymd?: string | null): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd ?? '');
  return m ? `${m[2]}.${m[3]}` : '';
};

const dates = (d: NotificationData): string => {
  const a = monthDay(d.start_date);
  const b = monthDay(d.end_date);
  return !b || a === b ? a : `${a}–${b}`;
};

/** Title (push title, e-mail subject) and body (the centre's one line, push body). */
export function notificationCopy(n: { kind: NotificationKind; data: NotificationData }, t: NotifyT): NotificationCopy {
  const d = n.data ?? {};
  const k = `notif.${n.kind}`;
  const vars = {
    title: d.title ?? t('notif.untitled'),
    name: d.name ?? '',
    reason: d.reason ?? '',
    dates: dates(d),
    time: d.start_time ?? '',
    count: d.count ?? 1,
    days: d.days_left ?? 0,
    rating: d.rating ?? '',
    query: d.query ?? '',
  };
  switch (n.kind) {
    case 'MESSAGE_CREATED':
      return { title: d.name || t(`${k}.title`), body: d.preview ?? '' };
    case 'LISTING_APPROVED':
    case 'LISTING_REJECTED':
      return { title: t(`${k}.title`), body: t(d.revision ? `${k}.bodyRevision` : `${k}.body`, vars) };
    case 'BOOKING_REMINDER':
      return { title: t(`${k}.title`), body: t(d.start_time ? `${k}.body` : `${k}.bodyNoTime`, vars) };
    default:
      return { title: t(`${k}.title`, vars), body: t(`${k}.body`, vars) };
  }
}

/** Where tapping a notification goes, independent of either client's routes. */
export type NotificationTarget =
  | { to: 'listing'; post_id: number }
  | { to: 'editListing'; post_id: number; field_key: string | null }
  | { to: 'myListings'; post_id: number | null }
  | { to: 'requests' }
  | { to: 'bookings' }
  | { to: 'reviews'; provider_id: string }
  | { to: 'savedSearches'; saved_search_id: string | null }
  | { to: 'chat'; conversation_id: string }
  | { to: 'notifications' };

export function notificationTarget(n: { kind: NotificationKind; data: NotificationData }): NotificationTarget {
  const d = n.data ?? {};
  const post = d.post_id ?? null;
  const asProvider = d.role === 'PROVIDER';
  switch (n.kind) {
    case 'LISTING_SUBMITTED':
    case 'LISTING_APPROVED':
      return post ? { to: 'listing', post_id: post } : { to: 'notifications' };
    case 'LISTING_REJECTED':
      return post ? { to: 'editListing', post_id: post, field_key: d.field_key ?? null } : { to: 'myListings', post_id: null };
    case 'LISTING_EXPIRING':
    case 'LISTING_EXPIRED':
      return { to: 'myListings', post_id: post };
    case 'BOOKING_REQUESTED':
      return { to: 'requests' };
    case 'BOOKING_ACCEPTED':
    case 'BOOKING_DECLINED':
    case 'BOOKING_EXPIRED':
      return { to: 'bookings' };
    case 'BOOKING_CANCELLED':
    case 'BOOKING_REMINDER':
      return asProvider ? { to: 'requests' } : { to: 'bookings' };
    case 'REVIEW_PROMPT':
    case 'REVIEW_CREATED':
    case 'REVIEW_REPLIED':
      return d.provider_id ? { to: 'reviews', provider_id: d.provider_id } : { to: 'notifications' };
    case 'SAVED_SEARCH_MATCH':
      return { to: 'savedSearches', saved_search_id: d.saved_search_id ?? null };
    case 'MESSAGE_CREATED':
      return d.conversation_id ? { to: 'chat', conversation_id: d.conversation_id } : { to: 'notifications' };
  }
}

/** The web route for a target; e-mail links and web push open it. */
export function notificationWebPath(target: NotificationTarget): string {
  switch (target.to) {
    case 'listing': return `/posts/${target.post_id}`;
    case 'editListing': return `/provider/listings/${target.post_id}/edit${target.field_key ? `?field=${encodeURIComponent(target.field_key)}` : ''}`;
    case 'myListings': return '/provider/listings';
    case 'requests': return '/requests';
    case 'bookings': return '/bookings';
    case 'reviews': return `/sellers/${target.provider_id}/reviews`;
    case 'savedSearches': return '/saved/searches';
    case 'chat': return `/messages/${target.conversation_id}`;
    case 'notifications': return '/notifications';
  }
}

