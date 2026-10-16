import { useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { DEFAULT_LOCALE, formatDate, formatDateRange, isLocale } from '@zuuchmap/core';
import { cn } from '@/lib/cn';
import { IconButton } from './IconButton';

/** Local calendar day as `YYYY-MM-DD`. Never parsed through `new Date(string)` (that is UTC). */
export type DayKey = string;

export interface DateRange {
  start?: DayKey;
  end?: DayKey;
}

export interface DateRangeCalendarProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
  /** Days that are already booked: struck through and unselectable. */
  booked?: readonly DayKey[];
  /** The provider's own closed days: shown apart from bookings and selectable only through `onBlockedClick`. */
  blocked?: readonly DayKey[];
  onBlockedClick?: (day: DayKey) => void;
  /** Replaces the two default legend lines. */
  legend?: ReactNode;
  /** First selectable day; defaults to today. */
  min?: DayKey;
  /** Month shown first; defaults to the start of the range, then today. */
  month?: DayKey;
  className?: string;
}

const pad = (n: number) => String(n).padStart(2, '0');
const keyOf = (d: Date): DayKey => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dateOf = (k: DayKey): Date => {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const addDays = (k: DayKey, n: number): DayKey => {
  const d = dateOf(k);
  d.setDate(d.getDate() + n);
  return keyOf(d);
};

const BAND = 'var(--color-action-primary-tint)';
/** Booked days are hatched, not just struck through. */
const STRIPES = 'repeating-linear-gradient(135deg, transparent 0 3px, var(--color-border-default) 3px 4px)';

export function DateRangeCalendar({ value, onChange, booked = [], blocked = [], onBlockedClick, legend, min, month, className }: DateRangeCalendarProps) {
  const { t, i18n } = useTranslation();
  const locale = isLocale(i18n.language) ? i18n.language : DEFAULT_LOCALE;
  const today = keyOf(new Date());
  const first = min ?? today;
  const bookedSet = useMemo(() => new Set(booked), [booked]);
  const blockedSet = useMemo(() => new Set(blocked), [blocked]);
  const [view, setView] = useState(() => {
    const d = dateOf(month ?? value.start ?? today);
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [focusKey, setFocusKey] = useState<DayKey>(value.start ?? today);
  const grid = useRef<HTMLDivElement>(null);

  const { start, end } = value;
  const weekdays = [1, 2, 3, 4, 5, 6, 7].map((n) => t(`kit.calendar.wd${n}`));

  // Weeks start Monday.
  const lead = (view.getDay() + 6) % 7;
  const daysInMonth = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
  const rows = Math.ceil((lead + daysInMonth) / 7);
  const cells = Array.from({ length: rows * 7 }, (_, i) => keyOf(new Date(view.getFullYear(), view.getMonth(), 1 - lead + i)));
  const viewMonth = view.getMonth();

  const disabled = (k: DayKey) => k < first || bookedSet.has(k) || (blockedSet.has(k) && !onBlockedClick) || dateOf(k).getMonth() !== viewMonth;
  const bookedBetween = (a: DayKey, b: DayKey) => booked.some((k) => k > a && k < b);

  const pick = (k: DayKey) => {
    if (blockedSet.has(k) && onBlockedClick && !disabled(k)) {
      onBlockedClick(k);
      return;
    }
    if (disabled(k)) return;
    if (!start || end) onChange({ start: k });
    else if (k < start || bookedBetween(start, k)) onChange({ start: k });
    else onChange({ start, end: k });
  };

  const shiftMonth = (n: number) => setView(new Date(view.getFullYear(), view.getMonth() + n, 1));

  const moveFocus = (k: DayKey) => {
    const d = dateOf(k);
    if (d.getMonth() !== viewMonth || d.getFullYear() !== view.getFullYear()) setView(new Date(d.getFullYear(), d.getMonth(), 1));
    setFocusKey(k);
    requestAnimationFrame(() => grid.current?.querySelector<HTMLElement>(`[data-day="${k}"]`)?.focus());
  };

  const onKey = (e: KeyboardEvent, k: DayKey) => {
    const step: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (e.key in step) {
      e.preventDefault();
      moveFocus(addDays(k, step[e.key]));
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      const dow = (dateOf(k).getDay() + 6) % 7;
      moveFocus(addDays(k, e.key === 'Home' ? -dow : 6 - dow));
    } else if (e.key === 'PageUp' || e.key === 'PageDown') {
      e.preventDefault();
      const d = dateOf(k);
      d.setMonth(d.getMonth() + (e.key === 'PageUp' ? -1 : 1));
      moveFocus(keyOf(d));
    }
  };

  const monthLabel = formatDate(view, locale).slice(0, 7);
  // The tab stop: the focused day if it is on screen, else the first selectable one.
  const tabStop = cells.includes(focusKey) && dateOf(focusKey).getMonth() === viewMonth ? focusKey : cells.find((k) => dateOf(k).getMonth() === viewMonth);

  return (
    <div className={cn('flex w-full max-w-[358px] flex-col gap-3 rounded-xl bg-bg-surface p-4', className)}>
      <div className="flex items-center">
        <IconButton icon="chevron-left" label={t('kit.calendar.prev')} variant="ghost" size="medium" onClick={() => shiftMonth(-1)} />
        <p aria-live="polite" className="flex-1 text-center text-title text-text-primary">{monthLabel}</p>
        <IconButton icon="chevron-right" label={t('kit.calendar.next')} variant="ghost" size="medium" onClick={() => shiftMonth(1)} />
      </div>
      <div ref={grid} role="grid" aria-label={monthLabel} className="flex flex-col gap-0.5">
        <div role="row" className="grid grid-cols-7">
          {weekdays.map((w) => (
            <span key={w} role="columnheader" className="flex h-6 items-center justify-center text-small text-text-tertiary">{w}</span>
          ))}
        </div>
        {Array.from({ length: rows }, (_, r) => (
          <div key={r} role="row" className="grid grid-cols-7">
            {cells.slice(r * 7, r * 7 + 7).map((k) => {
              const inMonth = dateOf(k).getMonth() === viewMonth;
              const isBooked = bookedSet.has(k);
              const isBlocked = !isBooked && blockedSet.has(k);
              const isStart = k === start;
              const isEnd = k === end;
              const between = !!start && !!end && k > start && k < end;
              const off = disabled(k);
              const selected = isStart || isEnd;
              const band =
                isStart && end && end > start!
                  ? `linear-gradient(to right, transparent 50%, ${BAND} 50%)`
                  : isEnd && start && end! > start
                    ? `linear-gradient(to left, transparent 50%, ${BAND} 50%)`
                    : undefined;
              const label = formatDate(dateOf(k), locale) + (isBooked ? `, ${t('kit.status.busy')}` : isBlocked ? `, ${t('prov.block.blocked')}` : '');
              return (
                <div
                  key={k}
                  role="gridcell"
                  aria-selected={inMonth ? selected || between : undefined}
                  className={cn('flex h-11 items-center justify-center', between && 'bg-action-primary-tint')}
                  style={band ? { backgroundImage: band } : undefined}
                >
                  {inMonth && (
                    <button
                      type="button"
                      data-day={k}
                      tabIndex={k === tabStop ? 0 : -1}
                      aria-label={label}
                      aria-disabled={off || undefined}
                      onClick={() => pick(k)}
                      style={!selected && isBooked ? { backgroundImage: STRIPES } : undefined}
                      onKeyDown={(e) => onKey(e, k)}
                      onFocus={() => setFocusKey(k)}
                      className={cn(
                        'flex size-10 items-center justify-center rounded-pill text-label focus-visible:outline-none focus-visible:shadow-focus',
                        selected && 'bg-action-secondary text-label-strong text-action-on-secondary',
                        !selected && isBooked && 'text-text-secondary line-through',
                        !selected && isBlocked && 'bg-status-warning-tint text-status-warning',
                        !selected && !isBooked && off && 'cursor-not-allowed text-text-disabled',
                        !selected && !off && !isBlocked && 'text-text-primary',
                        !selected && k === today && 'border border-border-strong',
                      )}
                    >
                      {dateOf(k).getDate()}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-1">
        {start && end && (
          <p aria-live="polite" className="text-label-strong text-text-primary">{formatDateRange(dateOf(start), dateOf(end), locale)}</p>
        )}
        {legend ?? (
          <>
            <p className="text-small text-text-secondary">{t('kit.calendar.legendBooked')}</p>
            <p className="text-small text-text-secondary">{t('kit.calendar.legendPick')}</p>
          </>
        )}
      </div>
    </div>
  );
}
