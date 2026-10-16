import { lazy, Suspense, useEffect, useState } from 'react';
import { cn } from '@/lib/cn';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ANALYTICS_EVENTS, DISTRICT_CODES, PROVINCE_CODES, type BrowseSort } from '@zuuchmap/core';
import { requireAuth } from '@/lib/auth';
import { useGeo } from '@/lib/geo';
import { useCategoryLookup, useOptionLabel, usePlace } from '@/lib/labels';
import { useDocTitle } from '@/lib/meta';
import { useBrowse, useMedia, useOnline, useStats } from '@/lib/queries';
import { pushRecent, searchToApi, shortDay, useSearchState, type SearchState } from '@/lib/search';
import { track } from '@/lib/track';
import { Banner } from '@/ui/Banner';
import { Button } from '@/ui/Button';
import { Chip } from '@/ui/Chip';
import { EmptyState } from '@/ui/EmptyState';
import { Icon } from '@/ui/Icon';
import { IconButton } from '@/ui/IconButton';
import { SearchBar } from '@/ui/SearchBar';
import { SegmentedControl } from '@/ui/SegmentedControl';
import { Select } from '@/ui/Select';
import { SkeletonListingRow } from '@/ui/SkeletonListingRow';
import { ListingRow } from './ListingRow';
import { AttrFilter, FilterSheet } from './sheets/FilterSheet';
import { CategorySheet } from './sheets/CategorySheet';
import { DatesSheet } from './sheets/DatesSheet';
import { PlaceSheet } from './sheets/PlaceSheet';
import { SaveSearchSheet } from './sheets/SaveSearchSheet';
import { Suggestions } from './Suggestions';

const MapView = lazy(() => import('./MapView'));

type Sheet = 'dates' | 'filter' | 'place' | 'category' | 'save' | null;

const hasFilters = (s: SearchState) =>
  !!(s.q || s.family || s.category || s.subcategory || s.province || s.district || s.price_min || s.price_max || Object.keys(s.attrs).length);

function pillClass(on: boolean) {
  return on ? 'rounded-pill border-border-selected! bg-action-primary-tint! px-3!' : 'rounded-pill px-3!';
}

function focusSearch() {
  const inputs = Array.from(document.querySelectorAll<HTMLInputElement>('input[type="search"]'));
  inputs.find((i) => i.offsetParent !== null)?.focus();
}

