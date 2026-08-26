/**
 * The property under test: the verification cap is a FIXED window. A user who
 * hits the limit and keeps retrying must still be unblocked when the original
 * window ends — retries must never extend the lockout.
 */
const mockRedisState: { enabled: boolean; client: any } = {
  enabled: false,
  client: null,
};

jest.mock('./redis', () => ({
  redisEnabled: () => mockRedisState.enabled,
  createRedis: () => mockRedisState.client,
}));

const HOUR = 60 * 60_000;

describe('incrAndCheckOverLimit', () => {
  let incrAndCheckOverLimit: typeof import('./rate-counter').incrAndCheckOverLimit;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-08-21T00:00:00Z'));
    mockRedisState.enabled = false;
    mockRedisState.client = null;
    // Fresh module per test — the counter caches its Redis client and window
    // state at module level.
    jest.resetModules();
    ({ incrAndCheckOverLimit } = require('./rate-counter'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('in-process fallback (no Redis)', () => {
    it('allows up to the limit and blocks the attempt after it', async () => {
      for (let i = 0; i < 5; i++) {
        expect(await incrAndCheckOverLimit('99110000', 5, HOUR)).toBe(false);
      }
      expect(await incrAndCheckOverLimit('99110000', 5, HOUR)).toBe(true);
    });

    it('blocked retries do not extend the lockout window', async () => {
      for (let i = 0; i < 6; i++)
        await incrAndCheckOverLimit('99110000', 5, HOUR);

      // Frustrated retry mid-window — still blocked, and must NOT reset the clock.
      jest.advanceTimersByTime(30 * 60_000);
      expect(await incrAndCheckOverLimit('99110000', 5, HOUR)).toBe(true);

      // 61 minutes after the FIRST attempt the window has ended.
      jest.advanceTimersByTime(31 * 60_000);
      expect(await incrAndCheckOverLimit('99110000', 5, HOUR)).toBe(false);
    });

    it('keys are independent', async () => {
      for (let i = 0; i < 6; i++)
        await incrAndCheckOverLimit('99110000', 5, HOUR);
      expect(await incrAndCheckOverLimit('99110001', 5, HOUR)).toBe(false);
    });
  });

  describe('Redis-backed', () => {
    it('runs INCR and PEXPIRE as one atomic script so the TTL can never be lost', async () => {
      const evalMock = jest
        .fn()
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(6);
      mockRedisState.enabled = true;
      mockRedisState.client = { eval: evalMock };

      expect(await incrAndCheckOverLimit('99110000', 5, HOUR)).toBe(false);
      expect(await incrAndCheckOverLimit('99110000', 5, HOUR)).toBe(true);
      expect(evalMock).toHaveBeenCalledWith(
        expect.stringContaining('PEXPIRE'),
        1,
        'rate:99110000',
        HOUR,
      );
    });

    it('fails open when the store errors', async () => {
      mockRedisState.enabled = true;
      mockRedisState.client = {
        eval: jest.fn().mockRejectedValue(new Error('connection refused')),
      };

      expect(await incrAndCheckOverLimit('99110000', 1, HOUR)).toBe(false);
      expect(await incrAndCheckOverLimit('99110000', 1, HOUR)).toBe(false);
    });
  });
});
