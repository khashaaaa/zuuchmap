import { HttpException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { __resetLocalRateCounter } from '../utils/rate-counter';

/**
 * Covers the verify.mn Mobile-Originated flow. The security property under test
 * is that a token is only ever minted after the provider reports VERIFIED, or
 * for a device that already earned trust through a prior verification.
 */
describe('AuthService — phone verification', () => {
  let service: AuthService;
  let users: any, sessions: any, devices: any, jwt: any, verifyMn: any;
  let sessionRow: any;

  const OLD_ENV = process.env;

  beforeEach(() => {
    // Module-level rate counter persists across cases (prod uses a singleton
    // service, so this only matters for tests).
    __resetLocalRateCounter();
    process.env = {
      ...OLD_ENV,
      NODE_ENV: 'test',
      JWT_SECRET: 'x'.repeat(32),
      PUBLIC_ENGINE_URL: 'https://zuuchmap.com/engine',
      VERIFY_MN_API_KEY: 'vrf_test',
    };

    sessionRow = null;
    users = {
      findOne: jest.fn(async () => null),
      create: jest.fn((x) => ({ id: 'user-1', ...x })),
      save: jest.fn(async (x) => x),
    };
    sessions = {
      create: jest.fn((x) => ({ id: 'sess-1', ...x })),
      save: jest.fn(async (x) => { sessionRow = x; return x; }),
      findOne: jest.fn(async () => sessionRow),
      delete: jest.fn(async () => ({ affected: 0 })),
    };
    devices = {
      findOne: jest.fn(async () => null),
      create: jest.fn((x) => x),
      save: jest.fn(async (x) => x),
    };
    jwt = { sign: jest.fn(() => 'signed.jwt.token') };
    verifyMn = {
      enabled: true,
      createSession: jest.fn(async (phone: string, text: string) => ({
        sessionId: 'remote-1',
        phone,
        shortcode: '144773',
        text,
        smsUri: `sms:144773?body=${text}`,
        displayInstruction: `144773 дугаарт "${text}" гэж SMS илгээнэ үү`,
        expiresAt: new Date(Date.now() + 300_000).toISOString(),
      })),
      getStatus: jest.fn(),
    };

    service = new AuthService(users, sessions, devices, jwt, verifyMn);
  });

  afterAll(() => { process.env = OLD_ENV; });

  it('rejects a malformed phone number before calling the provider', async () => {
    await expect(service.startVerification('12345')).rejects.toThrow(HttpException);
    expect(verifyMn.createSession).not.toHaveBeenCalled();
  });

  it('normalizes a +976-prefixed number', async () => {
    await service.startVerification('+976 9911 2233');
    expect(verifyMn.createSession).toHaveBeenCalledWith(
      '99112233', expect.any(String), expect.stringContaining('/auth/verify/callback/'),
    );
  });

  it('returns the SMS instructions and issues no token while PENDING', async () => {
    const started = await service.startVerification('99112233', 'device-abc');
    expect(started.verified).toBe(false);
    expect(started.auth).toBeUndefined();
    expect(started.sms_uri).toMatch(/^sms:144773\?body=\d{6}$/);

    verifyMn.getStatus.mockResolvedValue({ sessionStatus: 'PENDING', callbackStatus: 'PENDING' });
    const status = await service.checkVerification('sess-1');
    expect(status.status).toBe('PENDING');
    expect(status.auth).toBeUndefined();
  });

  it('mints a token and trusts the device once the provider reports VERIFIED', async () => {
    await service.startVerification('99112233', 'device-abc');

    verifyMn.getStatus.mockResolvedValue({
      sessionStatus: 'VERIFIED',
      callbackStatus: 'SENT',
      verifiedAt: new Date().toISOString(),
    });

    const status = await service.checkVerification('sess-1');
    expect(status.status).toBe('VERIFIED');
    expect(status.auth?.token).toBe('signed.jwt.token');
    expect(users.create).toHaveBeenCalledWith(
      expect.objectContaining({ phone_number: '99112233', is_verified: true }),
    );
    expect(devices.save).toHaveBeenCalled();
    // The raw device id must never be persisted.
    expect(JSON.stringify(devices.save.mock.calls)).not.toContain('device-abc');
  });

  // The provider's callback used to run the full check, which consumed the
  // session and threw its token away — the client's next poll was then answered
  // with 410 and a user who had verified correctly (and paid for it) was told to
  // start over.
  it('leaves the session spendable after a provider callback', async () => {
    await service.startVerification('99112233', 'device-abc');
    verifyMn.getStatus.mockResolvedValue({
      sessionStatus: 'VERIFIED',
      callbackStatus: 'SENT',
      verifiedAt: new Date().toISOString(),
    });

    await service.handleCallback('sess-1');
    expect(sessionRow.status).toBe('VERIFIED');
    expect(sessionRow.status).not.toBe('CONSUMED');

    const status = await service.checkVerification('sess-1');
    expect(status.status).toBe('VERIFIED');
    expect(status.auth?.token).toBe('signed.jwt.token');
  });

  // The nudge is the signal that something changed; the per-session throttle
  // that protects the provider from our polling must not swallow it.
  it('lets a callback bypass the upstream poll throttle', async () => {
    await service.startVerification('99112233');
    verifyMn.getStatus.mockResolvedValue({ sessionStatus: 'PENDING', callbackStatus: 'SENT' });
    await service.checkVerification('sess-1');
    verifyMn.getStatus.mockClear();
    verifyMn.getStatus.mockResolvedValue({ sessionStatus: 'VERIFIED', callbackStatus: 'SENT' });

    await service.handleCallback('sess-1');
    expect(verifyMn.getStatus).toHaveBeenCalled();
    expect(sessionRow.status).toBe('VERIFIED');
  });

  it('ignores a callback for a session already consumed', async () => {
    await service.startVerification('99112233');
    verifyMn.getStatus.mockResolvedValue({ sessionStatus: 'VERIFIED', callbackStatus: 'SENT' });
    await service.checkVerification('sess-1');
    expect(sessionRow.status).toBe('CONSUMED');

    await expect(service.handleCallback('sess-1')).resolves.toBeUndefined();
    expect(sessionRow.status).toBe('CONSUMED');
  });

  it('refuses to reuse a consumed session', async () => {
    await service.startVerification('99112233', 'device-abc');
    verifyMn.getStatus.mockResolvedValue({ sessionStatus: 'VERIFIED', callbackStatus: 'SENT' });
    await service.checkVerification('sess-1');

    await expect(service.checkVerification('sess-1')).rejects.toMatchObject({ status: 410 });
  });

  it('reports EXPIRED past the TTL without calling the provider', async () => {
    await service.startVerification('99112233');
    sessionRow.expires_at = new Date(Date.now() - 1000);
    verifyMn.getStatus.mockClear();

    const status = await service.checkVerification('sess-1');
    expect(status.status).toBe('EXPIRED');
    expect(status.auth).toBeUndefined();
    expect(verifyMn.getStatus).not.toHaveBeenCalled();
  });

  it('skips the provider entirely for an already-trusted device', async () => {
    users.findOne.mockResolvedValue({ id: 'user-1', phone_number: '99112233', is_verified: true });
    devices.findOne.mockResolvedValue({ id: 'dev-1', device_hash: 'hash', user: { id: 'user-1' } });

    const started = await service.startVerification('99112233', 'device-abc');

    expect(started.verified).toBe(true);
    expect(started.auth?.token).toBe('signed.jwt.token');
    expect(verifyMn.createSession).not.toHaveBeenCalled();
  });

  it('locks the 6th verification attempt with a 429 and a stable machine code', async () => {
    for (let i = 0; i < 5; i++) await service.startVerification('99112233');

    await expect(service.startVerification('99112233')).rejects.toMatchObject({
      status: 429,
      // Clients localize by `code` — the raw English message must never be
      // the only thing they can show.
      response: expect.objectContaining({ code: 'TOO_MANY_VERIFICATIONS' }),
    });
  });

  it('throttles upstream polling to stay under the provider rate limit', async () => {
    await service.startVerification('99112233');
    verifyMn.getStatus.mockResolvedValue({ sessionStatus: 'PENDING', callbackStatus: 'PENDING' });

    await service.checkVerification('sess-1');
    await service.checkVerification('sess-1');

    expect(verifyMn.getStatus).toHaveBeenCalledTimes(1);
  });

  it('propagates a provider credential failure instead of authenticating', async () => {
    await service.startVerification('99112233');
    verifyMn.getStatus.mockRejectedValue(new HttpException('SMS provider rejected our credentials.', 503));

    await expect(service.checkVerification('sess-1')).rejects.toThrow(HttpException);
  });
});
