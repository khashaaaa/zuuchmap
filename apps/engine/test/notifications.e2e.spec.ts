/**
 * Phase 7: every event reaches a phone (Expo), a browser (web push) and an e-mail-only account,
 * in the language of the device or account; the centre stores it; the Figma I6 switches silence a
 * topic's push and e-mail but never the centre; dead tokens are dropped; saved-search matches fold
 * into one unread row.
 */
import '../src/config/load-env';
import { randomInt } from 'node:crypto';
import type { Server } from 'node:http';
import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getDataSourceToken, TypeOrmModule } from '@nestjs/typeorm';
import request from 'supertest';
import type { DataSource } from 'typeorm';
import type { AppNotification, Badges, Booking, NotificationSettings } from '@zuuchmap/core';
import { AUTH_CONFIG, authConfigFromEnv, type AuthConfig } from '../src/auth/auth.config';
import { AuthModule } from '../src/auth/auth.module';
import { openSession } from '../src/auth/request-user';
import { BookingModule } from '../src/booking/booking.module';
import { CategoryModule } from '../src/category/category.module';
import { CategoryService } from '../src/category/category.service';
import { ChatModule } from '../src/chat/chat.module';
import { AllExceptionsFilter } from '../src/common/all-exceptions.filter';
import { dataSourceOptions } from '../src/database/data-source';
import { NotificationModule } from '../src/notification/notification.module';
import { NotificationService } from '../src/notification/notification.service';
import { NOTIFY_TRANSPORTS, type NotifyTransports, type OutboundMail, type OutboundPush } from '../src/notification/transports';
import { addDays, ulaanbaatarDate } from '../src/post/availability.service';
import { InMemoryListingEvents, LISTING_EVENTS, type ListingEvent } from '../src/post/listing-events';
import { PostModule } from '../src/post/post.module';
import { RedisModule } from '../src/redis/redis.module';
import { ReviewModule } from '../src/review/review.module';
import { UserModule } from '../src/user/user.module';

const pushed: OutboundPush[] = [];
const mailed: OutboundMail[] = [];
const deadTokens = new Set<string>();
let failMail = 0;
const fake: NotifyTransports = {
  push: (messages) => {
    pushed.push(...messages);
    return Promise.resolve({ dead: messages.map((m) => m.token).filter((t) => deadTokens.has(t)) });
  },
  mail: (m) => {
    if (failMail > 0) {
      failMail--;
      return Promise.reject(new Error('smtp down'));
    }
    mailed.push(m);
    return Promise.resolve();
  },
  webPushKey: 'BTestVapidKey',
  mailEnabled: true,
};

let app: INestApplication;
let ds: DataSource;
let svc: NotificationService;
let bus: InMemoryListingEvents;
const phones = Array.from({ length: 4 }, () => `6${String(randomInt(1_000_000, 10_000_000))}`);
const ids: Record<'provider' | 'customer' | 'emailOnly' | 'admin', string> = { provider: '', customer: '', emailOnly: '', admin: '' };
const auth: Record<keyof typeof ids, { Authorization: string }> = {} as never;
const http = (): ReturnType<typeof request> => request(app.getHttpServer() as Server);
const day = (n: number): string => addDays(ulaanbaatarDate(), n);
const expoToken = `ExponentPushToken[test-${String(randomInt(1e9))}]`;
const webEndpoint = `https://fcm.googleapis.com/fcm/send/test-${String(randomInt(1e9))}`;
let rental: number;

const reset = (): void => {
  pushed.length = 0;
  mailed.length = 0;
};
const settle = (): Promise<void> => svc.drain();
const centre = async (who: keyof typeof ids): Promise<AppNotification[]> =>
  (await http().get('/api/notifications').set(auth[who]).expect(200)).body as AppNotification[];

async function insertPost(title: string, category: string, subcategory: string): Promise<number> {
  const rows = await ds.query<Array<{ id: number }>>(
    `INSERT INTO posts (user_id, title, category, subcategory, province, price_amount, price_unit, contact_phone, approval_status, status)
     VALUES ($1, $2, $3, $4, 'ULAANBAATAR', 450000, 'DAY', '88112233', 'APPROVED', 'ACTIVE') RETURNING id`,
    [ids.provider, title, category, subcategory],
  );
  return rows[0].id;
}

