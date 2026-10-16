import { useCallback, useMemo } from 'react';
import {
  keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient, type QueryClient,
} from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type {
  AvailabilityResponse, BrowseResponse, CategoriesResponse, LandingStats, LikeIdsResponse, LikeResponse, Listing,
  ListingListItem, MapResponse, Paginated, SavedSearch, SavedSearchWriteRequest,
} from '@zuuchmap/core';
import { useToast } from '../ui/Toast';
import { useLocale } from '../ui/useLocale';
import { api, errorText } from './api';
import { useAuth } from './auth';
import { browseParams, type BrowseState } from './browse';
import { guestSaved, useGuestSaved } from './saved';

const PAGE = 20;

/** Categories and families come in one request; each hook selects its half of the shared cache entry. */
const useCatalog = <T,>(select: (r: CategoriesResponse) => T) => {
  const lang = useLocale();
  return useQuery({ queryKey: ['categories', lang], queryFn: () => api<CategoriesResponse>('/categories', { params: { lang } }), staleTime: 10 * 60_000, select });
};
const pickCategories = (r: CategoriesResponse) => [...r.categories].sort((a, b) => a.sort_order - b.sort_order);
const pickFamilies = (r: CategoriesResponse) => r.families;
export const useCategories = () => useCatalog(pickCategories);
export const useFamilies = () => useCatalog(pickFamilies);

export const useStats = () => useQuery({ queryKey: ['stats'], queryFn: () => api<LandingStats>('/posts/stats'), staleTime: 5 * 60_000 });

type Coords = { lat: number; lng: number } | null;
const withCoords = (p: Record<string, string | number | undefined>, c: Coords) => (c ? { ...p, lat: c.lat, lng: c.lng } : p);

/** The A1 list: pages of 20, the previous result stays on screen while a new search loads. */
export const useBrowseList = (s: BrowseState, coords: Coords, enabled = true) => {
  const params = withCoords(browseParams(s), coords);
  return useInfiniteQuery({
    queryKey: ['browse', params],
    queryFn: ({ pageParam }) => api<BrowseResponse>('/posts', { params: { ...params, page: pageParam, limit: PAGE } }),
    initialPageParam: 1,
    getNextPageParam: (last, all) => (all.reduce((n, p) => n + p.items.length, 0) < last.total && last.items.length > 0 ? all.length + 1 : undefined),
    placeholderData: keepPreviousData,
    enabled,
  });
};

/** Live count for a sheet footer: the same query with limit=1 and the draft state. */
export const useBrowseCount = (s: BrowseState, enabled: boolean) => {
  const params = browseParams(s);
  return useQuery({
    queryKey: ['browse-count', params],
    queryFn: () => api<BrowseResponse>('/posts', { params: { ...params, limit: 1 } }),
    enabled,
    placeholderData: keepPreviousData,
    select: (r) => r.total,
  });
};

export const useSosList = (coords: Coords, province: string | undefined, subcategory: string | undefined) => {
  const params = { category: 'sos', province, subcategory, sort: coords ? 'nearby' : undefined, ...(coords ?? {}), limit: 50 };
  return useQuery({ queryKey: ['sos', params], queryFn: () => api<BrowseResponse>('/posts', { params }), placeholderData: keepPreviousData });
};

export const useMapData = (s: BrowseState, box: { w: number; s: number; e: number; n: number } | null, zoom: number) => {
  const params = { ...browseParams(s), bbox: box ? [box.w, box.s, box.e, box.n].map((v) => v.toFixed(4)).join(',') : undefined, zoom: Math.round(zoom) };
  return useQuery({
    queryKey: ['map', params],
    queryFn: () => api<MapResponse>('/posts/map', { params }),
    enabled: !!box,
    placeholderData: keepPreviousData,
  });
};

export const useListing = (id: number) => useQuery({ queryKey: ['listing', id], queryFn: () => api<Listing>(`/posts/${id}`), retry: false });
export const useSimilar = (id: number, enabled: boolean) =>
  useQuery({ queryKey: ['similar', id], queryFn: () => api<ListingListItem[]>(`/posts/${id}/similar`, { params: { limit: 6 } }), enabled });
