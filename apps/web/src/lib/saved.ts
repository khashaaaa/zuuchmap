import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { LikeIdsResponse, LikeResponse, ListingListItem, MergeLikesRequest, Paginated } from '@zuuchmap/core';
import { create } from 'zustand';
import { api, errorKey } from './api';
import { useAuthStore } from './auth';
import { useToast } from './toast';

const KEY = 'zm_saved';

function read(): ListingListItem[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(v) ? (v as ListingListItem[]) : [];
  } catch {
    return [];
  }
}
function write(items: ListingListItem[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    /* storage unavailable */
  }
}

interface GuestState {
  items: ListingListItem[];
  /** The C10 toast shows once per session. */
  told: boolean;
  add: (i: ListingListItem) => void;
  remove: (id: number) => void;
  clear: () => void;
  tell: () => void;
}

/** Guest saves live on the device as full snapshots so the Saved list renders offline. */
export const useGuestSaves = create<GuestState>((set, get) => ({
  items: read(),
  told: false,
  add: (i) => {
    const items = [i, ...get().items.filter((x) => x.id !== i.id)];
    write(items);
    set({ items });
  },
  remove: (id) => {
    const items = get().items.filter((x) => x.id !== id);
    write(items);
    set({ items });
  },
  clear: () => {
    write([]);
    set({ items: [] });
  },
  tell: () => set({ told: true }),
}));

export const likeKeys = { ids: ['likes', 'ids'] as const, list: ['likes', 'list'] as const };

export function useLikeIds() {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: [...likeKeys.ids, token],
    enabled: !!token,
    queryFn: () => api<LikeIdsResponse>('/likes/ids').then((r) => r.ids),
  });
}

export function useLikedList() {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: [...likeKeys.list, token],
    enabled: !!token,
    queryFn: () => api<Paginated<ListingListItem>>('/likes', { query: { page: 1, limit: 100 } }),
  });
}

/** Save/unsave for guests (device) and signed-in users (server), optimistic with rollback. */
export function useSaves() {
  const { t } = useTranslation();
  const toast = useToast();
  const qc = useQueryClient();
  const token = useAuthStore((s) => s.token);
  const guest = useGuestSaves();
  const ids = useLikeIds();

  const set = useMutation({
    mutationFn: ({ item, on }: { item: ListingListItem; on: boolean }) =>
      on ? api<LikeResponse>('/likes', { method: 'POST', body: { post_id: item.id } }) : api<LikeResponse>(`/likes/${item.id}`, { method: 'DELETE' }),
    onMutate: async ({ item, on }) => {
      const key = [...likeKeys.ids, token];
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<number[]>(key);
      qc.setQueryData<number[]>(key, (cur) => (on ? [...new Set([...(cur ?? []), item.id])] : (cur ?? []).filter((x) => x !== item.id)));
      return { prev, key };
    },
    onError: (e, _v, ctx) => {
      if (ctx) qc.setQueryData(ctx.key, ctx.prev);
      toast.error(t(errorKey(e)));
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: likeKeys.list }),
  });

  const isSaved = useCallback(
    (id: number) => (token ? (ids.data ?? []).includes(id) : guest.items.some((x) => x.id === id)),
    [token, ids.data, guest.items],
  );

  const setSaved = useCallback(
    (item: ListingListItem, on: boolean) => {
      if (token) {
        set.mutate({ item, on });
        return;
      }
      if (on) {
        guest.add(item);
        if (!guest.told) {
          guest.tell();
          toast.info(t('customer.detail.savedOnDevice'));
        }
      } else guest.remove(item.id);
    },
    [token, set, guest, toast, t],
  );

  const toggle = useCallback((item: ListingListItem) => setSaved(item, !isSaved(item.id)), [setSaved, isSaved]);
  return { isSaved, toggle, setSaved };
}

/** After sign-in: send the device saves to the account, clear them, refetch the ids. */
export async function mergeGuestSaves(qc: { invalidateQueries: (o: { queryKey: readonly unknown[] }) => Promise<void> | void }): Promise<void> {
  const { items, clear } = useGuestSaves.getState();
  if (items.length) {
    try {
      await api('/likes/merge', { method: 'POST', body: { post_ids: items.map((i) => i.id) } satisfies MergeLikesRequest });
      clear();
    } catch {
      /* keep them on the device; the next sign-in retries */
    }
  }
  await qc.invalidateQueries({ queryKey: ['likes'] });
}
