import { visitorKey } from './visitor';

const req = (headers: Record<string, string> = {}, ip = '1.2.3.4') =>
  ({ headers, ip }) as any;

/**
 * The visitor key exists so anonymous views can be deduped without storing
 * anything that identifies a person. Both halves of that matter.
 */
describe('visitorKey', () => {
  it('is stable for the same visitor', () => {
    const a = visitorKey(req({ 'x-visitor-id': 'abcdefgh12345678' }));
    const b = visitorKey(req({ 'x-visitor-id': 'abcdefgh12345678' }));
    expect(a).toBe(b);
    expect(a).toHaveLength(32);
  });

  it('separates two visitors', () => {
    expect(visitorKey(req({ 'x-visitor-id': 'aaaaaaaaaaaaaaaa' }))).not.toBe(
      visitorKey(req({ 'x-visitor-id': 'bbbbbbbbbbbbbbbb' })),
    );
  });

  // The stored value must not be walkable back to an address or a device id.
  it('never stores the raw input', () => {
    const key = visitorKey(req({ 'x-visitor-id': 'abcdefgh12345678' }));
    expect(key).not.toContain('abcdefgh');
    expect(visitorKey(req({}, '203.0.113.9'))).not.toContain('203.0.113');
  });

  it('falls back to address and user-agent when the client sends no id', () => {
    const a = visitorKey(req({ 'user-agent': 'Chrome' }, '203.0.113.9'));
    const b = visitorKey(req({ 'user-agent': 'Firefox' }, '203.0.113.9'));
    expect(a).toBeDefined();
    // Two browsers behind one CGNAT address still count as two viewers. It is
    // an undercount either way; this is the direction to err in.
    expect(a).not.toBe(b);
  });

  // X-Real-IP is set by nginx from the socket address and always overwritten,
  // so unlike X-Forwarded-For it cannot be used to mint fresh view counts.
  it('prefers the proxy-set address over the socket one', () => {
    const viaProxy = visitorKey(
      req({ 'x-real-ip': '198.51.100.7' }, '10.0.0.1'),
    );
    const direct = visitorKey(req({}, '198.51.100.7'));
    expect(viaProxy).toBe(direct);
  });

  it('ignores a suspiciously short or long supplied id', () => {
    // Too short to be a real generated id — fall through to the IP path rather
    // than letting a caller pin every view onto one key.
    const short = visitorKey(req({ 'x-visitor-id': 'abc' }, '1.2.3.4'));
    const fallback = visitorKey(req({}, '1.2.3.4'));
    expect(short).toBe(fallback);
  });
});
