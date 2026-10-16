import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { FAMILY_KEYS, groupThousands } from '@zuuchmap/core';
import { useCategoryLookup, usePlace } from '@/lib/labels';
import { useDocTitle } from '@/lib/meta';
import { useBrowseOnce, useFamilies, useStats } from '@/lib/queries';
import { pushRecent, searchHref, shortDay } from '@/lib/search';
import { AppHeader } from '@/ui/AppHeader';
import { Button } from '@/ui/Button';
import { Icon } from '@/ui/Icon';
import { SearchBar } from '@/ui/SearchBar';
import { ListingRow } from './ListingRow';
import { DatesSheet } from './sheets/DatesSheet';
import { PlaceSheet } from './sheets/PlaceSheet';

/** N5 / N5d. */
export default function Landing() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const place = usePlace();
  const cats = useCategoryLookup();
  const families = useFamilies();
  const stats = useStats();
  const latest = useBrowseOnce({ sort: 'newest' }, 8);
  const [q, setQ] = useState('');
  const [dates, setDates] = useState<{ from?: string; to?: string }>({});
  const [province, setProvince] = useState<string | undefined>();
  const [sheet, setSheet] = useState<'dates' | 'place' | null>(null);
  useDocTitle(null);

  const go = (v: string) => {
    pushRecent(v);
    void nav(searchHref({ attrs: {}, view: 'list', q: v.trim() || undefined, date_from: dates.from, date_to: dates.to, province }));
  };
  const dateLabel = dates.from && dates.to ? `${shortDay(dates.from)} – ${shortDay(dates.to)}` : t('customer.landing.pickDates');
  const placeLabel = place(province) || t('customer.landing.allProvinces');
  const pill = (on: boolean) => `shrink-0 rounded-pill px-3! ${on ? 'border-border-selected! bg-action-primary-tint!' : ''}`;
  const familyList = (families.data ?? []).length ? families.data ?? [] : [];
  const order = FAMILY_KEYS as readonly string[];
  const sorted = [...familyList].sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));

  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-col">
      <AppHeader variant="brand" className="md:hidden" action={{ icon: 'plus', label: t('customer.landing.addListing'), onClick: () => void nav('/become-provider') }} />

      <section className="grid items-center gap-8 px-4 pb-6 pt-4 md:px-6 md:pb-12 md:pt-14 lg:grid-cols-2 lg:px-20">
        <div className="flex flex-col gap-4">
          <p className="hidden text-overline text-text-secondary md:block">{t('customer.landing.heroTitle')}</p>
          <h1 className="text-h1 text-text-primary md:text-display">{t('customer.landing.heroSubtitle')}</h1>
          <p className="text-body text-text-secondary">{t('customer.landing.heroHint')}</p>
        </div>
        <div aria-hidden="true" className="hidden h-[260px] items-center justify-center rounded-xxl bg-bg-surface-sunken text-action-primary lg:flex">
          <Icon name="truck" size={120} strokeWidth={1.25} />
        </div>
      </section>

      <section className="flex flex-col gap-3 px-4 md:px-6 lg:px-20">
        <div className="md:hidden"><SearchBar value={q} onChange={setQ} onSubmit={go} /></div>
        <div className="hidden md:block"><SearchBar variant="hero" value={q} onChange={setQ} onSubmit={go} location={placeLabel} onLocationClick={() => setSheet('place')} /></div>
        <div className="flex items-center gap-2 overflow-x-auto zm-noscroll">
          <Button variant="outline" size="medium" icon="calendar" className={pill(!!dates.from)} onClick={() => setSheet('dates')}>{dateLabel}</Button>
          <Button variant="outline" size="medium" icon="map-pin" className={`${pill(!!province)} md:hidden`} onClick={() => setSheet('place')}>{placeLabel}</Button>
        </div>
        {stats.data && (
          <dl className="flex flex-wrap gap-x-8 gap-y-1 pt-1">
            <div className="flex items-baseline gap-2"><dt className="order-2 text-caption text-text-secondary">{t('customer.landing.statListings')}</dt><dd className="text-h3 tabular-nums text-text-primary">{groupThousands(stats.data.total)}</dd></div>
            <div className="flex items-baseline gap-2"><dt className="order-2 text-caption text-text-secondary">{t('customer.landing.statProvinces')}</dt><dd className="text-h3 tabular-nums text-text-primary">{stats.data.provinces}</dd></div>
          </dl>
        )}
      </section>

      <section className="flex flex-col gap-4 px-4 pt-8 md:px-6 md:pt-12 lg:px-20">
        <h2 className="text-h2 text-text-primary">{t('customer.landing.whatDoYouNeed')}</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-5">
          {sorted.map((fam) => (
            <button
              key={fam.key}
              type="button"
              onClick={() => void nav(`/browse?family=${fam.key}`)}
              className="flex flex-col gap-3 rounded-xl border border-border-subtle bg-bg-surface p-4 text-left shadow-sm focus-visible:outline-none focus-visible:shadow-focus"
            >
              <span className="flex gap-2">
                {fam.categories.slice(0, 4).map((k) => (
                  <span key={k} className="inline-flex size-9 items-center justify-center rounded-md bg-bg-surface-sunken" style={{ color: `var(--color-category-text-${k})` }}>
                    <Icon name={cats.byKey.get(k)?.icon ?? fam.icon} categoryKey={k} size={18} />
                  </span>
                ))}
              </span>
              <span className="text-title text-text-primary">{fam.label}</span>
              <span className="text-caption text-text-secondary">{t(`customer.landing.familyHint.${fam.key}`)}</span>
              <span className="flex items-center gap-1 text-label-strong text-text-link">
                {t('customer.landing.familyCount', { count: fam.count })}
                <Icon name="chevron-right" size={16} />
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className="px-4 pt-6 md:px-6 lg:px-20">
        <div className="flex flex-col items-start gap-3 rounded-xl bg-status-danger-tint p-4 sm:flex-row sm:items-center">
          <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-pill bg-status-danger-fill text-text-on-color"><Icon name="alert-triangle" size={24} /></span>
          <div className="min-w-0 flex-1">
            <h2 className="text-title text-text-primary">{t('customer.landing.sosTitle')}</h2>
            <p className="text-caption text-text-secondary">{t('customer.landing.sosBodyLong')}</p>
          </div>
          <Button variant="danger" icon="phone" onClick={() => void nav('/sos')}>{t('customer.landing.sosCall')}</Button>
        </div>
      </section>

      <section className="flex flex-col gap-4 px-4 pb-10 pt-10 md:px-6 lg:px-20">
        <div className="flex items-center justify-between">
          <h2 className="text-h2 text-text-primary">{t('customer.landing.newListings')}</h2>
          <button type="button" onClick={() => void nav('/browse?sort=newest')} className="inline-flex h-12 items-center gap-1 text-label-strong text-text-link focus-visible:outline-none focus-visible:shadow-focus">
            {t('customer.landing.seeAll')}<Icon name="chevron-right" size={16} />
          </button>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:gap-5">
          {(latest.data?.items ?? []).slice(0, 4).map((it) => <ListingRow key={it.id} item={it} variant="grid" />)}
        </div>
      </section>

      <footer className="border-t border-border-subtle px-4 py-6 text-caption text-text-secondary md:px-6 lg:px-20">© 2026 ZuuchMap</footer>

      <DatesSheet open={sheet === 'dates'} onClose={() => setSheet(null)} from={dates.from} to={dates.to} onApply={(from, to) => setDates({ from, to })} />
      <PlaceSheet open={sheet === 'place'} onClose={() => setSheet(null)} province={province} provinceOnly onPick={(p) => setProvince(p)} />
    </div>
  );
}
