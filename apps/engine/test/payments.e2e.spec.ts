/**
 * Phase 8: plans and featured placement. A paid invoice grants a plan and a placement exactly
 * once (a callback and a poll racing grant once), an unpaid one grants nothing and lapses, a
 * placement never outruns its listing, a newer invoice retires the older, admins grant without
 * payment, and every payment e-mails a receipt.
 */
import './payment-env';
import '../src/config/load-env';
import { randomInt } from 'node:crypto';
import type { Server } from 'node:http';
import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getDataSourceToken, TypeOrmModule } from '@nestjs/typeorm';
import request from 'supertest';
import type { DataSource } from 'typeorm';
import type { AppNotification, Payment, PaymentCatalogue, PaymentInvoice } from '@zuuchmap/core';
import { AUTH_CONFIG, authConfigFromEnv, type AuthConfig } from '../src/auth/auth.config';
import { AuthModule } from '../src/auth/auth.module';
import { openSession } from '../src/auth/request-user';
import { CategoryModule } from '../src/category/category.module';
import { CategoryService } from '../src/category/category.service';
import { AllExceptionsFilter } from '../src/common/all-exceptions.filter';
import { dataSourceOptions } from '../src/database/data-source';
import { NotificationModule } from '../src/notification/notification.module';
import { NotificationService } from '../src/notification/notification.service';
import { NOTIFY_TRANSPORTS, type NotifyTransports, type OutboundMail } from '../src/notification/transports';
import { PAYMENT_GATEWAY, type PaymentGateway } from '../src/payment/gateway';
import { PaymentModule } from '../src/payment/payment.module';
import { addMonths, PaymentService } from '../src/payment/payment.service';
import { PostModule } from '../src/post/post.module';
import { RedisModule } from '../src/redis/redis.module';
import { UserModule } from '../src/user/user.module';

/** QPay as the tests need it: invoices numbered, money arriving when a test says so. */
const paid = new Map<string, number>();
let invoices = 0;
let refuse = false;
const gateway: PaymentGateway = {
  configured: true,
  createInvoice: () => {
    if (refuse) return Promise.reject(new Error('QPay down'));
    invoices++;
    return Promise.resolve({ invoice_id: `inv-${String(invoices)}`, qr_text: 'qr', qr_image: 'png', urls: [{ name: 'Khan bank', description: 'Хаан банк', logo: '', link: 'khanbank://q?qPay_QRcode=x' }] });
  },
  check: (id) => Promise.resolve({ paid_amount: paid.get(id) ?? 0 }),
};

const mailed: OutboundMail[] = [];
const transports: NotifyTransports = {
  push: () => Promise.resolve({ dead: [] }),
  mail: (m) => {
    mailed.push(m);
    return Promise.resolve();
  },
  webPushKey: null,
  mailEnabled: true,
};

let app: INestApplication;
let ds: DataSource;
let svc: PaymentService;
let notify: NotificationService;
const phones = Array.from({ length: 4 }, () => `5${String(randomInt(1_000_000, 10_000_000))}`);
const ids = { provider: '', other: '', customer: '', admin: '' };
const auth = {} as Record<keyof typeof ids, { Authorization: string }>;
const http = (): ReturnType<typeof request> => request(app.getHttpServer() as Server);
const DAY = 86_400_000;

async function insertPost(owner: string, extra: Record<string, unknown> = {}): Promise<number> {
  const cols = { user_id: owner, title: 'Komatsu PC200 экскаватор', category: 'machineryrent', subcategory: 'excavator', province: 'ULAANBAATAR', price_amount: 450000, price_unit: 'DAY', approval_status: 'APPROVED', status: 'ACTIVE', expires_at: new Date(Date.now() + 26 * DAY), ...extra };
  const keys = Object.keys(cols);
  const rows = await ds.query<Array<{ id: number }>>(
    `INSERT INTO posts (${keys.join(', ')}) VALUES (${keys.map((_, i) => `$${String(i + 1)}`).join(', ')}) RETURNING id`,
    Object.values(cols),
  );
  return rows[0].id;
}

const invoiceOf = async (id: string): Promise<string> =>
  (await ds.query<Array<{ provider_invoice_id: string }>>('SELECT provider_invoice_id FROM payments WHERE id = $1', [id]))[0].provider_invoice_id;
