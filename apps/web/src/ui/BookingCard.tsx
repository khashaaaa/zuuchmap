import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { CategoryTile } from './ListingCard';

const TONE: Record<string, string> = {
  PENDING: 'bg-status-warning-tint text-status-warning',
  ACCEPTED: 'bg-status-success-tint text-status-success',
  DECLINED: 'bg-status-danger-tint text-status-danger',
};

export interface BookingCardProps {
  title: string;
  /** The other person, under the title. */
  person?: string;
  photo?: string;
  categoryKey: string;
  categoryIcon?: string;
  status: string;
  statusLabel: string;
  /** "10.20 – 10.22 · 3 өдөр". */
  dates: string;
  /** "1,350,000₮". */
  total?: string;
  onOpen?: () => void;
  /** Details and actions under the summary. */
  children?: ReactNode;
  className?: string;
}

/** One booking, either side: summary on top, the screen's details and actions below. */
export function BookingCard({ title, person, photo, categoryKey, categoryIcon, status, statusLabel, dates, total, onOpen, children, className }: BookingCardProps) {
  const head = (
    <>
      <span className="size-16 shrink-0 overflow-hidden rounded-md bg-bg-surface-sunken">
        {photo ? <img src={photo} alt="" className="size-full object-cover" /> : <CategoryTile categoryKey={categoryKey} icon={categoryIcon} glyph={28} className="size-full" />}
      </span>
      <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
        <span className={cn('mb-1 inline-flex h-6 items-center rounded-tag px-2 text-overline', TONE[status] ?? 'bg-bg-surface-sunken text-text-secondary')}>{statusLabel}</span>
        <span className="max-w-full truncate text-body-bold text-text-primary">{title}</span>
        {person && <span className="truncate text-caption text-text-secondary">{person}</span>}
        <span className="text-caption text-text-secondary">{dates}</span>
        {total && <span className="text-label-strong text-text-primary">{total}</span>}
      </span>
    </>
  );
  return (
    <article className={cn('flex flex-col gap-3 rounded-xl border border-border-subtle bg-bg-surface p-4', className)}>
      {onOpen ? (
        <button type="button" onClick={onOpen} className="flex w-full items-start gap-3 rounded-lg text-left focus-visible:outline-none focus-visible:shadow-focus">{head}</button>
      ) : (
        <div className="flex items-start gap-3">{head}</div>
      )}
      {children}
    </article>
  );
}
