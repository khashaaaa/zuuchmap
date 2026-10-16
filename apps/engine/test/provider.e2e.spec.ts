/**
 * Phase 6 engine: contacts (one per viewer per kind per day, never the owner), the 7-day
 * performance against the 7 before, the provider home, booking value, and companies (one per
 * account, providers only, verification dropped by a name/registration change, public on every
 * listing owner).
 */
import '../src/config/load-env';
import { randomInt } from 'node:crypto';
import type { Server } from 'node:http';
import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getDataSourceToken, TypeOrmModule } from '@nestjs/typeorm';
import request from 'supertest';
import type { DataSource } from 'typeorm';
import type { BookingValue, Company, Listing, ListingPerformanceDetail, MyCompanyResponse, MyListingStats, MyPerformance, ProviderHome } from '@zuuchmap/core';
import { AUTH_CONFIG, authConfigFromEnv, type AuthConfig } from '../src/auth/auth.config';
import { AuthModule } from '../src/auth/auth.module';
import { openSession } from '../src/auth/request-user';
import { BookingModule } from '../src/booking/booking.module';
import { CategoryModule } from '../src/category/category.module';
import { CategoryService } from '../src/category/category.service';
import { ChatModule } from '../src/chat/chat.module';
import { AllExceptionsFilter } from '../src/common/all-exceptions.filter';
import { CompanyModule } from '../src/company/company.module';
import { dataSourceOptions } from '../src/database/data-source';
import { addDays, ulaanbaatarDate } from '../src/post/availability.service';
import { PostModule } from '../src/post/post.module';
import { ProviderModule } from '../src/provider/provider.module';
import { RedisModule } from '../src/redis/redis.module';
import { ReviewModule } from '../src/review/review.module';
import { UserModule } from '../src/user/user.module';

let app: INestApplication;
let ds: DataSource;
let cfg: AuthConfig;
const phones = Array.from({ length: 3 }, () => `7${String(randomInt(1_000_000, 10_000_000))}`);
const ids = { provider: '', customer: '', other: '' };
const auth = {} as Record<keyof typeof ids, { Authorization: string }>;
let live: number;
let rejected: number;
let expiring: number;
const http = (): ReturnType<typeof request> => request(app.getHttpServer() as Server);
const body = (res: { body: unknown }): Record<string, unknown> => res.body as Record<string, unknown>;

async function insertPost(title: string, extra: Record<string, unknown> = {}): Promise<number> {
  const cols = { user_id: ids.provider, title, category: 'machineryrent', subcategory: 'excavator', province: 'ULAANBAATAR', price_amount: 450000, price_unit: 'DAY', approval_status: 'APPROVED', status: 'ACTIVE', expires_at: new Date(Date.now() + 20 * 86_400_000), ...extra };
  const keys = Object.keys(cols);
  const rows = await ds.query<Array<{ id: number }>>(
    `INSERT INTO posts (${keys.join(', ')}) VALUES (${keys.map((_, i) => `$${String(i + 1)}`).join(', ')}) RETURNING id`,
    Object.values(cols),
  );
  return rows[0].id;
}

beforeAll(async () => {
  cfg = { ...authConfigFromEnv(), devMode: true, adminPhones: [] };
  const mod = await Test.createTestingModule({
    imports: [
      TypeOrmModule.forRoot({ ...dataSourceOptions(), autoLoadEntities: true }),
      RedisModule, AuthModule, UserModule, CategoryModule, PostModule, ChatModule, BookingModule, ReviewModule, CompanyModule, ProviderModule,
    ],
  }).overrideProvider(AUTH_CONFIG).useValue(cfg).compile();
  app = mod.createNestApplication();
  app.setGlobalPrefix('api');
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.init();
  ds = app.get<DataSource>(getDataSourceToken());
  await app.get(CategoryService).seed();
  const rows = await ds.query<Array<{ id: string; phone_number: string }>>(
    `INSERT INTO users (phone_number, is_verified, type, given_name) VALUES ($1, true, 'PROVIDER', 'Бат'), ($2, true, 'CUSTOMER', 'Ганбат'), ($3, true, 'CUSTOMER', 'Сараа') RETURNING id, phone_number`,
    phones,
  );
  const byPhone = new Map(rows.map((r) => [r.phone_number, r.id]));
  for (const [i, k] of (['provider', 'customer', 'other'] as const).entries()) {
    ids[k] = byPhone.get(phones[i]) as string;
    auth[k] = { Authorization: `Bearer ${await openSession(ds, ids[k], cfg)}` };
  }
  live = await insertPost('Komatsu PC200 экскаватор');
  rejected = await insertPost('Кран 25 тн', { approval_status: 'REJECTED', rejection_reason: 'Үнэ буруу', rejection_field: 'price_amount' });
  expiring = await insertPost('Самосвал HOWO', { expires_at: new Date(Date.now() + 2 * 86_400_000) });
});

