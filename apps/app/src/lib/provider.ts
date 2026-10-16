import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type {
  BookingValue, CategoryView, ListingPerformanceDetail, MyCompanyResponse, MyListingItem, MyListingStats, MyPerformance, ProviderHome, User,
} from '@zuuchmap/core';
import type { TFunction } from 'i18next';
import { useToast } from '../ui/Toast';
import { api, errorText } from './api';
import { useAuth } from './auth';

/** Everything a listing, booking or block change can make stale on the provider side. */
export const PROVIDER_KEYS = ['provider-home', 'my-listings', 'my-stats', 'my-performance', 'listing-performance', 'booking-value', 'listing', 'browse', 'availability', 'profile', 'badges'] as const;
export const invalidateProvider = (qc: QueryClient): void => {
  for (const k of PROVIDER_KEYS) void qc.invalidateQueries({ queryKey: [k] });
};

const useMine = <T>(key: unknown[], path: string, params?: Record<string, string | number>) => {
  const { token } = useAuth();
  return useQuery({ queryKey: key, queryFn: () => api<T>(path, { params }), enabled: !!token });
};

export const useProviderHome = () => useMine<ProviderHome>(['provider-home'], '/provider/home');
export const useMyListings = () => useMine<MyListingItem[]>(['my-listings'], '/posts/mine');
export const useMyStats = () => useMine<MyListingStats>(['my-stats'], '/posts/mine/stats');
export const useMyPerformance = (days = 7) => useMine<MyPerformance>(['my-performance', days], '/posts/mine/performance', { days });
export const useListingPerformance = (id: number, days = 7) => useMine<ListingPerformanceDetail>(['listing-performance', id, days], `/posts/${id}/performance`, { days });
export const useBookingValue = (month: string) => useMine<BookingValue>(['booking-value', month], '/bookings/value', { month });
export const useMyCompany = () => useMine<MyCompanyResponse>(['my-company'], '/company/mine');

/** Renew / delete with one error toast and every provider list refetched. */
export function useListingAction(kind: 'renew' | 'delete') {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (id: number) => (kind === 'renew' ? api(`/posts/${id}/renew`, { method: 'POST' }) : api(`/posts/${id}`, { method: 'DELETE' })),
    onSettled: () => invalidateProvider(qc),
    onError: (e) => toast.show({ message: errorText(e), kind: 'error' }),
  });
}

// ---- Listing state ----

export type ListingState = 'live' | 'pending' | 'rejected' | 'refused' | 'editing' | 'expired' | 'draft';
export const EXPIRING_DAYS = 3;
const DAY = 86_400_000;

export const daysLeft = (expiresAt: string | null | undefined, now = Date.now()): number | null =>
  expiresAt ? Math.ceil((new Date(expiresAt).getTime() - now) / DAY) : null;

export function listingState(p: MyListingItem, now = Date.now()): ListingState {
  if (p.is_draft) return 'draft';
  if (p.approval_status === 'REJECTED') return 'rejected';
  if (p.approval_status === 'PENDING') return 'pending';
  const lapsed = p.status === 'EXPIRED' || (p.expires_at !== null && new Date(p.expires_at).getTime() <= now);
  if (lapsed) return 'expired';
  if (p.pending_revision) return 'editing';
  if (p.rejection_reason) return 'refused';
  return 'live';
}

export const isExpiring = (p: MyListingItem, now = Date.now()): boolean => {
  const d = daysLeft(p.expires_at, now);
  return listingState(p, now) === 'live' && d !== null && d <= EXPIRING_DAYS;
};

export type ListingFilter = 'all' | 'live' | 'attention' | 'expired' | 'draft';
export function matchesFilter(p: MyListingItem, f: ListingFilter, now = Date.now()): boolean {
  const st = listingState(p, now);
  switch (f) {
    case 'all': return true;
    case 'live': return st === 'live' || st === 'editing' || st === 'refused';
    case 'attention': return st === 'rejected' || st === 'refused' || st === 'pending' || isExpiring(p, now);
    case 'expired': return st === 'expired';
    case 'draft': return st === 'draft';
  }
}

// ---- Labels and numbers ----

/** The label of a select option: `attrs.<camelCase>`, then `attrs.coverage<Camel>` (CITY, PROVINCE), else the code. */
export function optionLabel(t: TFunction, _f: CategoryView['fields'][number], code: string): string {
  const camel = code.toLowerCase().replace(/_([a-z0-9])/g, (_m, c: string) => c.toUpperCase());
  const plain = t(`attrs.${camel}`, { defaultValue: '' }) as string;
  if (plain) return plain;
  return t(`attrs.coverage${camel.charAt(0).toUpperCase()}${camel.slice(1)}`, { defaultValue: code }) as string;
}

/** "+18%" / "-4%"; a window that started from zero shows the plain gain. Null when nothing changed. */
export function changeText(cur: number, prev: number): { text: string; up: boolean } | null {
  if (cur === prev) return null;
  if (prev === 0) return { text: `+${cur}`, up: true };
  const pct = Math.round(((cur - prev) / prev) * 100);
  return { text: `${pct > 0 ? '+' : ''}${pct}%`, up: pct > 0 };
}

/** `YYYY-MM` of a date (the booking-value month key). */
export const month = (d = new Date()): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

/** The signed-in account's own profile (shared cache key with the customer Profile). */
export const useProfile = () => {
  const { token } = useAuth();
  return useQuery({ queryKey: ['profile'], queryFn: () => api<User>('/user/profile'), enabled: !!token, staleTime: 5 * 60_000 });
};
