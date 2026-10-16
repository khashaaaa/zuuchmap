import '../src/config/load-env';
import { randomInt } from 'node:crypto';
import type { Server } from 'node:http';
import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import { getDataSourceToken, TypeOrmModule } from '@nestjs/typeorm';
import request from 'supertest';
import type { DataSource } from 'typeorm';
import type { AuthResponse, VerifyStartResponse, VerifyStatusResponse } from '@zuuchmap/core';
import { AUTH_CONFIG, authConfigFromEnv, type AuthConfig } from '../src/auth/auth.config';
import { AuthController } from '../src/auth/auth.controller';
import { AuthModule } from '../src/auth/auth.module';
import { AuthService, hashDevice } from '../src/auth/auth.service';
import { AccountThrottlerGuard } from '../src/auth/guards';
import { TrustedDevice } from '../src/auth/entities/trusted-device.entity';
import { VerificationSession } from '../src/auth/entities/verification-session.entity';
import { AllExceptionsFilter } from '../src/common/all-exceptions.filter';
import { dataSourceOptions } from '../src/database/data-source';
import { RedisModule } from '../src/redis/redis.module';
import { User } from '../src/user/entities/user.entity';
import { AdminModule } from '../src/admin/admin.module';
import { UserModule } from '../src/user/user.module';
import { UserService } from '../src/user/user.service';

const phones: string[] = [];
/** 7xxxxxxx: not a real mobile prefix, so it never collides with a real account. */
function phone(): string {
  const p = `7${String(randomInt(1_000_000, 10_000_000))}`;
  phones.push(p);
  return p;
}
const ADMIN = phone();
const device = (): string => `dev-${String(randomInt(1e9))}-${String(Date.now())}`;

let app: INestApplication;
let ds: DataSource;
let auth: AuthService;
let users: UserService;
let http: () => ReturnType<typeof request>;
let cfg: AuthConfig;

