/**
 * Phase 9: reports (reasons per kind, one open report per person per subject, grouped by subject
 * for the queue, a take-down rejects the whole listing or deletes the review, closes the
 * subject's other reports and tells each reporter, and costs the owner "proven" status), the
 * admin's users, company badge, overview, analytics with search gaps, broadcast, and deleting an
 * account (its live listings stay 14 days).
 */
import '../src/config/load-env';
import { randomInt } from 'node:crypto';
import type { Server } from 'node:http';
import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getDataSourceToken, TypeOrmModule } from '@nestjs/typeorm';
import request from 'supertest';
import type { DataSource } from 'typeorm';
import type {
  AdminAnalytics, AdminOverview, AdminUser, AdminUserDetail, AppNotification, BroadcastEstimate, Paginated, ReportGroup,
} from '@zuuchmap/core';
import { AdminModule } from '../src/admin/admin.module';
import { AUTH_CONFIG, authConfigFromEnv, type AuthConfig } from '../src/auth/auth.config';
import { AuthModule } from '../src/auth/auth.module';
import { openSession } from '../src/auth/request-user';
import { CategoryModule } from '../src/category/category.module';
import { CategoryService } from '../src/category/category.service';
import { AllExceptionsFilter } from '../src/common/all-exceptions.filter';
import { dataSourceOptions } from '../src/database/data-source';
import { NotificationModule } from '../src/notification/notification.module';
import { NotificationService } from '../src/notification/notification.service';
import { NOTIFY_TRANSPORTS, type NotifyTransports, type OutboundPush } from '../src/notification/transports';
import { PostModule } from '../src/post/post.module';
import { PostService } from '../src/post/post.service';
import { RedisModule } from '../src/redis/redis.module';
import { ReportModule } from '../src/report/report.module';
import { ReviewModule } from '../src/review/review.module';
import { UserModule } from '../src/user/user.module';

const pushed: OutboundPush[] = [];
const transports: NotifyTransports = {
  push: (m) => {
    pushed.push(...m);
    return Promise.resolve({ dead: [] });
  },
  mail: () => Promise.resolve(),
  webPushKey: null,
  mailEnabled: false,
};

let app: INestApplication;
let ds: DataSource;
let notify: NotificationService;
const phones = Array.from({ length: 5 }, () => `4${String(randomInt(1_000_000, 10_000_000))}`);
const ids = { provider: '', a: '', b: '', admin: '', leaver: '' };
const auth = {} as Record<keyof typeof ids, { Authorization: string }>;
const http = (): ReturnType<typeof request> => request(app.getHttpServer() as Server);
const DAY = 86_400_000;
const word = `zz${String(randomInt(1e6, 1e7))}`;
let post: number;
let review: number;
let companyId: string;

async function insertPost(owner: string, extra: Record<string, unknown> = {}): Promise<number> {
  const cols = { user_id: owner, title: 'Генератор 30 кВт', category: 'machineryrent', subcategory: 'excavator', province: 'ULAANBAATAR', price_amount: 120000, price_unit: 'DAY', approval_status: 'APPROVED', status: 'ACTIVE', published_at: new Date(), expires_at: new Date(Date.now() + 26 * DAY), ...extra };
  const keys = Object.keys(cols);
  const rows = await ds.query<Array<{ id: number }>>(
    `INSERT INTO posts (${keys.join(', ')}) VALUES (${keys.map((_, i) => `$${String(i + 1)}`).join(', ')}) RETURNING id`,
    Object.values(cols),
  );
  return rows[0].id;
}
const centre = async (who: keyof typeof ids): Promise<AppNotification[]> =>
  (await http().get('/api/notifications').set(auth[who]).expect(200)).body as AppNotification[];

