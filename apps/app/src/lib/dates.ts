import { formatDate, type Locale } from '@zuuchmap/core';

const p2 = (n: number) => String(n).padStart(2, '0');

/** Local calendar day as `YYYY-MM-DD` (what the engine takes). */
export const toYmd = (d: Date): string => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
export const fromYmd = (s: string): Date => new Date(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
export const addDays = (d: Date, n: number): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/** "10.12" from the core formatter's `2026.10.12`. */
export const shortDate = (ymd: string, locale: Locale): string => formatDate(fromYmd(ymd), locale).slice(5);
/** "10.12 – 10.14" */
export const shortRange = (from: string, to: string, locale: Locale): string =>
  from === to ? shortDate(from, locale) : `${shortDate(from, locale)} – ${shortDate(to, locale)}`;

export type QuickRange = 'today' | 'tomorrow' | 'weekend' | 'week';
export function quickRange(kind: QuickRange, now = new Date()): [Date, Date] {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (kind) {
    case 'today': return [today, today];
    case 'tomorrow': return [addDays(today, 1), addDays(today, 1)];
    case 'week': return [today, addDays(today, 6)];
    case 'weekend': {
      const dow = today.getDay(); // 0 Sun .. 6 Sat
      if (dow === 6) return [today, addDays(today, 1)];
      if (dow === 0) return [today, today];
      const sat = addDays(today, 6 - dow);
      return [sat, addDays(sat, 1)];
    }
  }
}
