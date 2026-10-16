import { useTranslation } from 'react-i18next';
import {
  DEFAULT_LOCALE, formatDate, formatInboxStamp, formatPriceParts, formatRelativeAge, formatTime, isLocale, type DateInput, type Locale, type PriceParts, type TFn,
} from '@zuuchmap/core';

export interface Format {
  locale: Locale;
  /** `{amount:'450,000₮', unit:'өдрөөр'}`; null when there is no renderable price. */
  priceParts: (amount: unknown, unit?: string | null) => PriceParts | null;
  /** The bare amount, `450,000₮` — what map pins and totals show. */
  amount: (amount: unknown) => string | null;
  /** "2 цагийн өмнө". */
  age: (at: DateInput) => string;
  /** `HH:MM`. */
  time: (at: DateInput) => string;
  /** `YYYY.MM.DD`. */
  date: (at: DateInput) => string;
  /** Time today, `YYYY.MM.DD` if older. */
  inboxStamp: (at: DateInput) => string;
}

/** The only place web components touch core's display formatters: locale and `t` are bound once. */
export function useFormat(): Format {
  const { t, i18n } = useTranslation();
  const locale = isLocale(i18n.language) ? i18n.language : DEFAULT_LOCALE;
  const tfn = t as unknown as TFn;
  return {
    locale,
    priceParts: (amount, unit) => formatPriceParts(amount, unit, locale),
    amount: (amount) => formatPriceParts(amount, 'TOTAL', locale)?.amount ?? null,
    age: (at) => formatRelativeAge(at as Date | number | string | null | undefined, tfn),
    time: (at) => formatTime(at, locale),
    date: (at) => formatDate(at, locale),
    inboxStamp: (at) => formatInboxStamp(at, locale),
  };
}
