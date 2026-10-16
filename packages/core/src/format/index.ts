// Pure display formatting, assembled by hand: React Native's Android engine ships
// without full ICU, so any locale-driven formatting API silently falls back to
// en-US there.

import { FORMAT_DEFAULT_LOCALE as DEFAULT_LOCALE, FORMAT_LABELS, type FormatLocale as Locale } from './labels.js';

/** An i18next-style resolver. */
export type TFn = (key: string, options?: { count?: number }) => string;

export type DateInput = string | number | Date | null | undefined;

const DATE_SEPARATOR = '.';
const DASH = '—';
const lookup = (locale: Locale, group: 'priceUnit', key: string): string | undefined =>
  FORMAT_LABELS[locale]?.[group]?.[key];

/** `common.invalidDate` in the given locale, from core's own resources. */
const invalidLabel = (locale: Locale): string =>
  FORMAT_LABELS[locale]?.invalidDate ?? FORMAT_LABELS[DEFAULT_LOCALE].invalidDate;

const pad2 = (n: number): string => String(n).padStart(2, '0');

const toDate = (value: DateInput): Date | null => {
  if (value === null || value === undefined || value === '') return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

const ymd = (d: Date): string => [d.getFullYear(), pad2(d.getMonth() + 1), pad2(d.getDate())].join(DATE_SEPARATOR);
const hm = (d: Date): string => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;

/**
 * `YYYY.MM.DD`, in the runtime's LOCAL time zone by design (as the original app
 * and web helpers); the engine runs with TZ=Asia/Ulaanbaatar. A missing value is an em dash; an unparseable one is `invalid`. */
export const formatDate = (value: DateInput, locale: Locale = DEFAULT_LOCALE): string => {
  if (!value) return DASH;
  const d = toDate(value);
  return d ? ymd(d) : invalidLabel(locale);
};

/** `HH:MM`, 24-hour. */
export const formatTime = (value: DateInput, locale: Locale = DEFAULT_LOCALE): string => {
  if (!value) return DASH;
  const d = toDate(value);
  return d ? hm(d) : invalidLabel(locale);
};

/** `YYYY.MM.DD – YYYY.MM.DD`, both ends in full. */
export const formatDateRange = (start: DateInput, end: DateInput, locale: Locale = DEFAULT_LOCALE): string =>
  `${formatDate(start, locale)} – ${formatDate(end, locale)}`;

/**
 * "just now" · "5 min ago" · "3 h ago" · "2 d ago", through `t` with the keys
 * `provider.draftJustNow|draftMinutesAgo|draftHoursAgo|draftDaysAgo`.
 */
export const formatRelativeAge = (savedAt: Date | number | string | null | undefined, t: TFn, now: number = Date.now()): string => {
  // An ISO string from the API parses as a date; a bare number (or numeric string) is epoch ms.
  const at = savedAt instanceof Date ? savedAt.getTime() : typeof savedAt === 'string' && !/^\d+$/.test(savedAt) ? Date.parse(savedAt) : Number(savedAt);
  if (!at || Number.isNaN(at)) return t('provider.draftJustNow');
  const mins = Math.max(0, Math.round((now - at) / 60000));
  if (mins < 1) return t('provider.draftJustNow');
  if (mins < 60) return t('provider.draftMinutesAgo', { count: mins });
  const hours = Math.round(mins / 60);
  if (hours < 24) return t('provider.draftHoursAgo', { count: hours });
  return t('provider.draftDaysAgo', { count: Math.round(hours / 24) });
};

/** An inbox row's stamp: the time for today, the date for anything older. */
export const formatInboxStamp = (value: DateInput, locale: Locale = DEFAULT_LOCALE, now: Date = new Date()): string => {
  if (!value) return '';
  const d = toDate(value);
  if (!d) return invalidLabel(locale);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return d >= startOfToday ? hm(d) : ymd(d);
};

/** A notification row's stamp: `HH:MM · YYYY.MM.DD`, both halves always. */
export const formatNotificationStamp = (value: DateInput, locale: Locale = DEFAULT_LOCALE): string => {
  if (!value) return '';
  return `${formatTime(value, locale)} · ${formatDate(value, locale)}`;
};

// --- Prices ---

/** Thousand separators by hand: `1234567` -> `1,234,567`. */
export const groupThousands = (digits: string | number | null | undefined): string =>
  String(digits ?? '').replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/** A price is renderable only if it is a real, non-zero number (Postgres decimals arrive as strings). */
const priceValue = (priceAmount: unknown): number | null => {
  if (!priceAmount) return null;
  const amount = Number(priceAmount);
  return Number.isNaN(amount) ? null : amount;
};

const wholeTugriks = (amount: number): string => groupThousands(Math.round(amount));

/**
 * `priceUnit.<CODE>` in `locale`, read from core's bundled resources so a caller
 * cannot forget to supply it. An optional `t` overrides the lookup. An unknown
 * code falls back to the code itself.
 */
export const getPriceUnitLabel = (priceUnit: string | null | undefined, locale: Locale = DEFAULT_LOCALE, t?: TFn): string => {
  if (!priceUnit) return '';
  if (t) {
    const key = `priceUnit.${priceUnit}`;
    const label = t(key);
    if (label && label !== key) return label;
  }
  return lookup(locale, 'priceUnit', priceUnit) ?? priceUnit;
};

/** `450,000₮/өдрөөр` (no space, as the app renders it); a `TOTAL` price is the bare amount. Null when there is no renderable price. */
export const formatPrice = (priceAmount: unknown, priceUnit?: string | null, locale: Locale = DEFAULT_LOCALE, t?: TFn): string | null => {
  const amount = priceValue(priceAmount);
  if (amount === null) return null;
  const formatted = `${wholeTugriks(amount)}₮`;
  if (priceUnit === 'TOTAL') return formatted;
  const unitLabel = getPriceUnitLabel(priceUnit, locale, t);
  return unitLabel ? `${formatted}/${unitLabel}` : formatted;
};

export interface PriceParts { amount: string; unit: string | null }

/** Amount and unit split for weighted display (a client may render "/ unit"). A `TOTAL` price has no unit. */
export const formatPriceParts = (priceAmount: unknown, priceUnit?: string | null, locale: Locale = DEFAULT_LOCALE, t?: TFn): PriceParts | null => {
  const amount = priceValue(priceAmount);
  if (amount === null) return null;
  const formatted = `${wholeTugriks(amount)}₮`;
  if (priceUnit === 'TOTAL') return { amount: formatted, unit: null };
  return { amount: formatted, unit: getPriceUnitLabel(priceUnit, locale, t) || null };
};

// --- Distance and dates-first search ---

/** `1.2 км` under 10 km, `12 км` above, `850 м` under 1 km; null for an unknown distance. */
export const formatDistance = (meters: number | null | undefined, locale: Locale = DEFAULT_LOCALE): string | null => {
  if (meters === null || meters === undefined || !Number.isFinite(meters) || meters < 0) return null;
  const u = FORMAT_LABELS[locale]?.distance ?? FORMAT_LABELS[DEFAULT_LOCALE].distance;
  if (meters < 1000) return `${Math.round(meters)} ${u.m}`;
  const km = meters / 1000;
  return `${km < 10 ? km.toFixed(1) : String(Math.round(km))} ${u.km}`;
};

/** Road speed the SOS ETA assumes, km/h: city traffic with a tow truck or a fuel run. */
export const ETA_ROAD_SPEED_KMH = 25;

/** Minutes to cover `meters` at `ETA_ROAD_SPEED_KMH`, never under 5; null for an unknown distance. */
export const estimateEtaMinutes = (meters: number | null | undefined, speedKmh = ETA_ROAD_SPEED_KMH): number | null => {
  if (meters === null || meters === undefined || !Number.isFinite(meters) || meters < 0) return null;
  return Math.max(5, Math.round(((meters / 1000) / speedKmh) * 60 / 5) * 5);
};

/** Calendar days in an inclusive `YYYY-MM-DD` range (10.12–10.14 = 3); 0 when either end is missing or reversed. */
export const countDays = (from: string | null | undefined, to: string | null | undefined): number => {
  if (!from || !to) return 0;
  const a = Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10));
  const b = Date.UTC(+to.slice(0, 4), +to.slice(5, 7) - 1, +to.slice(8, 10));
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return 0;
  return Math.round((b - a) / 86_400_000) + 1;
};

