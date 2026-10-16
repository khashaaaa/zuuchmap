import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/cn';
import { useFormat } from '@/lib/useFormat';
import { Icon } from './Icon';
import { CategoryTile } from './ListingCard';
import { StatusBadge, type Status } from './StatusBadge';

export interface MyListingRowProps {
  status: Status;
  title: string;
  categoryKey: string;
  categoryIcon?: string;
  photo?: string;
  price?: number | string | null;
  priceUnit?: string | null;
  /** "128 үзэлт · 6 хадгалсан · 3 хоног үлдсэн". */
  meta?: string;
  /** Pill under the meta: "Онцлох" (star) or "Сунгах" on an expired one. */
  action?: { label: string; icon?: string; onClick?: () => void };
  /** Rejection note. */
  note?: string;
  onOpen?: () => void;
  onMore?: () => void;
  className?: string;
}

export function MyListingRow(p: MyListingRowProps) {
  const { t } = useTranslation();
  const f = useFormat();
  const parts = f.priceParts(p.price, p.priceUnit);
  return (
    <article className={cn('relative flex gap-3 rounded-xl border border-border-elevation bg-bg-surface py-3 pl-3 pr-2 shadow-sm', p.className)}>
      <div className="size-16 shrink-0 overflow-hidden rounded-md bg-bg-surface-sunken">
        {p.photo ? <img src={p.photo} alt="" loading="lazy" className="size-full object-cover" /> : <CategoryTile categoryKey={p.categoryKey} icon={p.categoryIcon} glyph={28} className="size-full" />}
      </div>
      <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
        <StatusBadge status={p.status} />
        <button
          type="button"
          onClick={p.onOpen}
          className="line-clamp-2 text-left text-body-bold text-text-primary after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:rounded-xl focus-visible:after:shadow-focus"
        >
          {p.title}
        </button>
        {parts && (
          <p className="flex items-baseline gap-1">
            <span className="text-label-strong text-text-primary">{parts.amount}</span>
            {parts.unit && <span className="text-body text-text-secondary">/ {parts.unit}</span>}
          </p>
        )}
        {p.meta && <p className="text-small text-text-secondary">{p.meta}</p>}
        {p.action && (
          <button
            type="button"
            onClick={p.action.onClick}
            className="relative z-10 inline-flex h-8 items-center gap-1.5 rounded-pill bg-action-primary-tint py-1.5 pl-2.5 pr-3 text-label-strong text-text-link focus-visible:outline-none focus-visible:shadow-focus"
          >
            <Icon name={p.action.icon ?? 'star'} size={16} />
            {p.action.label}
          </button>
        )}
        {p.note && (
          <p className="flex items-start gap-1.5 rounded-sm bg-status-danger-tint px-2 py-1.5 text-small text-text-primary">
            <Icon name="circle-alert" size={14} className="mt-0.5 text-status-danger" />
            {p.note}
          </p>
        )}
      </div>
      <button
        type="button"
        aria-label={t('common.more')}
        onClick={p.onMore}
        className="relative z-10 -my-1 inline-flex size-12 shrink-0 items-center justify-center self-start rounded-pill text-icon-primary focus-visible:outline-none focus-visible:shadow-focus"
      >
        <Icon name="more-horizontal" size={20} />
      </button>
    </article>
  );
}
