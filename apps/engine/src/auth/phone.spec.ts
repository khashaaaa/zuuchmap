import { normalizePhone } from './phone';

describe('normalizePhone', () => {
  it.each([
    ['99112233', '99112233'],
    ['+976 9911-2233', '99112233'],
    ['97699112233', '99112233'],
  ])('accepts %s', (raw, want) => {
    expect(normalizePhone(raw)).toBe(want);
  });

  it.each(['', '1234567', '123456789', 'abcdefgh', '+97699'])('rejects %p', (raw) => {
    expect(normalizePhone(raw)).toBeNull();
  });

  it('does not strip a 976 that is part of an 8-digit number', () => {
    expect(normalizePhone('97611223')).toBe('97611223');
  });
});