beforeAll(async () => {
  const cfg: AuthConfig = { ...authConfigFromEnv(), devMode: true, adminPhones: [phones[3]] };
  const mod = await Test.createTestingModule({
    imports: [
      TypeOrmModule.forRoot({ ...dataSourceOptions(), autoLoadEntities: true }),
      RedisModule, AuthModule, UserModule, CategoryModule, PostModule, ReviewModule, NotificationModule, ReportModule, AdminModule,
    ],
  })
    .overrideProvider(AUTH_CONFIG).useValue(cfg)
    .overrideProvider(NOTIFY_TRANSPORTS).useValue(transports)
    .compile();
  app = mod.createNestApplication();
  app.setGlobalPrefix('api');
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.init();
  ds = app.get<DataSource>(getDataSourceToken());
  notify = app.get(NotificationService);
  await app.get(CategoryService).seed();
  const rows = await ds.query<Array<{ id: string; phone_number: string }>>(
    `INSERT INTO users (phone_number, is_verified, type, given_name) VALUES
       ($1, true, 'PROVIDER', 'Хүнд Техник'), ($2, true, 'CUSTOMER', 'Ганбат'), ($3, true, 'CUSTOMER', 'Сараа'),
       ($4, true, 'CUSTOMER', 'Админ'), ($5, true, 'PROVIDER', 'Явагч') RETURNING id, phone_number`,
    phones,
  );
  const byPhone = new Map(rows.map((r) => [r.phone_number, r.id]));
  for (const [i, k] of (['provider', 'a', 'b', 'admin', 'leaver'] as const).entries()) {
    ids[k] = byPhone.get(phones[i]) as string;
    auth[k] = { Authorization: `Bearer ${await openSession(ds, ids[k], cfg)}` };
  }
  post = await insertPost(ids.provider);
  // A pending edit beside the live version: a take-down must drop it too.
  await ds.query(`UPDATE posts SET pending_revision = $2 WHERE id = $1`, [post, JSON.stringify({ title: 'Генератор 30 кВт (шинэ)', images: [], submitted_at: new Date().toISOString() })]);
  [{ id: review }] = await ds.query<Array<{ id: number }>>(`INSERT INTO reviews (provider_id, author_id, rating, comment) VALUES ($1, $2, 1, 'Луйварчин') RETURNING id`, [ids.provider, ids.a]);
  [{ id: companyId }] = await ds.query<Array<{ id: string }>>(
    `INSERT INTO companies (owner_id, name, registration_number, tax_id) VALUES ($1, 'Хүнд Техник ХХК', '6123456', '5098765') RETURNING id`, [ids.provider],
  );
  await ds.query(`INSERT INTO push_devices (user_id, provider, token, locale) VALUES ($1, 'EXPO', $2, 'mn')`, [ids.b, `ExponentPushToken[adm-${String(randomInt(1e9))}]`]);
});

afterAll(async () => {
  const all = Object.values(ids);
  await ds.query('DELETE FROM reports WHERE reporter_id = ANY($1::uuid[]) OR owner_id = ANY($1::uuid[])', [all]);
  await ds.query('DELETE FROM posts WHERE user_id = ANY($1::uuid[])', [all]);
  await ds.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [all]);
  await ds.query('DELETE FROM search_misses WHERE query = $1', [word]);
  await app.close();
});

