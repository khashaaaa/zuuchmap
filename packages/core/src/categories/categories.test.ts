import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CATEGORY_KEYS, FAMILIES, FAMILY_KEYS, familyOf, categoryIconFallback, listingHealth } from './index.js';
import { LOCALES } from '../i18n/index.js';

test('families partition the 13 categories', () => {
  assert.equal(CATEGORY_KEYS.length, 13);
  assert.equal(new Set(CATEGORY_KEYS).size, 13);
  assert.equal(familyOf('vehiclerent'), 'EQUIPMENT_VEHICLES');
  assert.equal(familyOf('factory'), 'MATERIALS_PRODUCTION');
  assert.equal(familyOf('sos'), 'SERVICES');
  assert.equal(familyOf('jobvacancy'), 'JOBS');
  assert.equal(familyOf('nope'), undefined);
  assert.equal(familyOf(null), undefined);
});

test('family icons and labels', () => {
  assert.deepEqual(FAMILY_KEYS.map((f) => FAMILIES[f].icon), ['truck', 'package', 'wrench', 'briefcase']);
  for (const f of FAMILY_KEYS) for (const l of LOCALES) assert.ok(FAMILIES[f].labels[l]);
});

test('categoryIconFallback', () => {
  const shipped = new Set(['hammer', 'truck']);
  assert.equal(categoryIconFallback('hammer', 'sos', shipped), 'hammer');
  assert.equal(categoryIconFallback('car-outline', 'sos', shipped), 'wrench');
  assert.equal(categoryIconFallback(null, 'jobvacancy', shipped), 'briefcase');
  assert.equal(categoryIconFallback('x', 'unknown', shipped), 'package');
  assert.equal(categoryIconFallback('hammer', 'sos', ['hammer']), 'hammer');
});

test('listingHealth: weights, redistributed price, heaviest gap first', () => {
  const schema = { has_price: true, fields: [{ key: 'manufacturer', required: true }, { key: 'year' }] };
  const full = listingHealth({ imageCount: 5, attributes: { manufacturer: 'Komatsu' }, details: 'x'.repeat(120), price: 450000, schema });
  assert.deepEqual(full, { score: 100, missing: [], hint: null });
  const bare = listingHealth({ schema });
  assert.equal(bare.score, 0);
  assert.deepEqual(bare.missing, ['photos', 'attributes', 'details', 'price']);
  const noPrice = listingHealth({ imageCount: 5, attributes: {}, details: 'x'.repeat(120), schema: { has_price: false, fields: [] } });
  assert.equal(noPrice.score, 100);
  assert.equal(listingHealth({ imageCount: 3, attributes: { manufacturer: 'K' }, details: 'x'.repeat(120), price: 1, schema }).hint, 'photos');
});
