import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  MESSAGES_PAGE, replyTimeKey,
  type Booking, type BookingList, type Conversation, type ConversationOpenResponse, type Message, type MyBookingsTab, type ProviderReviews,
  type PublicUser, type ReceivedBookingsTab, type ReviewSort, type SellerProfile,
} from '@zuuchmap/core';
import { api, errorKey } from './api';
import { useAuthStore } from './auth';
import { useToast } from './toast';

/** A provider shows as its company (or the name the account carries); a customer as "Д. Ганбат". */
export const displayName = (u?: PublicUser | null): string => {
  if (!u) return '';
  if (u.company?.name) return u.company.name;
  if (u.type === 'PROVIDER') return u.parent_name ?? u.given_name ?? '';
  return [u.parent_name, u.given_name].filter(Boolean).join(' ') || (u.phone_number ?? '');
};

/** "Ихэвчлэн 2 цагт хариулдаг" when the reply time is known, else undefined. */
export function useReplyNote(): (minutes?: number | null) => string | undefined {
  const { t } = useTranslation();
  return (minutes) => {
    if (typeof minutes !== 'number') return undefined;
    const { key, count } = replyTimeKey(minutes);
    return t('deal.replyTime', { time: t(key, { count }) });
  };
}

const BOOKINGS_LIMIT = 50;

export function useMyBookings(tab: MyBookingsTab) {
  const token = useAuthStore((s) => s.token);
  return useQuery({ queryKey: ['bookings', 'mine', tab, token], enabled: !!token, queryFn: () => api<BookingList<MyBookingsTab>>('/bookings/mine', { query: { tab, limit: BOOKINGS_LIMIT } }) });
}

export function useReceivedBookings(tab: ReceivedBookingsTab) {
  const token = useAuthStore((s) => s.token);
  return useQuery({ queryKey: ['bookings', 'received', tab, token], enabled: !!token, queryFn: () => api<BookingList<ReceivedBookingsTab>>('/bookings/received', { query: { tab, limit: BOOKINGS_LIMIT } }) });
}

export function useConversations() {
  const token = useAuthStore((s) => s.token);
  return useQuery({ queryKey: ['conversations', token], enabled: !!token, queryFn: () => api<Conversation[]>('/conversations') });
}

export function useConversation(id: string) {
  return useQuery({ queryKey: ['conversation', id], retry: false, queryFn: () => api<Conversation>(`/conversations/${id}`) });
}

interface ThreadCursor { before: string; before_id: string }

/** Messages, newest first; "load older" appends the next page. */
export function useThread(id: string) {
  return useInfiniteQuery({
    queryKey: ['thread', id],
    initialPageParam: undefined as ThreadCursor | undefined,
    queryFn: ({ pageParam }) => api<Message[]>(`/conversations/${id}/messages`, { query: pageParam && { before: pageParam.before, before_id: pageParam.before_id } }),
    getNextPageParam: (last) => {
      const oldest = last[last.length - 1];
      return last.length < MESSAGES_PAGE || !oldest ? undefined : { before: oldest.date_created, before_id: oldest.id };
    },
  });
}

export function useSeller(id: string) {
  return useQuery({ queryKey: ['seller', id], retry: false, queryFn: () => api<SellerProfile>(`/sellers/${id}`) });
}

export const REVIEWS_PAGE = 20;

/** Sent with the token when signed in: `own` and `can_review` are the viewer's. */
export function useProviderReviews(id: string, sort: ReviewSort = 'new') {
  const token = useAuthStore((s) => s.token);
  return useInfiniteQuery({
    queryKey: ['reviews', id, sort, token],
    initialPageParam: 1,
    queryFn: ({ pageParam }) => api<ProviderReviews>(`/reviews/provider/${id}`, { query: { sort, page: pageParam, limit: REVIEWS_PAGE } }),
    getNextPageParam: (last, all) => (all.length * REVIEWS_PAGE < last.total ? all.length + 1 : undefined),
  });
}

/** Opens (or returns) the thread about a listing and goes to it. */
export function useOpenChat() {
  const nav = useNavigate();
  const toast = useToast();
  const { t } = useTranslation();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ postId }: { postId: number; search?: string }) => api<ConversationOpenResponse>('/conversations', { method: 'POST', body: { post_id: postId } }),
    onSuccess: (r, v) => {
      void qc.invalidateQueries({ queryKey: ['conversations'] });
      void nav(`/messages/${r.conversation.id}${v.search ?? ''}`);
    },
    onError: (e) => toast.error(t(errorKey(e))),
  });
}

/** A booking's Чат: its thread when there is one, else open it on the listing. */
export function useBookingChat(): (b: Booking) => void {
  const nav = useNavigate();
  const open = useOpenChat();
  return (b) => {
    if (b.conversation_id) void nav(`/messages/${b.conversation_id}`);
    else if (b.post_id) open.mutate({ postId: b.post_id });
  };
}

/** Every cache a booking or review answer can touch. */
export function useRefreshDeals(): () => void {
  const qc = useQueryClient();
  return () => {
    for (const key of ['bookings', 'availability', 'conversations', 'reviews', 'seller']) void qc.invalidateQueries({ queryKey: [key] });
  };
}