function Results({ s, update, openSheet }: { s: SearchState; update: (p: Partial<SearchState>) => void; openSheet: (x: Sheet) => void }) {
  const { t } = useTranslation();
  const online = useOnline();
  const wide = useMedia('(min-width: 1024px)');
  const geo = useGeo((g) => g.coords);
  const apiParams = searchToApi(s, geo);
  const q = useBrowse(apiParams);
  const first = q.data?.pages[0];
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  const dates = s.date_from && s.date_to ? { from: s.date_from, to: s.date_to } : undefined;
  const days = dates ? Math.round((Date.parse(dates.to) - Date.parse(dates.from)) / 86_400_000) + 1 : 0;

  useEffect(() => {
    if (!first) return;
    track(dates ? ANALYTICS_EVENTS.SEARCH_WITH_DATES : ANALYTICS_EVENTS.SEARCH_PERFORMED, { q: s.q, total: first.total });
    // one event per distinct answer
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [first?.total, JSON.stringify(apiParams)]);

  const grid = 'grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3 lg:gap-5';

  if (q.isPending) {
    return (
      <div className={grid}>
        {Array.from({ length: 6 }, (_, i) => <SkeletonListingRow key={i} />)}
      </div>
    );
  }
  if (q.isError && !first) {
    return (
      <EmptyState
        icon={online ? 'refresh-cw' : 'wifi-off'}
        title={t('customer.browse.loadFailed')}
        body={online ? t('customer.browse.loadFailedBody') : t('offline.noConnection')}
        action={{ label: t('common.retry'), onClick: () => void q.refetch() }}
      />
    );
  }
  if (!first) return null;

  if (items.length === 0) {
    if (dates && first.undated_total !== undefined) {
      return (
        <div className="flex flex-col gap-3">
          <EmptyState
            icon="calendar"
            title={t('customer.browse.noFreeTitle', { from: shortDay(dates.from), to: shortDay(dates.to) })}
            body={t('customer.browse.noFreeBody', { count: first.undated_total })}
          />
          <ul className="mx-auto flex w-full max-w-[480px] flex-col gap-2">
            {(first.alternatives ?? []).map((a) => (
              <li key={a.date_from + a.date_to}>
                <button
                  type="button"
                  onClick={() => update({ date_from: a.date_from, date_to: a.date_to })}
                  className="flex min-h-14 w-full items-center gap-3 rounded-xl border border-border-subtle bg-bg-surface px-4 text-left focus-visible:outline-none focus-visible:shadow-focus"
                >
                  <Icon name="calendar" size={20} className="text-icon-secondary" />
                  <span className="flex-1 text-body-bold text-text-primary">{shortDay(a.date_from)}–{shortDay(a.date_to)}</span>
                  <span className="text-caption text-status-success">{t('customer.browse.altFree', { count: a.count })}</span>
                  <Icon name="chevron-right" size={18} className="text-icon-secondary" />
                </button>
              </li>
            ))}
          </ul>
          <div className="mx-auto">
            <Button variant="outline" size="medium" onClick={() => update({ date_from: undefined, date_to: undefined })}>{t('customer.browse.withoutDates')}</Button>
          </div>
        </div>
      );
    }
    return (
      <EmptyState
        icon="search"
        title={t('filter.searchNoResults')}
        body={t('customer.browse.noResultsBody')}
        action={{ label: t('savedSearch.save'), onClick: () => requireAuth('search', () => openSheet('save')), variant: 'secondary' }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {!online && <Banner tone="offline" title={t('offline.noConnection')} />}
      {dates && !first.relaxed && (
        <Banner tone="info" title={t('customer.browse.datesBanner', { from: shortDay(dates.from), to: shortDay(dates.to) })} action={{ label: t('customer.browse.edit'), onClick: () => openSheet('dates') }} />
      )}
      {first.relaxed && (
        <Banner tone="warning" title={t('customer.browse.nearTitle')} body={t('customer.browse.nearBody', { count: first.total })} action={{ label: t('customer.browse.edit'), onClick: focusSearch }} />
      )}
      <div className="flex flex-wrap items-baseline gap-x-2">
        <p className="text-h3 text-text-primary">{t('customer.browse.countAll', { count: first.total })}</p>
        <p className="text-caption text-text-secondary">
          {first.relaxed ? t('customer.browse.nearMatched') : dates ? t('customer.browse.countFree', { days }) : s.sort === 'newest' || !s.sort ? t('customer.browse.newestFirst') : ''}
        </p>
        {hasFilters(s) && (
          <button type="button" onClick={() => requireAuth('search', () => openSheet('save'))} className="ml-auto h-10 text-label-strong text-text-link focus-visible:outline-none focus-visible:shadow-focus">
            {t('savedSearch.save')}
          </button>
        )}
      </div>
      <div className={cn(grid, 'zm-stagger')}>
        {items.map((it) => <ListingRow key={it.id} item={it} dates={dates} variant={wide ? 'grid' : 'row'} />)}
      </div>
      {q.hasNextPage && (
        <div className="flex justify-center py-4">
          <Button variant="outline" size="medium" loading={q.isFetchingNextPage} onClick={() => void q.fetchNextPage()}>{t('customer.landing.seeAll')}</Button>
        </div>
      )}
    </div>
  );
}

export default function Browse() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const [s, update] = useSearchState();
  const cats = useCategoryLookup();
  const stats = useStats();
  const place = usePlace();
  const optionLabel = useOptionLabel();
  const coords = useGeo((g) => g.coords);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [text, setText] = useState(s.q ?? '');
  const [focus, setFocus] = useState(false);
  useEffect(() => setText(s.q ?? ''), [s.q]);

  const cat = s.category ? cats.byKey.get(s.category) : undefined;
  useDocTitle(s.q ?? cat?.label ?? t('nav.browse'));
  const submit = (v: string) => {
    pushRecent(v);
    setFocus(false);
    update({ q: v.trim() || undefined });
  };
  const dateLabel = s.date_from && s.date_to ? `${shortDay(s.date_from)} – ${shortDay(s.date_to)}` : t('customer.landing.pickDates');
  const placeLabel = place(s.province, s.district) || t('customer.landing.allProvinces');

  const sortOptions: BrowseSort[] = ['relevance', 'newest', ...(coords ? (['nearby'] as const) : []), 'price_asc', 'price_desc'];
  const sortLabel = (x: BrowseSort) => (x === 'nearby' ? t('ui.sortNearby') : t(`sort.${x}`));
  const mapView = s.view === 'map';

  const removable: { key: string; label: string; clear: () => void; wide?: boolean }[] = [];
  if (s.date_from && s.date_to) removable.push({ key: 'dates', label: dateLabel, wide: true, clear: () => update({ date_from: undefined, date_to: undefined }) });
  if (s.family) removable.push({ key: 'family', label: t(`customer.landing.familyHint.${s.family}`).split(',')[0] ?? s.family, clear: () => update({ family: undefined }) });
  if (cat) removable.push({ key: 'cat', label: cat.label, wide: true, clear: () => update({ category: undefined, subcategory: undefined, attrs: {} }) });
  if (s.subcategory) removable.push({ key: 'sub', label: cat?.subcategories.find((x) => x.value === s.subcategory)?.label ?? s.subcategory, clear: () => update({ subcategory: undefined }) });
  if (s.province) removable.push({ key: 'prov', label: t(`province.${s.province}`), wide: true, clear: () => update({ province: undefined, district: undefined }) });
  if (s.district) removable.push({ key: 'dist', label: t(`district.${s.district}`), clear: () => update({ district: undefined }) });
  if (s.price_min || s.price_max) removable.push({ key: 'price', label: `${s.price_min ?? ''}–${s.price_max ?? ''}`, clear: () => update({ price_min: undefined, price_max: undefined, price_unit: undefined }) });
  for (const [k, v] of Object.entries(s.attrs)) {
    const base = k.replace(/_(min|max)$/, '');
    const fld = cat?.fields.find((x) => x.key === base);
    const label = v === 'true' ? (fld?.label ?? k) : k.endsWith('_min') ? `${fld?.label ?? base} ≥ ${v}` : k.endsWith('_max') ? `${fld?.label ?? base} ≤ ${v}` : optionLabel(v);
    removable.push({ key: `a-${k}`, label, clear: () => update({ attrs: Object.fromEntries(Object.entries(s.attrs).filter(([x]) => x !== k)) }) });
  }

  const provinceOptions = [{ value: '', label: t('customer.landing.allProvinces') }, ...PROVINCE_CODES.map((c) => ({ value: c, label: t(`province.${c}`) }))];
  const districtOptions = [{ value: '', label: t('filter.all') }, ...DISTRICT_CODES.map((c) => ({ value: c, label: t(`district.${c}`) }))];
  const filterableBooleans = (cat?.fields ?? []).filter((x) => x.filterable && x.type === 'boolean');
  const count = (k: string) => stats.data?.categories.find((c) => c.key === k)?.count;

  const viewToggle = (
    <SegmentedControl
      label={t('customer.browse.list')}
      value={s.view}
      onChange={(view) => update({ view })}
      segments={[{ value: 'list', label: t('customer.browse.list'), icon: 'list' }, { value: 'map', label: t('customer.browse.map'), icon: 'map' }]}
      className="max-md:[&_button]:px-3 max-md:[&_button]:text-[0px] max-md:[&_svg]:m-0"
    />
  );

  return (
    <div className="mx-auto flex w-full max-w-[1440px] gap-8 px-4 pb-6 pt-2 md:px-6 lg:px-20 lg:pt-6">
      <aside className="hidden w-[280px] shrink-0 flex-col gap-5 self-start rounded-xl border border-border-subtle bg-bg-surface p-5 lg:flex">
        <section className="flex flex-col gap-2">
          <h2 className="text-overline text-text-secondary">{t('customer.dates.title')}</h2>
          <button
            type="button"
            onClick={() => setSheet('dates')}
            className={`flex h-12 items-center gap-2.5 rounded-input border px-3 text-body focus-visible:outline-none focus-visible:shadow-focus ${s.date_from ? 'border-border-focus text-text-primary' : 'border-border-default text-text-secondary'}`}
          >
            <Icon name="calendar" size={18} />
            <span className="flex-1 text-left">{dateLabel}</span>
          </button>
          <p className="text-small text-text-secondary">{t('customer.landing.heroHint')}</p>
        </section>
        <section className="flex flex-col gap-1">
          <h2 className="text-overline text-text-secondary">{t('filter.category')}</h2>
          <button type="button" aria-pressed={!s.category} onClick={() => update({ category: undefined, subcategory: undefined, attrs: {} })} className={`flex h-10 items-center rounded-md px-2 text-body ${!s.category ? 'bg-bg-surface-sunken text-text-primary' : 'text-text-secondary'} focus-visible:outline-none focus-visible:shadow-focus`}>
            {t('customer.browse.all')}
          </button>
          {cats.list.map((c) => (
            <button
              key={c.key}
              type="button"
              aria-pressed={s.category === c.key}
              onClick={() => update({ category: s.category === c.key ? undefined : c.key, subcategory: undefined, attrs: {} })}
              className={`flex h-10 items-center gap-2.5 rounded-md px-2 text-body focus-visible:outline-none focus-visible:shadow-focus ${s.category === c.key ? 'bg-bg-surface-sunken text-text-primary' : 'text-text-secondary'}`}
            >
              <span style={{ color: `var(--color-category-text-${c.key})` }}><Icon name={c.icon} categoryKey={c.key} size={18} /></span>
              <span className="flex-1 truncate text-left">{c.label}</span>
              <span className="text-caption tabular-nums text-text-secondary">{count(c.key) ?? 0}</span>
            </button>
          ))}
        </section>
        <section className="flex flex-col gap-3">
          <h2 className="text-overline text-text-secondary">{t('common.province')}</h2>
          <Select label={t('common.province')} value={s.province ?? ''} options={provinceOptions} onChange={(v) => update({ province: v || undefined, district: undefined })} />
          {s.province === 'ULAANBAATAR' && <Select label={t('common.district')} value={s.district ?? ''} options={districtOptions} onChange={(v) => update({ district: v || undefined })} />}
        </section>
        {filterableBooleans.length > 0 && (
          <section className="flex flex-col gap-2">
            {filterableBooleans.map((fld) => <AttrFilter key={fld.key} field={fld} attrs={s.attrs} onChange={(attrs) => update({ attrs })} />)}
          </section>
        )}
        <Button variant="outline" size="medium" icon="sliders-horizontal" onClick={() => setSheet('filter')}>{t('customer.filter.title')}</Button>
      </aside>

      <main className="min-w-0 flex-1">
        {/* phone and tablet: search + view toggle, chips */}
        <div className="flex flex-col gap-3 lg:hidden">
          <div className="flex items-center gap-3 md:hidden">
            <div className="relative min-w-0 flex-1" onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}>
              <SearchBar value={text} onChange={setText} onSubmit={submit} />
              {focus && (
                <Suggestions
                  query={text}
                  onCategory={(category, subcategory) => { setFocus(false); setText(''); update({ category, subcategory, q: undefined }); }}
                  onQuery={(q) => { setText(q); submit(q); }}
                />
              )}
            </div>
            {viewToggle}
          </div>
          <div className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 md:mx-0 md:px-0 zm-noscroll">
            <Button variant="outline" size="medium" icon="calendar" className={`shrink-0 ${pillClass(!!s.date_from)}`} onClick={() => setSheet('dates')}>{dateLabel}</Button>
            <Button variant="outline" size="medium" icon="map-pin" className={`shrink-0 ${pillClass(!!s.province)}`} onClick={() => setSheet('place')}>{placeLabel}</Button>
            <IconButton icon="sliders-horizontal" label={t('customer.filter.title')} variant="surface" size="medium" className="shrink-0" onClick={() => setSheet('filter')} />
            <span className="ml-auto hidden shrink-0 md:block">{viewToggle}</span>
          </div>
          <div className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 md:mx-0 md:px-0 zm-noscroll">
            <Chip className="shrink-0 whitespace-nowrap" label={t('customer.browse.all')} selected={!s.category} onClick={() => update({ category: undefined, subcategory: undefined, attrs: {} })} />
            {cats.list.map((c) => (
              <Chip key={c.key} className="shrink-0 whitespace-nowrap" type="category" label={c.label} icon={c.icon} categoryKey={c.key} selected={s.category === c.key} onClick={() => update({ category: s.category === c.key ? undefined : c.key, subcategory: undefined, attrs: {} })} />
            ))}
            <Chip className="shrink-0 whitespace-nowrap" label={t('customer.picker.category')} onClick={() => setSheet('category')} />
          </div>
        </div>

        {/* desktop heading row */}
        <div className="hidden items-end gap-4 lg:flex">
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-h2 text-text-primary">{s.q ? `“${s.q}”` : (cat?.label ?? t('nav.browse'))}</h1>
          </div>
          <Select className="w-[220px]" label={t('filter.sortBy')} value={s.sort ?? 'relevance'} options={sortOptions.map((x) => ({ value: x, label: sortLabel(x) }))} onChange={(v) => update({ sort: v === 'relevance' ? undefined : (v as BrowseSort) })} />
          {viewToggle}
        </div>

        {removable.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {removable.map((r) => <Chip key={r.key} type="removable" label={r.label} onRemove={r.clear} className={r.wide ? 'max-lg:hidden' : undefined} />)}
            <button type="button" onClick={() => void nav('/browse')} className="hidden h-10 px-2 text-label-strong text-text-link focus-visible:outline-none focus-visible:shadow-focus lg:block">{t('filter.clearAll')}</button>
          </div>
        )}

        <div key={mapView ? 'map' : 'list'} className="zm-fade-in mt-4">
          {mapView ? (
            <Suspense fallback={<div role="status" className="zm-pulse h-[60dvh] rounded-xl bg-bg-surface-sunken"><span className="sr-only">{t('ui.loading')}</span></div>}>
              <MapView s={s} update={update} onFilter={() => setSheet('filter')} />
            </Suspense>
          ) : (
            <Results s={s} update={update} openSheet={setSheet} />
          )}
        </div>
      </main>

      <DatesSheet open={sheet === 'dates'} onClose={() => setSheet(null)} from={s.date_from} to={s.date_to} onApply={(a, b) => update({ date_from: a, date_to: b })} />
      <PlaceSheet open={sheet === 'place'} onClose={() => setSheet(null)} province={s.province} district={s.district} onPick={(province, district) => update({ province, district })} />
      <CategorySheet open={sheet === 'category'} onClose={() => setSheet(null)} onPick={(p) => update({ category: p.category, subcategory: p.subcategory, family: p.family, attrs: {} })} />
      <FilterSheet open={sheet === 'filter'} onClose={() => setSheet(null)} state={s} canNearby={!!coords} onApply={(p) => update(p)} />
      <SaveSearchSheet open={sheet === 'save'} onClose={() => setSheet(null)} state={s} />
    </div>
  );
}
