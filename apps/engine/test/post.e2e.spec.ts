import '../src/config/load-env';
import { randomInt, randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getDataSourceToken, TypeOrmModule } from '@nestjs/typeorm';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import type { DataSource } from 'typeorm';
import type { AdminListing, Listing, ListingListItem, MyListingItem, MyListingStats, Paginated } from '@zuuchmap/core';
import { AUTH_CONFIG, authConfigFromEnv, type AuthConfig } from '../src/auth/auth.config';
import { AuthModule } from '../src/auth/auth.module';
import { openSession } from '../src/auth/request-user';
import { CategoryModule } from '../src/category/category.module';
import { CategoryService } from '../src/category/category.service';
import { AllExceptionsFilter } from '../src/common/all-exceptions.filter';
import { dataSourceOptions } from '../src/database/data-source';
import { InMemoryListingEvents, LISTING_EVENTS, type ListingEvent } from '../src/post/listing-events';
import { InMemoryPhotoStorage, PHOTO_STORAGE } from '../src/post/photo-storage';
import { PostExpiryService } from '../src/post/post-expiry.service';
import { PostModule } from '../src/post/post.module';
import { RedisModule } from '../src/redis/redis.module';
import { UserModule } from '../src/user/user.module';

const CAT = 'post_test_cat';
const phones: string[] = [];
const newPhone = (): string => {
  const p = `7${String(randomInt(1_000_000, 10_000_000))}`;
  phones.push(p);
  return p;
};
const ADMIN_PHONE = newPhone();

let app: INestApplication;
let ds: DataSource;
let cfg: AuthConfig;
let storage: InMemoryPhotoStorage;
let bus: InMemoryListingEvents;
let expiry: PostExpiryService;
const events: ListingEvent[] = [];
const http = (): ReturnType<typeof request> => request(app.getHttpServer() as Server);

interface Account { id: string; token: string; auth: { Authorization: string } }
async function account(admin = false, plan = 'FREE'): Promise<Account> {
  const phone = admin ? ADMIN_PHONE : newPhone();
  const rows = await ds.query<Array<{ id: string }>>(
    `INSERT INTO users (phone_number, is_verified, plan) VALUES ($1, true, $2)
     ON CONFLICT (phone_number) DO UPDATE SET plan = $2 RETURNING id`,
    [phone, plan],
  );
  const id = rows[0].id;
  const token = await openSession(ds, id, cfg);
  return { id, token, auth: { Authorization: `Bearer ${token}` } };
}

let admin: Account;
const body = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  category: CAT,
  title: `Test listing ${randomUUID().slice(0, 8)}`,
  details: 'A solid machine for rent',
  province: 'ULAANBAATAR',
  district: 'BAYANGOL',
  price_amount: 150000,
  price_unit: 'DAY',
  contact_phone: '99112233',
  attributes: { capacity: 10, color: 'red' },
  ...over,
});
async function create(u: Account, over: Record<string, unknown> = {}): Promise<Listing> {
  const res = await http().post('/api/posts').set(u.auth).send(body(over)).expect(201);
  return res.body as Listing;
}
async function approve(id: number): Promise<AdminListing> {
  const res = await http().post(`/api/admin/posts/${String(id)}/approve`).set(admin.auth).expect(200);
  return res.body as AdminListing;
}
async function reject(id: number, reason: string, field_key?: string): Promise<request.Response> {
  return http().post(`/api/admin/posts/${String(id)}/reject`).set(admin.auth).send({ reason, field_key });
}
async function browseIds(query = ''): Promise<number[]> {
  const res = await http().get(`/api/posts?category=${CAT}&limit=100${query}`).expect(200);
  return (res.body as Paginated<ListingListItem>).items.map((i) => i.id);
}
const row = async (id: number): Promise<Record<string, unknown>> =>
  (await ds.query<Array<Record<string, unknown>>>('SELECT * FROM posts WHERE id = $1', [id]))[0];
const code = (res: request.Response): string => (res.body as { code: string }).code;