describe('reports', () => {
  it('a reason must belong to the kind (Figma R2 vs R6)', async () => {
    const res = await http().post('/api/reports').set(auth.a).send({ kind: 'POST', post_id: post, reason: 'FAKE' }).expect(400);
    expect((res.body as { code: string }).code).toBe('REPORT_REASON_INVALID');
  });

  it('one subject per report', async () => {
    await http().post('/api/reports').set(auth.a).send({ kind: 'POST', reason: 'SCAM' }).expect(400);
    await http().post('/api/reports').set(auth.a).send({ kind: 'POST', post_id: post, review_id: review, reason: 'SCAM' }).expect(400);
  });

  it('not your own listing or review', async () => {
    await http().post('/api/reports').set(auth.provider).send({ kind: 'POST', post_id: post, reason: 'SCAM' }).expect(403);
    await http().post('/api/reports').set(auth.a).send({ kind: 'REVIEW', review_id: review, reason: 'ABUSIVE' }).expect(403);
  });

  it('one open report per person per subject', async () => {
    await http().post('/api/reports').set(auth.a).send({ kind: 'POST', post_id: post, reason: 'SCAM', detail: 'Утсаа авахгүй, урьдчилгаа нэхсэн.' }).expect(201);
    const res = await http().post('/api/reports').set(auth.a).send({ kind: 'POST', post_id: post, reason: 'SPAM' }).expect(409);
    expect((res.body as { code: string }).code).toBe('REPORT_ALREADY_OPEN');
    await http().post('/api/reports').set(auth.b).send({ kind: 'POST', post_id: post, reason: 'SCAM' }).expect(201);
    await http().post('/api/reports').set(auth.provider).send({ kind: 'REVIEW', review_id: review, reason: 'ABUSIVE', detail: 'захиалга хийгээгүй хүний үнэлгээ' }).expect(201);
  });

  it('are admin-only to read', async () => {
    await http().get('/api/admin/reports').set(auth.a).expect(403);
  });

  it('the queue groups by subject, oldest first (Figma J4)', async () => {
    const q = (await http().get('/api/admin/reports').set(auth.admin).expect(200)).body as Paginated<ReportGroup>;
    const listing = q.items.find((g) => g.post_id === post);
    expect(listing).toMatchObject({ kind: 'POST', reporters: 2, reasons: ['SCAM'], detail: 'Утсаа авахгүй, урьдчилгаа нэхсэн.', subject: 'Генератор 30 кВт' });
    expect(listing?.owner?.id).toBe(ids.provider);
    expect(listing?.post?.id).toBe(post);
    const rev = q.items.find((g) => g.review_id === review);
    expect(rev).toMatchObject({ kind: 'REVIEW', reporters: 1, subject: '★1 · Луйварчин' });
    expect(rev?.owner?.id).toBe(ids.a);
  });

  it('keep: the reports close as dismissed, the review stays', async () => {
    const q = (await http().get('/api/admin/reports').set(auth.admin).expect(200)).body as Paginated<ReportGroup>;
    const rev = q.items.find((g) => g.review_id === review) as ReportGroup;
    await http().post(`/api/admin/reports/${rev.id}/resolve`).set(auth.admin).send({ action: 'KEEP' }).expect(200);
    await http().post(`/api/admin/reports/${rev.id}/resolve`).set(auth.admin).send({ action: 'KEEP' }).expect(409);
    const [r] = await ds.query<unknown[]>('SELECT 1 FROM reviews WHERE id = $1', [review]);
    expect(r).toBeDefined();
  });

  it('take down: the whole listing is rejected, both reporters are told, the owner is no longer proven', async () => {
    const q = (await http().get('/api/admin/reports').set(auth.admin).expect(200)).body as Paginated<ReportGroup>;
    const g = q.items.find((x) => x.post_id === post) as ReportGroup;
    const res = (await http().post(`/api/admin/reports/${g.id}/resolve`).set(auth.admin).send({ action: 'TAKE_DOWN', resolution: 'Луйвар' }).expect(200)).body as { closed: number };
    expect(res.closed).toBe(2);
    const [p] = await ds.query<Array<{ approval_status: string; pending_revision: unknown; rejection_reason: string }>>('SELECT approval_status, pending_revision, rejection_reason FROM posts WHERE id = $1', [post]);
    expect(p).toMatchObject({ approval_status: 'REJECTED', pending_revision: null, rejection_reason: 'Луйвар' });
    await notify.drain();
    for (const who of ['a', 'b'] as const) {
      expect((await centre(who)).find((n) => n.kind === 'REPORT_RESOLVED')?.data).toMatchObject({ title: 'Генератор 30 кВт', report_kind: 'POST' });
    }
    expect((await centre('provider')).some((n) => n.kind === 'LISTING_REJECTED')).toBe(true);
    expect(await app.get(PostService).isProvenProvider(ids.provider)).toBe(false);
    const closed = (await http().get('/api/admin/reports?status=CLOSED').set(auth.admin).expect(200)).body as Paginated<ReportGroup>;
    expect(closed.items.find((x) => x.post_id === post)).toMatchObject({ status: 'RESOLVED', action: 'TAKE_DOWN', reporters: 2 });
  });

  it('taking a review down deletes it; the report stays readable', async () => {
    await http().post('/api/reports').set(auth.provider).send({ kind: 'REVIEW', review_id: review, reason: 'FAKE' }).expect(201);
    const q = (await http().get('/api/admin/reports').set(auth.admin).expect(200)).body as Paginated<ReportGroup>;
    const g = q.items.find((x) => x.review_id === review) as ReportGroup;
    await http().post(`/api/admin/reports/${g.id}/resolve`).set(auth.admin).send({ action: 'TAKE_DOWN' }).expect(200);
    expect(await ds.query('SELECT 1 FROM reviews WHERE id = $1', [review])).toHaveLength(0);
    const closed = (await http().get('/api/admin/reports?status=CLOSED').set(auth.admin).expect(200)).body as Paginated<ReportGroup>;
    expect(closed.items.find((x) => x.subject === '★1 · Луйварчин' && x.action === 'TAKE_DOWN')?.review).toBeNull();
  });
});