afterAll(async () => {
  const all = Object.values(ids);
  await ds.query('DELETE FROM bookings WHERE provider_id = ANY($1::uuid[])', [all]);
  await ds.query('DELETE FROM posts WHERE user_id = ANY($1::uuid[])', [all]);
  await ds.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [all]);
  await app.close();
});

describe('contacts', () => {
  it('one call per viewer per day; the owner and an unidentifiable guest never count', async () => {
    const call = (h: Record<string, string>) => http().post(`/api/posts/${String(live)}/contact`).set(h).send({ kind: 'CALL' });
    expect(body(await call(auth.customer).expect(200)).recorded).toBe(true);
    expect(body(await call(auth.customer).expect(200)).recorded).toBe(false);
    expect(body(await call(auth.provider).expect(200)).recorded).toBe(false);
    expect(body(await call({ 'X-Visitor-Id': 'device-1' }).expect(200)).recorded).toBe(true);
    expect(body(await call({ 'X-Visitor-Id': 'device-1' }).expect(200)).recorded).toBe(false);
    await http().post(`/api/posts/${String(live)}/contact`).send({ kind: 'CHAT' }).expect(400);
    await http().post('/api/posts/999999999/contact').send({ kind: 'CALL' }).expect(404);
  });

  it('opening a Чат and requesting a booking are contacts too', async () => {
    await http().post('/api/conversations').set(auth.other).send({ post_id: live, body: 'Сайн уу' }).expect(200);
    await http().post('/api/bookings').set(auth.other).send({ post_id: live, start_date: addDays(ulaanbaatarDate(), 2), end_date: addDays(ulaanbaatarDate(), 3) }).expect(201);
    const kinds = await ds.query<Array<{ kind: string }>>('SELECT kind FROM post_contacts WHERE post_id = $1 AND user_id = $2 ORDER BY kind', [live, ids.other]);
    expect(kinds.map((k) => k.kind)).toEqual(['BOOKING', 'CHAT']);
    const stats = body(await http().get('/api/posts/mine/stats').set(auth.provider).expect(200)) as unknown as MyListingStats;
    expect(stats.posts.find((p) => p.id === live)?.contacts).toBe(4);
  });
});

describe('performance', () => {
  it('compares the last 7 days with the 7 before', async () => {
    await ds.query(
      `INSERT INTO post_views (post_id, visitor_key, counted, date_viewed)
       SELECT $1, 'pv-' || g, true, now() - make_interval(days => CASE WHEN g <= 5 THEN 2 ELSE 9 END) FROM generate_series(1, 8) g`,
      [live],
    );
    await ds.query(`INSERT INTO post_views (post_id, visitor_key, counted, date_viewed) VALUES ($1, 'pv-old', true, now() - interval '20 days'), ($1, 'pv-owner', false, now())`, [live]);
    const mine = body(await http().get('/api/posts/mine/performance').set(auth.provider).expect(200)) as unknown as MyPerformance;
    const row = mine.posts.find((p) => p.id === live);
    expect(mine.days).toBe(7);
    expect(row?.current).toMatchObject({ views: 5, contacts: 4, booking_requests: 1 });
    expect(row?.previous.views).toBe(3);
    expect(mine.posts[0].id).toBe(live);
    expect(mine.totals.current.views).toBe(5);

    const one = body(await http().get(`/api/posts/${String(live)}/performance`).set(auth.provider).expect(200)) as unknown as ListingPerformanceDetail;
    expect(one).toMatchObject({ id: live, pending_requests: 1, days: 7 });
    expect(one.days_left).toBeGreaterThanOrEqual(19);
    expect(body(await http().get(`/api/posts/${String(live)}/performance`).set(auth.customer).expect(403)).code).toBe('NOT_POST_OWNER');
  });
});

