import { useCallback } from 'react';
import { useNavigation } from '@react-navigation/native';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  MESSAGES_PAGE, replyTimeKey, type Booking, type BookingList, type Conversation, type ConversationOpenResponse, type Message, type MessageKind,
  type MyBookingsTab, type ProviderReviews, type PublicUser, type ReceivedBookingsTab, type ReviewSort, type SellerProfile,
} from '@zuuchmap/core';
import type { TFunction } from 'i18next';
import { useToast } from '../ui/Toast';
import type { Nav } from '../nav';
import { api, errorText } from './api';
import { useAuth } from './auth';

export { displayName } from '@zuuchmap/core';

/** "Үйлчлэх бүс: Улаанбаатар, Төв" for a company with a service area; undefined otherwise. */
export function serviceAreaText(t: TFunction, user: Pick<PublicUser, 'company'> | null | undefined): string | undefined {
  const area = user?.company?.service_area ?? [];
  if (area.length === 0) return undefined;
  return t('deal.seller.area', { areas: area.map((p) => t(`province.${p}`, { defaultValue: p })).join(', ') });
}

/** "Ихэвчлэн 2 цагт хариулдаг", only when the engine has a reply time. */
export function replyText(t: TFunction, minutes: number | null | undefined): string | undefined {
  if (typeof minutes !== 'number') return undefined;
  const { key, count } = replyTimeKey(minutes);
  return t('deal.replyTime', { time: t(key, { count }) });
}

/** What a thread row or a system line says for a message: booking steps are worded here, never stored. */
export const messageText = (t: TFunction, kind: MessageKind | null, body: string | null): string =>
  kind && kind !== 'TEXT' ? t(`deal.chat.step.${kind}`) : (body ?? '');

/** Everything a booking or thread change can make stale. */
export const DEAL_KEYS = ['bookings', 'conversations', 'messages', 'badges', 'availability', 'listing', 'browse', 'seller', 'reviews'] as const;

// ---- Bookings ----

export const useMyBookings = (tab: MyBookingsTab) => {
  const { token } = useAuth();
  return useQuery({ queryKey: ['bookings', 'mine', tab], queryFn: () => api<BookingList<MyBookingsTab>>('/bookings/mine', { params: { tab, limit: 50 } }), enabled: !!token });
};

export const useReceivedBookings = (tab: ReceivedBookingsTab) => {
  const { token } = useAuth();
  return useQuery({ queryKey: ['bookings', 'received', tab], queryFn: () => api<BookingList<ReceivedBookingsTab>>('/bookings/received', { params: { tab, limit: 50 } }), enabled: !!token });
};

export type BookingAction = 'accept' | 'decline' | 'cancel';

/** One conditional answer; every list, thread and calendar it touches is refetched. */
export function useBookingAction() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: ({ id, action, response_message }: { id: number; action: BookingAction; response_message?: string }) =>
      api<Booking>(`/bookings/${id}/${action}`, { method: 'PUT', body: action === 'cancel' ? undefined : { response_message: response_message?.trim() || undefined } }),
    onSettled: () => {
      for (const k of DEAL_KEYS) void qc.invalidateQueries({ queryKey: [k] });
    },
    onError: (e) => toast.show({ message: errorText(e), kind: 'error' }),
  });
}

// ---- Чат ----

export const useInbox = () => {
  const { token } = useAuth();
  return useQuery({ queryKey: ['conversations'], queryFn: () => api<Conversation[]>('/conversations'), enabled: !!token });
};

export const useConversation = (id: string, initial?: Conversation) =>
  useQuery({ queryKey: ['conversation', id], queryFn: () => api<Conversation>(`/conversations/${id}`), initialData: initial, staleTime: 30_000 });

/** Newest first; each page is keyed by the oldest message before it. */
export const useMessages = (id: string) =>
  useInfiniteQuery({
    queryKey: ['messages', id],
    queryFn: ({ pageParam }) => api<Message[]>(`/conversations/${id}/messages`, { params: pageParam ? { before: pageParam.before, before_id: pageParam.before_id } : undefined }),
    initialPageParam: null as { before: string; before_id: string } | null,
    getNextPageParam: (last) => {
      const oldest = last[last.length - 1];
      return last.length >= MESSAGES_PAGE && oldest ? { before: oldest.date_created, before_id: oldest.id } : undefined;
    },
  });

export const flattenMessages = (pages: Message[][] | undefined): Message[] => {
  const seen = new Set<string>();
  const out: Message[] = [];
  for (const p of pages ?? []) for (const m of p) if (!seen.has(m.id)) { seen.add(m.id); out.push(m); }
  return out;
};

/** Opens (or returns) the thread about a listing and navigates to it. */
export function useOpenChat() {
  const nav = useNavigation<Nav>();
  const toast = useToast();
  const qc = useQueryClient();
  return useCallback(
    async (postId: number, onUnauthorized?: () => void) => {
      try {
        const res = await api<ConversationOpenResponse>('/conversations', { method: 'POST', body: { post_id: postId } });
        qc.setQueryData(['conversation', res.conversation.id], res.conversation);
        nav.navigate('Thread', { id: res.conversation.id, conversation: res.conversation });
      } catch (e) {
        if (onUnauthorized && (e as { status?: number }).status === 401) onUnauthorized();
        else toast.show({ message: errorText(e), kind: 'error' });
      }
    },
    [nav, toast, qc],
  );
}

// ---- Reviews and the seller page ----

export const useSeller = (id: string) => useQuery({ queryKey: ['seller', id], queryFn: () => api<SellerProfile>(`/sellers/${id}`) });

export const useProviderReviews = (id: string, sort: ReviewSort, limit = 20) => {
  const { token } = useAuth();
  // Own review and can_review depend on who is asking.
  return useQuery({ queryKey: ['reviews', id, sort, limit, !!token], queryFn: () => api<ProviderReviews>(`/reviews/provider/${id}`, { params: { sort, limit } }) });
};
