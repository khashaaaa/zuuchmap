import { buildAttrFilter, attributesOutOfBounds, ATTR_MAX_KEYS, ATTR_MAX_BYTES } from './post.service';

describe('buildAttrFilter', () => {
  const calls: Array<[string, any]> = [];
  const qb = { andWhere: (sql: string, params: any) => { calls.push([sql, params]); return qb; } };
  beforeEach(() => { calls.length = 0; });

  it('matches a boolean by jsonb containment so the GIN index serves it', () => {
    buildAttrFilter(qb as any, { with_operator: 'true' }, new Map([['with_operator', 'boolean']]));
    expect(calls[0][0]).toContain('@>');
    expect(JSON.parse(calls[0][1].attr0)).toEqual({ with_operator: true });
  });

  it('treats "false" as false, not as a truthy string', () => {
    buildAttrFilter(qb as any, { delivery_available: 'false' }, new Map([['delivery_available', 'boolean']]));
    expect(JSON.parse(calls[0][1].attr0)).toEqual({ delivery_available: false });
  });

  it('matches a multiselect member with the ? operator', () => {
    buildAttrFilter(qb as any, { coverage: 'CITY' }, new Map([['coverage', 'multiselect']]));
    expect(calls[0][0]).toContain('?');
    expect(calls[0][1].attr0).toBe('CITY');
  });

  it('still range-filters numbers', () => {
    buildAttrFilter(qb as any, { capacity_min: '20' }, new Map([['capacity', 'number']]));
    expect(calls[0][0]).toContain('>=');
    expect(calls[0][1].attr0).toBe(20);
  });

  it('ignores an unparseable range value', () => {
    buildAttrFilter(qb as any, { capacity_min: 'abc' }, new Map([['capacity', 'number']]));
    expect(calls).toHaveLength(0);
  });

  // `attr.<key>` keys arrive straight off the query string, and the key — unlike
  // every value here — is interpolated into the SQL text rather than bound as a
  // parameter, because a jsonb path operand cannot be a placeholder. The only
  // thing standing between that and injection is the `^[a-z0-9_]+$` match, so it
  // gets an adversarial test rather than a reading.
  it.each([
    ["brand'; DROP TABLE post; --"],
    ["brand' OR '1'='1"],
    ['brand"'],
    ['brand)'],
    ['brand-x'],
    ['brand.sub'],
    ['brand key'],
    ['BRAND'],
    ['../etc/passwd'],
  ])('drops the malformed attribute key %p instead of interpolating it', (key) => {
    buildAttrFilter(qb as any, { [key]: 'x' }, new Map([['brand', 'text']]));
    expect(calls).toHaveLength(0);
  });

  it('binds hostile range and text *values* as parameters, never as SQL', () => {
    buildAttrFilter(qb as any, { capacity_min: '1); DROP TABLE post;--' }, new Map([['capacity', 'number']]));
    expect(calls).toHaveLength(0);            // non-numeric range is dropped outright

    buildAttrFilter(qb as any, { brand: "'; DROP TABLE post; --" }, new Map([['brand', 'text']]));
    expect(calls[0][0]).not.toContain('DROP');
    expect(calls[0][1].attr0).toBe("%'; DROP TABLE post; --%");   // bound, not inlined
  });
});

describe('attributesOutOfBounds', () => {
  it('passes a realistic attribute set', () => {
    expect(attributesOutOfBounds({ manufacturer: 'Komatsu', model: 'PC200-8', capacity: 20 })).toBeNull();
  });

  it('passes null and undefined', () => {
    expect(attributesOutOfBounds(undefined)).toBeNull();
    expect(attributesOutOfBounds(null)).toBeNull();
  });

  it('rejects too many keys', () => {
    const many = Object.fromEntries(Array.from({ length: ATTR_MAX_KEYS + 1 }, (_, i) => [`k${i}`, 'v']));
    expect(attributesOutOfBounds(many)).toBe('ATTRIBUTES_TOO_MANY_KEYS');
  });

  it('rejects an oversized payload', () => {
    expect(attributesOutOfBounds({ blob: 'x'.repeat(ATTR_MAX_BYTES + 1) })).toBe('ATTRIBUTES_TOO_LARGE');
  });

  it('rejects a cyclic object rather than throwing on it', () => {
    const cyclic: any = { a: 1 };
    cyclic.self = cyclic;
    expect(attributesOutOfBounds(cyclic)).toBe('ATTRIBUTES_UNSERIALISABLE');
  });

  it('leaves genuine headroom over the largest real row (10 keys, 234 bytes)', () => {
    expect(ATTR_MAX_KEYS).toBeGreaterThanOrEqual(30);
    expect(ATTR_MAX_BYTES).toBeGreaterThanOrEqual(4096);
  });
});
