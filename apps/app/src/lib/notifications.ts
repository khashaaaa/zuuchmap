import { useCallback } from 'react';
import { useNavigation } from '@react-navigation/native';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData, type QueryClient } from '@tanstack/react-query';
import {
  NOTIFICATIONS_PAGE, notificationTarget, type AppNotification, type NotificationKind, type NotificationSettings, type NotificationSettingsUpdate,
  type Badges, type NotificationTarget, type PlanUsage,
} from '@zuuchmap/core';
import { useTranslation } from 'react-i18next';
import { useToast } from '../ui/Toast';
import type { HeaderAction } from '../ui/AppHeader';
import type { NotificationType } from '../ui/NotificationRow';
import type { Nav } from '../nav';
import { api, errorText } from './api';
import { getAuth, useAuth } from './auth';

type Pages = InfiniteData<AppNotification[], unknown>;

export const NOTIFICATION_KEYS = ['notifications', 'badges', 'notif-settings'] as const;

// ---- The centre ----

/** Newest first; each page is keyed by the oldest row before it. */
export const useNotifications = () => {
  const { token } = useAuth();
  return useInfiniteQuery({
    queryKey: ['notifications'],
    enabled: !!token,
    queryFn: ({ pageParam }) => api<AppNotification[]>('/notifications', { params: pageParam ? { before: pageParam.before, before_id: pageParam.before_id } : undefined }),
    initialPageParam: null as { before: string; before_id: string } | null,
    getNextPageParam: (last) => {
      const oldest = last[last.length - 1];
      return last.length >= NOTIFICATIONS_PAGE && oldest ? { before: oldest.created_at, before_id: oldest.id } : undefined;
    },
  });
};

export const flattenNotifications = (pages: AppNotification[][] | undefined): AppNotification[] => {
  const seen = new Set<string>();
  const out: AppNotification[] = [];
  for (const p of pages ?? []) for (const n of p) if (!seen.has(n.id)) { seen.add(n.id); out.push(n); }
  return out;
};

/** The shell's counts (bell, Чат, a provider's quota) in one request; each hook selects its part of the shared entry. */
const useBadges = <T,>(select: (b: Badges) => T) => {
  const { token } = useAuth();
  return useQuery({ queryKey: ['badges', token], queryFn: () => api<Badges>('/notifications/badges'), enabled: !!token, select });
};
const pickNotifications = (b: Badges): number => b.notifications;
const pickChat = (b: Badges): number => b.chat;
const pickPlan = (b: Badges): PlanUsage | null => b.plan;
export const useNotifUnread = () => useBadges(pickNotifications);
/** The Чат tab badge. */
export const useUnreadCount = () => useBadges(pickChat);
/** A provider's quota for the + tab; null for a customer. */
export const usePlanUsage = () => useBadges(pickPlan);

/** A row from the socket goes on the front of the first page; one that arrives again (saved-search count) replaces its old place. */
export function upsertNotification(qc: QueryClient, n: AppNotification): void {
  qc.setQueryData<Pages>(['notifications'], (old) => {
    if (!old) return old;
    const pages = old.pages.map((p) => p.filter((x) => x.id !== n.id));
    return { ...old, pages: [[n, ...(pages[0] ?? [])], ...pages.slice(1)] };
  });
  void qc.invalidateQueries({ queryKey: ['badges'] });
}

/** Mark the given ids (or every unread row) read; the cache is patched at once and the count refetched. */
export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids?: string[]) => api('/notifications/read', { method: 'PUT', body: ids ? { ids } : {} }),
    onMutate: (ids) => {
      const at = new Date().toISOString();
      qc.setQueryData<Pages>(['notifications'], (old) =>
        old ? { ...old, pages: old.pages.map((p) => p.map((n) => (!n.read_at && (!ids || ids.includes(n.id)) ? { ...n, read_at: at } : n))) } : old,
      );
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['badges'] });
    },
  });
}

/** Bell for a header: the centre, with the unread count. */
export function useBell(): HeaderAction {
  const { t } = useTranslation();
  const nav = useNavigation<Nav>();
  const unread = useNotifUnread().data ?? 0;
  return { icon: 'bell', label: t('notif.title'), badge: unread, onPress: () => nav.navigate('Notifications') };
}

