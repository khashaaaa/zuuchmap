/**
 * Phase 4 engine surface: saved listings (likes) with the guest merge, saved searches with
 * their "N new" and the alert matcher, landing counters, similar listings, and the empty dated
 * browse that offers nearby windows.
 */
import '../src/config/load-env';
import { randomInt } from 'node:crypto';
import type { Server } from 'node:http';
import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getDataSourceToken, TypeOrmModule } from '@nestjs/typeorm';
import request from 'supertest';
import type { DataSource } from 'typeorm';
import type { BrowseResponse, LandingStats, LikeResponse, Listing, ListingListItem, MyListingStats, Paginated, SavedSearch } from '@zuuchmap/core';
import { AUTH_CONFIG, authConfigFromEnv, type AuthConfig } from '../src/auth/auth.config';
import { AuthModule } from '../src/auth/auth.module';
import { openSession } from '../src/auth/request-user';
import { CategoryModule } from '../src/category/category.module';
import { CategoryService } from '../src/category/category.service';
import { AllExceptionsFilter } from '../src/common/all-exceptions.filter';
import { dataSourceOptions } from '../src/database/data-source';
import { PostModule } from '../src/post/post.module';
import { SavedSearchService } from '../src/post/saved-search.service';
import { RedisModule } from '../src/redis/redis.module';
import { UserModule } from '../src/user/user.module';

interface Fixture {
  title: string;
  category: string;
  subcategory: string;
  province: string;
  district?: string;
  price?: number;
  unit?: string;
  attributes?: Record<string, unknown>;
  live?: boolean;
}

const F: Record<string, Fixture> = {
  exc: { title: 'Komatsu PC200 экскаватор', category: 'machineryrent', subcategory: 'excavator', province: 'ULAANBAATAR', district: 'KHANUUL', price: 450000, unit: 'DAY', attributes: { with_operator: true, year: 2019 } },
  excNear: { title: 'Hitachi ZX200 экскаватор', category: 'machineryrent', subcategory: 'excavator', province: 'ULAANBAATAR', district: 'KHANUUL', price: 480000, unit: 'DAY' },
  excFar: { title: 'CAT 320 экскаватор', category: 'machineryrent', subcategory: 'excavator', province: 'ULAANBAATAR', district: 'BAYANZURKH', price: 450000, unit: 'DAY' },
  excCheap: { title: 'Doosan экскаватор', category: 'machineryrent', subcategory: 'excavator', province: 'ULAANBAATAR', district: 'KHANUUL', price: 100000, unit: 'DAY' },
  excOther: { title: 'Volvo экскаватор', category: 'machineryrent', subcategory: 'excavator', province: 'ORKHON', price: 450000, unit: 'DAY' },
  // Same district and amount but priced by the hour: ranks after every day-priced neighbour.
  excHour: { title: 'Sany экскаватор цагаар', category: 'machineryrent', subcategory: 'excavator', province: 'ULAANBAATAR', district: 'KHANUUL', price: 450000, unit: 'HOUR' },
  dozer: { title: 'Shantui бульдозер', category: 'machineryrent', subcategory: 'bulldozer', province: 'TUV', price: 300000, unit: 'DAY' },
  cement: { title: 'Хөтөл цемент', category: 'materialstore', subcategory: 'cement', province: 'DARKHANUUL' },
  lapsed: { title: 'Хуучин экскаватор', category: 'machineryrent', subcategory: 'excavator', province: 'ULAANBAATAR', district: 'KHANUUL', price: 450000, unit: 'DAY', live: false },
};

let app: INestApplication;
let ds: DataSource;
let cfg: AuthConfig;
let ownerId: string;
let customerId: string;
let owner: { Authorization: string };
let customer: { Authorization: string };
const ids: Record<string, number> = {};
const idOf = new Map<number, string>();
const http = (): ReturnType<typeof request> => request(app.getHttpServer() as Server);
const names = (rows: Array<{ id: number }>): string[] => rows.map((r) => idOf.get(r.id) ?? `#${String(r.id)}`);
const phoneA = `7${String(randomInt(1_000_000, 10_000_000))}`;
const phoneB = `7${String(randomInt(1_000_000, 10_000_000))}`;