/** A per-day price times the chosen days; null for any other unit, so a card never multiplies a monthly rate. */
export const priceForDays = (priceAmount: unknown, priceUnit: string | null | undefined, days: number): number | null => {
  if (priceUnit !== 'DAY' || days < 1) return null;
  const amount = priceValue(priceAmount);
  return amount === null ? null : amount * days;
};

/**
 * Which `deal.reply*` phrase a reply time reads as, for `deal.replyTime` ("Ихэвчлэн 2 цагт
 * хариулдаг"): minutes under an hour, hours under two days, then days.
 */
export const replyTimeKey = (minutes: number): { key: 'deal.replyMinutes' | 'deal.replyHours' | 'deal.replyDays'; count: number } => {
  if (minutes < 60) return { key: 'deal.replyMinutes', count: Math.max(1, Math.round(minutes)) };
  if (minutes < 48 * 60) return { key: 'deal.replyHours', count: Math.round(minutes / 60) };
  return { key: 'deal.replyDays', count: Math.round(minutes / 1440) };
};

/** What a booking is worth to its provider: the per-day total, else the quoted price (one trip, one project). */
export const bookingValue = (b: { total: number | null; price_amount: unknown }): number => b.total ?? priceValue(b.price_amount) ?? 0;

/** How a person is named everywhere (the engine's notification copy agrees): the company when there is one, else "parent given", else `fallback`. */
export const displayName = (
  u: { company?: { name?: string | null } | null; parent_name?: string | null; given_name?: string | null } | null | undefined,
  fallback = '',
): string => u?.company?.name || [u?.parent_name, u?.given_name].filter(Boolean).join(' ') || fallback;
