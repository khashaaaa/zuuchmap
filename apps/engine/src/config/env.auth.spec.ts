import { parseEnv } from './env';

const base = {
  JWT_SECRET: 'x'.repeat(32),
  PG_HOST: 'h',
  PG_USER: 'u',
  PG_PASSWORD: 'p',
  PG_DATABASE: 'd',
  ALLOWED_ORIGIN: 'http://a',
  PUBLIC_API_URL: 'http://a/api',
  PUBLIC_WEB_URL: 'http://a',
};

describe('auth env', () => {
  it('defaults: no admins, verify.mn inert, 5/hour', () => {
    const e = parseEnv(base);
    expect(e.ADMIN_PHONES).toEqual([]);
    expect(e.VERIFY_MN_API_KEY).toBeUndefined();
    expect(e.VERIFY_RATE_LIMIT).toBe(5);
    expect(e.RATE_TTL_MS).toBe(3_600_000);
    expect(e.VERIFY_TTL_MS).toBe(300_000);
  });

  it('normalises ADMIN_PHONES', () => {
    expect(parseEnv({ ...base, ADMIN_PHONES: '+976 99112233, 88001122' }).ADMIN_PHONES).toEqual([
      '99112233',
      '88001122',
    ]);
  });

  it('rejects a bad admin phone and a bad limit', () => {
    expect(() => parseEnv({ ...base, ADMIN_PHONES: '123' })).toThrow(/ADMIN_PHONES/);
    expect(() => parseEnv({ ...base, VERIFY_RATE_LIMIT: '0' })).toThrow(/VERIFY_RATE_LIMIT/);
  });
});