beforeAll(async () => {
  cfg = { ...authConfigFromEnv(), devMode: true, adminPhones: [ADMIN_PHONE] };
  storage = new InMemoryPhotoStorage();
  bus = new InMemoryListingEvents();
  bus.subscribe((e) => events.push(e));
  const mod = await Test.createTestingModule({
    imports: [
      TypeOrmModule.forRoot({ ...dataSourceOptions(), autoLoadEntities: true }),
      RedisModule,
      AuthModule,
      UserModule,
      CategoryModule,
      PostModule,
    ],
  })
    .overrideProvider(AUTH_CONFIG)
    .useValue(cfg)
    .overrideProvider(PHOTO_STORAGE)
    .useValue(storage)
    .overrideProvider(LISTING_EVENTS)
    .useValue(bus)
    .compile();
  app = mod.createNestApplication<NestExpressApplication>();
  (app as NestExpressApplication).set('trust proxy', 1); // as main.ts: the address is nginx's X-Forwarded-For hop
  app.setGlobalPrefix('api');
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.init();
  ds = app.get<DataSource>(getDataSourceToken());
  expiry = app.get(PostExpiryService);
  await app.get(CategoryService).upsert(CAT, {
    family: 'EQUIPMENT_VEHICLES',
    label: 'Тест',
    labels: { mn: 'Тест', en: 'Test', zh: 'Test', ru: 'Тест' },
    fields: [
      { key: 'capacity', label: 'Capacity', type: 'number', min: 1, max: 100, filterable: true },
      { key: 'color', label: 'Color', type: 'select', options: ['red', 'blue'], filterable: true },
    ],
  });
  admin = await account(true);
});

afterAll(async () => {
  await ds.query('DELETE FROM posts WHERE category = $1 OR user_id IN (SELECT id FROM users WHERE phone_number = ANY($2))', [CAT, phones]);
  await ds.query('DELETE FROM users WHERE phone_number = ANY($1)', [phones]);
  await ds.query('DELETE FROM category_schema WHERE key = $1', [CAT]);
  await app.close();
});

describe('role and moderation', () => {
  it('everyone is a customer; the first listing makes the user a provider, a refused one does not', async () => {
    const u = await account();
    const before = await ds.query<Array<{ type: string }>>('SELECT type FROM users WHERE id = $1', [u.id]);
    expect(before[0]?.type).toBe('CUSTOMER');
    // Invalid attributes: refused, role untouched.
    await http().post('/api/posts').set(u.auth).send(body({ attributes: { capacity: 9999 } })).expect(400);
    expect((await ds.query<Array<{ type: string }>>('SELECT type FROM users WHERE id = $1', [u.id]))[0]?.type).toBe('CUSTOMER');
    const l = await create(u);
    expect(l.approval_status).toBe('PENDING');
    expect((await ds.query<Array<{ type: string }>>('SELECT type FROM users WHERE id = $1', [u.id]))[0]?.type).toBe('PROVIDER');
    await http().post('/api/posts').send(body()).expect(401);
  });

  it('new listings start PENDING, stay out of browse, and approval publishes them', async () => {
    const u = await account();
    const l = await create(u);
    expect(await browseIds()).not.toContain(l.id);
    await http().get(`/api/posts/${String(l.id)}`).expect(404);
    await http().get(`/api/posts/${String(l.id)}`).set(u.auth).expect(200);
    await http().post(`/api/admin/posts/${String(l.id)}/approve`).set(u.auth).expect(403);
    const pending = await http().get('/api/admin/posts?approval_status=PENDING').set(admin.auth).expect(200);
    expect((pending.body as Paginated<AdminListing>).items.map((i) => i.id)).toContain(l.id);
    await approve(l.id);
    expect(await browseIds()).toContain(l.id);
    await http().get(`/api/posts/${String(l.id)}`).expect(200);
  });

  it('reject carries a reason and a validated field key, counts, and can be fixed and resubmitted', async () => {
    const u = await account();
    const l = await create(u);
    expect((await reject(l.id, '')).status).toBe(400);
    expect(code(await reject(l.id, 'bad', 'not_a_field'))).toBe('INVALID_FIELD_KEY');
    const r = await reject(l.id, 'Price is not realistic', 'capacity');
    expect(r.status).toBe(200);
    const rej = r.body as AdminListing;
    expect(rej).toMatchObject({ approval_status: 'REJECTED', rejection_reason: 'Price is not realistic', rejection_field: 'capacity' });
    expect((await ds.query<Array<{ posts_rejected: number }>>('SELECT posts_rejected FROM users WHERE id = $1', [u.id]))[0]?.posts_rejected).toBe(1);
    // A second reject of the same listing does not double count.
    await reject(l.id, 'still bad', 'title');
    expect((await ds.query<Array<{ posts_rejected: number }>>('SELECT posts_rejected FROM users WHERE id = $1', [u.id]))[0]?.posts_rejected).toBe(1);
    const mine = await http().get('/api/posts/mine').set(u.auth).expect(200);
    expect((mine.body as MyListingItem[])[0]).toMatchObject({ rejection_reason: 'still bad', rejection_field: 'title' });
    // Fix and resubmit.
    const fixed = await http().patch(`/api/posts/${String(l.id)}`).set(u.auth).send({ title: 'A fixed title' }).expect(200);
    expect(fixed.body).toMatchObject({ approval_status: 'PENDING', rejection_reason: null, rejection_field: null, title: 'A fixed title' });
    await approve(l.id);
    expect(await browseIds()).toContain(l.id);
  });
});

