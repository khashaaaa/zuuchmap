import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LOCALES, DEFAULT_LOCALE, resources, flattenTranslations } from './index.js';
import { PRICE_UNITS, ERROR_CODES } from '../enums/index.js';

const flat = Object.fromEntries(LOCALES.map((l) => [l, flattenTranslations(resources[l].translation)]));
// i18next plural forms differ per language (en _one/_other, ru adds _few/_many, mn has none).
const baseKey = (k: string) => k.replace(/_(zero|one|two|few|many|other)$/, '');
const bases = (l: (typeof LOCALES)[number]) => new Set(Object.keys(flat[l]).map(baseKey));

test('defaults', () => {
  assert.deepEqual([...LOCALES], ['mn', 'en', 'zh', 'ru']);
  assert.equal(DEFAULT_LOCALE, 'mn');
  assert.deepEqual(Object.keys(resources), ['mn', 'en', 'zh', 'ru']);
});

test('every locale has exactly en\'s key set (plural suffixes aside)', () => {
  const en = bases('en');
  for (const l of LOCALES) {
    const have = bases(l);
    assert.deepEqual([...en].filter((k) => !have.has(k)), [], `${l} is missing keys`);
    assert.deepEqual([...have].filter((k) => !en.has(k)), [], `${l} has extra keys`);
  }
  // Non-plural keys must match exactly.
  const plain = (l: (typeof LOCALES)[number]) => Object.keys(flat[l]).filter((k) => baseKey(k) === k).sort();
  for (const l of LOCALES) {
    const enPlain = plain('en').filter((k) => !Object.keys(flat.en).some((x) => x !== k && baseKey(x) === k));
    for (const k of enPlain) assert.ok(k in flat[l], `${l} lacks ${k}`);
  }
});

test('no empty values', () => {
  for (const l of LOCALES) for (const [k, v] of Object.entries(flat[l])) assert.ok(v.trim().length > 0, `${l}.${k}`);
});

test('every PriceUnit has priceUnit.<CODE> in every locale', () => {
  for (const l of LOCALES) for (const u of PRICE_UNITS) assert.ok(flat[l][`priceUnit.${u}`], `${l} priceUnit.${u}`);
});

test('every ERROR_CODE has errors.codes.<CODE> in every locale', () => {
  for (const l of LOCALES) for (const c of ERROR_CODES) assert.ok(flat[l][`errors.codes.${c}`], `${l} errors.codes.${c}`);
});

test('messages.title', () => {
  assert.equal(flat.mn['messages.title'], 'Чат');
  assert.equal(flat.en['messages.title'], 'Messages');
  assert.equal(flat.zh['messages.title'], '消息');
  assert.equal(flat.ru['messages.title'], 'Сообщения');
});
