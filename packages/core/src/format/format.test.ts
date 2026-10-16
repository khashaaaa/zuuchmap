import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  replyTimeKey, displayName,
  groupThousands, formatPrice, formatPriceParts, formatDate, formatTime,
  formatDateRange, formatRelativeAge, formatInboxStamp, formatNotificationStamp, formatDistance, estimateEtaMinutes, countDays, priceForDays, type TFn,
} from './index.js';
import { FORMAT_LABELS } from './labels.js';
import { resources, flattenTranslations, LOCALES } from '../i18n/index.js';
import { PRICE_UNITS } from '../enums/index.js';

const UNITS = ['HOUR', 'MOTO_HOUR', 'DAY', 'WEEK', 'MONTH', 'PROJECT', 'UNIT', 'PIECE', 'SQM', 'TRIP', 'TOTAL'];
// Known units resolve to a sentinel; unknown ones echo the key (i18next's miss).
const t: TFn = (key) => {
  const code = key.split('.').pop() ?? '';
  return UNITS.includes(code) ? `UNIT:${code}` : key;
};

test('groupThousands', () => {
  assert.equal(groupThousands(450000), '450,000');
  assert.equal(groupThousands(1234567), '1,234,567');
  assert.equal(groupThousands(999), '999');
  assert.equal(groupThousands(null), '');
});

test('formatPrice fixtures', () => {
  const cases: Array<[unknown, string | null | undefined, string | null]> = [
    [250000, 'HOUR', '250,000₮/UNIT:HOUR'],
    ['250000.00', 'DAY', '250,000₮/UNIT:DAY'],
    [250000, 'TOTAL', '250,000₮'],
    [1234567, 'MOTO_HOUR', '1,234,567₮/UNIT:MOTO_HOUR'],
    [0, 'DAY', null],
    [null, 'DAY', null],
    [undefined, 'DAY', null],
    ['', 'DAY', null],
    ['abc', 'DAY', null],
    [NaN, 'DAY', null],
    [-5000, 'DAY', '-5,000₮/UNIT:DAY'],
    ['1e3', 'DAY', '1,000₮/UNIT:DAY'],
    ['250000.60', 'DAY', '250,001₮/UNIT:DAY'],
    ['0.40', 'DAY', '0₮/UNIT:DAY'],
    [250000, 'ZZZ_UNKNOWN', '250,000₮/ZZZ_UNKNOWN'],
    [250000, null, '250,000₮'],
    [250000, undefined, '250,000₮'],
  ];
  for (const [amount, unit, want] of cases) assert.equal(formatPrice(amount, unit, 'mn', t), want, `${String(amount)} ${String(unit)}`);
  assert.equal(formatPrice(450000), '450,000₮');
  assert.equal(formatPrice(450000, 'DAY'), '450,000₮/өдрөөр');
  assert.equal(formatPrice(450000, 'DAY', 'en'), '450,000₮/per day');
  assert.equal(formatPrice(450000, 'ZZZ'), '450,000₮/ZZZ');
});

test('formatPriceParts: TOTAL carries no unit', () => {
  assert.deepEqual(formatPriceParts(250000, 'TOTAL', 'mn', t), { amount: '250,000₮', unit: null });
  assert.deepEqual(formatPriceParts(250000, 'DAY', 'mn', t), { amount: '250,000₮', unit: 'UNIT:DAY' });
  assert.deepEqual(formatPriceParts(250000, null, 'mn', t), { amount: '250,000₮', unit: null });
  assert.equal(formatPriceParts('abc', 'DAY', 'mn', t), null);
});

test('dates and times', () => {
  const d = new Date(2026, 7, 4, 9, 5);
  assert.equal(formatDate(d), '2026.08.04');
  assert.equal(formatTime(d), '09:05');
  assert.equal(formatDate('2026-08-24T00:00:00'), '2026.08.24');
  assert.equal(formatDate(null), '—');
  assert.equal(formatDate(''), '—');
  assert.equal(formatDate('garbage'), 'Буруу огноо');
  assert.equal(formatDate('garbage', 'en'), 'Invalid date');
  assert.equal(formatTime(new Date(2026, 0, 1, 20, 47)), '20:47');
  assert.equal(formatTime('garbage', 'ru'), 'Неверная дата');
  assert.equal(
    formatDateRange(new Date(2026, 7, 4), new Date(2026, 7, 9)),
    '2026.08.04 – 2026.08.09',
  );
});

test('formatRelativeAge', () => {
  const spy: TFn = (key, o) => `${key}${o?.count !== undefined ? `:${o.count}` : ''}`;
  const MIN = 60000;
  const now = 1_800_000_000_000;
  const age = (v: unknown) => formatRelativeAge(v as number, spy, now);
  assert.equal(age(now), 'provider.draftJustNow');
  assert.equal(age(now - 29000), 'provider.draftJustNow');
  assert.equal(age(now - MIN), 'provider.draftMinutesAgo:1');
  assert.equal(age(now - 59 * MIN), 'provider.draftMinutesAgo:59');
  assert.equal(age(now - 60 * MIN), 'provider.draftHoursAgo:1');
  assert.equal(age(now - 23 * 60 * MIN), 'provider.draftHoursAgo:23');
  assert.equal(age(now - 24 * 60 * MIN), 'provider.draftDaysAgo:1');
  assert.equal(age(now - 9 * 24 * 60 * MIN), 'provider.draftDaysAgo:9');
  assert.equal(age(now + 10 * MIN), 'provider.draftJustNow');
  for (const v of [null, undefined, 0, 'garbage']) assert.equal(age(v), 'provider.draftJustNow');
  assert.equal(age(new Date(now - 5 * MIN)), 'provider.draftMinutesAgo:5');
});