describe('editing a live listing', () => {
  it('parks the edit beside the live version; approve applies it, reject drops it', async () => {
    const u = await account();
    const l = await create(u, { title: 'Original title' });
    await approve(l.id);
    const edit = await http().patch(`/api/posts/${String(l.id)}`).set(u.auth).send({ title: 'Edited title', price_amount: 200000 }).expect(200);
    const e = edit.body as Listing;
    expect(e.title).toBe('Original title');
    expect(e.approval_status).toBe('APPROVED');
    expect(e.pending_revision).toMatchObject({ title: 'Edited title', price_amount: 200000 });
    expect(e.previous_snapshot).toMatchObject({ title: 'Original title' });
    // Still in browse with the live content; strangers never see the revision.
    expect(await browseIds()).toContain(l.id);
    const pub = (await http().get(`/api/posts/${String(l.id)}`).expect(200)).body as Listing;
    expect(pub.title).toBe('Original title');
    expect(pub.pending_revision).toBeUndefined();

    const queue = (await http().get('/api/admin/posts?approval_status=PENDING').set(admin.auth).expect(200)).body as Paginated<AdminListing>;
    const queued = queue.items.find((i) => i.id === l.id);
    expect(queued?.edit_diff).toEqual(
      expect.arrayContaining([
        { field: 'title', before: 'Original title', after: 'Edited title' },
        { field: 'price_amount', before: 150000, after: 200000 },
      ]),
    );

    const ok = await approve(l.id);
    expect(ok).toMatchObject({ title: 'Edited title', pending_revision: null, approval_status: 'APPROVED' });
    expect(ok.previous_snapshot).toMatchObject({ title: 'Original title', price: 150000 });

    // Second edit, rejected: live stays, reason is the edit's.
    await http().patch(`/api/posts/${String(l.id)}`).set(u.auth).send({ title: 'Bad edit' }).expect(200);
    const rj = await reject(l.id, 'Title is misleading', 'title');
    expect(rj.body).toMatchObject({ approval_status: 'APPROVED', title: 'Edited title', pending_revision: null, rejection_reason: 'Title is misleading', rejection_field: 'title' });
    expect(await browseIds()).toContain(l.id);
    expect((await ds.query<Array<{ posts_rejected: number }>>('SELECT posts_rejected FROM users WHERE id = $1', [u.id]))[0]?.posts_rejected).toBe(0);
  });

  it('photos dropped by a pending edit are only reclaimed once it is approved', async () => {
    const u = await account();
    const keyA = (await http().post('/api/posts/photos/intent').set(u.auth).send({ content_type: 'image/jpeg' }).expect(200)).body as { key: string };
    storage.upload(keyA.key);
    const l = await create(u, { images: [keyA.key] });
    await approve(l.id);
    const keyB = (await http().post('/api/posts/photos/intent').set(u.auth).send({ content_type: 'image/png' }).expect(200)).body as { key: string };
    storage.upload(keyB.key);
    await http().patch(`/api/posts/${String(l.id)}`).set(u.auth).send({ images: [keyB.key] }).expect(200);
    expect(storage.deleted).not.toContain(keyA.key);
    await approve(l.id);
    expect(storage.deleted).toContain(keyA.key);
  });

  it('a proven provider publishes edits without review but never new listings', async () => {
    const u = await account(false, 'PROVIDER');
    const posts: Listing[] = [];
    for (let i = 0; i < 3; i++) posts.push(await create(u, { title: `Proven ${String(i)}` }));
    for (const p of posts) await approve(p.id);
    const first = posts[0];
    const edit = (await http().patch(`/api/posts/${String(first.id)}`).set(u.auth).send({ title: 'Instant edit' }).expect(200)).body as Listing;
    expect(edit).toMatchObject({ title: 'Instant edit', approval_status: 'APPROVED', pending_revision: null });
    expect(edit.previous_snapshot).toMatchObject({ title: 'Proven 0' });
    const fresh = await create(u, { title: 'Brand new' });
    expect(fresh.approval_status).toBe('PENDING');
    expect(await browseIds()).not.toContain(fresh.id);

    // One rejection ends the shortcut.
    await reject(fresh.id, 'no');
    const after = (await http().patch(`/api/posts/${String(first.id)}`).set(u.auth).send({ title: 'Needs review' }).expect(200)).body as Listing;
    expect(after.title).toBe('Instant edit');
    expect(after.pending_revision).toMatchObject({ title: 'Needs review' });
  });
});

