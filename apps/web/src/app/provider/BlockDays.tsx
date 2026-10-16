import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQueries } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { countDays, formatDateRange, type AvailabilityResponse } from '@zuuchmap/core';
import { api, errorKey } from '@/lib/api';
import { useCategoryLookup } from '@/lib/labels';
import { useDocTitle } from '@/lib/meta';
import { listingFacts, useBlockDays, useMyListings, useUnblockDays } from '@/lib/provider';
import { expandRange } from '@/lib/search';
import { useToast } from '@/lib/toast';
import { useFormat } from '@/lib/useFormat';
import { Button } from '@/ui/Button';
import { Chip } from '@/ui/Chip';
import { DateRangeCalendar, type DateRange } from '@/ui/DateRangeCalendar';
import { EmptyState } from '@/ui/EmptyState';
import { PageHead, ProviderOnly } from './Page';

const dayOf = (iso: string) => iso.slice(0, 10);

function Block() {
  const { t } = useTranslation();
  const f = useFormat();
  const toast = useToast();
  const [sp] = useSearchParams();
  const mine = useMyListings();
  const cats = useCategoryLookup();
  const block = useBlockDays();
  const unblock = useUnblockDays();
  useDocTitle(t('prov.block.title'));

  const listings = useMemo(
    () => (mine.data ?? []).filter((p) => listingFacts(p).state === 'live' && cats.byKey.get(p.category)?.rentable),
    [mine.data, cats.byKey],
  );
  const pre = Number(sp.get('post'));
  const [picked, setPicked] = useState<number[] | null>(null);
  // Default: the listing named in the URL, else every one.
  const selected = picked ?? (listings.some((p) => p.id === pre) ? [pre] : listings.map((p) => p.id));
  const all = selected.length === listings.length && listings.length > 0;
  const [range, setRange] = useState<DateRange>({});

  const avail = useQueries({
    queries: selected.map((id) => ({ queryKey: ['availability', id], queryFn: () => api<AvailabilityResponse>(`/posts/${id}/availability`) })),
  });
  const ranges = avail.flatMap((q) => q.data?.busy ?? []);
  const booked = useMemo(() => ranges.filter((r) => r.kind === 'BOOKED').flatMap((r) => expandRange(dayOf(r.start_date), dayOf(r.end_date))), [ranges]);
  const blockedRanges = ranges.filter((r) => r.kind === 'BLOCKED');
  const blocked = useMemo(() => blockedRanges.flatMap((r) => expandRange(dayOf(r.start_date), dayOf(r.end_date))), [blockedRanges]);
  const single = selected.length === 1;

  const toggle = (id: number) => {
    const cur = new Set(selected);
    if (cur.has(id)) cur.delete(id);
    else cur.add(id);
    setPicked([...cur]);
    setRange({});
  };

  const save = () => {
    if (!range.start || !range.end || selected.length === 0) return;
    block.mutate(
      { post_ids: selected, start_date: range.start, end_date: range.end },
      {
        onSuccess: () => {
          toast.success(t('prov.block.saved'));
          setRange({});
        },
        onError: (e) => toast.error(t(errorKey(e))),
      },
    );
  };

  const open = (day: string) => {
    const r = blockedRanges.find((x) => dayOf(x.start_date) <= day && day <= dayOf(x.end_date));
    if (!r || !single) return;
    unblock.mutate(r.id, { onSuccess: () => toast.success(t('prov.block.unblocked')), onError: (e) => toast.error(t(errorKey(e))) });
  };

  const parse = (k: string) => new Date(Number(k.slice(0, 4)), Number(k.slice(5, 7)) - 1, Number(k.slice(8, 10)));

  return (
    <div className="pb-28 md:pb-10">
      <PageHead title={t('prov.block.title')} back />
      {mine.isPending ? (
        <p role="status" className="p-8 text-center text-caption text-text-secondary">{t('ui.loading')}</p>
      ) : listings.length === 0 ? (
        <EmptyState icon="calendar-x" title={t('prov.block.title')} body={t('ui.prov.noRentable')} className="py-16" />
      ) : (
        <div className="flex flex-col gap-4 px-4 pt-2 md:px-8 md:pt-6">
          <p className="text-caption text-text-secondary">{t('prov.block.hint')}</p>
          <section className="flex flex-col gap-2">
            <h2 className="text-label-strong text-text-primary">{t('prov.block.which')}</h2>
            <div className="zm-noscroll -mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0">
              <Chip label={t('prov.block.allListings', { count: listings.length })} selected={all} className="shrink-0" onClick={() => { setPicked(listings.map((p) => p.id)); setRange({}); }} />
              {listings.map((p) => (
                <Chip key={p.id} label={p.title ?? String(p.id)} selected={!all && selected.includes(p.id)} className="shrink-0" onClick={() => (all ? (setPicked([p.id]), setRange({})) : toggle(p.id))} />
              ))}
            </div>
          </section>
          <div className="flex flex-col gap-4 md:flex-row md:items-start">
            <DateRangeCalendar
              value={range}
              onChange={setRange}
              booked={booked}
              blocked={blocked}
              onBlockedClick={single ? open : undefined}
              className="border border-border-subtle md:w-[400px] md:max-w-none"
              legend={
                <ul className="flex flex-wrap gap-x-4 gap-y-1 text-small text-text-secondary">
                  <li>{t('prov.block.booked')}</li>
                  <li className="text-status-warning">{t('prov.block.blocked')}{single ? ` · ${t('prov.block.unblock')}` : ''}</li>
                  <li>{t('prov.block.free')}</li>
                </ul>
              }
            />
            <div className="flex min-w-0 flex-1 flex-col gap-3">
              {single && blockedRanges.length > 0 && (
                <ul className="flex flex-col gap-2">
                  {blockedRanges.map((r) => (
                    <li key={r.id} className="flex items-center gap-3 rounded-xl border border-border-subtle bg-bg-surface px-4 py-2">
                      <span className="min-w-0 flex-1 text-body text-text-primary">{formatDateRange(parse(dayOf(r.start_date)), parse(dayOf(r.end_date)), f.locale)}</span>
                      <Button variant="outline" size="medium" loading={unblock.isPending && unblock.variables === r.id} onClick={() => unblock.mutate(r.id, { onSuccess: () => toast.success(t('prov.block.unblocked')), onError: (e) => toast.error(t(errorKey(e))) })}>
                        {t('prov.block.unblock')}
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
      {listings.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-20 flex flex-col gap-2 border-t border-border-subtle bg-bg-surface px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-3 md:static md:mx-8 md:mt-4 md:max-w-[400px] md:border-0 md:bg-transparent md:p-0">
          {range.start && range.end && (
            <p className="text-caption text-text-secondary">
              {t('prov.block.summary', { range: formatDateRange(parse(range.start), parse(range.end), f.locale), listings: selected.length, days: countDays(range.start, range.end) })}
            </p>
          )}
          <Button loading={block.isPending} disabled={!range.start || !range.end || selected.length === 0} onClick={save}>{t('prov.block.save')}</Button>
        </div>
      )}
    </div>
  );
}

export default function BlockDays() {
  return <ProviderOnly><Block /></ProviderOnly>;
}
