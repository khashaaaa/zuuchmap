import { createHmac } from 'node:crypto';
import { signHs256, verifyHs256 } from './jwt';

const SECRET = 'x'.repeat(32);
const b64 = (v: unknown): string => Buffer.from(JSON.stringify(v)).toString('base64url');
function forge(header: object, payload: object, secret = SECRET): string {
  const data = `${b64(header)}.${b64(payload)}`;
  return `${data}.${createHmac('sha256', secret).update(data).digest('base64url')}`;
}
const H = { alg: 'HS256', typ: 'JWT' };
const now = Math.floor(Date.now() / 1000);

describe('jwt', () => {
  it('accepts a valid token', () => {
    const t = signHs256({ sub: '7', admin: true }, SECRET, 60);
    expect(verifyHs256(t, SECRET)).toMatchObject({ sub: '7', admin: true });
  });

  it('rejects an expired token', () => {
    const t = signHs256({ sub: '7' }, SECRET, 60, Date.now() - 120_000);
    expect(verifyHs256(t, SECRET)).toBeNull();
  });

  it('rejects nbf in the future', () => {
    expect(verifyHs256(forge(H, { sub: '7', exp: now + 600, nbf: now + 300 }), SECRET)).toBeNull();
  });

  it('rejects a wrong alg in the header', () => {
    expect(verifyHs256(forge({ alg: 'none', typ: 'JWT' }, { sub: '7', exp: now + 60 }), SECRET)).toBeNull();
    expect(verifyHs256(forge({ alg: 'HS512', typ: 'JWT' }, { sub: '7', exp: now + 60 }), SECRET)).toBeNull();
  });

  it('rejects a tampered signature and a wrong secret', () => {
    const t = signHs256({ sub: '7' }, SECRET, 60);
    expect(verifyHs256(t.slice(0, -2) + 'AA', SECRET)).toBeNull();
    expect(verifyHs256(t, 'y'.repeat(32))).toBeNull();
  });

  it('rejects exp as a string', () => {
    expect(verifyHs256(forge(H, { sub: '7', exp: String(now + 60) }), SECRET)).toBeNull();
  });
});