describe('quota and drafts', () => {
  it('refuses creation at the plan limit with POST_QUOTA_EXCEEDED; drafts stay allowed; rejected ones free a slot', async () => {
    const u = await account();
    const made: Listing[] = [];
    for (let i = 0; i < 3; i++) made.push(await create(u));
    const over = await http().post('/api/posts').set(u.auth).send(body()).expect(400);
    expect(code(over)).toBe('POST_QUOTA_EXCEEDED');
    const draft = (await http().post('/api/posts').set(u.auth).send(body({ draft: true })).expect(201)).body as Listing;
    expect(await browseIds()).not.toContain(draft.id);
    const submitFull = await http().patch(`/api/posts/${String(draft.id)}`).set(u.auth).send({ submit: true }).expect(400);
    expect(code(submitFull)).toBe('POST_QUOTA_EXCEEDED');
    await reject(made[0].id, 'no');
    await http().patch(`/api/posts/${String(draft.id)}`).set(u.auth).send({ submit: true }).expect(200);
    const stats = (await http().get('/api/posts/mine/stats').set(u.auth).expect(200)).body as MyListingStats;
    expect(stats.plan).toMatchObject({ name: 'FREE', post_limit: 3, active_posts: 3 });
    expect(stats.totals.posts).toBe(4);
  });
});