describe('users and companies (Figma J6, J11d, J13d)', () => {
  it('searches by name or company, filters by role', async () => {
    const byCompany = (await http().get('/api/admin/users').query({ q: 'Хүнд Техник ХХК' }).set(auth.admin).expect(200)).body as Paginated<AdminUser>;
    expect(byCompany.items.map((u) => u.id)).toContain(ids.provider);
    const admins = (await http().get('/api/admin/users').query({ type: 'ADMIN' }).set(auth.admin).expect(200)).body as Paginated<AdminUser>;
    expect(admins.items.map((u) => u.id)).toEqual([ids.admin]);
    expect(admins.items[0].is_admin).toBe(true);
  });

  it('a user in detail: company with its numbers, listings', async () => {
    const d = (await http().get(`/api/admin/users/${ids.provider}`).set(auth.admin).expect(200)).body as AdminUserDetail;
    expect(d.company).toMatchObject({ name: 'Хүнд Техник ХХК', registration_number: '6123456', tax_id: '5098765', is_verified: false });
    expect(d.posts.find((p) => p.id === post)).toMatchObject({ approval_status: 'REJECTED', is_live: false });
  });

  it('grants and removes the verified badge', async () => {
    await http().put(`/api/admin/companies/${companyId}/verify`).set(auth.admin).send({ verified: true }).expect(200);
    let d = (await http().get(`/api/admin/users/${ids.provider}`).set(auth.admin).expect(200)).body as AdminUserDetail;
    expect(d.company?.is_verified).toBe(true);
    await http().put(`/api/admin/companies/${companyId}/verify`).set(auth.admin).send({ verified: false }).expect(200);
    d = (await http().get(`/api/admin/users/${ids.provider}`).set(auth.admin).expect(200)).body as AdminUserDetail;
    expect(d.company?.is_verified).toBe(false);
  });
});

describe('overview and analytics (Figma J7, J10d)', () => {
  it('counts the market', async () => {
    const o = (await http().get('/api/admin/overview').set(auth.admin).expect(200)).body as AdminOverview;
    expect(o.users.total).toBeGreaterThanOrEqual(5);
    expect(o.posts.rejected).toBeGreaterThanOrEqual(1);
    expect(typeof o.reports_open).toBe('number');
  });

  it('a search that found nothing becomes a search gap', async () => {
    await http().get('/api/posts').query({ q: word, province: 'DARKHAN_UUL' }).expect(200);
    await http().get('/api/posts').query({ q: word, province: 'DARKHAN_UUL' }).expect(200);
    const a = (await http().get('/api/admin/analytics?days=30').set(auth.admin).expect(200)).body as AdminAnalytics;
    expect(a.days).toBe(30);
    expect(a.search_gaps).toContainEqual({ query: word, province: 'DARKHAN_UUL', count: 2 });
    expect(Object.values(a.funnel).every((n) => Number.isInteger(n))).toBe(true);
  });
});

