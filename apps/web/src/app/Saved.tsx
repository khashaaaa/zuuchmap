import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { SAVED_SEARCH_LIMIT, formatDate, isListingLive, type ListingListItem, type SavedSearch } from '@zuuchmap/core';
import { api, errorKey } from '@/lib/api';
import { useAuthStore, useSignInSheet } from '@/lib/auth';
import { useCategoryLookup, usePlace } from '@/lib/labels';
import { useDocTitle } from '@/lib/meta';
import { useOnline, useSavedSearches } from '@/lib/queries';
import { useGuestSaves, useLikedList, useSaves } from '@/lib/saved';
import { savedToSearch, searchHref } from '@/lib/search';
import { useToast } from '@/lib/toast';
import { useFormat } from '@/lib/useFormat';
import { AppHeader } from '@/ui/AppHeader';
import { Banner } from '@/ui/Banner';
import { CountBadge } from '@/ui/CountBadge';
import { EmptyState } from '@/ui/EmptyState';
import { IconButton } from '@/ui/IconButton';
import { Modal } from '@/ui/Modal';
import { SegmentedControl } from '@/ui/SegmentedControl';
import { SkeletonListingRow } from '@/ui/SkeletonListingRow';
import { ListingRow } from './ListingRow';

function Listings() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const toast = useToast();
  const token = useAuthStore((s) => s.token);
  const guest = useGuestSaves((s) => s.items);
  const liked = useLikedList();
  const saves = useSaves();
  const online = useOnline();
  const items: ListingListItem[] = token ? (liked.data?.items ?? []) : guest;

  if (token && liked.isPending) return <div className="flex flex-col gap-3">{Array.from({ length: 3 }, (_, i) => <SkeletonListingRow key={i} />)}</div>;
  if (token && liked.isError) return <EmptyState icon={online ? 'refresh-cw' : 'wifi-off'} title={t('customer.browse.loadFailed')} body={t('customer.browse.loadFailedBody')} action={{ label: t('common.retry'), onClick: () => void liked.refetch() }} />;
  if (items.length === 0) return <EmptyState icon="bookmark" title={t('posts.noSaved')} action={{ label: t('posts.browse'), onClick: () => void nav('/browse') }} />;

  const remove = (it: ListingListItem) => {
    saves.setSaved(it, false);
    toast.success(t('customer.saved.removed'), { label: t('customer.saved.undo'), onClick: () => saves.setSaved(it, true) });
  };
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
      {items.map((it) => {
        const live = isListingLive(it);
        return (
          <div key={it.id} className={live ? undefined : 'opacity-60'}>
            <ListingRow item={it} onToggle={remove} />
            {!live && <p className="px-1 pt-1 text-caption text-text-secondary">{t('customer.saved.unavailable')}</p>}
          </div>
        );
      })}
    </div>
  );
}

function summary(s: SavedSearch, place: (p?: string | null, d?: string | null) => string, cat: (k: string) => string | undefined): string {
  const p = s.params;
  const attrs = Object.entries(p.attrs ?? {}).map(([k, v]) => (v === 'true' ? k : `${k}: ${v}`));
  return [p.q, p.category ? cat(p.category) : undefined, place(p.province, p.district), ...attrs].filter(Boolean).join(' · ');
}