describe('drafts without required fields', () => {
  it('saves a draft missing required attributes; submitting names the fields; filled in and submitted in one PATCH', async () => {
    const u = await account();
    // A real category with required fields (the test category has none).
    const bare = { ...body({ draft: true }), category: 'machineryrent', subcategory: 'excavator', attributes: {} };
    const draft = (await http().post('/api/posts').set(u.auth).send(bare).expect(201)).body as Listing;
    // A wrong type is still refused, draft or not.
    await http().post('/api/posts').set(u.auth).send({ ...bare, attributes: { year: 'old' } }).expect(400);
    const refused = await http().patch(`/api/posts/${String(draft.id)}`).set(u.auth).send({ submit: true }).expect(400);
    expect(code(refused)).toBe('INVALID_ATTRIBUTES');
    const issues = (refused.body as { errors?: Array<{ key: string; code: string }> }).errors ?? [];
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.every((e) => e.code === 'required')).toBe(true);
    const full = { manufacturer: 'Komatsu', model: 'PC200', year: 2019, capacity: 20, with_operator: true };
    const sent = (await http().patch(`/api/posts/${String(draft.id)}`).set(u.auth).send({ attributes: full, submit: true }).expect(200)).body as Listing;
    expect(sent).toMatchObject({ is_draft: false, approval_status: 'PENDING' });
  });
});

describe('expiry', () => {
  it('lapses listings, warns once three days out, renews within quota', async () => {
    const u = await account();
    const a = await create(u);
    const b = await create(u);
    await approve(a.id);
    await approve(b.id);
    await ds.query("UPDATE posts SET expires_at = now() - interval '1 minute' WHERE id = $1", [a.id]);
    // Past expires_at is already out of browse before the sweep runs.
    expect(await browseIds()).not.toContain(a.id);
    await ds.query("UPDATE posts SET expires_at = now() + interval '2 days' WHERE id = $1", [b.id]);

    events.length = 0;
    expect((await expiry.expireLapsed()) >= 1).toBe(true);
    expect((await row(a.id)).status).toBe('EXPIRED');
    expect(events).toContainEqual(expect.objectContaining({ type: 'listing.expired', post_id: a.id }));
    expect((await expiry.warnExpiring()) >= 1).toBe(true);
    expect(events).toContainEqual(expect.objectContaining({ type: 'listing.expiring', post_id: b.id, days_left: 2 }));
    events.length = 0;
    await expiry.warnExpiring();
    expect(events.filter((e) => e.type === 'listing.expiring' && e.post_id === b.id)).toHaveLength(0);

    const renewed = await http().post(`/api/posts/${String(a.id)}/renew`).set(u.auth).expect(200);
    expect((renewed.body as Listing).status).toBe('ACTIVE');
    expect(await browseIds()).toContain(a.id);
    // A pending listing has nothing to renew.
    const p = await create(await account());
    await http().post(`/api/posts/${String(p.id)}/renew`).set((await account()).auth).expect(403);
  });

  it('renewing a lapsed listing is quota-checked', async () => {
    const u = await account();
    const first = await create(u);
    await approve(first.id);
    await ds.query("UPDATE posts SET status = 'EXPIRED', expires_at = now() - interval '1 day' WHERE id = $1", [first.id]);
    for (let i = 0; i < 3; i++) await create(u);
    const res = await http().post(`/api/posts/${String(first.id)}/renew`).set(u.auth).expect(400);
    expect(code(res)).toBe('POST_QUOTA_EXCEEDED');
  });

  it('only one server runs the nightly job per day', async () => {
    const day = new Date(Date.UTC(2200 + randomInt(0, 700), randomInt(0, 12), randomInt(1, 28)));
    expect(typeof (await expiry.runExpiry(day))).toBe('number');
    expect(await expiry.runExpiry(day)).toBeNull();
  });
});