beforeAll(async () => {
  cfg = { ...authConfigFromEnv(), devMode: true, adminPhones: [ADMIN], rateLimit: 3, rateTtlMs: 60_000 };
  const mod = await Test.createTestingModule({
    imports: [
      TypeOrmModule.forRoot({ ...dataSourceOptions(), autoLoadEntities: true }),
      ThrottlerModule.forRoot([{ ttl: 60_000, limit: 10_000 }]),
      RedisModule,
      AuthModule,
      UserModule,
      AdminModule,
    ],
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
  auth = app.get(AuthService);
  users = app.get(UserService);
  http = () => request(app.getHttpServer() as Server);
});

afterAll(async () => {
  await ds.query('DELETE FROM verification_session WHERE phone_number = ANY($1)', [phones]);
  await ds.query('DELETE FROM users WHERE phone_number = ANY($1)', [phones]);
  await app.close();
});

async function signIn(p: string, deviceId?: string): Promise<AuthResponse> {
  const start = await http().post('/api/auth/verify/start').send({ phone_number: p, device_id: deviceId }).expect(200);
  const s = start.body as VerifyStartResponse;
  if (s.verified && s.auth) return s.auth;
  const st = await http().post('/api/auth/verify/status').send({ session_id: s.session_id }).expect(200);
  const body = st.body as VerifyStatusResponse;
  expect(body.status).toBe('VERIFIED');
  return body.auth as AuthResponse;
}

function bearer(a: AuthResponse): { Authorization: string } {
  return { Authorization: `Bearer ${a.token}` };
}

async function startSession(p: string, deviceId?: string): Promise<VerifyStartResponse> {
  const res = await http().post('/api/auth/verify/start').send({ phone_number: p, device_id: deviceId }).expect(200);
  return res.body as VerifyStartResponse;
}

describe('sign-in by text and trusted devices', () => {
  it('a new device needs verification; the same device afterwards gets a token with none', async () => {
    const p = phone();
    const d = device();
    const first = await startSession(p, d);
    expect(first).toMatchObject({ verified: false, shortcode: '144773', auth: null });
    expect(first.code).toMatch(/^\d{6}$/);

    const st = await http().post('/api/auth/verify/status').send({ session_id: first.session_id }).expect(200);
    const done = st.body as VerifyStatusResponse;
    expect(done.status).toBe('VERIFIED');
    expect(done.auth?.user).toMatchObject({ phone_number: p, type: 'CUSTOMER', is_verified: true, is_admin: false });

    const again = await startSession(p, d);
    expect(again.verified).toBe(true);
    expect(again.session_id).toBeNull();
    expect(again.auth?.token).toBeTruthy();
    expect(again.auth?.user.id).toBe(done.auth?.user.id);

    // A different device on the same account must verify again.
    const other = await startSession(p, device());
    expect(other.verified).toBe(false);
    expect(other.session_id).toBeTruthy();
  });

  it('stores only the hash of the device id', async () => {
    const p = phone();
    const d = device();
    const a = await signIn(p, d);
    const rows = await ds.getRepository(TrustedDevice).find({ where: { user_id: a.user.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.device_hash).toBe(hashDevice(d));
    expect(rows[0]?.device_hash).not.toBe(d);
  });

  it('a device idle for over a year is no longer trusted', async () => {
    const p = phone();
    const d = device();
    const a = await signIn(p, d);
    await ds.query("UPDATE trusted_device SET last_seen_at = now() - interval '400 days' WHERE user_id = $1", [
      a.user.id,
    ]);
    expect((await startSession(p, d)).verified).toBe(false);
  });

  it('logout forgets the device so the next sign-in verifies again', async () => {
    const p = phone();
    const d = device();
    const a = await signIn(p, d);
    expect((await startSession(p, d)).verified).toBe(true);
    await http().post('/api/auth/logout').set(bearer(a)).send({ device_id: d }).expect(200);
    expect((await startSession(p, d)).verified).toBe(false);
    await http().post('/api/auth/logout').send({}).expect(401);
  });

  it('logout ends that token alone; the account’s other sessions keep working', async () => {
    const p = phone();
    const d = device();
    const a = await signIn(p, d);
    const other = await startSession(p, d); // the same account on a second, trusted session
    expect(other.verified).toBe(true);
    await http().post('/api/auth/logout').set(bearer(a)).send({}).expect(200);
    await http().get('/api/user/profile').set(bearer(a)).expect(401);
    await http().get('/api/user/profile').set({ Authorization: `Bearer ${other.auth?.token ?? ''}` }).expect(200);
  });

  it('issues a year-long token that the profile route accepts', async () => {
    const a = await signIn(phone(), device());
    const payload = JSON.parse(Buffer.from(a.token.split('.')[1] ?? '', 'base64url').toString('utf8')) as {
      iat: number;
      exp: number;
    };
    expect(payload.exp - payload.iat).toBe(365 * 24 * 3600);
    const me = await http().get('/api/user/profile').set(bearer(a)).expect(200);
    expect(me.body).toMatchObject({ id: a.user.id, type: 'CUSTOMER', is_admin: false });
    await http().get('/api/user/profile').expect(401);
  });

  it('rejects a malformed phone', async () => {
    await http().post('/api/auth/verify/start').send({ phone_number: '123' }).expect(400);
    await http().post('/api/auth/verify/start').send({}).expect(400);
  });
});

describe('verification sessions', () => {
  it('spends a session exactly once under concurrent polls', async () => {
    const s = await startSession(phone(), device());
    await ds.getRepository(VerificationSession).update({ id: s.session_id as string }, { status: 'VERIFIED' });
    const results = await Promise.allSettled(
      Array.from({ length: 6 }, () => auth.checkVerification(s.session_id as string)),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const lost = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(lost).toHaveLength(5);
    for (const r of lost) expect((r.reason as { status?: number }).status).toBe(410);
    await http().post('/api/auth/verify/status').send({ session_id: s.session_id }).expect(410);
  });

  it('two sessions finishing together for one new number create one account', async () => {
    const p = phone();
    const [a, b] = await Promise.all([startSession(p, device()), startSession(p, device())]);
    const [ra, rb] = await Promise.all([
      auth.checkVerification(a.session_id as string),
      auth.checkVerification(b.session_id as string),
    ]);
    expect(ra.auth?.user.id).toBe(rb.auth?.user.id);
    expect(await ds.getRepository(User).countBy({ phone_number: p })).toBe(1);
  });

  it('the unique phone index holds under concurrent creates', async () => {
    const p = phone();
    const made = await Promise.all(Array.from({ length: 8 }, () => users.findOrCreateByPhone(p)));
    expect(new Set(made.map((u) => u.id)).size).toBe(1);
    expect(await ds.getRepository(User).countBy({ phone_number: p })).toBe(1);
    await expect(
      ds.getRepository(User).insert({ phone_number: p }),
    ).rejects.toMatchObject({ code: '23505' });
  });

  it('an expired session reports EXPIRED and can never be spent', async () => {
    const s = await startSession(phone(), device());
    await ds
      .getRepository(VerificationSession)
      .update({ id: s.session_id as string }, { expires_at: new Date(Date.now() - 1000) });
    for (let i = 0; i < 2; i++) {
      const res = await http().post('/api/auth/verify/status').send({ session_id: s.session_id }).expect(200);
      expect(res.body).toEqual({ status: 'EXPIRED', auth: null });
    }
    const row = await ds.getRepository(VerificationSession).findOneByOrFail({ id: s.session_id as string });
    expect(row.status).toBe('EXPIRED');
  });

  it('an unknown or malformed session id is 404', async () => {
    await http().post('/api/auth/verify/status').send({ session_id: 'nope' }).expect(404);
    await http()
      .post('/api/auth/verify/status')
      .send({ session_id: '00000000-0000-4000-8000-000000000000' })
      .expect(404);
  });

  it('the callback only records the outcome; the poll still gets the token', async () => {
    const s = await startSession(phone(), device());
    await http().get(`/api/auth/verify/callback/${s.session_id as string}`).expect(200);
    await http().get('/api/auth/verify/callback/not-a-uuid').expect(200);
    await new Promise((r) => setTimeout(r, 150));
    const row = await ds.getRepository(VerificationSession).findOneByOrFail({ id: s.session_id as string });
    expect(row.status).toBe('VERIFIED');
    const res = await http().post('/api/auth/verify/status').send({ session_id: s.session_id }).expect(200);
    expect((res.body as VerifyStatusResponse).auth?.token).toBeTruthy();
  });

  it('caps paid verifications per phone (VERIFY_RATE_LIMIT)', async () => {
    const p = phone();
    for (let i = 0; i < cfg.rateLimit; i++) await startSession(p, device());
    const res = await http().post('/api/auth/verify/start').send({ phone_number: p, device_id: device() }).expect(429);
    expect(res.body).toMatchObject({ code: 'TOO_MANY_VERIFICATIONS' });
  });

  it('a trusted device is not charged against the rate limit', async () => {
    const p = phone();
    const d = device();
    await signIn(p, d);
    for (let i = 0; i < cfg.rateLimit + 3; i++) expect((await startSession(p, d)).verified).toBe(true);
  });
});

describe('role', () => {
  it('everyone starts as customer; provider is set once and the repeat is idempotent', async () => {
    const a = await signIn(phone(), device());
    expect(a.user.type).toBe('CUSTOMER');
    const first = await http().post('/api/user/role').set(bearer(a)).send({ type: 'PROVIDER' }).expect(200);
    expect(first.body).toMatchObject({ type: 'PROVIDER' });
    await http().post('/api/user/role').set(bearer(a)).send({ type: 'PROVIDER' }).expect(200);
    const back = await http().post('/api/user/role').set(bearer(a)).send({ type: 'CUSTOMER' }).expect(409);
    expect(back.body).toMatchObject({ code: 'ROLE_ALREADY_SET' });
    const me = await http().get('/api/user/profile').set(bearer(a)).expect(200);
    expect(me.body).toMatchObject({ type: 'PROVIDER' });
  });

  it('concurrent first-listing role sets all succeed with one outcome', async () => {
    const a = await signIn(phone(), device());
    const rs = await Promise.all(
      Array.from({ length: 5 }, () => http().post('/api/user/role').set(bearer(a)).send({ type: 'PROVIDER' })),
    );
    expect(rs.map((r) => r.status)).toEqual([200, 200, 200, 200, 200]);
  });

  it('rejects an unknown role and the profile route cannot set it', async () => {
    const a = await signIn(phone(), device());
    await http().post('/api/user/role').set(bearer(a)).send({ type: 'ADMIN' }).expect(400);
    const res = await http().patch('/api/user/profile').set(bearer(a)).send({ type: 'PROVIDER', given_name: 'Bat' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ type: 'CUSTOMER', given_name: 'Bat' });
  });
});

describe('profile and admin', () => {
  it('updates and clears profile fields, validating email', async () => {
    const a = await signIn(phone(), device());
    const ok = await http()
      .patch('/api/user/profile')
      .set(bearer(a))
      .send({ given_name: 'Bat', email: 'bat@example.mn', address: 'UB' })
      .expect(200);
    expect(ok.body).toMatchObject({ given_name: 'Bat', email: 'bat@example.mn', address: 'UB' });
    const cleared = await http().patch('/api/user/profile').set(bearer(a)).send({ email: '', address: null }).expect(200);
    expect(cleared.body).toMatchObject({ email: null, address: null, given_name: 'Bat' });
    await http().patch('/api/user/profile').set(bearer(a)).send({ email: 'not-an-email' }).expect(400);
  });

  it('is_admin comes from ADMIN_PHONES in the auth response and gates the list', async () => {
    const admin = await signIn(ADMIN, device());
    expect(admin.user.is_admin).toBe(true);
    const list = await http().get('/api/admin/users?limit=5').set(bearer(admin)).expect(200);
    const body = list.body as { items: { phone_number: string }[]; total: number };
    expect(body.items.length).toBeLessThanOrEqual(5);
    expect(body.total).toBeGreaterThan(0);

    const plain = await signIn(phone(), device());
    expect(plain.user.is_admin).toBe(false);
    await http().get('/api/admin/users').set(bearer(plain)).expect(403);
    await http().get('/api/admin/users').expect(401);
  });
});

describe('throttle', () => {
  it('auth/verify/start allows 20 per minute per address (carrier CGNAT; the per-phone limit is the real one)', async () => {
    const mod = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }])],
      controllers: [AuthController],
      providers: [
        { provide: APP_GUARD, useClass: AccountThrottlerGuard },
        { provide: AuthService, useValue: {} },
        { provide: AUTH_CONFIG, useValue: cfg },
        { provide: getDataSourceToken(), useValue: {} },
      ],
    }).compile();
    const t = mod.createNestApplication();
    t.setGlobalPrefix('api');
    t.useGlobalFilters(new AllExceptionsFilter());
    t.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await t.init();
    try {
      const codes: number[] = [];
      for (let i = 0; i < 21; i++) {
        codes.push((await request(t.getHttpServer() as Server).post('/api/auth/verify/start').send({})).status);
      }
      expect(codes).toEqual([...Array<number>(20).fill(400), 429]);
    } finally {
      await t.close();
    }
  });
});
