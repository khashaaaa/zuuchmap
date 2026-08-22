import { buildAttrFilter } from './post.service';

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
});