/** Every fixture title starts with this token so queries can single them out of whatever else the dev DB holds. */
const TOKEN = 'zqx';

async function insertPost(name: string, f: Fixture, userId = ownerId): Promise<number> {
  const rows = await ds.query<Array<{ id: number }>>(
    `INSERT INTO posts (user_id, title, category, subcategory, province, district, attributes, price_amount, price_unit, approval_status, status, latitude, longitude)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'APPROVED',$10, 47.9, 106.9) RETURNING id`,
    [userId, `${TOKEN} ${f.title}`, f.category, f.subcategory, f.province, f.district ?? null, JSON.stringify(f.attributes ?? {}), f.price ?? null, f.unit ?? null, f.live === false ? 'EXPIRED' : 'ACTIVE'],
  );
  ids[name] = rows[0].id;
  idOf.set(rows[0].id, name);
  return rows[0].id;
}

beforeAll(async () => {
  cfg = { ...authConfigFromEnv(), devMode: true, adminPhones: [] };
  const mod = await Test.createTestingModule({
    imports: [TypeOrmModule.forRoot({ ...dataSourceOptions(), autoLoadEntities: true }), RedisModule, AuthModule, UserModule, CategoryModule, PostModule],
  })
    .overrideProvider(AUTH_CONFIG)
    .useValue(cfg)
    .compile();
  app = mod.createNestApplication();
  app.setGlobalPrefix('api');
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.init();
  ds = app.get<DataSource>(getDataSourceToken());
  await app.get(CategoryService).seed();
  const users = await ds.query<Array<{ id: string }>>(
    `INSERT INTO users (phone_number, is_verified, type) VALUES ($1, true, 'PROVIDER'), ($2, true, 'CUSTOMER') RETURNING id`, [phoneA, phoneB],
  );
  ownerId = users[0].id;
  customerId = users[1].id;
  owner = { Authorization: `Bearer ${await openSession(ds, ownerId, cfg)}` };
  customer = { Authorization: `Bearer ${await openSession(ds, customerId, cfg)}` };
  for (const [name, f] of Object.entries(F)) await insertPost(name, f);
});

afterAll(async () => {
  await ds.query('DELETE FROM posts WHERE user_id = ANY($1::uuid[])', [[ownerId, customerId]]);
  await ds.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [[ownerId, customerId]]);
  await app.close();
});

describe('landing stats', () => {
  it('counts live listings only, per family and province', async () => {
    const stats = (await http().get('/api/posts/stats').expect(200)).body as LandingStats;
    const mine = Object.values(F).filter((f) => f.live !== false).length;
    expect(stats.total).toBeGreaterThanOrEqual(mine);
    expect(stats.provinces).toBeGreaterThanOrEqual(4);
    expect(stats.verified_providers).toBe(0);
    expect(stats.reply_hours).toBeNull();
    const equipment = stats.families.find((f) => f.key === 'EQUIPMENT_VEHICLES');
    expect(equipment?.count).toBeGreaterThanOrEqual(6);
    expect(stats.categories.find((c) => c.key === 'materialstore')?.count).toBeGreaterThanOrEqual(1);
    expect(stats.families.reduce((n, f) => n + f.count, 0)).toBe(stats.total);
  });
});

describe('similar listings', () => {
  it('ranks same district, then province, closest price first; never itself or a lapsed one', async () => {
    const rows = (await http().get(`/api/posts/${String(ids.exc)}/similar?limit=20`).expect(200)).body as ListingListItem[];
    const got = names(rows).filter((n) => n in F);
    expect(got).toEqual(['excNear', 'excCheap', 'excHour', 'excFar', 'excOther', 'dozer']);
    expect(got).not.toContain('lapsed');
    expect(got).not.toContain('cement');
  });

  it('404s for a lapsed or unknown listing and bounds limit', async () => {
    await http().get(`/api/posts/${String(ids.lapsed)}/similar`).expect(404);
    await http().get('/api/posts/999999999/similar').expect(404);
    await http().get(`/api/posts/${String(ids.exc)}/similar?limit=50`).expect(400);
  });
});

