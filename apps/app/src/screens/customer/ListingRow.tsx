import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { countDays, formatDistance, formatPrice, isListingLive, priceForDays, type ListingListItem } from '@zuuchmap/core';
import { listingMeta } from '../../lib/browse';
import { useCategories } from '../../lib/queries';
import { ListingCard } from '../../ui/ListingCard';
import { useLocale } from '../../ui/useLocale';

export interface ListingRowProps {
  item: ListingListItem;
  /** The search carries dates: availability chip and "N өдөр · total" on rentable cards. */
  dates?: { from?: string; to?: string };
  saved: boolean;
  onToggleSave: (item: ListingListItem) => void;
  onOpen: (item: ListingListItem) => void;
  /** Distance replaces the age in the meta line. */
  showDistance?: boolean;
}

/** The kit ListingCard fed from a list item; shared by Browse, Saved, the map carousel and "similar". */
export function ListingRow({ item, dates, saved, onToggleSave, onOpen, showDistance }: ListingRowProps) {
  const { t } = useTranslation();
  const locale = useLocale();
  const categories = useCategories();
  const cat = useMemo(() => categories.data?.find((c) => c.key === item.category), [categories.data, item.category]);
  const withDates = !!(dates?.from && dates.to) && !!cat?.rentable;
  const days = countDays(dates?.from, dates?.to);
  const total = withDates ? priceForDays(item.price_amount, item.price_unit, days) : null;
  const dist = showDistance ? formatDistance(item.distance_m, locale) : null;
  const live = isListingLive(item);
  return (
    <ListingCard
      title={item.title ?? ''}
      categoryKey={item.category}
      categoryIcon={cat?.icon}
      categoryLabel={cat?.label}
      photoUri={item.images?.[0] ?? null}
      meta={listingMeta(t, item, dist)}
      price={item.price_amount !== null ? { amount: item.price_amount, unit: item.price_unit } : null}
      featured={item.is_featured}
      saved={saved}
      onToggleSave={() => onToggleSave(item)}
      onPress={() => onOpen(item)}
      dates={withDates}
      availability={withDates && live ? 'available' : undefined}
      total={total !== null ? t('customer.browse.daysTotal', { days, total: formatPrice(total, 'TOTAL', locale) ?? '' }) : undefined}
    />
  );
}
