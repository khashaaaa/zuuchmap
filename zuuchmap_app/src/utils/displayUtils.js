import { logger } from './logger';
import i18n from '../i18n';


export const getProvinceLabel = (provinceCode) => {
    if (!provinceCode) return i18n.t('common.locationUnknown');
    return i18n.t(`province.${provinceCode}`, { defaultValue: provinceCode });
};

export const getDistrictLabel = (districtCode) => {
    if (!districtCode) return '';
    return i18n.t(`district.${districtCode}`, { defaultValue: districtCode });
};

// --- Date formatting ---
//
// `YYYY.MM.DD` — the Mongolian convention, and the same string the web client
// produces via toLocaleDateString('mn-MN'). The two used to disagree: a booking
// window read 2026.08.24 on the web and 2026-08-24 in the app. Built by hand
// rather than through Intl because React Native's JSC ships without full ICU on
// Android, so a locale-driven format would silently fall back to en-US there.
const DATE_SEPARATOR = '.';

const parts = (dateString) => {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return null;
    return {
        date,
        y: date.getFullYear(),
        m: String(date.getMonth() + 1).padStart(2, '0'),
        d: String(date.getDate()).padStart(2, '0'),
    };
};

export const formatDate = (dateString) => {
    // An em dash, matching the web client: a missing date is a blank, not a
    // claim that the value is unknown.
    if (!dateString) return '—';
    try {
        const p = parts(dateString);
        if (!p) return i18n.t('common.invalidDate');
        return [p.y, p.m, p.d].join(DATE_SEPARATOR);
    } catch (error) {
        logger.error('Date formatting error:', error);
        return i18n.t('common.invalidDate');
    }
};

export const formatDateTime = (dateString) => {
    if (!dateString) return '—';
    try {
        const p = parts(dateString);
        if (!p) return i18n.t('common.invalidDate');
        const hours = String(p.date.getHours()).padStart(2, '0');
        const minutes = String(p.date.getMinutes()).padStart(2, '0');
        return `${[p.y, p.m, p.d].join(DATE_SEPARATOR)} ${hours}:${minutes}`;
    } catch (error) {
        logger.error('DateTime formatting error:', error);
        return i18n.t('common.invalidDate');
    }
};

// --- Price formatting ---

export const getPriceUnitLabel = (priceUnit) => {
    if (!priceUnit) return '';
    return i18n.t(`priceUnit.${priceUnit}`, { defaultValue: priceUnit });
};

export const formatPrice = (priceAmount, priceUnit) => {
    if (!priceAmount) return null;
    // price_amount arrives as a Postgres decimal string ("250000.00"); coerce
    // before formatting so thousands-grouping applies and the .00 tail is dropped.
    const amount = Number(priceAmount);
    if (Number.isNaN(amount)) return null;
    const formattedAmount = amount.toLocaleString('mn-MN', { maximumFractionDigits: 0 });
    // A total (sale) price is the whole amount — a "/unit" suffix would misread as recurring
    if (priceUnit === 'TOTAL') return `${formattedAmount}₮`;
    const unitLabel = getPriceUnitLabel(priceUnit);
    return unitLabel ? `${formattedAmount}₮/${unitLabel}` : `${formattedAmount}₮`;
};

// --- Localized sorting ---

// Mongolian Cyrillic collation order. Ө sits after О and Ү after У, which no
// byte order and no ASCII transliteration gets right: the province codes are
// Latin (`UMNUGOVI`, `KHENTII`, `ZAVKHAN`), so rendering them in declaration
// order put Хэнтий · Ховд · Хөвсгөл ahead of Өмнөговь and left Завхан last —
// 22 chips in no order a reader can scan.
//
// Deliberately NOT Intl/localeCompare: RN's JSC ships no full ICU on Android,
// so a locale-driven comparator silently degrades to code-point order there —
// the same reason formatDate is hand-rolled.
//
// Non-Cyrillic characters (Latin, digits, Han) rank after the alphabet by code
// point, so en/zh labels still come out in a stable, sensible order.
const MN_ALPHABET = 'абвгдеёжзийклмноөпрстуүфхцчшщъыьэюя';
const MN_RANK = new Map([...MN_ALPHABET].map((ch, i) => [ch, i]));
// Separators sort ahead of every letter, so Баян-Өлгий precedes Баянхонгор.
const SEPARATORS = { '-': -3, '\u2013': -3, ' ': -2, "'": -1 };
const rank = (ch) =>
  SEPARATORS[ch] ?? MN_RANK.get(ch) ?? MN_ALPHABET.length + ch.codePointAt(0);

export const compareLocalized = (a, b) => {
  const x = String(a ?? '').toLowerCase();
  const y = String(b ?? '').toLowerCase();
  const n = Math.min(x.length, y.length);
  for (let i = 0; i < n; i += 1) {
    const d = rank(x[i]) - rank(y[i]);
    if (d !== 0) return d;
  }
  return x.length - y.length;
};

/**
 * Codes ordered by how their labels actually read in the active locale.
 * `pinned` keeps a few codes at the head regardless — Ulaanbaatar carries most
 * of the listings and belongs at the top of a province list, not filed under У.
 */
export const sortByLabel = (codes, label, pinned = []) => {
  const head = pinned.filter((c) => codes.includes(c));
  const tail = codes.filter((c) => !head.includes(c));
  return [...head, ...tail.sort((a, b) => compareLocalized(label(a), label(b)))];
};
