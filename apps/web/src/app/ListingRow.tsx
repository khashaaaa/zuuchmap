import type { MouseEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { countDays, formatDistance, priceForDays, type ListingListItem } from '@zuuchmap/core';
import { useCategoryLookup, usePlace } from '@/lib/labels';
import { useSaves } from '@/lib/saved';
import { useAuthStore } from '@/lib/auth';
import { useFormat } from '@/lib/useFormat';
import { listingHref } from '@/lib/search';
import { track } from '@/lib/track';
import { ANALYTICS_EVENTS } from '@zuuchmap/core';
import { ListingCard } from '@/ui/ListingCard';

export interface ListingRowProps {
  item: ListingListItem;
  variant?: 'row' | 'grid';
  /** The search dates: shows the availability chip and the N-day total. */
  dates?: { from?: string; to?: string };
  className?: string;
  /** Hide the save button (own listings / admins). */
  hideSave?: boolean;
  /** Replaces the plain save toggle (the Saved list adds an undo toast). */
  onToggle?: (item: ListingListItem) => void;
}

/** One listing as a card: the data mapping every list, rail and carousel shares. */
export function ListingRow({ item, variant = 'row', dates, className, hideSave, onToggle }: ListingRowProps) {
  const { t } = useTranslation();
  const f = useFormat();
  const nav = useNavigate();
  const place = usePlace();
  const cats = useCategoryLookup();
  const saves = useSaves();
  const me = useAuthStore((s) => s.user);
  const cat = cats.byKey.get(item.category);
  const distance = formatDistance(item.distance_m, f.locale);
  const loc = [place(item.province, item.district), distance].filter(Boolean).join(' · ');

  const withDates = !!(dates?.from && dates.to && cat?.rentable);
  const days = withDates ? countDays(dates?.from, dates?.to) : 0;
  const sum = withDates ? priceForDays(item.price_amount, item.price_unit, days) : null;
  const total = sum !== null ? t('customer.browse.daysTotal', { days, total: f.amount(sum) ?? '' }) : undefined;

  const open = (e: MouseEvent) => {
    const a = (e.target as HTMLElement).closest('a');
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    track(ANALYTICS_EVENTS.LISTING_OPENED, { id: item.id });
    void nav(listingHref(item.id, dates));
  };

  return (
    <div onClick={open} className={variant === 'grid' ? 'min-w-0' : undefined}>
      <ListingCard
        variant={variant}
        title={item.title ?? ''}
        categoryKey={item.category}
        categoryIcon={cat?.icon}
        categoryLabel={cat?.label}
        photo={item.images?.[0]}
        featured={item.is_featured}
        saved={saves.isSaved(item.id)}
        onSave={() => (onToggle ?? saves.toggle)(item)}
        hideSave={hideSave || me?.id === item.user?.id}
        location={loc || undefined}
        postedAt={distance ? undefined : item.date_created}
        price={item.price_amount}
        priceUnit={item.price_unit}
        dates={withDates ? { available: true } : undefined}
        total={total}
        href={listingHref(item.id, dates)}
        className={className ?? (variant === 'grid' ? 'max-w-none' : undefined)}
      />
    </div>
  );
}
