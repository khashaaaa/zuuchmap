import { JwtService } from '@nestjs/jwt';
import { AppThrottlerGuard } from './throttler.guard';

/**
 * Tracker resolution. Mongolian carriers CGNAT many subscribers behind one IP,
 * so authenticated traffic must bucket by user id — otherwise one busy cell
 * tower exhausts the shared per-IP budget and innocent users see 429s.
 * Anonymous traffic falls back to the nginx-set real IP, then req.ip.
 */
describe('AppThrottlerGuard.getTracker', () => {
  const SECRET = 's'.repeat(32);
  const OLD_ENV = process.env;
  let guard: any;

  beforeEach(() => {
    process.env = { ...OLD_ENV, JWT_SECRET: SECRET };
    guard = new AppThrottlerGuard({} as any, {} as any, {} as any);
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  const req = (headers: Record<string, string> = {}) => ({
    headers,
    ip: '10.0.0.9',
  });

  it('buckets an authenticated request by user id, not by IP', async () => {
    const token = new JwtService().sign({ sub: 'user-1' }, { secret: SECRET });
    const tracker = await guard.getTracker(
      req({ authorization: `Bearer ${token}`, 'x-real-ip': '1.2.3.4' }),
    );
    expect(tracker).toBe('user:user-1');
  });

  it('ignores a token signed with the wrong secret and buckets by IP', async () => {
    const forged = new JwtService().sign(
      { sub: 'user-1' },
      { secret: 'wrong'.repeat(7) },
    );
    const tracker = await guard.getTracker(
      req({ authorization: `Bearer ${forged}`, 'x-real-ip': '1.2.3.4' }),
    );
    expect(tracker).toBe('1.2.3.4');
  });

  it('prefers the nginx-set X-Real-IP for anonymous requests', async () => {
    expect(await guard.getTracker(req({ 'x-real-ip': '1.2.3.4' }))).toBe(
      '1.2.3.4',
    );
  });

  it('falls back to req.ip when no proxy header is present (local dev)', async () => {
    expect(await guard.getTracker(req())).toBe('10.0.0.9');
  });
});
