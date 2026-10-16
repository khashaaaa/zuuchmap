import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import type {
  AvailabilityResponse, BrowseResponse, CategoriesResponse, LandingStats, Listing, ListingListItem, MapResponse, SavedSearch,
} from '@zuuchmap/core';
import { useSyncExternalStore } from 'react';
import { api } from './api';
import { useAuthStore } from './auth';
import { useFormat } from './useFormat';
import { expandRange, type ApiQuery } from './search';

/** Categories and families come in one request; each hook selects its half of the shared cache entry. */
function useCatalog<T>(select: (r: CategoriesResponse) => T) {
  const { locale } = useFormat();
  return useQuery({ queryKey: ['categories', locale], staleTime: 300000, queryFn: () => api<CategoriesResponse>('/categories', { query: { lang: locale } }), select });
}
const pickCategories = (r: CategoriesResponse) => r.categories;
const pickFamilies = (r: CategoriesResponse) => r.families;
export const useCategories = () => useCatalog(pickCategories);
export const useFamilies = () => useCatalog(pickFamilies);

export function useStats() {
  return useQuery({ queryKey: ['stats'], staleTime: 300000, queryFn: () => api<LandingStats>('/posts/stats') });
}

export const PAGE = 20;

/** Paged browse: "show more" appends the next page. */
export function useBrowse(params: ApiQuery) {
  return useInfiniteQuery({
    queryKey: ['browse', params],
    initialPageParam: 1,
    queryFn: ({ pageParam }) => api<BrowseResponse>('/posts', { query: { ...params, page: pageParam, limit: PAGE } }),
    getNextPageParam: (last, all) => (all.length * PAGE < last.total ? all.length + 1 : undefined),
    placeholderData: keepPreviousData,
  });
}

/** One page, for rails and counts. */
export function useBrowseOnce(params: ApiQuery, limit: number, enabled = true) {
  return useQuery({
    queryKey: ['browse-once', params, limit],
    enabled,
    placeholderData: keepPreviousData,
    queryFn: () => api<BrowseResponse>('/posts', { query: { ...params, page: 1, limit } }),
  });
}

export function useMapPins(params: ApiQuery, bbox: string | null, zoom: number) {
  return useQuery({
    queryKey: ['map', params, bbox, zoom],
    enabled: !!bbox,
    placeholderData: keepPreviousData,
    queryFn: () => api<MapResponse>('/posts/map', { query: { ...params, bbox, zoom } }),
  });
}

export function useListing(id: number) {
  const token = useAuthStore((s) => s.token);
  return useQuery({ queryKey: ['listing', id, token], retry: false, queryFn: () => api<Listing>(`/posts/${id}`) });
}

export function useSimilar(id: number) {
  return useQuery({ queryKey: ['similar', id], queryFn: () => api<ListingListItem[]>(`/posts/${id}/similar`, { query: { limit: 6 } }) });
}

export function useAvailability(id: number, enabled = true) {
  return useQuery({ queryKey: ['availability', id], enabled, queryFn: () => api<AvailabilityResponse>(`/posts/${id}/availability`) });
}

export function useSavedSearches() {
  const token = useAuthStore((s) => s.token);
  return useQuery({ queryKey: ['saved-searches', token], enabled: !!token, queryFn: () => api<SavedSearch[]>('/saved-searches') });
}

const subscribe = (cb: () => void) => {
  window.addEventListener('online', cb);
  window.addEventListener('offline', cb);
  return () => {
    window.removeEventListener('online', cb);
    window.removeEventListener('offline', cb);
  };
};
export const useOnline = (): boolean => useSyncExternalStore(subscribe, () => navigator.onLine, () => true);

/** Busy days of a listing as day keys: the availability answer, falling back to the 14-day list. */
export function useBusyDays(listing: Listing, enabled: boolean): string[] {
  const av = useAvailability(listing.id, enabled);
  if (av.data) return av.data.busy.flatMap((b) => expandRange(b.start_date.slice(0, 10), b.end_date.slice(0, 10)));
  return listing.busy_dates ?? [];
}

/** `matchMedia` as state (the desktop list renders grid cards, the phone list renders rows). */
export function useMedia(query: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(query);
      m.addEventListener('change', cb);
      return () => m.removeEventListener('change', cb);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