// ---- Settings ----

export const useNotifSettings = () => {
  const { token } = useAuth();
  return useQuery({ queryKey: ['notif-settings'], queryFn: () => api<NotificationSettings>('/notifications/settings'), enabled: !!token });
};

/** A switch flips at once and rolls back with a toast if the engine refuses. */
export function useUpdateNotifSettings() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (body: NotificationSettingsUpdate) => api<NotificationSettings>('/notifications/settings', { method: 'PUT', body }),
    onMutate: async (body) => {
      await qc.cancelQueries({ queryKey: ['notif-settings'] });
      const prev = qc.getQueryData<NotificationSettings>(['notif-settings']);
      if (prev) qc.setQueryData<NotificationSettings>(['notif-settings'], { ...prev, topics: { ...prev.topics, ...body.topics } });
      return { prev };
    },
    onError: (e, _body, ctx) => {
      if (ctx?.prev) qc.setQueryData(['notif-settings'], ctx.prev);
      toast.show({ message: errorText(e), kind: 'error' });
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['notif-settings'] });
    },
  });
}

// ---- Presentation and navigation ----

const ROW_TYPE: Record<NotificationKind, NotificationType> = {
  LISTING_SUBMITTED: 'approved', LISTING_APPROVED: 'approved', LISTING_REJECTED: 'rejected', LISTING_EXPIRING: 'expiring', LISTING_EXPIRED: 'expiring',
  BOOKING_REQUESTED: 'booking', BOOKING_ACCEPTED: 'booking', BOOKING_DECLINED: 'booking', BOOKING_CANCELLED: 'booking', BOOKING_EXPIRED: 'expiring', BOOKING_REMINDER: 'booking',
  REVIEW_PROMPT: 'review', REVIEW_CREATED: 'review', REVIEW_REPLIED: 'review', SAVED_SEARCH_MATCH: 'savedSearch', MESSAGE_CREATED: 'message',
  PAYMENT_PAID: 'approved', REPORT_RESOLVED: 'report', BROADCAST: 'message',
};
export const rowType = (kind: NotificationKind): NotificationType => ROW_TYPE[kind] ?? 'booking';

type Navigator = Pick<Nav, 'navigate'>;

/** Where a notification (a centre row or a tapped push) goes. */
export function openTarget(nav: Navigator, target: NotificationTarget): void {
  const provider = getAuth().user?.type === 'PROVIDER';
  switch (target.to) {
    case 'listing': nav.navigate('ListingDetail', { id: target.post_id }); return;
    // G1: the phase-6 wizard opens on the refused field for a rejected listing.
    case 'editListing': nav.navigate('Wizard', { edit: target.post_id }); return;
    case 'myListings':
      if (provider) nav.navigate('Tabs', { screen: 'myPosts', params: target.post_id ? { renew: target.post_id } : undefined });
      else nav.navigate('Notifications');
      return;
    case 'requests': nav.navigate(provider ? 'BookingRequests' : 'MyBookings'); return;
    case 'bookings': nav.navigate('MyBookings'); return;
    case 'reviews': nav.navigate('Reviews', { id: target.provider_id, name: '' }); return;
    case 'savedSearches':
      if (provider) nav.navigate('Notifications');
      else nav.navigate('Tabs', { screen: 'saved', params: { seg: 'searches' } });
      return;
    case 'chat': nav.navigate('Thread', { id: target.conversation_id }); return;
    case 'payments': nav.navigate(provider ? 'Billing' : 'Notifications'); return;
    case 'notifications': nav.navigate('Notifications'); return;
  }
}

/** Tap on a centre row: read it, then go. */
export function useOpenNotification() {
  const nav = useNavigation<Nav>();
  const mark = useMarkRead();
  return useCallback(
    (n: AppNotification) => {
      if (!n.read_at) mark.mutate([n.id]);
      openTarget(nav, notificationTarget(n));
    },
    [nav, mark],
  );
}

/** The Thread screen reports which thread is open, so a message for it is not announced twice. */
let openThread: string | null = null;
export const setOpenThread = (id: string | null): void => {
  openThread = id;
};
export const isThreadOpen = (id: string): boolean => openThread === id;