const plan = async (id: string): Promise<{ plan: string; plan_expires_at: Date | null }> =>
  (await ds.query<Array<{ plan: string; plan_expires_at: Date | null }>>('SELECT plan, plan_expires_at FROM users WHERE id = $1', [id]))[0];

beforeAll(async () => {
  const cfg: AuthConfig = { ...authConfigFromEnv(), devMode: true, adminPhones: [phones[3]] };
  const mod = await Test.createTestingModule({
    imports: [TypeOrmModule.forRoot({ ...dataSourceOptions(), autoLoadEntities: true }), RedisModule, AuthModule, UserModule, CategoryModule, PostModule, NotificationModule, PaymentModule],
  })
    .overrideProvider(AUTH_CONFIG).useValue(cfg)
    .overrideProvider(PAYMENT_GATEWAY).useValue(gateway)
    .overrideProvider(NOTIFY_TRANSPORTS).useValue(transports)
    .compile();
  app = mod.createNestApplication();
  app.setGlobalPrefix('api');
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.init();
  ds = app.get<DataSource>(getDataSourceToken());
  svc = app.get(PaymentService);
  notify = app.get(NotificationService);
  await app.get(CategoryService).seed();
  const rows = await ds.query<Array<{ id: string; phone_number: string }>>(
    `INSERT INTO users (phone_number, is_verified, type, given_name, email) VALUES
       ($1, true, 'PROVIDER', 'Бат', 'bat@example.mn'), ($2, true, 'PROVIDER', 'Дорж', NULL),
       ($3, true, 'CUSTOMER', 'Ганбат', NULL), ($4, true, 'CUSTOMER', 'Админ', NULL) RETURNING id, phone_number`,
    phones,
  );
  const byPhone = new Map(rows.map((r) => [r.phone_number, r.id]));
  for (const [i, k] of (['provider', 'other', 'customer', 'admin'] as const).entries()) {
    ids[k] = byPhone.get(phones[i]) as string;
    auth[k] = { Authorization: `Bearer ${await openSession(ds, ids[k], cfg)}` };
  }
});

afterAll(async () => {
  const all = Object.values(ids);
  await ds.query('DELETE FROM posts WHERE user_id = ANY($1::uuid[])', [all]);
  await ds.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [all]);
  await app.close();
});

describe('catalogue', () => {
  it('lists the prices without sign-in', async () => {
    const c = (await http().get('/api/payments/catalogue').expect(200)).body as PaymentCatalogue;
    expect(c.enabled).toBe(true);
    expect(c.plans.find((p) => p.plan === 'PROVIDER')?.monthly_price).toBe(49900);
    expect(c.featured).toMatchObject({ price_per_day: 5000, packs: [7, 14, 30], max_days: 30 });
  });
});