beforeAll(async () => {
  const cfg: AuthConfig = { ...authConfigFromEnv(), devMode: true, adminPhones: [phones[3]] };
  bus = new InMemoryListingEvents();
  const mod = await Test.createTestingModule({
    imports: [
      TypeOrmModule.forRoot({ ...dataSourceOptions(), autoLoadEntities: true }),
      RedisModule, AuthModule, UserModule, CategoryModule, PostModule, ChatModule, BookingModule, ReviewModule, NotificationModule,
    ],
  })
    .overrideProvider(AUTH_CONFIG).useValue(cfg)
    .overrideProvider(LISTING_EVENTS).useValue(bus)
    .overrideProvider(NOTIFY_TRANSPORTS).useValue(fake)
    .compile();
  app = mod.createNestApplication();
  app.setGlobalPrefix('api');
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.init();
  ds = app.get<DataSource>(getDataSourceToken());
  svc = app.get(NotificationService);
  await app.get(CategoryService).seed();
  const rows = await ds.query<Array<{ id: string; phone_number: string }>>(
    `INSERT INTO users (phone_number, is_verified, type, given_name, parent_name, email) VALUES
       ($1, true, 'PROVIDER', 'Бат-Эрдэнэ', 'Ц.', NULL),
       ($2, true, 'CUSTOMER', 'Ганбат', 'Д.', NULL),
       ($3, true, 'CUSTOMER', 'Сарнай', NULL, 'sarnai@example.com'),
       ($4, true, 'CUSTOMER', 'Админ', NULL, NULL)
     RETURNING id, phone_number`,
    phones,
  );
  const byPhone = new Map(rows.map((r) => [r.phone_number, r.id]));
  for (const [i, k] of (['provider', 'customer', 'emailOnly', 'admin'] as const).entries()) {
    ids[k] = byPhone.get(phones[i]) as string;
    auth[k] = { Authorization: `Bearer ${await openSession(ds, ids[k], cfg)}` };
  }
  rental = await insertPost('Komatsu PC200 экскаватор', 'machineryrent', 'excavator');
});

afterAll(async () => {
  const all = Object.values(ids);
  await ds.query('DELETE FROM conversations WHERE customer_id = ANY($1::uuid[]) OR provider_id = ANY($1::uuid[])', [all]);
  await ds.query('DELETE FROM bookings WHERE customer_id = ANY($1::uuid[]) OR provider_id = ANY($1::uuid[])', [all]);
  await ds.query('DELETE FROM posts WHERE user_id = ANY($1::uuid[])', [all]);
  await ds.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [all]);
  await app.close();
});

describe('devices', () => {
  it('registers a phone and a browser, refuses a malformed one, and serves the VAPID key unauthenticated', async () => {
    await http().post('/api/notifications/devices').set(auth.provider).send({ provider: 'EXPO', token: expoToken, locale: 'en', platform: 'android' }).expect(200);
    await http().post('/api/notifications/devices').set(auth.customer).send({ provider: 'WEB', token: webEndpoint, keys: { p256dh: 'p', auth: 'a' } }).expect(200);
    await http().post('/api/notifications/devices').set(auth.customer).send({ provider: 'WEB', token: 'https://x.example/no-keys' }).expect(400);
    await http().post('/api/notifications/devices').set(auth.customer).send({ provider: 'EXPO', token: 'not-a-token' }).expect(400);
    await http().post('/api/notifications/devices').send({ provider: 'EXPO', token: expoToken }).expect(401);
    expect((await http().get('/api/notifications/vapid-key').expect(200)).body).toEqual({ key: 'BTestVapidKey' });
    // The provider's device language becomes the account's e-mail language.
    const s = (await http().get('/api/notifications/settings').set(auth.provider).expect(200)).body as NotificationSettings;
    expect(s).toEqual({ topics: { chat: true, booking: true, saved_search: true, news: true }, locale: 'en', email: null });
  });
});