describe('likes', () => {
  it('needs sign-in', async () => {
    await http().post('/api/likes').send({ post_id: ids.exc }).expect(401);
  });

  it('saves once, counts on the detail, says liked for the viewer only', async () => {
    const first = (await http().post('/api/likes').set(customer).send({ post_id: ids.exc }).expect(201)).body as LikeResponse;
    expect(first).toEqual({ liked: true, like_count: 1 });
    const again = (await http().post('/api/likes').set(customer).send({ post_id: ids.exc }).expect(201)).body as LikeResponse;
    expect(again.like_count).toBe(1);
    const mine = (await http().get(`/api/posts/${String(ids.exc)}`).set(customer).expect(200)).body as Listing;
    expect(mine.like_count).toBe(1);
    expect(mine.liked).toBe(true);
    const guest = (await http().get(`/api/posts/${String(ids.exc)}`).expect(200)).body as Listing;
    expect(guest.liked).toBe(false);
    expect(guest.like_count).toBe(1);
  });

  it('refuses the owner and a listing browse would not show', async () => {
    const own = await http().post('/api/likes').set(owner).send({ post_id: ids.exc }).expect(400);
    expect((own.body as { code: string }).code).toBe('CANNOT_LIKE_OWN_POST');
    const lapsed = await http().post('/api/likes').set(customer).send({ post_id: ids.lapsed }).expect(404);
    expect((lapsed.body as { code: string }).code).toBe('POST_NOT_AVAILABLE');
    await http().post('/api/likes').set(customer).send({ post_id: 999999999 }).expect(404);
  });

  it('merges a guest device list: live, not own, deduplicated; unknown ids dropped', async () => {
    const res = (await http().post('/api/likes/merge').set(customer).send({ post_ids: [ids.dozer, ids.dozer, ids.lapsed, 999999999, ids.exc] }).expect(200))
      .body as { ids: number[] };
    expect([...res.ids].sort()).toEqual([ids.dozer, ids.exc].sort());
    const ownMerge = (await http().post('/api/likes/merge').set(owner).send({ post_ids: [ids.exc] }).expect(200)).body as { ids: number[] };
    expect(ownMerge.ids).toEqual([]);
  });

  it('lists newest save first with list items, and ids', async () => {
    await http().post('/api/likes').set(customer).send({ post_id: ids.cement }).expect(201);
    const page = (await http().get('/api/likes?limit=2').set(customer).expect(200)).body as Paginated<ListingListItem>;
    expect(page.total).toBe(3);
    expect(names(page.items)).toEqual(['cement', 'dozer']);
    expect(page.items[0]).not.toHaveProperty('details');
    const idsRes = (await http().get('/api/likes/ids').set(customer).expect(200)).body as { ids: number[] };
    expect(idsRes.ids).toEqual([ids.cement, ids.dozer, ids.exc]);
  });

  it("counts saves on the owner's stats", async () => {
    const stats = (await http().get('/api/posts/mine/stats').set(owner).expect(200)).body as MyListingStats;
    expect(stats.posts.find((p) => p.id === ids.exc)?.saves).toBe(1);
    expect(stats.totals.saves).toBe(3);
  });

  it('removes idempotently', async () => {
    const gone = (await http().delete(`/api/likes/${String(ids.cement)}`).set(customer).expect(200)).body as LikeResponse;
    expect(gone).toEqual({ liked: false, like_count: 0 });
    await http().delete(`/api/likes/${String(ids.cement)}`).set(customer).expect(200);
    const idsRes = (await http().get('/api/likes/ids').set(customer).expect(200)).body as { ids: number[] };
    expect(idsRes.ids).not.toContain(ids.cement);
  });
});

