import { ForbiddenException, UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import type { AuthConfig } from './auth.config';
import { env } from '../config/env';
import { AccountThrottlerGuard, AdminGuard, JwtAuthGuard, OptionalJwtAuthGuard } from './guards';
import { signHs256 } from './jwt';
import type { AuthedRequest } from './request-user';

const SECRET = 'x'.repeat(40);
const ID = '11111111-1111-4111-8111-111111111111';
const SID = '22222222-2222-4222-8222-222222222222';
const cfg = { jwtSecret: SECRET, adminPhones: ['99000001'] } as unknown as AuthConfig;

function ds(phone: string | null): DataSource {
  return {
    query: () => Promise.resolve(phone ? [{ id: ID, phone_number: phone, type: 'CUSTOMER' }] : []),
  } as unknown as DataSource;
}

function ctx(req: Partial<AuthedRequest>): ExecutionContext {
  return { switchToHttp: () => ({ getRequest: () => req }) } as unknown as ExecutionContext;
}

const bearer = (t: string): Partial<AuthedRequest> => ({ headers: { authorization: `Bearer ${t}` } });

describe('guards', () => {
  const good = signHs256({ sub: ID, sid: SID }, SECRET, 60);

  it('JwtAuthGuard sets req.user from a valid token', async () => {
    const req = bearer(good);
    await expect(new JwtAuthGuard(cfg, ds('99000002')).canActivate(ctx(req))).resolves.toBe(true);
    expect(req.user).toMatchObject({ id: ID, phone_number: '99000002', is_admin: false, session_id: SID });
  });

  it.each([
    ['no header', { headers: {} }],
    ['forged', bearer(signHs256({ sub: ID, sid: SID }, 'y'.repeat(40), 60))],
    ['expired', bearer(signHs256({ sub: ID, sid: SID }, SECRET, -10))],
    ['sessionless', bearer(signHs256({ sub: ID }, SECRET, 60))],
    ['garbage', bearer('abc')],
  ])('JwtAuthGuard rejects %s', async (_n, req) => {
    await expect(new JwtAuthGuard(cfg, ds('99000002')).canActivate(ctx(req))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('JwtAuthGuard rejects a token whose session or user is gone', async () => {
    await expect(new JwtAuthGuard(cfg, ds(null)).canActivate(ctx(bearer(good)))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('OptionalJwtAuthGuard lets anonymous and bad tokens through without a user', async () => {
    const g = new OptionalJwtAuthGuard(cfg, ds('99000002'));
    const anon: Partial<AuthedRequest> = { headers: {} };
    await expect(g.canActivate(ctx(anon))).resolves.toBe(true);
    expect(anon.user).toBeUndefined();
    const bad = bearer('nope');
    await expect(g.canActivate(ctx(bad))).resolves.toBe(true);
    expect(bad.user).toBeUndefined();
    const ok = bearer(good);
    await g.canActivate(ctx(ok));
    expect(ok.user?.id).toBe(ID);
  });

  it('AdminGuard admits only phones in ADMIN_PHONES', async () => {
    await expect(new AdminGuard(cfg, ds('99000001')).canActivate(ctx(bearer(good)))).resolves.toBe(true);
    await expect(new AdminGuard(cfg, ds('99000002')).canActivate(ctx(bearer(good)))).rejects.toThrow(
      ForbiddenException,
    );
    await expect(new AdminGuard(cfg, ds('99000001')).canActivate(ctx({ headers: {} }))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('AccountThrottlerGuard counts a signed request per account, anything else per address', async () => {
    const tracker = (req: Record<string, unknown>): Promise<string> =>
      (AccountThrottlerGuard.prototype as unknown as { getTracker: (r: Record<string, unknown>) => Promise<string> }).getTracker(req);
    const signed = signHs256({ sub: ID, sid: SID }, env().JWT_SECRET, 60);
    await expect(tracker({ ip: '10.0.0.7', headers: { authorization: `Bearer ${signed}` } })).resolves.toBe(`u:${ID}`);
    await expect(tracker({ ip: '10.0.0.7', headers: { authorization: `Bearer ${signHs256({ sub: ID }, 'z'.repeat(40), 60)}` } })).resolves.toBe('ip:10.0.0.7');
    await expect(tracker({ ip: '10.0.0.7', headers: {} })).resolves.toBe('ip:10.0.0.7');
  });
});