describe('plan', () => {
  let first: PaymentInvoice;

  it('is for providers only', async () => {
    const res = await http().post('/api/payments/invoice').set(auth.customer).send({ kind: 'PLAN', months: 1 }).expect(403);
    expect((res.body as { code: string }).code).toBe('PROVIDER_ONLY');
  });

  it('refuses a length that is not on sale', async () => {
    await http().post('/api/payments/invoice').set(auth.provider).send({ kind: 'PLAN', months: 2 }).expect(400);
  });

  it('opens an invoice priced by the month, with a QR and bank links', async () => {
    first = (await http().post('/api/payments/invoice').set(auth.provider).send({ kind: 'PLAN', months: 3 }).expect(201)).body as PaymentInvoice;
    expect(first.payment).toMatchObject({ kind: 'PLAN', plan: 'PROVIDER', months: 3, amount: 149700, status: 'PENDING' });
    expect(first.payment.reference).toMatch(/^ZM-[0-9A-F]{6}$/);
    expect(first.qr_image).toBe('png');
    expect(first.urls).toHaveLength(1);
  });

  it('an unpaid invoice grants nothing', async () => {
    const p = (await http().get(`/api/payments/${first.payment.id}/status`).set(auth.provider).expect(200)).body as Payment;
    expect(p.status).toBe('PENDING');
    expect((await plan(ids.provider)).plan).toBe('FREE');
  });

  it('a newer invoice of the same kind retires the older one', async () => {
    const second = (await http().post('/api/payments/invoice').set(auth.provider).send({ kind: 'PLAN', months: 1 }).expect(201)).body as PaymentInvoice;
    const old = (await http().get(`/api/payments/${first.payment.id}`).set(auth.provider).expect(200)).body as PaymentInvoice;
    expect(old.payment.status).toBe('CANCELLED');
    expect(old.qr_image).toBeNull();
    first = second;
  });

  it('paid: grants the plan once, however many times QPay is asked', async () => {
    paid.set(await invoiceOf(first.payment.id), 49900);
    mailed.length = 0;
    await http().get(`/api/payments/callback/${first.payment.id}`).expect(200);
    const [a, b] = await Promise.all([svc.settle(first.payment.id), svc.refresh(first.payment.id, true)]);
    expect(a).toBe(false);
    expect(b).toBeUndefined();
    const p = (await http().get(`/api/payments/${first.payment.id}/status`).set(auth.provider).expect(200)).body as Payment;
    expect(p.status).toBe('PAID');
    const u = await plan(ids.provider);
    expect(u.plan).toBe('PROVIDER');
    expect(p.granted_until).toBe(u.plan_expires_at?.toISOString());
    const months = (u.plan_expires_at?.getTime() ?? 0) - Date.now();
    expect(months).toBeGreaterThan(27 * DAY);
    expect(months).toBeLessThan(32 * DAY);
  });

  it('tells the provider and e-mails a receipt (Figma Q4)', async () => {
    await notify.drain();
    const rows = (await http().get('/api/notifications').set(auth.provider).expect(200)).body as AppNotification[];
    expect(rows.find((n) => n.kind === 'PAYMENT_PAID')?.data).toMatchObject({ payment_kind: 'PLAN', amount: 49900 });
    const mail = mailed.find((m) => m.to === 'bat@example.mn');
    expect(mail?.subject).toContain(first.payment.reference);
    expect(mail?.html).toContain('49,900₮');
  });

  it('a second plan extends from the current end', async () => {
    const before = (await plan(ids.provider)).plan_expires_at as Date;
    const inv = (await http().post('/api/payments/invoice').set(auth.provider).send({ kind: 'PLAN', months: 1 }).expect(201)).body as PaymentInvoice;
    paid.set(await invoiceOf(inv.payment.id), 49900);
    await svc.refresh(inv.payment.id, true);
    expect((await plan(ids.provider)).plan_expires_at?.toISOString()).toBe(addMonths(before, 1).toISOString());
  });

  it('an underpaid invoice grants nothing', async () => {
    const inv = (await http().post('/api/payments/invoice').set(auth.other).send({ kind: 'PLAN', months: 1 }).expect(201)).body as PaymentInvoice;
    paid.set(await invoiceOf(inv.payment.id), 100);
    await svc.refresh(inv.payment.id, true);
    expect((await plan(ids.other)).plan).toBe('FREE');
  });

  it('an invoice nobody paid lapses after 30 minutes', async () => {
    const inv = (await http().post('/api/payments/invoice').set(auth.other).send({ kind: 'PLAN', months: 1 }).expect(201)).body as PaymentInvoice;
    await ds.query(`UPDATE payments SET expires_at = now() - interval '1 minute' WHERE id = $1`, [inv.payment.id]);
    await svc.sweepPending();
    const p = (await http().get(`/api/payments/${inv.payment.id}/status`).set(auth.other).expect(200)).body as Payment;
    expect(p.status).toBe('EXPIRED');
    // Money that arrives after it lapsed is still granted.
    paid.set(await invoiceOf(inv.payment.id), 49900);
    await svc.sweepPending();
    expect((await plan(ids.other)).plan).toBe('PROVIDER');
  });

  it('QPay refusing the invoice leaves nothing payable behind', async () => {
    refuse = true;
    try {
      const res = await http().post('/api/payments/invoice').set(auth.other).send({ kind: 'PLAN', months: 1 }).expect(503);
      expect((res.body as { code: string }).code).toBe('PAYMENT_PROVIDER_ERROR');
    } finally {
      refuse = false;
    }
    const mine = (await http().get('/api/payments/mine').set(auth.other).expect(200)).body as Payment[];
    expect(mine.some((p) => p.status === 'PENDING')).toBe(false);
  });

  it('another account cannot read the payment', async () => {
    await http().get(`/api/payments/${first.payment.id}/status`).set(auth.other).expect(404);
  });
});