describe('saved searches', () => {
  let saved: SavedSearch;
  const params = { q: 'экскаватор', province: 'ULAANBAATAR', attrs: { with_operator: 'true' }, date_from: '2026-11-01', page: 3 };

  it('creates with the browse filters only (dates and paging dropped)', async () => {
    saved = (await http().post('/api/saved-searches').set(customer).send({ name: 'экскаватор · Улаанбаатар', params }).expect(201)).body as SavedSearch;
    expect(saved.params).toEqual({ q: 'экскаватор', province: 'ULAANBAATAR', attrs: { with_operator: 'true' } });
    expect(saved.notify).toBe(true);
    expect(saved.new_count).toBe(0);
  });

  it('validates like browse', async () => {
    await http().post('/api/saved-searches').set(customer).send({ name: '', params: {} }).expect(400);
    await http().post('/api/saved-searches').set(customer).send({ name: 'x', params: { price_min: 1 } }).expect(400);
    await http().post('/api/saved-searches').set(customer).send({ name: 'x' }).expect(400);
  });

  it('counts new matching listings since last seen, then restarts after seen', async () => {
    await insertPost('excNew', { ...F.exc, title: 'Шинэ Komatsu экскаватор' });
    await insertPost('excNoOperator', { ...F.exc, title: 'Экскаватор операторгүй', attributes: { with_operator: false } });
    // Created before the search was opened, approved after it: new to the search.
    await ds.query(`UPDATE posts SET date_created = now() - interval '1 day', published_at = now() WHERE id = $1`, [ids.excNew]);
    const list = (await http().get('/api/saved-searches').set(customer).expect(200)).body as SavedSearch[];
    expect(list.map((s) => s.id)).toContain(saved.id);
    expect(list.find((s) => s.id === saved.id)?.new_count).toBe(1);
    const seen = (await http().post(`/api/saved-searches/${saved.id}/seen`).set(customer).expect(200)).body as SavedSearch;
    expect(seen.new_count).toBe(0);
    const after = (await http().get('/api/saved-searches').set(customer).expect(200)).body as SavedSearch[];
    expect(after.find((s) => s.id === saved.id)?.new_count).toBe(0);
  });

  it('matches an approved listing the way browse would, alerts on, owner excluded', async () => {
    const svc = app.get(SavedSearchService);
    const base = { user_id: ownerId, category: 'machineryrent', subcategory: 'excavator', province: 'ULAANBAATAR', district: 'KHANUUL', attributes: { with_operator: true } };
    const hit = (p: Record<string, unknown>) => svc.matching({ ...base, ...p }).then((r) => r.some((s) => s.id === saved.id));
    await expect(hit({ title: 'Komatsu PC300 экскаваторын түрээс' })).resolves.toBe(true); // suffix
    await expect(hit({ title: 'Komatsu PC300', subcategory: 'bulldozer' })).resolves.toBe(false); // neither text nor subcategory name
    await expect(hit({ title: 'Komatsu PC300' })).resolves.toBe(true); // the subcategory's name answers the query
    await expect(hit({ title: 'Экскаватор', province: 'ORKHON' })).resolves.toBe(false);
    await expect(hit({ title: 'Экскаватор', attributes: { with_operator: false } })).resolves.toBe(false);
    await expect(hit({ title: 'Экскаватор', user_id: customerId })).resolves.toBe(false); // the searcher's own listing
    await http().patch(`/api/saved-searches/${saved.id}`).set(customer).send({ notify: false }).expect(200);
    await expect(hit({ title: 'Экскаватор' })).resolves.toBe(false);
    const renamed = (await http().patch(`/api/saved-searches/${saved.id}`).set(customer).send({ name: 'Шинэ нэр' }).expect(200)).body as SavedSearch;
    expect(renamed.name).toBe('Шинэ нэр');
    expect(renamed.notify).toBe(false); // untouched by a rename
    const on = (await http().patch(`/api/saved-searches/${saved.id}`).set(customer).send({ notify: true }).expect(200)).body as SavedSearch;
    expect(on.name).toBe('Шинэ нэр');
    expect(on.notify).toBe(true);
  });

  it('matches family and price within a unit', async () => {
    const svc = app.get(SavedSearchService);
    const s = (await http().post('/api/saved-searches').set(customer).send({ name: 'Техник 500к хүртэл', params: { family: 'EQUIPMENT_VEHICLES', price_max: 500000, price_unit: 'DAY' } }).expect(201)).body as SavedSearch;
    const hit = (p: Record<string, unknown>) => svc.matching({ user_id: ownerId, category: 'machineryrent', title: 'x', ...p }).then((r) => r.some((x) => x.id === s.id));
    await expect(hit({ price_amount: '450000', price_unit: 'DAY' })).resolves.toBe(true);
    await expect(hit({ price_amount: '450000', price_unit: 'HOUR' })).resolves.toBe(false);
    await expect(hit({ price_amount: '650000', price_unit: 'DAY' })).resolves.toBe(false);
    await expect(hit({ category: 'materialstore', price_amount: '1000', price_unit: 'DAY' })).resolves.toBe(false);
    await http().delete(`/api/saved-searches/${s.id}`).set(customer).expect(200);
  });

  it('stops at the limit and 404s on someone else’s search', async () => {
    const have = ((await http().get('/api/saved-searches').set(customer).expect(200)).body as SavedSearch[]).length;
    for (let i = have; i < 10; i++) await http().post('/api/saved-searches').set(customer).send({ name: `s${String(i)}`, params: { category: 'materialstore' } }).expect(201);
    const over = await http().post('/api/saved-searches').set(customer).send({ name: 'one more', params: {} }).expect(400);
    expect((over.body as { code: string }).code).toBe('SAVED_SEARCH_LIMIT');
    await http().delete(`/api/saved-searches/${saved.id}`).set(owner).expect(404);
    await http().delete(`/api/saved-searches/${saved.id}`).set(customer).expect(200);
    await http().delete(`/api/saved-searches/${saved.id}`).set(customer).expect(404);
  });
});

