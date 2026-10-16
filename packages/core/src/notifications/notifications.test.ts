import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NOTIFICATION_KINDS } from '../api/index.js';
import { LOCALES, translator } from '../i18n/index.js';
import { notificationCopy, notificationTarget, notificationWebPath } from './index.js';

test('Figma I3 sentences render from data', () => {
  const t = translator('mn');
  assert.equal(
    notificationCopy({ kind: 'BOOKING_REQUESTED', data: { name: 'Бат-Эрдэнэ', start_date: '2026-10-12', end_date: '2026-10-14' } }, t).body,
    'Бат-Эрдэнэ 10.12–10.14-нд захиалга илгээлээ.',
  );
  assert.equal(
    notificationCopy({ kind: 'BOOKING_REMINDER', data: { title: 'Komatsu PC200', start_time: '08:00' } }, t).body,
    'Маргааш 08:00-д Komatsu PC200 захиалга эхэлнэ',
  );
  assert.equal(
    notificationCopy({ kind: 'SAVED_SEARCH_MATCH', data: { query: 'экскаватор · Хан-Уул', count: 3 } }, t).body,
    '“экскаватор · Хан-Уул” хайлтад 3 шинэ зар.',
  );
  assert.equal(notificationCopy({ kind: 'LISTING_REJECTED', data: { reason: 'үнээ засна уу.' } }, t).body, 'Зар татгалзсан: үнээ засна уу.');
  assert.equal(
    notificationCopy({ kind: 'PAYMENT_PAID', data: { payment_kind: 'FEATURED', title: 'Komatsu PC200', until: '2026-10-15T10:00:00Z' } }, t).body,
    '“Komatsu PC200” 2026.10.15 хүртэл онцлогдоно.',
  );
});

test('every kind renders a title and body in every locale, with no key or placeholder left', () => {
  for (const l of LOCALES) {
    const t = translator(l);
    for (const kind of NOTIFICATION_KINDS) {
      const c = notificationCopy({ kind, data: { title: 'X', name: 'N', preview: 'p', reason: 'r', start_date: '2026-01-02', start_time: '09:00', query: 'q', count: 2, days_left: 3, rating: 5, body: 'b', amount: 35000, until: '2026-10-15' } }, t);
      for (const s of [c.title, c.body]) {
        assert.ok(s && !s.startsWith('notif.') && !s.includes('{{'), `${l} ${kind}: ${s}`);
      }
    }
  }
});

test('targets and web paths', () => {
  assert.equal(notificationWebPath(notificationTarget({ kind: 'LISTING_REJECTED', data: { post_id: 7, field_key: 'price' } })), '/provider/listings/7/edit?field=price');
  assert.equal(notificationWebPath(notificationTarget({ kind: 'BOOKING_CANCELLED', data: { role: 'PROVIDER' } })), '/requests');
  assert.equal(notificationWebPath(notificationTarget({ kind: 'BOOKING_CANCELLED', data: { role: 'CUSTOMER' } })), '/bookings');
  assert.equal(notificationWebPath(notificationTarget({ kind: 'MESSAGE_CREATED', data: { conversation_id: 'c1' } })), '/messages/c1');
});
