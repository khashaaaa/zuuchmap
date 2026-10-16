import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  NOTIFICATIONS_PAGE, notificationCopy, notificationTarget, notificationWebPath,
  type AppNotification, type Badges, type NotificationSettings, type NotificationSettingsUpdate, type NotificationTarget, type NotificationTopic,
} from '@zuuchmap/core';
import type { NotificationType } from '@/ui/NotificationRow';
import { api, errorKey } from './api';
import { useAuthStore } from './auth';
import { useToast } from './toast';

interface Cursor { before: string; before_id: string }
type Pages = InfiniteData<AppNotification[], Cursor | undefined>;

/** Newest first, 30 a page, by (`created_at`, `id`). `enabled` false (a closed panel) fetches nothing. */
export function useNotifications(enabled = true) {
  const token = useAuthStore((s) => s.token);
  return useInfiniteQuery({
    queryKey: ['notifications', 'list', token],
    enabled: !!token && enabled,
    initialPageParam: undefined as Cursor | undefined,
    queryFn: ({ pageParam }) => api<AppNotification[]>('/notifications', { query: pageParam && { before: pageParam.before, before_id: pageParam.before_id } }),
    getNextPageParam: (last) => {
      const oldest = last[last.length - 1];
      return last.length < NOTIFICATIONS_PAGE || !oldest ? undefined : { before: oldest.created_at, before_id: oldest.id };
    },
  });
}

/** The shell's counts (bell, Чат, a provider's quota), one request for every screen. */
export function useBadges(): Badges | undefined {
  const token = useAuthStore((s) => s.token);
  return useQuery({ queryKey: ['badges', token], enabled: !!token, queryFn: () => api<Badges>('/notifications/badges') }).data;
}
/** The bell's number. */
export const useNotificationUnread = (): number => useBadges()?.notifications ?? 0;
/** The Чат tab badge. */
export const useUnread = (): number => useBadges()?.chat ?? 0;

/** A saved-search row arrives again with a higher count: it replaces itself by id and moves to the top. */
export function upsertNotification<P>(pages: InfiniteData<AppNotification[], P> | undefined, n: AppNotification): InfiniteData<AppNotification[], P> | undefined {
  if (!pages) return pages;
  const clean = pages.pages.map((p) => p.filter((x) => x.id !== n.id));
  return { ...pages, pages: [[n, ...(clean[0] ?? [])], ...clean.slice(1)] };
}

function markIn(pages: Pages | undefined, ids: string[] | null, at: string): Pages | undefined {
  return pages && { ...pages, pages: pages.pages.map((p) => p.map((n) => (!n.read_at && (!ids || ids.includes(n.id)) ? { ...n, read_at: at } : n))) };
}

/** Marks the given rows (or every unread one) read, optimistically; the server's count settles it. */
export function useMarkRead() {
  const qc = useQueryClient();
  const token = useAuthStore((s) => s.token);
  return useMutation({
    mutationFn: (ids: string[] | null) => (ids?.length === 1 ? api<void>(`/notifications/${ids[0]}/read`, { method: 'PUT' }) : api<void>('/notifications/read', { method: 'PUT', body: ids ? { ids } : {} })),
    onMutate: (ids) => {
      const at = new Date().toISOString();
      qc.setQueryData<Pages>(['notifications', 'list', token], (d) => markIn(d, ids, at));
      qc.setQueryData<Badges>(['badges', token], (d) => {
        if (!d) return d;
        const list = qc.getQueryData<Pages>(['notifications', 'list', token]);
        if (!ids || !list) return ids ? d : { ...d, notifications: 0 };
        return { ...d, notifications: Math.max(0, d.notifications - ids.filter((id) => list.pages.some((p) => p.some((n) => n.id === id && !n.read_at))).length) };
      });
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['notifications'] });
      void qc.invalidateQueries({ queryKey: ['badges'] });
    },
  });
}

/** Where a notification goes on the web. The fix flow and the renew sheet are opened with a query the pages read. */
function notificationHref(target: NotificationTarget): string {
  if (target.to === 'editListing') return `/provider/listings/${target.post_id}/edit?fix=1${target.field_key ? `&field=${encodeURIComponent(target.field_key)}` : ''}`;
  if (target.to === 'myListings' && target.post_id) return `/provider/listings?renew=${target.post_id}`;
  return notificationWebPath(target);
}

/** Tap on a centre row: mark it read, then go to its target. */
export function useOpenNotification(): (n: AppNotification, after?: () => void) => void {
  const nav = useNavigate();
  const mark = useMarkRead();
  return (n, after) => {
    if (!n.read_at) mark.mutate([n.id]);
    after?.();
    void nav(notificationHref(notificationTarget(n)));
  };
}

/** The row's one sentence. */
export function useNotificationText(): (n: AppNotification) => string {
  const { t } = useTranslation();
  return (n) => notificationCopy(n, t as unknown as (key: string, options?: Record<string, unknown>) => string).body;
}

/** Row icon and tint per kind. */
export const notificationLook = (kind: AppNotification['kind']): NotificationType => {
  switch (kind) {
    case 'LISTING_APPROVED': return 'approved';
    case 'LISTING_REJECTED':
    case 'BOOKING_DECLINED':
    case 'BOOKING_CANCELLED': return 'rejected';
    case 'LISTING_SUBMITTED':
    case 'LISTING_EXPIRING':
    case 'LISTING_EXPIRED':
    case 'BOOKING_EXPIRED': return 'expiring';
    case 'BOOKING_REQUESTED':
    case 'BOOKING_ACCEPTED':
    case 'BOOKING_REMINDER': return 'booking';
    case 'REVIEW_PROMPT':
    case 'REVIEW_CREATED':
    case 'REVIEW_REPLIED': return 'review';
    case 'SAVED_SEARCH_MATCH': return 'savedSearch';
    case 'MESSAGE_CREATED':
    case 'BROADCAST': return 'message';
    case 'PAYMENT_PAID': return 'approved';
    case 'REPORT_RESOLVED': return 'report';
  }
};

export function useNotificationSettings() {
  const token = useAuthStore((s) => s.token);
  return useQuery({ queryKey: ['notification-settings', token], enabled: !!token, queryFn: () => api<NotificationSettings>('/notifications/settings') });
}

/** Flips one topic at once; a failed save rolls it back and says so. */
export function useSetTopic() {
  const qc = useQueryClient();
  const toast = useToast();
  const { t } = useTranslation();
  const token = useAuthStore((s) => s.token);
  const key = ['notification-settings', token];
  return useMutation({
    mutationFn: ({ topic, on }: { topic: NotificationTopic; on: boolean }) => {
      const body: NotificationSettingsUpdate = { topics: { [topic]: on } };
      return api<NotificationSettings>('/notifications/settings', { method: 'PUT', body });
    },
    onMutate: async ({ topic, on }) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<NotificationSettings>(key);
      qc.setQueryData<NotificationSettings>(key, (d) => d && { ...d, topics: { ...d.topics, [topic]: on } });
      return { prev };
    },
    onError: (e, _v, ctx) => {
      qc.setQueryData(key, ctx?.prev);
      toast.error(t(errorKey(e)));
    },
    onSuccess: (s) => qc.setQueryData(key, s),
  });
}