describe('empty dated browse offers nearby windows', () => {
  it('says how many match without dates and the nearest free windows of the same length', async () => {
    const from = '2027-03-10';
    const to = '2027-03-12';
    // Every live KHANUUL excavator of the owner is busy on the asked days, free three days later.
    const busy = Object.entries(ids).filter(([n]) => ['exc', 'excNear', 'excCheap', 'excHour', 'excNew', 'excNoOperator'].includes(n)).map(([, id]) => id);
    await http().post('/api/posts/availability/block').set(owner).send({ post_ids: busy, start_date: from, end_date: '2027-03-14' }).expect(201);
    const res = (await http().get(`/api/posts?q=${TOKEN} экскаватор&district=KHANUUL&date_from=${from}&date_to=${to}`).expect(200)).body as BrowseResponse;
    expect(res.items).toEqual([]);
    expect(res.total).toBe(0);
    expect(res.undated_total).toBe(busy.length);
    expect(res.alternatives?.[0]).toEqual({ date_from: '2027-03-15', date_to: '2027-03-17', count: busy.length });
    expect(res.alternatives?.length).toBeGreaterThanOrEqual(2);
    // Windows do not overlap each other.
    const alts = res.alternatives ?? [];
    for (let i = 1; i < alts.length; i++) expect(alts[i].date_from > alts[i - 1].date_to).toBe(true);
  });

  it('answers plain empty when nothing matches even without dates, or when no dates were asked', async () => {
    const dated = (await http().get(`/api/posts?q=${TOKEN} экскаватор&province=KHOVD&date_from=2027-03-10&date_to=2027-03-12`).expect(200)).body as BrowseResponse;
    expect(dated).toEqual({ items: [], total: 0, relaxed: false });
    const undated = (await http().get('/api/posts?q=zzzzzz').expect(200)).body as BrowseResponse;
    expect(undated).toEqual({ items: [], total: 0, relaxed: false });
  });
});