describe('broadcast (Figma J10d, J12d)', () => {
  it('estimates and sends to an audience, push and centre', async () => {
    const est = (await http().post('/api/admin/broadcast/estimate').set(auth.admin).send({ audience: 'CUSTOMER' }).expect(200)).body as BroadcastEstimate;
    expect(est.devices).toBeGreaterThanOrEqual(1);
    pushed.length = 0;
    await http().post('/api/admin/broadcast').set(auth.admin).send({ audience: 'CUSTOMER', title: 'Өвлийн бэлтгэл', body: 'Цас цэвэрлэх техникийн зарууд нэмэгдлээ.' }).expect(200);
    await notify.drain();
    expect(pushed.some((p) => p.title === 'Өвлийн бэлтгэл')).toBe(true);
    expect((await centre('b')).find((n) => n.kind === 'BROADCAST')?.data).toMatchObject({ title: 'Өвлийн бэлтгэл' });
    expect((await centre('provider')).some((n) => n.kind === 'BROADCAST')).toBe(false);
  });

  it('refuses an unknown category and is admin-only', async () => {
    await http().post('/api/admin/broadcast').set(auth.admin).send({ audience: 'ALL', category: 'nope', title: 't', body: 'b' }).expect(400);
    await http().post('/api/admin/broadcast').set(auth.a).send({ audience: 'ALL', title: 't', body: 'b' }).expect(403);
  });
});

describe('account deletion (Figma L3, L4)', () => {
  it('the account goes, its live listing lapses within 14 days, its token stops working', async () => {
    const live = await insertPost(ids.leaver, { expires_at: new Date(Date.now() + 60 * DAY) });
    const draft = await insertPost(ids.leaver, { is_draft: true, approval_status: 'PENDING' });
    await http().delete('/api/user/account').set(auth.leaver).expect(200);
    expect(await ds.query('SELECT 1 FROM users WHERE id = $1', [ids.leaver])).toHaveLength(0);
    const [p] = await ds.query<Array<{ user_id: string | null; expires_at: Date }>>('SELECT user_id, expires_at FROM posts WHERE id = $1', [live]);
    expect(p.user_id).toBeNull();
    expect(p.expires_at.getTime()).toBeLessThanOrEqual(Date.now() + 14 * DAY + 60_000);
    const [d] = await ds.query<Array<{ deleted_at: Date | null }>>('SELECT deleted_at FROM posts WHERE id = $1', [draft]);
    expect(d.deleted_at).not.toBeNull();
    await http().get('/api/user/profile').set(auth.leaver).expect(401);
  });
});

describe('listings and categories for the admin (Figma J5, J15d, J16d)', () => {
  it('finds listings by title or owner phone', async () => {
    const byTitle = (await http().get('/api/admin/posts').query({ q: 'Генератор' }).set(auth.admin).expect(200)).body as Paginated<{ id: number }>;
    expect(byTitle.items.map((p) => p.id)).toContain(post);
    const byPhone = (await http().get('/api/admin/posts').query({ q: phones[0], approval_status: 'REJECTED' }).set(auth.admin).expect(200)).body as Paginated<{ id: number }>;
    expect(byPhone.items.map((p) => p.id)).toEqual([post]);
    expect(byPhone.total).toBe(1);
  });

  it('a field or subcategory listings use is never removed', async () => {
    await ds.query(`UPDATE posts SET attributes = '{"year": 2018}' WHERE id = $1`, [post]);
    const usage = (await http().get('/api/admin/categories/machineryrent/usage').set(auth.admin).expect(200)).body as { posts: number; fields: Record<string, number>; subcategories: Record<string, number> };
    expect(usage.fields.year).toBeGreaterThanOrEqual(1);
    expect(usage.subcategories.excavator).toBeGreaterThanOrEqual(1);
    const schema = (await http().get('/api/admin/categories/machineryrent').set(auth.admin).expect(200)).body as { fields: Array<{ key: string; type: string }>; subcategories: Array<{ value: string }> };
    let res = await http().put('/api/admin/categories/machineryrent').set(auth.admin).send({ fields: schema.fields.filter((f) => f.key !== 'year') }).expect(400);
    expect((res.body as { code: string }).code).toBe('CATEGORY_KEY_IN_USE');
    res = await http().put('/api/admin/categories/machineryrent').set(auth.admin).send({ subcategories: schema.subcategories.filter((s) => s.value !== 'excavator') }).expect(400);
    expect((res.body as { code: string }).code).toBe('CATEGORY_KEY_IN_USE');
    await http().put('/api/admin/categories/machineryrent').set(auth.admin).send({ fields: schema.fields }).expect(200);
  });
});