describe('views', () => {
  const visit = (id: number, visitor: string, ip = '10.0.0.1', u?: Account): request.Test => {
    const r = http().put(`/api/posts/${String(id)}/views`).set('X-Visitor-Id', visitor).set('X-Forwarded-For', ip);
    return u ? r.set(u.auth) : r;
  };
  const views = async (id: number): Promise<number> => (await row(id)).views as number;

  it('counts one per viewer, concurrently too, never owner or admin, only live listings', async () => {
    const owner = await account();
    const l = await create(owner);
    // Not live yet: nothing counted and nothing recorded for a stranger.
    expect(((await visit(l.id, 'v-early').expect(200)).body as { counted: boolean }).counted).toBe(false);
    expect(await views(l.id)).toBe(0);
    await approve(l.id);

    const same = await Promise.all(Array.from({ length: 12 }, () => visit(l.id, 'v-same')));
    expect(same.filter((r) => (r.body as { counted: boolean }).counted)).toHaveLength(1);
    expect(await views(l.id)).toBe(1);
    await visit(l.id, 'v-other').expect(200);
    expect(await views(l.id)).toBe(2);

    // The early viewer was never recorded, so they count now.
    expect(((await visit(l.id, 'v-early')).body as { counted: boolean }).counted).toBe(true);
    expect(await views(l.id)).toBe(3);

    // Owner and admin: never counted, and signing out afterwards on the same device stays uncounted.
    await visit(l.id, 'v-owner-dev', '10.0.0.2', owner).expect(200);
    await visit(l.id, 'v-owner-dev').expect(200);
    await visit(l.id, 'v-admin-dev', '10.0.0.3', admin).expect(200);
    expect(await views(l.id)).toBe(3);

    // A signed-in viewer is one viewer however many devices.
    const fan = await account();
    await visit(l.id, 'v-fan-1', '10.0.0.4', fan);
    await visit(l.id, 'v-fan-2', '10.0.0.5', fan);
    expect(await views(l.id)).toBe(4);
  });

  it('caps fresh anonymous viewers per address', async () => {
    const owner = await account();
    const l = await create(owner);
    await approve(l.id);
    for (let i = 0; i < 33; i++) await visit(l.id, `cap-${String(i)}`, '10.9.9.9');
    expect(await views(l.id)).toBe(30);
    await visit(l.id, 'cap-elsewhere', '10.9.9.10');
    expect(await views(l.id)).toBe(31);
    // X-Real-IP is a client's to write: it no longer names the address.
    await http().put(`/api/posts/${String(l.id)}/views`).set('X-Visitor-Id', 'cap-spoof').set('X-Forwarded-For', '10.9.9.9').set('X-Real-IP', '10.1.2.3').expect(200);
    expect(await views(l.id)).toBe(31);
  });
});

describe('browse', () => {
  it('filters by category, province, district, q, attributes and paginates { items, total }', async () => {
    const u = await account(false, 'PROVIDER');
    const stamp = randomUUID().slice(0, 6);
    const a = await create(u, { title: `Excavator ${stamp}`, attributes: { capacity: 5, color: 'red' }, province: 'UVS', district: null });
    const b = await create(u, { title: `Loader ${stamp}`, details: `heavy ${stamp}`, attributes: { capacity: 50, color: 'blue' } });
    const c = await create(u, { title: `Crane 100%_ ${stamp}`, attributes: { capacity: 20 } });
    for (const p of [a, b, c]) await approve(p.id);

    expect(await browseIds(`&province=UVS`)).toEqual([a.id]);
    expect(await browseIds(`&district=BAYANGOL`)).toEqual(expect.arrayContaining([b.id, c.id]));
    expect(await browseIds(`&q=excav`)).toContain(a.id);
    expect(await browseIds(`&q=${stamp}`)).toHaveLength(3);
    expect((await browseIds(`&q=${stamp}+heavy`))).toEqual([b.id]);
    expect(await browseIds(`&q=${encodeURIComponent('100%_')}`)).toEqual([c.id]);
    expect(await browseIds(`&q=${stamp}&attr.color=blue`)).toEqual([b.id]);
    expect((await browseIds(`&q=${stamp}&attr.capacity_min=10&attr.capacity_max=30`))).toEqual([c.id]);
    expect(await browseIds(`&q=${stamp}&attr.capacity=5`)).toEqual([a.id]);

    const page = (await http().get(`/api/posts?category=${CAT}&q=${stamp}&limit=2&page=2`).expect(200)).body as Paginated<ListingListItem>;
    expect(page.total).toBe(3);
    expect(page.items).toHaveLength(1);
    expect(page.items[0]).not.toHaveProperty('details');
    expect(page.items[0]).not.toHaveProperty('rejection_reason');
    expect(page.items[0]?.user?.phone_number).toBeNull();
  });

  it('feeds the category family counts and stores a PostGIS point', async () => {
    const u = await account();
    const l = await create(u, { latitude: 47.9, longitude: 106.9 });
    await approve(l.id);
    const geo = await ds.query<Array<{ lon: number; lat: number }>>(
      'SELECT ST_X(geo::geometry) AS lon, ST_Y(geo::geometry) AS lat FROM posts WHERE id = $1',
      [l.id],
    );
    expect(geo[0]).toEqual({ lon: 106.9, lat: 47.9 });
    const fams = ((await http().get('/api/categories').expect(200)).body as { families: Array<{ key: string; count: number }> }).families;
    expect(fams.find((f) => f.key === 'EQUIPMENT_VEHICLES')?.count).toBeGreaterThan(0);
  });
});

