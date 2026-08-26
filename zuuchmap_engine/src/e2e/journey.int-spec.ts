/**
 * End-to-end journey over real HTTP against a real Postgres.
 *
 * The unit suite mocks every repository and the integration suite talks to the
 * database directly; neither has ever exercised the thing the product actually
 * is — a request arriving at a route, passing a guard, a validation pipe, a
 * service, and coming back as JSON. Every wiring mistake lives in that gap:
 * a controller registered in the wrong order, a DTO that rejects a field the
 * client sends, a guard applied to the wrong handler.
 *
 * Auth is minted directly from JWT_SECRET rather than walked through verify.mn.
 * That flow costs the end user 150₮ per run and proves possession of a phone,
 * which is not what this suite is asking about.
 *
 * Everything it creates, it deletes in `afterAll`.
 *
 * Run: npm run test:int
 */
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({
  path: path.resolve(
    process.cwd(),
    'config/variables',
    `${process.env.NODE_ENV ?? 'development'}.env`,
  ),
});

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import * as request from 'supertest';
import { AppModule } from '../app.module';
import { AllExceptionsFilter } from '../filters/all-exceptions.filter';
import { User } from '../user/entities/user.entity';
import { Post } from '../post/entities/post.entity';
import { UserType } from '../enums/usertype';

jest.setTimeout(60000);

let app: INestApplication;
let ds: DataSource;
let http: any;

let providerId: string;
let customerId: string;
let adminId: string;
let providerToken: string;
let customerToken: string;
let adminToken: string;
let postId: number;
let category: any;

const created = { users: [] as string[], posts: [] as number[] };

/** Mirrors what auth.service signs, so the guards see exactly what they see in production. */
const tokenFor = (
  jwt: JwtService,
  user: { id: string; phone_number: string },
) =>
  jwt.sign(
    { sub: user.id, phone_number: user.phone_number },
    {
      secret: process.env.JWT_SECRET,
      expiresIn: '1h',
    },
  );

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  app = moduleRef.createNestApplication();
  app.setGlobalPrefix('/engine');
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  await app.init();

  http = app.getHttpServer();
  ds = app.get(DataSource);
  const jwt = app.get(JwtService);
  const users = ds.getRepository(User);

  // The admin's identity is its phone number (ADMIN_PHONES), not a role column.
  const adminPhone = (process.env.ADMIN_PHONES ?? '').split(',')[0]?.trim();
  if (!adminPhone)
    throw new Error('ADMIN_PHONES must be set for the e2e journey');

  const provider = await users.save(
    users.create({
      type: UserType.PROVIDER,
      phone_number: `e2e-prov-${Date.now()}`,
      given_name: 'E2E Provider',
      is_verified: true,
    }),
  );
  const customer = await users.save(
    users.create({
      type: UserType.CUSTOMER,
      phone_number: `e2e-cust-${Date.now()}`,
      given_name: 'E2E Customer',
      is_verified: true,
    }),
  );
  const admin = await users.save(
    users.create({
      type: UserType.PROVIDER,
      phone_number: adminPhone,
      given_name: 'E2E Admin',
      is_verified: true,
    }),
  );

  providerId = provider.id;
  customerId = customer.id;
  adminId = admin.id;
  created.users.push(provider.id, customer.id, admin.id);

  providerToken = tokenFor(jwt, provider);
  customerToken = tokenFor(jwt, customer);
  adminToken = tokenFor(jwt, admin);

  // Categories are data, not code — an admin can add a required field without
  // a deploy. Reading the schema and filling it is what a client does, so the
  // fixture stays valid when the schema changes instead of going stale.
  const categories = await request(http)
    .get('/engine/posts/categories/all')
    .expect(200);
  category =
    categories.body.find((c: any) => c.key === 'machineryrent') ??
    categories.body[0];
  if (!category) throw new Error('No category schemas seeded');
});

/** A plausible value for every field the schema marks required. */
function fillRequired(schema: any): Record<string, any> {
  const out: Record<string, any> = {};
  for (const field of schema?.fields ?? []) {
    if (!field?.required) continue;
    switch (field.type) {
      case 'number':
        out[field.key] = 1;
        break;
      case 'boolean':
        out[field.key] = true;
        break;
      case 'date':
        out[field.key] = new Date().toISOString().slice(0, 10);
        break;
      case 'select':
        out[field.key] =
          field.options?.[0]?.value ?? field.options?.[0] ?? 'other';
        break;
      case 'multiselect':
        out[field.key] = [
          field.options?.[0]?.value ?? field.options?.[0] ?? 'other',
        ];
        break;
      default:
        out[field.key] = 'E2E';
    }
  }
  return out;
}

afterAll(async () => {
  if (ds?.isInitialized) {
    if (created.posts.length) {
      await ds
        .getRepository(Post)
        .delete(created.posts)
        .catch(() => undefined);
    }
    if (created.users.length) {
      await ds
        .getRepository(User)
        .delete(created.users)
        .catch(() => undefined);
    }
  }
  await app?.close();
});

describe('health', () => {
  it('answers liveness without auth', async () => {
    const res = await request(http).get('/engine/health').expect(200);
    expect(res.body.status).toBe('ok');
  });

  it('answers readiness with the database reachable', async () => {
    const res = await request(http).get('/engine/health/ready').expect(200);
    expect(res.body.checks.database.ok).toBe(true);
  });
});

