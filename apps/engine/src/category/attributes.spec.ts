import { checkAttributes } from './attributes';
import { CATEGORY_SEED } from './seed/category-seed';
import { categoryIconFallback, FAMILY_KEYS, LOCALES } from '@zuuchmap/core';
import { SHIPPED_ICON_NAMES } from './icons';
import { primaryActionOf, CategoryService } from './category.service';
import { resolveLocale } from './category.controller';

const schema = {
  key: 'x',
  active: true,
  subcategories: [{ value: 'a' }],
  fields: [
    { key: 'name', label: 'n', type: 'text' as const, required: true },
    { key: 'year', label: 'y', type: 'number' as const, min: 1950, max: 2100 },
    { key: 'fuel', label: 'f', type: 'select' as const, options: ['PETROL', 'DIESEL'] },
    { key: 'tags', label: 't', type: 'multiselect' as const, options: ['a', 'b'] },
    { key: 'op', label: 'o', type: 'boolean' as const },
  ],
};

describe('seed', () => {
  it('has 13 categories, each with a family and four-locale labels', () => {
    expect(CATEGORY_SEED).toHaveLength(13);
    for (const c of CATEGORY_SEED) {
      expect(FAMILY_KEYS).toContain(c.family);
      for (const l of LOCALES) expect(c.labels[l].length).toBeGreaterThan(0);
      expect(SHIPPED_ICON_NAMES.has(c.icon)).toBe(true);
    }
    expect(new Set(CATEGORY_SEED.map((c) => c.key)).size).toBe(13);
  });
  it('seed fields pass the admin validator', () => {
    const svc = new CategoryService(undefined as never);
    for (const c of CATEGORY_SEED) {
      expect(() => {
        svc.validateInput({ family: c.family, label: c.label, labels: c.labels, fields: c.fields, subcategories: c.subcategories, icon: c.icon, color: c.color ?? null }, true);
      }).not.toThrow();
    }
  });
  it('flags choose the primary action', () => {
    expect(primaryActionOf({ rentable: true, sos: false })).toBe('BOOK');
    expect(primaryActionOf({ rentable: false, sos: true })).toBe('CALL_NOW');
    expect(primaryActionOf({ rentable: false, sos: false })).toBe('CALL');
    expect(CATEGORY_SEED.find((c) => c.key === 'sos')?.sos).toBe(true);
    expect(CATEGORY_SEED.find((c) => c.key === 'vehiclerent')?.rentable).toBe(true);
  });
});

describe('checkAttributes', () => {
  it('passes valid attributes and coerces numeric strings', () => {
    const r = checkAttributes(schema, 'a', { name: 'Cat', year: '2020', fuel: 'DIESEL', tags: ['a'], op: true });
    expect(r.ok).toBe(true);
    expect(r.attributes.year).toBe(2020);
  });
  it('flags required, type, option, min and max', () => {
    const codes = (a: Record<string, unknown>) => checkAttributes(schema, null, a).errors.map((e) => `${e.key}:${e.code}`);
    expect(codes({})).toEqual(['name:required']);
    expect(codes({ name: 'a', year: 'abc' })).toEqual(['year:type']);
    expect(codes({ name: 'a', year: 1900 })).toEqual(['year:min']);
    expect(codes({ name: 'a', year: 3000 })).toEqual(['year:max']);
    expect(codes({ name: 'a', fuel: 'COAL' })).toEqual(['fuel:option']);
    expect(codes({ name: 'a', tags: ['z'] })).toEqual(['tags:option']);
    expect(codes({ name: 'a', op: 'yes' })).toEqual(['op:type']);
    expect(codes({ name: 'a', nope: 1 })).toEqual(['nope:unknown_field']);
  });
  it('rejects unknown subcategory and unknown/inactive category', () => {
    expect(checkAttributes(schema, 'zzz', { name: 'a' }).errors[0]?.code).toBe('unknown_subcategory');
    expect(checkAttributes(null, null, {}).errors[0]?.code).toBe('unknown_category');
    expect(checkAttributes({ ...schema, active: false }, null, { name: 'a' }).ok).toBe(false);
  });
});

describe('icons and locale', () => {
  it('unknown icon falls back to the family icon', () => {
    const svc = new CategoryService(undefined as never);
    expect(svc.resolveIcon('car-outline', 'vehiclerent', 'EQUIPMENT_VEHICLES')).toBe('truck');
    expect(svc.resolveIcon('briefcase', 'vehiclerent', 'EQUIPMENT_VEHICLES')).toBe('briefcase');
    expect(svc.resolveIcon(null, 'newcat', 'JOBS')).toBe('briefcase');
    expect(categoryIconFallback('nope', 'sos', SHIPPED_ICON_NAMES)).toBe('wrench');
  });
  it('resolves locale from query then header', () => {
    expect(resolveLocale('en', 'ru')).toBe('en');
    expect(resolveLocale(undefined, 'zh-CN,en;q=0.8')).toBe('zh');
    expect(resolveLocale('xx', 'fr')).toBe('mn');
  });
});
