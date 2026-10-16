import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nearestPlace, PROVINCE_CODES, DISTRICT_CODES, PROVINCE_NAMES, DISTRICT_NAMES, PRICE_UNITS, ERROR_CODES, isErrorCode, REPORT_REASONS } from './index.js';

test('place names cover every code with mn and en', () => {
  assert.equal(PROVINCE_CODES.length, 22);
  assert.equal(DISTRICT_CODES.length, 9);
  for (const c of PROVINCE_CODES) assert.ok(PROVINCE_NAMES[c].mn && PROVINCE_NAMES[c].en, c);
  for (const c of DISTRICT_CODES) assert.ok(DISTRICT_NAMES[c].mn && DISTRICT_NAMES[c].en, c);
});

test('price units, report reasons, error codes', () => {
  assert.equal(PRICE_UNITS.length, 11);
  assert.equal(REPORT_REASONS.length, 11);
  assert.equal(ERROR_CODES.length, new Set(ERROR_CODES).size);
  assert.ok(ERROR_CODES.length >= 46);
  assert.ok(ERROR_CODES.every((c) => /^[A-Z][A-Z0-9]*(_[A-Z0-9]+)+$/.test(c)));
  assert.equal(isErrorCode('BOOKING_OVERLAP'), true);
  assert.equal(isErrorCode('nope'), false);
});

test('nearestPlace: a point resolves to its aimag, or to Ulaanbaatar with its district', () => {
  assert.deepEqual(nearestPlace(47.905, 106.86), { province: 'ULAANBAATAR', district: 'BAYANGOL' });
  assert.deepEqual(nearestPlace(47.88, 106.9), { province: 'ULAANBAATAR', district: 'KHANUUL' });
  assert.deepEqual(nearestPlace(49.03, 104.08), { province: 'ORKHON', district: null }); // Erdenet
  assert.deepEqual(nearestPlace(43.57, 104.42), { province: 'UMNUGOVI', district: null }); // Dalanzadgad
});
