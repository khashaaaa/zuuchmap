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

/**
 * `HH:MM`, 24-hour — the same rule `formatDate` follows, and for the same
 * reason.
 *
 * Kept here rather than inline in the two screens that need it so the web has
 * something to be checked against: its copies went through `toLocaleTimeString`
 * and rendered `08:47 PM` for the message this returns `20:47` for. Mongolia
 * writes time in 24 hours.
 */
export const formatTime = (value) => {
    if (!value) return '—';
    try {
        const d = new Date(value);
        if (isNaN(d.getTime())) return i18n.t('common.invalidDate');
        return [String(d.getHours()).padStart(2, '0'), String(d.getMinutes()).padStart(2, '0')].join(':');
    } catch (error) {
        logger.error('Time formatting error:', error);
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

/**
 * "just now" · "5 min ago" · "3 h ago" · "2 d ago".
 *
 * Coarse buckets on purpose — nobody reading a banner needs seconds. Lifted out
 * of `DraftResumeBanner` so the web has something to be checked against: it
 * rendered the same stored draft as an absolute `09/11, 14:32` through
 * `toLocaleString`, so one device told you *when* you stopped typing and the
 * other told you *how long ago*, for the same draft.
 *
 * Takes `t` rather than reaching for the module-level i18n so the caller's
 * render subscribes to a locale change the way every other string on the screen
 * does.
 */
export const formatRelativeAge = (savedAt, t) => {
    const at = savedAt instanceof Date ? savedAt.getTime() : Number(savedAt);
    if (!at || Number.isNaN(at)) return t('provider.draftJustNow');
    const mins = Math.max(0, Math.round((Date.now() - at) / 60000));
    if (mins < 1) return t('provider.draftJustNow');
    if (mins < 60) return t('provider.draftMinutesAgo', { count: mins });
    const hours = Math.round(mins / 60);
    if (hours < 24) return t('provider.draftHoursAgo', { count: hours });
    return t('provider.draftDaysAgo', { count: Math.round(hours / 24) });
};

// --- Price formatting ---

export const getPriceUnitLabel = (priceUnit) => {
    if (!priceUnit) return '';
    return i18n.t(`priceUnit.${priceUnit}`, { defaultValue: priceUnit });
};

/**
 * Thousand separators, built by hand.
 *
 * The last Intl call left in the display path, and it was the one that mattered
 * most: `toLocaleString('mn-MN')` on Android, where JSC ships no full ICU,
 * silently resolves to en-US. It happens to group the same way today, so the
 * behavioural `check:sync` fixtures agreed under Node's full ICU and would have
 * gone on agreeing right up until an ICU or engine update moved mn-MN to a
 * space separator on one platform only — the same "agree by coincidence" the
 * `formatDate` comment above refuses. A price is the single number on the card
 * a provider is trusting us with; it does not get to depend on that.
 *
 * `TextInput` already grouped its currency field this way for exactly this
 * reason. This is that rule, in one place, imported by both.
 */
export const groupThousands = (digits) => {
    // Block-bodied, like every other helper `check:sync` lifts out of this file.
    return String(digits ?? '').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
};

/**
 * A price is renderable only if it is a real, non-zero number. `price_amount`
 * arrives as a Postgres decimal string, so a malformed row coerces to NaN;
 * both clients return null and the caller hides the line.
 */
const priceValue = (priceAmount) => {
    if (!priceAmount) return null;
    const amount = Number(priceAmount);
    return Number.isNaN(amount) ? null : amount;
};

// The .00 tail of a Postgres decimal has no business on screen, and no listing
// is priced in fractions of a tugrik.
const wholeTugriks = (amount) => {
    return groupThousands(Math.round(amount));
};

export const formatPrice = (priceAmount, priceUnit) => {
    const amount = priceValue(priceAmount);
    if (amount === null) return null;
    const formattedAmount = wholeTugriks(amount);
    // A total (sale) price is the whole amount — a "/unit" suffix would misread as recurring
    if (priceUnit === 'TOTAL') return `${formattedAmount}₮`;
    const unitLabel = getPriceUnitLabel(priceUnit);
    return unitLabel ? `${formattedAmount}₮/${unitLabel}` : `${formattedAmount}₮`;
};

/**
 * The price split into amount and unit so a display can weight them
 * differently — a big amount with a quiet unit above or beside it. Same rules
 * as `formatPrice`, including the one that matters: a TOTAL price has **no**
 * unit at all, so a caller cannot label a sale price "нийт" and have it read as
 * a rate. The listing detail screens on both clients used to build this split
 * inline, and the app's showed that label where the web's suppressed it.
 */
export const formatPriceParts = (priceAmount, priceUnit) => {
    const amount = priceValue(priceAmount);
    if (amount === null) return null;
    const formatted = `${wholeTugriks(amount)}₮`;
    if (priceUnit === 'TOTAL') return { amount: formatted, unit: null };
    const unitLabel = getPriceUnitLabel(priceUnit);
    return { amount: formatted, unit: unitLabel || null };
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
