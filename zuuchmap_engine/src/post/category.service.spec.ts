import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CategoryService } from './category.service';
import { CategorySchema } from './entities/category-schema.entity';
import { sharedCache } from '../utils/cache';

describe('CategoryService', () => {
  let service: CategoryService;
  let repo: {
    find: jest.Mock;
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    count: jest.Mock;
  };

  beforeEach(() => {
    // The cache is a module-level singleton shared across services — reset it
    // so entries from one test can't satisfy reads in the next.
    sharedCache.invalidatePrefix('');
    repo = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn((x) => x),
      save: jest.fn(async (x) => x),
      count: jest.fn(),
    };
    service = new CategoryService(repo as any);
  });

  describe('validateCategoryData', () => {
    const valid = (
      over: Partial<CategorySchema> = {},
    ): Partial<CategorySchema> => ({
      key: 'testcat',
      label: 'Test',
      fields: [{ key: 'foo_bar', label: 'F', type: 'text' }],
      subcategories: [{ value: 'a', display: 'A' }],
      ...over,
    });

    it('accepts a valid schema', () => {
      expect(() => service.validateCategoryData(valid())).not.toThrow();
    });

    it('rejects field keys that shadow post columns', () => {
      expect(() =>
        service.validateCategoryData(
          valid({
            fields: [{ key: 'title', label: 'T', type: 'text' }],
          }),
        ),
      ).toThrow(BadRequestException);
    });

    it('rejects a category key that would break URLs and cache lookups', () => {
      expect(() =>
        service.validateCategoryData(valid({ key: 'Vehicle Rent!' })),
      ).toThrow(BadRequestException);
    });

    it('accepts a snake_case category key', () => {
      expect(() =>
        service.validateCategoryData(valid({ key: 'heavy_haulage' })),
      ).not.toThrow();
    });

    it('rejects an emoji icon — mobile renders icons through Ionicons', () => {
      expect(() => service.validateCategoryData(valid({ icon: '🚗' }))).toThrow(
        BadRequestException,
      );
    });

    it('accepts an Ionicons glyph name', () => {
      expect(() =>
        service.validateCategoryData(valid({ icon: 'car-outline' })),
      ).not.toThrow();
    });

    it('rejects a non-hex colour', () => {
      expect(() =>
        service.validateCategoryData(valid({ color: 'red' })),
      ).toThrow(BadRequestException);
    });

    it('rejects non-snake_case subcategory values', () => {
      expect(() =>
        service.validateCategoryData(
          valid({
            subcategories: [{ value: 'Power Tools', display: 'Power Tools' }],
          }),
        ),
      ).toThrow(BadRequestException);
    });

    it('rejects non-snake_case field keys', () => {
      expect(() =>
        service.validateCategoryData(
          valid({
            fields: [{ key: 'Foo Bar', label: 'F', type: 'text' }],
          }),
        ),
      ).toThrow(BadRequestException);
    });

    it('rejects unknown field types', () => {
      expect(() =>
        service.validateCategoryData(
          valid({
            fields: [{ key: 'foo', label: 'F', type: 'checkbox' as any }],
          }),
        ),
      ).toThrow(BadRequestException);
    });

    it('rejects duplicate field keys', () => {
      expect(() =>
        service.validateCategoryData(
          valid({
            fields: [
              { key: 'foo', label: 'F', type: 'text' },
              { key: 'foo', label: 'F2', type: 'text' },
            ],
          }),
        ),
      ).toThrow(BadRequestException);
    });

    it('rejects select fields without options', () => {
      expect(() =>
        service.validateCategoryData(
          valid({
            fields: [{ key: 'foo', label: 'F', type: 'select' }],
          }),
        ),
      ).toThrow(BadRequestException);
    });

    it('accepts select fields with options', () => {
      expect(() =>
        service.validateCategoryData(
          valid({
            fields: [
              { key: 'foo', label: 'F', type: 'select', options: ['A'] },
            ],
          }),
        ),
      ).not.toThrow();
    });

    it('rejects duplicate subcategory values', () => {
      expect(() =>
        service.validateCategoryData(
          valid({
            subcategories: [
              { value: 'a', display: 'A' },
              { value: 'a', display: 'A2' },
            ],
          }),
        ),
      ).toThrow(BadRequestException);
    });

    it('accepts empty fields and subcategories', () => {
      expect(() =>
        service.validateCategoryData({ key: 'x', label: 'X' }),
      ).not.toThrow();
    });

    it('accepts a reasonable post_expiry_days', () => {
      expect(() =>
        service.validateCategoryData(valid({ post_expiry_days: 45 })),
      ).not.toThrow();
    });

    it('rejects zero, negative, fractional and oversized post_expiry_days', () => {
      for (const bad of [0, -7, 1.5, 366]) {
        expect(() =>
          service.validateCategoryData(valid({ post_expiry_days: bad })),
        ).toThrow(BadRequestException);
      }
    });
  });

  describe('getCategory', () => {
    it('throws NotFound for a missing key', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.getCategory('nope')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('returns the category when found', async () => {
      repo.findOne.mockResolvedValue({ key: 'vehiclerent' });
      await expect(service.getCategory('vehiclerent')).resolves.toEqual({
        key: 'vehiclerent',
      });
    });
  });

  describe('getCategories caching', () => {
    it('hits the repository once and serves the second call from cache', async () => {
      repo.find.mockResolvedValue([{ key: 'a' }]);
      await service.getCategories();
      await service.getCategories();
      expect(repo.find).toHaveBeenCalledTimes(1);
    });

    it('invalidates the cache on createCategory', async () => {
      repo.find.mockResolvedValue([{ key: 'a' }]);
      await service.getCategories();
      await service.createCategory({ key: 'b', label: 'B' });
      await service.getCategories();
      expect(repo.find).toHaveBeenCalledTimes(2);
    });
  });

  describe('seedCategories', () => {
    it('does nothing when categories already exist', async () => {
      repo.count.mockResolvedValue(8);
      await service.seedCategories();
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('seeds 13 categories on an empty table, all passing validation', async () => {
      repo.count.mockResolvedValue(0);
      await service.seedCategories();
      expect(repo.save).toHaveBeenCalledTimes(1);
      const seeded = repo.save.mock.calls[0][0];
      expect(seeded).toHaveLength(13);
      for (const cat of seeded) {
        expect(() => service.validateCategoryData(cat)).not.toThrow();
        expect(cat.labels).toEqual(
          expect.objectContaining({
            mn: expect.any(String),
            en: expect.any(String),
          }),
        );
      }
      const rentals = seeded.filter((c: any) => c.has_rental_status);
      expect(rentals.map((c: any) => c.key).sort()).toEqual([
        'construction',
        'designservice',
        'machineryrent',
        'miningsupport',
        'sos',
        'toolrent',
        'transport',
        'vehiclerent',
        'winterservice',
      ]);
    });

    const seed = async () => {
      repo.count.mockResolvedValue(0);
      await service.seedCategories();
      return repo.save.mock.calls[0][0] as any[];
    };
    const byKey = (cats: any[], key: string) => cats.find((c) => c.key === key);

    it('seeds usedequipment as a sale category — price only, TOTAL unit, not bookable', async () => {
      const cat = byKey(await seed(), 'usedequipment');
      expect(cat).toBeDefined();
      expect(cat.has_rental_status).toBeFalsy();
      expect(cat.has_availability_dates).toBeFalsy();
      expect(cat.has_price).toBe(true);
      expect(cat.default_price_unit).toBe('TOTAL');
      expect(cat.fields.find((f: any) => f.key === 'condition')).toMatchObject({
        type: 'select',
        filterable: true,
      });
    });

    it('seeds transport with a per-trip default price unit', async () => {
      const cat = byKey(await seed(), 'transport');
      expect(cat.default_price_unit).toBe('TRIP');
      // Tonnage shares the `capacity` key with machinery so one filter serves
      // both; the unit is what differs, not the key.
      expect(cat.fields.find((f: any) => f.key === 'capacity')).toMatchObject({
        type: 'number',
        filterable: true,
        unit: 'т',
      });
      expect(
        cat.fields.find((f: any) => f.key === 'capacity_tons'),
      ).toBeUndefined();
    });

    it('uses correct Mongolian terms for plumbing, scaffolding and compactor', async () => {
      const cats = await seed();
      const sub = (key: string, value: string) =>
        byKey(cats, key).subcategories.find((s: any) => s.value === value);
      expect(sub('construction', 'plumbing').labels.mn).toBe(
        'Сантехникийн ажил',
      );
      expect(sub('jobvacancy', 'plumber').labels.mn).toBe('Сантехникч');
      expect(sub('toolrent', 'scaffolding').labels.mn).toBe('Барилгын шат');
      expect(sub('machineryrent', 'compactor').labels.mn).toBe('Нягтруулагч');
      expect(sub('vehiclerent', 'van').labels.zh).toBe('面包车');
    });

    it('stores the build year as a filterable number, not a text date', async () => {
      const fields = byKey(await seed(), 'vehiclerent').fields;
      const year = fields.find((f: any) => f.key === 'year');
      expect(year.labels.mn).toBe('Үйлдвэрлэсэн он');
      // It is a year — typing it `number` is what turns on range filtering.
      expect(year).toMatchObject({ type: 'number', filterable: true });
      expect(
        fields.find((f: any) => f.key === 'manufactured_date'),
      ).toBeUndefined();
      // imported_date is gone: import year does not change a rental decision.
      expect(
        fields.find((f: any) => f.key === 'imported_date'),
      ).toBeUndefined();
    });

    it('enriches machineryrent and sos subcategories', async () => {
      const cats = await seed();
      const values = (key: string) =>
        byKey(cats, key).subcategories.map((s: any) => s.value);
      expect(values('machineryrent')).toEqual(
        expect.arrayContaining([
          'forklift',
          'grader',
          'concrete_mixer',
          'drilling_rig',
        ]),
      );
      expect(values('sos')).toEqual(
        expect.arrayContaining([
          'fuel_delivery',
          'mobile_repair',
          'jump_start',
        ]),
      );
    });

    it('gives construction filterable experience_years and team_size fields', async () => {
      const fields = byKey(await seed(), 'construction').fields;
      expect(
        fields.find((f: any) => f.key === 'experience_years'),
      ).toMatchObject({
        type: 'number',
        filterable: true,
      });
      expect(fields.find((f: any) => f.key === 'team_size')).toMatchObject({
        type: 'number',
      });
    });

    it('seeds sos as the only emphasized category', async () => {
      const cats = await seed();
      expect(byKey(cats, 'sos').emphasized).toBe(true);
      expect(cats.filter((c) => c.emphasized).map((c) => c.key)).toEqual([
        'sos',
      ]);
    });

    it('keeps every seeded colour in the shared-luminance family (≥3:1 on both grounds)', async () => {
      const s2l = (v: number) =>
        v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
      const lum = (hex: string) => {
        const n = parseInt(hex.slice(1), 16);
        return (
          0.2126 * s2l(((n >> 16) & 255) / 255) +
          0.7152 * s2l(((n >> 8) & 255) / 255) +
          0.0722 * s2l((n & 255) / 255)
        );
      };
      const cr = (a: number, b: number) =>
        (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      const dark = lum('#1F2124');
      const light = lum('#FFFFFF');
      for (const cat of await seed()) {
        const l = lum(cat.color);
        expect(cr(l, dark)).toBeGreaterThanOrEqual(3);
        expect(cr(l, light)).toBeGreaterThanOrEqual(3);
      }
    });
  });
});

// ─── Redesigned schema invariants ─────────────────────────────────────────
import { CATEGORY_SEED } from './category.service';

const POST_COLUMNS = [
  'title',
  'details',
  'province',
  'district',
  'address',
  'latitude',
  'longitude',
  'price_amount',
  'price_unit',
  'contact_phone',
  'contact_email',
  'available_from',
  'available_until',
  'website',
  'images',
  'status',
  'views',
  'category',
  'subcategory',
];

describe('CATEGORY_SEED', () => {
  const core = (c: any) =>
    (c.fields ?? []).filter((f: any) => (f.group ?? 'core') === 'core');
  const details = (c: any) =>
    (c.fields ?? []).filter((f: any) => f.group === 'details');

  it('defines exactly 13 categories', () => {
    expect(CATEGORY_SEED).toHaveLength(13);
  });

  it('gives every category 2-5 required core fields', () => {
    for (const c of CATEGORY_SEED) {
      expect({ key: c.key, n: core(c).length }).toEqual({
        key: c.key,
        n: expect.any(Number),
      });
      expect(core(c).length).toBeGreaterThanOrEqual(2);
      expect(core(c).length).toBeLessThanOrEqual(5);
      for (const f of core(c)) expect(f.required).toBe(true);
    }
  });

  it('never marks a details field required', () => {
    for (const c of CATEGORY_SEED) {
      for (const f of details(c)) expect(f.required).toBeFalsy();
    }
  });

  it('never collides an attribute key with a Post column', () => {
    for (const c of CATEGORY_SEED) {
      for (const f of c.fields ?? []) expect(POST_COLUMNS).not.toContain(f.key);
    }
  });

  it('gives every field mn and en labels', () => {
    for (const c of CATEGORY_SEED) {
      for (const f of c.fields ?? []) {
        expect(f.labels?.mn).toBeTruthy();
        expect(f.labels?.en).toBeTruthy();
      }
    }
  });

  it('never repeats a field key within one category', () => {
    for (const c of CATEGORY_SEED) {
      const keys = (c.fields ?? []).map((f: any) => f.key);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it('keeps one key per concept across categories', () => {
    // The bug this guards: license_info in one category, certifications in another.
    const byKey = new Map<string, string>();
    for (const c of CATEGORY_SEED) {
      for (const f of c.fields ?? []) {
        const prev = byKey.get(f.key);
        if (prev) expect(`${f.key}:${f.type}`).toBe(`${f.key}:${prev}`);
        else byKey.set(f.key, f.type);
      }
    }
    expect(byKey.has('license_info')).toBe(false);
    expect(byKey.has('certifications')).toBe(false);
    expect(byKey.has('license_no')).toBe(true);
  });

  it('exposes at most four browse filters per category', () => {
    for (const c of CATEGORY_SEED) {
      const n = (c.fields ?? []).filter((f: any) => f.filterable).length;
      expect({ key: c.key, filters: n }).toEqual({
        key: c.key,
        filters: expect.any(Number),
      });
      expect(n).toBeLessThanOrEqual(4);
    }
  });

  it('gives every select and multiselect a non-empty options list', () => {
    for (const c of CATEGORY_SEED) {
      for (const f of c.fields ?? []) {
        if (f.type === 'select' || f.type === 'multiselect') {
          expect(f.options?.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it('prices machineryrent and miningsupport by engine hour', () => {
    const get = (k: string) => CATEGORY_SEED.find((c: any) => c.key === k);
    expect(get('machineryrent')!.default_price_unit).toBe('MOTO_HOUR');
    expect(get('miningsupport')!.default_price_unit).toBe('MOTO_HOUR');
  });

  it('only sets default_price_unit on categories that have a price', () => {
    for (const c of CATEGORY_SEED) {
      if (c.default_price_unit) expect(c.has_price).toBe(true);
    }
  });

  it('rebuilds materialstore subcategories around the material, not the seller', () => {
    const ms = CATEGORY_SEED.find((c: any) => c.key === 'materialstore')!;
    const values = (ms.subcategories ?? []).map((s: any) => s.value);
    expect(values).toContain('cement');
    expect(values).toContain('rebar');
    expect(values).not.toContain('wholesale');
    expect(values).not.toContain('retail');
    expect((ms.fields ?? []).some((f: any) => f.key === 'sale_type')).toBe(
      true,
    );
  });

  it('gives every subcategory mn and en labels', () => {
    for (const c of CATEGORY_SEED) {
      for (const s of c.subcategories ?? []) {
        expect(s.labels?.mn).toBeTruthy();
        expect(s.labels?.en).toBeTruthy();
      }
    }
  });
});
