import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ANALYTICS_EVENTS } from './index.js';

test('event names are unique snake_case', () => {
  const v = Object.values(ANALYTICS_EVENTS);
  assert.equal(v.length, 12);
  assert.equal(new Set(v).size, 12);
  assert.ok(v.every((e) => /^[a-z]+(_[a-z]+)+$/.test(e)));
});