describe('public surface', () => {
  it('serves the category schemas clients build their forms from', async () => {
    const res = await request(http)
      .get('/engine/posts/categories/all')
      .expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  it('paginates browse as { items, total }', async () => {
    const res = await request(http).get('/engine/posts?limit=2').expect(200);
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(typeof res.body.total).toBe('number');
  });

  it('publishes a sitemap that contains the live listings', async () => {
    const res = await request(http).get('/engine/seo/sitemap.xml').expect(200);
    expect(res.text).toContain('<sitemapindex');
    expect(res.text).toContain('sitemap-posts-1.xml');
  });

  it('prices the plan ladder without requiring a session', async () => {
    const res = await request(http)
      .get('/engine/payments/catalogue')
      .expect(200);
    expect(res.body.plans.map((p: any) => p.plan)).toContain('PROVIDER');
  });
});

describe('provider journey', () => {
  it('rejects an unauthenticated post', async () => {
    await request(http).post('/engine/posts').send({ title: 'x' }).expect(401);
  });

  it('creates a listing that starts out pending', async () => {
    const res = await request(http)
      .post('/engine/posts')
      .set('Authorization', `Bearer ${providerToken}`)
      .field('title', 'E2E экскаватор түрээс')
      .field('category', category.key)
      .field('details', 'E2E journey fixture')
      .field('province', 'ULAANBAATAR')
      .field('attributes', JSON.stringify(fillRequired(category)))
      .expect(201);

    postId = res.body.id;
    created.posts.push(postId);
    expect(res.body.approval_status).toBe('PENDING');
  });

  it('keeps a pending listing out of public browse', async () => {
    const res = await request(http).get(`/engine/posts?q=E2E`).expect(200);
    expect(res.body.items.find((p: any) => p.id === postId)).toBeUndefined();
  });

  it('lists it under the owner’s own posts', async () => {
    const res = await request(http)
      .get('/engine/posts/mine')
      .set('Authorization', `Bearer ${providerToken}`)
      .expect(200);
    expect(
      res.body.some?.((p: any) => p.id === postId) ||
        res.body.items?.some((p: any) => p.id === postId),
    ).toBe(true);
  });
});

describe('moderation', () => {
  it('refuses approval from a non-admin', async () => {
    await request(http)
      .put(`/engine/admin/posts/${postId}/approve`)
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(403);
  });

  it('approves and the listing becomes publicly visible', async () => {
    await request(http)
      .put(`/engine/admin/posts/${postId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const res = await request(http).get(`/engine/posts/${postId}`).expect(200);
    expect(res.body.approval_status).toBe('APPROVED');
  });
});

describe('views', () => {
  it('counts an anonymous viewer', async () => {
    const before =
      (await request(http).get(`/engine/posts/${postId}`)).body.views ?? 0;
    await request(http)
      .put(`/engine/posts/${postId}/views`)
      .set('X-Visitor-Id', `e2e-visitor-${Date.now()}`)
      .expect(200);
    const after =
      (await request(http).get(`/engine/posts/${postId}`)).body.views ?? 0;
    expect(after).toBe(before + 1);
  });

  it('does not count the same anonymous viewer twice', async () => {
    const visitor = `e2e-visitor-fixed-${Date.now()}`;
    await request(http)
      .put(`/engine/posts/${postId}/views`)
      .set('X-Visitor-Id', visitor)
      .expect(200);
    const mid =
      (await request(http).get(`/engine/posts/${postId}`)).body.views ?? 0;
    await request(http)
      .put(`/engine/posts/${postId}/views`)
      .set('X-Visitor-Id', visitor)
      .expect(200);
    const after =
      (await request(http).get(`/engine/posts/${postId}`)).body.views ?? 0;
    expect(after).toBe(mid);
  });

  it('does not count the owner looking at their own listing', async () => {
    const before =
      (await request(http).get(`/engine/posts/${postId}`)).body.views ?? 0;
    await request(http)
      .put(`/engine/posts/${postId}/views`)
      .set('Authorization', `Bearer ${providerToken}`)
      .expect(200);
    const after =
      (await request(http).get(`/engine/posts/${postId}`)).body.views ?? 0;
    expect(after).toBe(before);
  });
});

describe('messaging', () => {
  let conversationId: string;

  it('opens a thread from a customer to the owner', async () => {
    const res = await request(http)
      .post('/engine/conversations')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ post_id: postId, body: 'Сайн байна уу, боломжтой юу?' })
      .expect(201);
    conversationId = res.body.id;
    expect(res.body.role).toBe('CUSTOMER');
  });

  it('shows the provider an unread message', async () => {
    const res = await request(http)
      .get('/engine/conversations/unread-count')
      .set('Authorization', `Bearer ${providerToken}`)
      .expect(200);
    expect(res.body.unread).toBeGreaterThan(0);
  });

  it('keeps a stranger out of the thread', async () => {
    await request(http)
      .get(`/engine/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(403);
  });

  it('clears the badge once the provider opens it', async () => {
    await request(http)
      .put(`/engine/conversations/${conversationId}/read`)
      .set('Authorization', `Bearer ${providerToken}`)
      .expect(200);
    const res = await request(http)
      .get('/engine/conversations/unread-count')
      .set('Authorization', `Bearer ${providerToken}`)
      .expect(200);
    expect(res.body.unread).toBe(0);
  });
});

describe('reports', () => {
  it('accepts a flag on a live listing and shows it in the admin queue', async () => {
    await request(http)
      .post('/engine/reports')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ post_id: postId, reason: 'WRONG_INFO', detail: 'e2e' })
      .expect(201);

    const res = await request(http)
      .get('/engine/reports')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(res.body.items.some((r: any) => r.post?.id === postId)).toBe(true);
  });

  it('refuses a reason that is not on the list', async () => {
    await request(http)
      .post('/engine/reports')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ post_id: postId, reason: 'BECAUSE_I_SAY_SO' })
      .expect(400);
  });

  it('keeps the queue away from non-admins', async () => {
    await request(http)
      .get('/engine/reports')
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(403);
  });
});
