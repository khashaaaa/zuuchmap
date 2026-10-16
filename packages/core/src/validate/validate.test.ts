import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateEmail, validatePhone, validateMongolianPhone, normalizeWebsiteUrl } from './index.js';

test('validateEmail', () => {
  assert.equal(validateEmail('a@b.mn'), true);
  assert.equal(validateEmail(' a@b.mn '), true);
  for (const v of ['a@b', 'a b@c.mn', '', null, undefined, 5]) assert.equal(validateEmail(v), false);
});

test('validatePhone', () => {
  assert.equal(validatePhone('99112233'), true);
  assert.equal(validatePhone('+976 9911-2233'), true);
  assert.equal(validatePhone('9911223'), false);
  assert.equal(validatePhone('1234567890123456'), false);
  assert.equal(validatePhone(''), false);
  assert.equal(validatePhone(99112233), false);
  assert.equal(validatePhone('9911223', 7, 8), true);
  assert.equal(validateMongolianPhone('99112233'), true);
  assert.equal(validateMongolianPhone('976 99112233'), false);
});

test('normalizeWebsiteUrl', () => {
  assert.equal(normalizeWebsiteUrl('example.mn'), 'https://example.mn');
  assert.equal(normalizeWebsiteUrl(' HTTP://a.mn '), 'HTTP://a.mn');
  assert.equal(normalizeWebsiteUrl('https://a.mn'), 'https://a.mn');
  assert.equal(normalizeWebsiteUrl('  '), '');
  assert.equal(normalizeWebsiteUrl(null), '');
});
