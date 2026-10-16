import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ANALYTICS_EVENTS, estimateEtaMinutes, formatDistance, type ListingListItem } from '@zuuchmap/core';
import { useGeo } from '@/lib/geo';
import { useCategoryLookup, usePlace } from '@/lib/labels';
import { useDocTitle } from '@/lib/meta';
import { recordCall } from '@/lib/provider';
import { useBrowseOnce, useOnline } from '@/lib/queries';
import { track } from '@/lib/track';
import { useFormat } from '@/lib/useFormat';
import { AppHeader } from '@/ui/AppHeader';
import { Banner } from '@/ui/Banner';
import { Chip } from '@/ui/Chip';
import { EmptyState } from '@/ui/EmptyState';
import { Icon } from '@/ui/Icon';
import { SkeletonListingRow } from '@/ui/SkeletonListingRow';
import { PlaceSheet } from './sheets/PlaceSheet';

function SosRow({ item }: { item: ListingListItem }) {
  const { t } = useTranslation();
  const f = useFormat();
  const nav = useNavigate();
  const dist = formatDistance(item.distance_m, f.locale);
  const eta = estimateEtaMinutes(item.distance_m);
  const parts = f.priceParts(item.price_amount, 'TOTAL');
  const status = [eta !== null ? t('customer.sos.eta', { minutes: eta }) : null, dist].filter(Boolean).join(' · ');
  return (
    <li className="flex items-center gap-3 border-b border-border-subtle py-4 last:border-b-0">
      <span aria-hidden="true" className="inline-flex size-12 shrink-0 items-center justify-center rounded-pill bg-status-danger-tint text-status-danger"><Icon name="alert-triangle" size={22} /></span>
      <div className="min-w-0 flex-1">
        <button type="button" onClick={() => void nav(`/posts/${item.id}`)} className="text-left text-title text-text-primary focus-visible:outline-none focus-visible:shadow-focus">{item.title}</button>
        <p className="text-caption text-text-secondary">{status}</p>
        <p className="text-body-bold text-text-primary">{parts ? `${parts.amount} ${t('customer.sos.perCall')}` : t('customer.sos.negotiable')}</p>
      </div>
      {item.contact_phone ? (
        <a
          href={`tel:${item.contact_phone}`}
          onClick={() => {
            track(ANALYTICS_EVENTS.CONTACT_CALL, { id: item.id, sos: true });
            recordCall(item.id);
          }}
          className="inline-flex h-12 shrink-0 items-center gap-2 rounded-button bg-status-danger-fill px-4 text-body-bold text-text-on-color focus-visible:outline-none focus-visible:shadow-focus"
        >
          <Icon name="phone" size={20} />{t('kit.action.call')}
        </a>
      ) : null}
    </li>
  );
}

/** S1: the two-tap path from the landing page to a phone call. No sign-in. */
export default function Sos() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const online = useOnline();
  const place = usePlace();
  const cats = useCategoryLookup();
  const geo = useGeo();
  const request = useGeo((g) => g.request);
  const [sub, setSub] = useState<string | undefined>();
  const [province, setProvince] = useState<string | undefined>();
  const [sheet, setSheet] = useState(false);
  useDocTitle(t('customer.sos.title'));
  useEffect(() => request(), [request]);

  const sosCat = cats.list.find((c) => c.sos);
  const list = useBrowseOnce({ category: sosCat?.key ?? 'sos', subcategory: sub, province, sort: geo.coords ? 'nearby' : 'newest', lat: geo.coords?.lat, lng: geo.coords?.lng }, 50);
  const items = list.data?.items ?? [];

  return (
    <div className="mx-auto w-full max-w-[720px]">
      <AppHeader variant="pushed" title={t('customer.sos.title')} onBack={() => void nav(-1)} className="md:hidden" />
      <div className="flex flex-col gap-4 px-4 pb-10 md:px-6 md:pt-8">
        {!online && <Banner tone="offline" title={t('offline.noConnection')} />}
        <section className="flex flex-col gap-2 rounded-xl bg-status-danger-tint p-4">
          <h1 className="flex items-center gap-2 text-h2 text-text-primary"><Icon name="alert-triangle" size={24} className="text-status-danger" />{t('customer.sos.heading')}</h1>
          <p className="text-body text-text-secondary">{t('customer.sos.body')}</p>
          <p className="flex flex-wrap items-center gap-2 text-label-strong text-text-primary">
            <Icon name="map-pin" size={16} />
            {t('customer.sos.yourLocation', { place: place(province ?? 'ULAANBAATAR') })}
            <button type="button" onClick={() => setSheet(true)} className="inline-flex h-10 items-center text-text-link focus-visible:outline-none focus-visible:shadow-focus">{t('customer.sos.change')}</button>
          </p>
        </section>
        {sosCat && sosCat.subcategories.length > 0 && (
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:px-0 zm-noscroll">
            <Chip className="shrink-0 whitespace-nowrap" label={t('customer.picker.all')} selected={!sub} onClick={() => setSub(undefined)} />
            {sosCat.subcategories.map((s) => <Chip key={s.value} className="shrink-0 whitespace-nowrap" label={s.label} selected={sub === s.value} onClick={() => setSub(sub === s.value ? undefined : s.value)} />)}
          </div>
        )}
        <p className="text-small text-text-secondary">{t('customer.sos.sortNote')}</p>
        {list.isPending ? (
          <div className="flex flex-col gap-2">{Array.from({ length: 4 }, (_, i) => <SkeletonListingRow key={i} />)}</div>
        ) : list.isError ? (
          <EmptyState icon={online ? 'refresh-cw' : 'wifi-off'} title={t('customer.browse.loadFailed')} body={t('customer.browse.loadFailedBody')} action={{ label: t('common.retry'), onClick: () => void list.refetch() }} />
        ) : items.length === 0 ? (
          <EmptyState icon="search" title={t('filter.searchNoResults')} />
        ) : (
          <ul>{items.map((it) => <SosRow key={it.id} item={it} />)}</ul>
        )}
      </div>
      <PlaceSheet open={sheet} onClose={() => setSheet(false)} province={province} provinceOnly onPick={(p) => setProvince(p)} />
    </div>
  );
}