describe('provider home and booking value', () => {
  it('collects requests, chats, fixes, expiring listings, reviews and this month', async () => {
    const before = body(await http().get('/api/provider/home').set(auth.provider).expect(200)) as unknown as ProviderHome;
    expect(before.pending_requests.count).toBe(1);
    expect(before.pending_requests.oldest_at).not.toBeNull();
    expect(before.unread_chats.count).toBe(1);
    const pending = (await ds.query<Array<{ id: number }>>(`SELECT id FROM bookings WHERE post_id = $1 AND status = 'PENDING'`, [live]))[0].id;
    await http().put(`/api/bookings/${String(pending)}/accept`).set(auth.provider).expect(200);
    await ds.query(`INSERT INTO reviews (provider_id, author_id, rating) VALUES ($1, $2, 5)`, [ids.provider, ids.customer]);
    const home = body(await http().get('/api/provider/home').set(auth.provider).expect(200)) as unknown as ProviderHome;
    expect(home.pending_requests.count).toBe(0);
    // Accepting wrote a step into the thread, and writing in a thread reads it.
    expect(home.unread_chats.count).toBe(0);
    expect(home.to_fix).toEqual([{ id: rejected, title: 'Кран 25 тн', rejection_reason: 'Үнэ буруу', rejection_field: 'price_amount', revision: false }]);
    expect(home.expiring.map((e) => e.id)).toEqual([expiring]);
    expect(home.unanswered_reviews).toBe(1);
    // The account screen's numbers ride along, so it needs no other request.
    expect(home.rating).toEqual({ average: 5, count: 1 });
    expect(home.company).toBeNull();
    expect(home.listings.total).toBeGreaterThanOrEqual(home.listings.live);
    expect(home.plan).toMatchObject({ name: 'FREE' });
    const month = addDays(ulaanbaatarDate(), 2).slice(0, 7);
    if (month === ulaanbaatarDate().slice(0, 7)) expect(home.booking_value).toMatchObject({ count: 1, total: 900000 });

    const value = body(await http().get(`/api/bookings/value?month=${month}`).set(auth.provider).expect(200)) as unknown as BookingValue;
    expect(value).toMatchObject({ month, count: 1, total: 900000 });
    expect(value.items[0].role).toBe('PROVIDER');
    await http().get('/api/bookings/value?month=2026-13').set(auth.provider).expect(400);
  });
});

describe('companies', () => {
  it('providers only, one per account; editing the name drops verification; public on listings', async () => {
    expect(body(await http().get('/api/company/mine').set(auth.provider).expect(200)) as unknown as MyCompanyResponse).toEqual({ company: null });
    expect(body(await http().post('/api/company').set(auth.customer).send({ name: 'Ганбат ХХК' }).expect(403)).code).toBe('PROVIDER_ONLY');
    await http().post('/api/company').set(auth.provider).send({ name: '   ' }).expect(400);
    await http().post('/api/company').set(auth.provider).send({ name: 'Х', service_area: ['MARS'] }).expect(400);
    const made = body(await http().post('/api/company').set(auth.provider).send({ name: 'Хүнд Техник ХХК', registration_number: '6123457', phone_number: '99112233', service_area: ['ULAANBAATAR', 'TUV', 'TUV'] }).expect(201)) as unknown as Company;
    expect(made).toMatchObject({ name: 'Хүнд Техник ХХК', registration_number: '6123457', service_area: ['ULAANBAATAR', 'TUV'], is_verified: false });
    expect(body(await http().post('/api/company').set(auth.provider).send({ name: 'Second' }).expect(409)).code).toBe('COMPANY_EXISTS');

    await ds.query('UPDATE companies SET is_verified = true WHERE id = $1', [made.id]);
    const desc = body(await http().patch('/api/company').set(auth.provider).send({ description: 'Оператортой' }).expect(200)) as unknown as Company;
    expect(desc.is_verified).toBe(true);
    const renamed = body(await http().patch('/api/company').set(auth.provider).send({ name: 'Хүнд Техник Групп' }).expect(200)) as unknown as Company;
    expect(renamed.is_verified).toBe(false);

    const detail = body(await http().get(`/api/posts/${String(live)}`).expect(200)) as unknown as Listing;
    expect(detail.user?.company).toMatchObject({ name: 'Хүнд Техник Групп', description: 'Оператортой' });
    expect(detail.user?.company).not.toHaveProperty('registration_number');
    const seller = body(await http().get(`/api/sellers/${ids.provider}`).expect(200));
    expect((seller.user as { company: { service_area: string[] } }).company.service_area).toEqual(['ULAANBAATAR', 'TUV']);
  });
});