describe('featured placement', () => {
  let live: number;
  let soon: number;

  beforeAll(async () => {
    live = await insertPost(ids.provider);
    soon = await insertPost(ids.provider, { title: 'Кран 25 тн', expires_at: new Date(Date.now() + 9 * DAY - 3_600_000) });
  });

  it('only the owner, only a live listing', async () => {
    await http().post('/api/payments/invoice').set(auth.other).send({ kind: 'FEATURED', post_id: live, days: 7 }).expect(403);
    const pending = await insertPost(ids.provider, { approval_status: 'PENDING' });
    const res = await http().post('/api/payments/invoice').set(auth.provider).send({ kind: 'FEATURED', post_id: pending, days: 7 }).expect(400);
    expect((res.body as { code: string }).code).toBe('POST_NOT_FEATURABLE');
  });

  it('days are cut to the listing\'s remaining window (Figma P2)', async () => {
    const inv = (await http().post('/api/payments/invoice').set(auth.provider).send({ kind: 'FEATURED', post_id: soon, days: 14 }).expect(201)).body as PaymentInvoice;
    expect(inv.payment).toMatchObject({ kind: 'FEATURED', post_id: soon, days: 9, amount: 45000, post_title: 'Кран 25 тн' });
  });

  it('paid: the listing is featured, never past its own end', async () => {
    const inv = (await http().post('/api/payments/invoice').set(auth.provider).send({ kind: 'FEATURED', post_id: live, days: 7 }).expect(201)).body as PaymentInvoice;
    expect(inv.payment.amount).toBe(35000);
    paid.set(await invoiceOf(inv.payment.id), 35000);
    await svc.refresh(inv.payment.id, true);
    const [p] = await ds.query<Array<{ is_featured: boolean; featured_until: Date; expires_at: Date }>>('SELECT is_featured, featured_until, expires_at FROM posts WHERE id = $1', [live]);
    expect(p.is_featured).toBe(true);
    expect(Math.round((p.featured_until.getTime() - Date.now()) / DAY)).toBe(7);
    expect(p.featured_until.getTime()).toBeLessThanOrEqual(p.expires_at.getTime());
  });

  it('a lapsed placement stops lifting the listing', async () => {
    await ds.query(`UPDATE posts SET featured_until = now() - interval '1 minute' WHERE id = $1`, [live]);
    await svc.expireFeatured();
    const [p] = await ds.query<Array<{ is_featured: boolean }>>('SELECT is_featured FROM posts WHERE id = $1', [live]);
    expect(p.is_featured).toBe(false);
  });
});

describe('admin grants (Figma J11d)', () => {
  it('are admin-only', async () => {
    await http().post(`/api/admin/users/${ids.customer}/plan`).set(auth.provider).send({ months: 1 }).expect(403);
  });

  it('grant and revoke a plan, recorded as a 0₮ manual payment', async () => {
    const p = (await http().post(`/api/admin/users/${ids.customer}/plan`).set(auth.admin).send({ months: 3 }).expect(200)).body as Payment;
    expect(p).toMatchObject({ provider: 'MANUAL', amount: 0, status: 'PAID', months: 3 });
    expect((await plan(ids.customer)).plan).toBe('PROVIDER');
    await http().delete(`/api/admin/users/${ids.customer}/plan`).set(auth.admin).expect(200);
    expect((await plan(ids.customer)).plan).toBe('FREE');
  });

  it('grant a placement, cut to the listing', async () => {
    const post = await insertPost(ids.other, { expires_at: new Date(Date.now() + 5 * DAY) });
    const p = (await http().post(`/api/admin/posts/${String(post)}/feature`).set(auth.admin).send({ days: 14 }).expect(200)).body as Payment;
    expect(p).toMatchObject({ provider: 'MANUAL', kind: 'FEATURED', days: 5, amount: 0, status: 'PAID' });
  });
});

describe('history (Figma P8)', () => {
  it('lists the account\'s payments newest first and resends a receipt', async () => {
    const mine = (await http().get('/api/payments/mine').set(auth.provider).expect(200)).body as Payment[];
    expect(mine.length).toBeGreaterThanOrEqual(4);
    const times = mine.map((p) => p.date_created);
    expect([...times].sort().reverse()).toEqual(times);
    const paidOne = mine.find((p) => p.status === 'PAID') as Payment;
    mailed.length = 0;
    await http().post(`/api/payments/${paidOne.id}/receipt`).set(auth.provider).expect(200);
    await notify.drain();
    expect(mailed).toHaveLength(1);
  });
});
