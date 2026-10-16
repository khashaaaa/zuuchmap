import { categoryColor, categoryKeys } from '@zuuchmap/tokens';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/cn';
import { useFormat } from '@/lib/useFormat';
import { FeaturedMark } from './FeaturedMark';
import { Icon } from './Icon';
import { IconButton } from './IconButton';
import { StatusBadge } from './StatusBadge';

export interface ListingCardProps {
  variant?: 'row' | 'grid';
  title: string;
  categoryKey: string;
  /** Category glyph for the no-photo fallback (falls back to the family icon). */
  categoryIcon?: string;
  /** Grid only: the category name above the title. */
  categoryLabel?: string;
  photo?: string;
  featured?: boolean;
  saved?: boolean;
  onSave?: () => void;
  /** Hide the save button (admins, own listings). */
  hideSave?: boolean;
  /** "Хан-Уул". */
  location?: string;
  postedAt?: string | number | Date;
  price?: number | string | null;
  priceUnit?: string | null;
  /** Present only when the search carries dates: shows the availability chip. */
  dates?: { available: boolean };
  /** Present only with dates, e.g. "3 өдөр · 1,350,000₮". */
  total?: string;
  href?: string;
  onOpen?: () => void;
  className?: string;
}

const isKnown = (k: string) => (categoryKeys as readonly string[]).includes(k);

/** Category tint + glyph, shown where there is no photo. */
export function CategoryTile({ categoryKey, icon, glyph, className }: { categoryKey: string; icon?: string; glyph: number; className?: string }) {
  const fill = isKnown(categoryKey) ? categoryColor(categoryKey, 'light').fill : undefined;
  return (
    <div
      aria-hidden="true"
      className={cn('flex items-center justify-center bg-bg-surface-sunken', className)}
      style={fill ? { backgroundColor: `color-mix(in srgb, ${fill} 16%, transparent)`, color: `color-mix(in srgb, ${fill} 70%, transparent)` } : undefined}
    >
      <Icon name={icon ?? ''} categoryKey={categoryKey} size={glyph} />
    </div>
  );
}

export function ListingCard(p: ListingCardProps) {
  const { t } = useTranslation();
  const f = useFormat();
  const grid = p.variant === 'grid';
  const parts = f.priceParts(p.price, p.priceUnit);
  const saveBtn = !p.hideSave && (
    <IconButton
      icon="heart"
      label={t('common.save')}
      variant={grid ? 'media' : 'ghost'}
      size="medium"
      aria-pressed={p.saved ?? false}
      onClick={p.onSave}
      className={cn('relative z-10', p.saved && '[&_svg]:fill-current')}
    />
  );
  const Title = p.href ? 'a' : 'button';
  const title = (
    <Title
      {...(p.href ? { href: p.href } : { type: 'button' as const, onClick: p.onOpen })}
      className="line-clamp-2 text-left text-title text-text-primary after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:shadow-focus focus-visible:after:rounded-xl"
    >
      {p.title}
    </Title>
  );
  const meta = (p.location || p.postedAt !== undefined) && (
    <p className="flex items-center gap-1 text-caption text-text-secondary">
      <Icon name="map-pin" size={14} />
      <span className="truncate">{[p.location, p.postedAt !== undefined ? f.age(p.postedAt) : undefined].filter(Boolean).join(' · ')}</span>
    </p>
  );
  const price = parts && (
    <p className="flex items-baseline gap-1">
      <span className="text-price text-text-primary">{parts.amount}</span>
      {parts.unit && <span className="whitespace-nowrap text-caption text-text-secondary">/ {parts.unit}</span>}
    </p>
  );
  const availability = p.dates && <StatusBadge status={p.dates.available ? 'available' : 'busy'} />;
  const total = p.total && <p className="text-label-strong text-status-success">{p.total}</p>;

  if (!grid) {
    return (
      <article className={cn('relative flex w-full gap-3.5 rounded-xl border border-border-elevation bg-bg-surface p-3 shadow-sm', p.className)}>
        <div className="relative size-[108px] shrink-0 overflow-hidden rounded-md bg-bg-surface-sunken">
          {p.photo ? <img src={p.photo} alt="" loading="lazy" className="size-full object-cover" /> : <CategoryTile categoryKey={p.categoryKey} icon={p.categoryIcon} glyph={35} className="size-full" />}
          {p.featured && <FeaturedMark className="absolute left-1 top-1" />}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex min-h-10 items-start justify-between gap-2">
            {availability || <span />}
            {saveBtn}
          </div>
          {title}
          {meta}
          {price}
          {total}
        </div>
      </article>
    );
  }
  return (
    <article className={cn('relative flex w-full max-w-[280px] flex-col overflow-hidden rounded-xl border border-border-elevation bg-bg-surface shadow-sm', p.className)}>
      <div className="relative aspect-[4/3] w-full bg-bg-surface-sunken">
        {p.photo ? <img src={p.photo} alt="" loading="lazy" className="size-full object-cover" /> : <CategoryTile categoryKey={p.categoryKey} icon={p.categoryIcon} glyph={67} className="size-full" />}
        {p.featured && <FeaturedMark className="absolute left-2 top-2" />}
        {saveBtn && <span className="absolute right-2 top-2 z-10">{saveBtn}</span>}
      </div>
      <div className="flex flex-col gap-1.5 px-4 pb-4 pt-3.5">
        {p.categoryLabel && (
          <p className="text-overline" style={isKnown(p.categoryKey) ? { color: `var(--color-category-text-${p.categoryKey})` } : undefined}>
            {p.categoryLabel}
          </p>
        )}
        {title}
        {meta}
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
          {price}
          {availability}
        </div>
        {total}
      </div>
    </article>
  );
}