describe('fan-out', () => {
  let booking: Booking;

  it('a booking request reaches the provider’s phone in its language and lands in the centre with the Figma sentence', async () => {
    reset();
    booking = (await http().post('/api/bookings').set(auth.customer).send({ post_id: rental, start_date: day(10), end_date: day(12), start_time: '08:00' }).expect(201)).body as Booking;
    await settle();
    const toProvider = pushed.filter((p) => p.token === expoToken);
    expect(toProvider).toHaveLength(1);
    expect(toProvider[0]).toMatchObject({ provider: 'EXPO', title: 'New booking request', data: { kind: 'BOOKING_REQUESTED', url: '/requests' } });
    expect(toProvider[0].body).toContain('Д. Ганбат');
    // The booking step posted into Чат is not pushed a second time as a message.
    expect(pushed.some((p) => p.data.kind === 'MESSAGE_CREATED')).toBe(false);

    const list = await centre('provider');
    expect(list[0]).toMatchObject({ kind: 'BOOKING_REQUESTED', read_at: null, data: { booking_id: booking.id, name: 'Д. Ганбат', role: 'PROVIDER', start_time: '08:00' } });
    expect(toProvider[0].data.notification_id).toBe(list[0].id);
    const badges = (await http().get('/api/notifications/badges').set(auth.provider).expect(200)).body as Badges;
    expect(badges.notifications).toBe(1);
    expect(badges.chat).toBeGreaterThanOrEqual(1);
    expect(badges.plan).toMatchObject({ name: 'FREE', post_limit: expect.any(Number) as number });
  });

  it('acceptance reaches the customer’s browser in Mongolian, with the provider’s name', async () => {
    reset();
    await http().put(`/api/bookings/${String(booking.id)}/accept`).set(auth.provider).send({}).expect(200);
    await settle();
    const web = pushed.filter((p) => p.provider === 'WEB');
    expect(web).toHaveLength(1);
    expect(web[0]).toMatchObject({ token: webEndpoint, keys: { p256dh: 'p', auth: 'a' }, title: 'Таны захиалга батлагдлаа', body: 'Ц. Бат-Эрдэнэ таны захиалгыг зөвшөөрлөө. Утас нээгдлээ.' });
    expect(web[0].data.url).toBe('/bookings');
  });

  it('a Чат message is pushed under the sender’s name and never stored', async () => {
    reset();
    const before = (await centre('provider')).length;
    await http().post(`/api/conversations/${String(booking.conversation_id)}/messages`).set(auth.customer).send({ body: 'Оператортой юу?' }).expect(201);
    await settle();
    expect(pushed).toHaveLength(1);
    expect(pushed[0]).toMatchObject({ token: expoToken, title: 'Д. Ганбат', body: 'Оператортой юу?', data: { kind: 'MESSAGE_CREATED', notification_id: null } });
    expect(await centre('provider')).toHaveLength(before);
  });

  it('an account with no device gets e-mail in its language; its topic switch silences e-mail but not the centre', async () => {
    reset();
    await http().put('/api/notifications/settings').set(auth.emailOnly).send({ locale: 'ru' }).expect(200);
    bus.emit({ type: 'booking.reminder', booking_id: booking.id, post_id: rental, user_id: ids.emailOnly, title: 'Komatsu PC200', start_date: day(10), start_time: '08:00', address: null });
    await settle();
    expect(pushed).toHaveLength(0);
    expect(mailed).toHaveLength(1);
    expect(mailed[0]).toMatchObject({ to: 'sarnai@example.com', subject: 'Бронирование начинается завтра' });
    // The title is the booking's own copy; this account is not the booking's customer, so it links to requests.
    expect(mailed[0].text).toContain('Komatsu PC200 экскаватор начинается завтра в 08:00');
    expect(mailed[0].html).toContain('http://localhost:5174/requests');

    reset();
    const off = (await http().put('/api/notifications/settings').set(auth.emailOnly).send({ topics: { booking: false } }).expect(200)).body as NotificationSettings;
    expect(off.topics).toEqual({ chat: true, booking: false, saved_search: true, news: true });
    bus.emit({ type: 'booking.reminder', booking_id: booking.id, post_id: rental, user_id: ids.emailOnly, title: 'Komatsu PC200', start_date: day(10), start_time: null, address: null });
    await settle();
    expect(mailed).toHaveLength(0);
    expect((await centre('emailOnly')).filter((n) => n.kind === 'BOOKING_REMINDER')).toHaveLength(2);
    // Moderation has no switch: always delivered.
    bus.emit({ type: 'listing.rejected', post_id: rental, user_id: ids.emailOnly, title: 'X', revision: false, reason: 'үнээ засна уу.', field_key: 'price' });
    await settle();
    expect(mailed).toHaveLength(1);
    expect(mailed[0].html).toContain('/provider/listings/');
  });

  it('a new listing goes to the admins', async () => {
    reset();
    bus.emit({ type: 'listing.submitted', post_id: rental, user_id: ids.provider, title: 'Komatsu PC200 экскаватор', category: 'machineryrent' });
    await settle();
    expect((await centre('admin'))[0]).toMatchObject({ kind: 'LISTING_SUBMITTED', data: { post_id: rental } });
  });

  it('an event outlives a restart and a failed send: the outbox keeps it until the sweep delivers it', async () => {
    const rejected = { type: 'listing.rejected', post_id: rental, user_id: ids.emailOnly, title: 'X', revision: false, reason: 'зураг нэм.', field_key: null };
    const outbox = (): Promise<Array<{ attempts: number; last_error: string | null }>> => ds.query('SELECT attempts, last_error FROM notification_outbox');

    // Suites run serially on one database; earlier suites' leftovers are not this test's.
    await ds.query('DELETE FROM notification_outbox');
    // A worker died mid-send: its claim is stale, the sweep takes the row over.
    reset();
    await ds.query(`INSERT INTO notification_outbox (event, attempts, claimed_at) VALUES ($1, 1, now() - interval '10 minutes')`, [rejected]);
    expect(await svc.sweep()).toBe(1);
    expect(mailed).toHaveLength(1);
    expect(await outbox()).toHaveLength(0);

    // The send failed: the row stays with its error and the next sweep sends it.
    reset();
    failMail = 1;
    bus.emit(rejected as ListingEvent);
    await settle();
    expect(mailed).toHaveLength(0);
    expect(await outbox()).toEqual([{ attempts: 1, last_error: 'smtp down' }]);
    expect(await svc.sweep()).toBe(1);
    expect(mailed).toHaveLength(1);
    expect(await outbox()).toHaveLength(0);

    // A live claim is another worker's: left alone.
    await ds.query('INSERT INTO notification_outbox (event, attempts, claimed_at) VALUES ($1, 1, now())', [rejected]);
    expect(await svc.sweep()).toBe(0);
    await ds.query('DELETE FROM notification_outbox');
  });

  it('saved-search matches fold into one unread row with a count, pushed once', async () => {
    reset();
    await http().post('/api/saved-searches').set(auth.customer).send({ name: 'экскаватор · Хан-Уул', params: { category: 'machineryrent', q: 'экскаватор' }, notify: true }).expect(201);
    const second = await insertPost('Hitachi ZX200 экскаватор', 'machineryrent', 'excavator');
    bus.emit({ type: 'listing.approved', post_id: rental, user_id: ids.provider, title: 'Komatsu PC200 экскаватор', revision: false });
    bus.emit({ type: 'listing.approved', post_id: second, user_id: ids.provider, title: 'Hitachi ZX200 экскаватор', revision: false });
    await settle();
    const rows = (await centre('customer')).filter((n) => n.kind === 'SAVED_SEARCH_MATCH');
    expect(rows).toHaveLength(1);
    expect(rows[0].data).toMatchObject({ count: 2, query: 'экскаватор · Хан-Уул', post_id: second });
    expect(pushed.filter((p) => p.data.kind === 'SAVED_SEARCH_MATCH')).toHaveLength(1);
    // The owner hears about the approval itself.
    expect(pushed.filter((p) => p.token === expoToken && p.data.kind === 'LISTING_APPROVED')).toHaveLength(2);

    // Read, the next match opens a fresh row.
    await http().put('/api/notifications/read').set(auth.customer).send({}).expect(200);
    expect((await http().get('/api/notifications/badges').set(auth.customer).expect(200)).body).toMatchObject({ notifications: 0, plan: null });
    bus.emit({ type: 'listing.approved', post_id: second, user_id: ids.provider, title: 'Hitachi ZX200 экскаватор', revision: false });
    await settle();
    expect((await centre('customer')).filter((n) => n.kind === 'SAVED_SEARCH_MATCH').map((n) => n.data.count)).toEqual([1, 2]);
  });

  it('a token the push service calls gone is dropped', async () => {
    deadTokens.add(expoToken);
    bus.emit({ type: 'listing.expired', post_id: rental, user_id: ids.provider, title: 'Komatsu PC200 экскаватор' });
    await settle();
    expect(await ds.query('SELECT 1 FROM push_devices WHERE token = $1', [expoToken])).toHaveLength(0);
  });

  it('pages by (created_at, id) and marks one read; another account’s id is ignored', async () => {
    const all = await centre('customer');
    const last = all[all.length - 1];
    const page = (await http().get('/api/notifications').query({ before: all[0].created_at, before_id: all[0].id }).set(auth.customer).expect(200)).body as AppNotification[];
    expect(page.map((n) => n.id)).toEqual(all.slice(1).map((n) => n.id));
    const providerRow = (await centre('provider'))[0];
    await http().put(`/api/notifications/${providerRow.id}/read`).set(auth.customer).expect(200);
    expect((await centre('provider'))[0].read_at).toBeNull();
    await http().put(`/api/notifications/${providerRow.id}/read`).set(auth.provider).expect(200);
    expect((await centre('provider'))[0].read_at).not.toBeNull();
    expect(last).toBeDefined();
  });
});