export const useAvailability = (id: number, enabled: boolean) =>
  useQuery({ queryKey: ['availability', id], queryFn: () => api<AvailabilityResponse>(`/posts/${id}/availability`), enabled });

// ---- Saves (likes): guests on the device, signed-in on the engine ----

export const useLikedIds = () => {
  const { token } = useAuth();
  return useQuery({ queryKey: ['like-ids', !!token], queryFn: () => api<LikeIdsResponse>('/likes/ids'), enabled: !!token, staleTime: 60_000 });
};

export const useSavedListings = () => {
  const { token } = useAuth();
  return useQuery({ queryKey: ['likes'], queryFn: () => api<Paginated<ListingListItem>>('/likes', { params: { limit: 100 } }), enabled: !!token });
};

let toldGuest = false;

/** Optimistic save/unsave with rollback and an error toast; the C10 toast once per session for a guest. */
export function useSaves() {
  const { token } = useAuth();
  const guest = useGuestSaved();
  const liked = useLikedIds();
  const qc = useQueryClient();
  const toast = useToast();
  const { t } = useTranslation();

  const set = useMemo(() => new Set(token ? (liked.data?.ids ?? []) : guest.map((i) => i.id)), [token, liked.data, guest]);
  const isSaved = useCallback((id: number) => set.has(id), [set]);

  const toggle = useCallback(
    async (item: ListingListItem) => {
      const was = set.has(item.id);
      if (!token) {
        if (was) guestSaved.remove(item.id);
        else {
          guestSaved.add(item);
          if (!toldGuest) {
            toldGuest = true;
            toast.show({ message: t('customer.detail.savedOnDevice'), kind: 'info' });
          }
        }
        return;
      }
      const key = ['like-ids', true];
      const prev = qc.getQueryData<LikeIdsResponse>(key);
      const prevList = qc.getQueryData<Paginated<ListingListItem>>(['likes']);
      qc.setQueryData<LikeIdsResponse>(key, { ids: was ? (prev?.ids ?? []).filter((i) => i !== item.id) : [item.id, ...(prev?.ids ?? [])] });
      if (was && prevList) qc.setQueryData<Paginated<ListingListItem>>(['likes'], { ...prevList, items: prevList.items.filter((i) => i.id !== item.id), total: prevList.total - 1 });
      try {
        if (was) await api<LikeResponse>(`/likes/${item.id}`, { method: 'DELETE' });
        else await api<LikeResponse>('/likes', { method: 'POST', body: { post_id: item.id } });
        void qc.invalidateQueries({ queryKey: ['likes'] });
      } catch (e) {
        qc.setQueryData(key, prev);
        if (prevList) qc.setQueryData(['likes'], prevList);
        toast.show({ message: errorText(e), kind: 'error' });
      }
    },
    [set, token, qc, toast, t],
  );
  return { isSaved, toggle };
}

/** After sign-in: send the device saves, clear them, refetch what the engine holds. */
export async function mergeGuestSaves(qc: QueryClient): Promise<void> {
  const ids = guestSaved.list().map((i) => i.id);
  if (ids.length) {
    try {
      await api('/likes/merge', { method: 'POST', body: { post_ids: ids } });
      guestSaved.clear();
    } catch {
      /* keep them on the device; the next sign-in retries */
    }
  }
  await qc.invalidateQueries({ queryKey: ['like-ids'] });
  await qc.invalidateQueries({ queryKey: ['likes'] });
  await qc.invalidateQueries({ queryKey: ['listing'] });
}

// ---- Saved searches ----

export const useSavedSearches = () => {
  const { token } = useAuth();
  return useQuery({ queryKey: ['saved-searches'], queryFn: () => api<SavedSearch[]>('/saved-searches'), enabled: !!token });
};

export const useSaveSearch = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: SavedSearchWriteRequest) => api<SavedSearch>('/saved-searches', { method: 'POST', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['saved-searches'] }),
  });
};

export const useDeleteSearch = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/saved-searches/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['saved-searches'] }),
  });
};

export const markSearchSeen = (id: string, qc: QueryClient) =>
  api(`/saved-searches/${id}/seen`, { method: 'POST' }).then(() => qc.invalidateQueries({ queryKey: ['saved-searches'] })).catch(() => undefined);