describe('deleted and missing', () => {
  it('answers 404 for an unknown id and 410 for a deleted one, everywhere', async () => {
    const u = await account();
    const other = await account();
    expect(code(await http().get('/api/posts/2147483000').expect(404))).toBe('POST_NOT_FOUND');
    expect(code(await http().put('/api/posts/2147483000/views').set('X-Visitor-Id', 'x').expect(404))).toBe('POST_NOT_FOUND');
    const l = await create(u);
    await approve(l.id);
    await http().delete(`/api/posts/${String(l.id)}`).set(other.auth).expect(403);
    await http().delete(`/api/posts/${String(l.id)}`).set(u.auth).expect(200);
    expect(code(await http().get(`/api/posts/${String(l.id)}`).expect(410))).toBe('POST_GONE');
    expect(code(await http().get(`/api/posts/${String(l.id)}`).set(u.auth).expect(410))).toBe('POST_GONE');
    expect(code(await http().put(`/api/posts/${String(l.id)}/views`).set('X-Visitor-Id', 'y').expect(410))).toBe('POST_GONE');
    expect(code(await http().patch(`/api/posts/${String(l.id)}`).set(u.auth).send({ title: 'x' }).expect(410))).toBe('POST_GONE');
    expect(await browseIds()).not.toContain(l.id);
    const mine = (await http().get('/api/posts/mine').set(u.auth).expect(200)).body as MyListingItem[];
    expect(mine.map((m) => m.id)).not.toContain(l.id);
  });
});

describe('photos', () => {
  it('validates key format, count, ownership and upload', async () => {
    const u = await account();
    const o = await account();
    await http().post('/api/posts').set(u.auth).send(body({ images: ['../../etc/passwd'] })).expect(400);
    const many = Array.from({ length: 11 }, () => `posts/${u.id}/${randomUUID()}.jpg`);
    await http().post('/api/posts').set(u.auth).send(body({ images: many })).expect(400);
    const mine = `posts/${u.id}/${randomUUID()}.jpg`;
    expect(code(await http().post('/api/posts').set(u.auth).send(body({ images: [mine] })).expect(400))).toBe('PHOTO_NOT_UPLOADED');
    const foreign = `posts/${o.id}/${randomUUID()}.jpg`;
    storage.upload(foreign);
    expect(code(await http().post('/api/posts').set(u.auth).send(body({ images: [foreign] })).expect(400))).toBe('INVALID_PHOTO_KEY');
    storage.upload(mine);
    const ok = await create(u, { images: [mine] });
    expect(ok.images).toEqual([mine]);
    await http().post('/api/posts/photos/intent').set(u.auth).send({ content_type: 'image/gif' }).expect(400);
  });
});

describe('events', () => {
  it('emits submitted, approved and rejected through the port', async () => {
    const u = await account();
    events.length = 0;
    const l = await create(u);
    await approve(l.id);
    await reject(l.id, 'taken down', 'title');
    expect(events.map((e) => e.type)).toEqual(['listing.submitted', 'listing.approved', 'listing.rejected']);
  });
});