test('inbox and notification stamps', () => {
  const now = new Date(2026, 9, 15, 15, 0);
  assert.equal(formatInboxStamp(new Date(2026, 9, 15, 9, 5), 'mn', now), '09:05');
  assert.equal(formatInboxStamp(new Date(2026, 9, 15, 0, 0), 'mn', now), '00:00');
  assert.equal(formatInboxStamp(new Date(2026, 9, 14, 23, 59), 'mn', now), '2026.10.14');
  assert.equal(formatInboxStamp('2026-01-05T14:32:00', 'mn', now), '2026.01.05');
  assert.equal(formatInboxStamp(null), '');
  assert.equal(formatInboxStamp('', 'mn'), '');
  assert.equal(formatInboxStamp('garbage', 'zh'), '日期无效');
  assert.equal(formatNotificationStamp(new Date(2026, 0, 5, 14, 32)), '14:32 · 2026.01.05');
  assert.equal(formatNotificationStamp(null), '');
  assert.equal(formatNotificationStamp(0), '');
});

test('labels.ts equals the i18n resources (no drift)', () => {
  assert.deepEqual(Object.keys(FORMAT_LABELS), [...LOCALES]);
  for (const l of LOCALES) {
    const flat = flattenTranslations(resources[l].translation);
    assert.equal(FORMAT_LABELS[l].invalidDate, flat['common.invalidDate'], `${l} invalidDate`);
    assert.equal(FORMAT_LABELS[l].distance.km, flat['common.distanceKm'], `${l} km`);
    assert.equal(FORMAT_LABELS[l].distance.m, flat['common.distanceM'], `${l} m`);
    assert.deepEqual(Object.keys(FORMAT_LABELS[l].priceUnit).sort(), [...PRICE_UNITS].sort());
    for (const u of PRICE_UNITS) assert.equal(FORMAT_LABELS[l].priceUnit[u], flat[`priceUnit.${u}`], `${l} ${u}`);
  }
});

test('distance, ETA, days and totals', () => {
  assert.equal(formatDistance(1234), '1.2 км');
  assert.equal(formatDistance(4000, 'en'), '4.0 km');
  assert.equal(formatDistance(12_600, 'ru'), '13 км');
  assert.equal(formatDistance(850, 'zh'), '850 米');
  assert.equal(formatDistance(null), null);
  assert.equal(formatDistance(-1), null);
  assert.equal(estimateEtaMinutes(1800), 5);
  assert.equal(estimateEtaMinutes(6250), 15);
  assert.equal(estimateEtaMinutes(null), null);
  assert.equal(countDays('2026-10-12', '2026-10-14'), 3);
  assert.equal(countDays('2026-10-12', '2026-10-12'), 1);
  assert.equal(countDays('2026-10-14', '2026-10-12'), 0);
  assert.equal(countDays(null, '2026-10-12'), 0);
  assert.equal(priceForDays('450000.00', 'DAY', 3), 1_350_000);
  assert.equal(priceForDays(450000, 'MONTH', 3), null);
  assert.equal(priceForDays(null, 'DAY', 3), null);
});

test('replyTimeKey: minutes, then hours, then days', () => {
  assert.deepEqual(replyTimeKey(0), { key: 'deal.replyMinutes', count: 1 });
  assert.deepEqual(replyTimeKey(45), { key: 'deal.replyMinutes', count: 45 });
  assert.deepEqual(replyTimeKey(120), { key: 'deal.replyHours', count: 2 });
  assert.deepEqual(replyTimeKey(47 * 60), { key: 'deal.replyHours', count: 47 });
  assert.deepEqual(replyTimeKey(3 * 1440), { key: 'deal.replyDays', count: 3 });
});

test('formatRelativeAge reads ISO strings as dates, not as just now', () => {
  const t: TFn = (k, o) => `${k}:${String((o as { count?: number } | undefined)?.count ?? '')}`;
  const now = Date.parse('2026-10-15T12:00:00Z');
  assert.equal(formatRelativeAge('2026-10-15T10:00:00.000Z', t, now), 'provider.draftHoursAgo:2');
  assert.equal(formatRelativeAge(String(now - 5 * 60000), t, now), 'provider.draftMinutesAgo:5');
  assert.equal(formatRelativeAge('not a date', t, now), 'provider.draftJustNow:');
});

test('displayName: company, else "parent given" (a provider too), else the fallback', () => {
  assert.equal(displayName({ company: { name: 'Хүнд Техник ХХК' }, parent_name: 'Д.', given_name: 'Ганбат' }), 'Хүнд Техник ХХК');
  assert.equal(displayName({ company: null, parent_name: 'Дорж', given_name: 'Ганбат' }), 'Дорж Ганбат');
  assert.equal(displayName({ parent_name: null, given_name: 'Ганбат' }), 'Ганбат');
  assert.equal(displayName({ parent_name: null, given_name: null }, '99120000'), '99120000');
  assert.equal(displayName(null), '');
});