function Searches() {
  const { t } = useTranslation();
  const f = useFormat();
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const token = useAuthStore((s) => s.token);
  const place = usePlace();
  const cats = useCategoryLookup();
  const list = useSavedSearches();
  const [del, setDel] = useState<SavedSearch | null>(null);
  const remove = useMutation({
    mutationFn: (id: string) => api(`/saved-searches/${id}`, { method: 'DELETE' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['saved-searches'] }),
    onError: (e) => toast.error(t(errorKey(e))),
  });

  if (!token) {
    return <EmptyState icon="search" title={t('savedSearch.empty')} body={t('customer.signin.sheetSearch')} action={{ label: t('auth.title'), onClick: () => useSignInSheet.getState().show('search') }} />;
  }
  if (list.isPending) return <div className="flex flex-col gap-3">{Array.from({ length: 3 }, (_, i) => <SkeletonListingRow key={i} />)}</div>;
  if (list.isError) return <EmptyState icon="refresh-cw" title={t('customer.browse.loadFailed')} action={{ label: t('common.retry'), onClick: () => void list.refetch() }} />;
  const rows = list.data;
  if (rows.length === 0) return <EmptyState icon="search" title={t('savedSearch.empty')} body={t('savedSearch.emptyHint')} action={{ label: t('posts.browse'), onClick: () => void nav('/browse') }} />;

  const open = (s: SavedSearch) => {
    void api(`/saved-searches/${s.id}/seen`, { method: 'POST' }).then(() => qc.invalidateQueries({ queryKey: ['saved-searches'] })).catch(() => undefined);
    void nav(searchHref(savedToSearch(s.params)));
  };
  return (
    <div className="flex flex-col gap-3">
      <p className="text-caption text-text-secondary">{t('customer.saved.searchCount', { count: rows.length, limit: SAVED_SEARCH_LIMIT })}</p>
      {rows.length >= SAVED_SEARCH_LIMIT && <Banner tone="warning" title={t('savedSearch.limit')} />}
      <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {rows.map((s) => (
          <li key={s.id} className="flex items-center gap-1 rounded-xl border border-border-elevation bg-bg-surface p-3 pl-4 shadow-sm">
            <button type="button" onClick={() => open(s)} className="flex min-w-0 flex-1 flex-col gap-1 py-1 text-left focus-visible:outline-none focus-visible:shadow-focus">
              <span className="flex items-center gap-2">
                <span className="truncate text-title text-text-primary">{s.name}</span>
                {s.new_count > 0 && <span className="inline-flex h-6 shrink-0 items-center rounded-pill bg-action-primary px-2 text-overline text-action-on-primary">{t('customer.saved.newCount', { count: s.new_count })}</span>}
              </span>
              <span className="truncate text-caption text-text-secondary">{[summary(s, place, (k) => cats.byKey.get(k)?.label), s.notify ? t('customer.saved.notifyOn') : t('customer.saved.notifyOff')].filter(Boolean).join(' · ')}</span>
              {s.last_notified_at && <span className="text-small text-text-secondary">{t('savedSearch.lastAlert')}: {formatDate(s.last_notified_at, f.locale)}</span>}
            </button>
            <IconButton icon="trash-2" label={t('common.delete')} variant="ghost" onClick={() => setDel(s)} />
          </li>
        ))}
      </ul>
      <Modal
        open={!!del}
        onClose={() => setDel(null)}
        tone="danger"
        destructive
        title={t('savedSearch.deleteTitle')}
        body={t('savedSearch.deleteMessage')}
        confirmLabel={t('common.delete')}
        onConfirm={() => {
          if (del) remove.mutate(del.id);
          setDel(null);
        }}
      />
    </div>
  );
}

/** C5 (`/saved`) and C8 (`/saved/searches`). */
export default function Saved() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const loc = useLocation();
  const token = useAuthStore((s) => s.token);
  const guest = useGuestSaves((s) => s.items);
  const liked = useLikedList();
  const searches = useSavedSearches();
  useDocTitle(t('customer.saved.title'));
  const tab = loc.pathname.startsWith('/saved/searches') ? 'searches' : 'listings';
  const listCount = token ? (liked.data?.total ?? 0) : guest.length;
  const searchCount = searches.data?.length ?? 0;
  const newTotal = (searches.data ?? []).reduce((n, s) => n + s.new_count, 0);

  return (
    <div className="mx-auto w-full max-w-[1100px]">
      <AppHeader variant="root" title={t('customer.saved.title')} className="md:hidden" />
      <h1 className="hidden px-6 pt-8 text-h1 text-text-primary md:block">{t('customer.saved.title')}</h1>
      <div className="flex flex-col gap-4 px-4 pb-10 pt-2 md:px-6">
        <div className="relative max-w-[480px]">
          <SegmentedControl
            label={t('customer.saved.title')}
            value={tab}
            onChange={(v) => void nav(v === 'searches' ? '/saved/searches' : '/saved', { replace: true })}
            segments={[
              { value: 'listings', label: t('customer.saved.listings', { count: listCount }) },
              { value: 'searches', label: t('customer.saved.searches', { count: searchCount }) },
            ]}
          />
          {newTotal > 0 && <CountBadge count={newTotal} className="absolute -right-1 -top-2" />}
        </div>
        {tab === 'listings' ? <Listings /> : <Searches />}
      </div>
    </div>
  );
}
