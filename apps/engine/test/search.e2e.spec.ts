/**
 * The search gate (phase 3 "done when"): the must-find query list passes, the SQL and the JS
 * matcher pick the same fixtures, paid placement lifts only where it answers the query, the
 * dates filter never returns a booked or blocked machine, and distance, family, price-by-unit
 * and the viewport map answer from the same fixtures.
 */
import '../src/config/load-env';
import { randomInt } from 'node:crypto';
import type { Server } from 'node:http';
import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getDataSourceToken, TypeOrmModule } from '@nestjs/typeorm';
import request from 'supertest';
import type { DataSource } from 'typeorm';
import type { AvailabilityResponse, BlockDaysResponse, BrowseResponse, MapResponse } from '@zuuchmap/core';
import { AUTH_CONFIG, authConfigFromEnv, type AuthConfig } from '../src/auth/auth.config';
import { AuthModule } from '../src/auth/auth.module';
import { openSession } from '../src/auth/request-user';
import { CategoryModule } from '../src/category/category.module';
import { CategoryService } from '../src/category/category.service';
import { AllExceptionsFilter } from '../src/common/all-exceptions.filter';
import { dataSourceOptions } from '../src/database/data-source';
import { PostModule } from '../src/post/post.module';
import { RedisModule } from '../src/redis/redis.module';
import {
  categoryLabelIndex, expandTerms, matchesPost, type SearchMode, searchSql, searchTerms, type TermGroup,
} from '../src/post/search-terms';
import { UserModule } from '../src/user/user.module';

interface Fixture {
  title: string;
  category: string;
  subcategory: string;
  province: string;
  district?: string;
  details?: string;
  attributes?: Record<string, unknown>;
  featured?: boolean;
  lat?: number;
  lng?: number;
  price?: number;
  unit?: string;
}

// Ulaanbaatar centre is 47.918, 106.917.
const F: Record<string, Fixture> = {
  exc: {
    title: 'Komatsu PC200-8 экскаватор түрээслүүлнэ', category: 'machineryrent', subcategory: 'excavator',
    province: 'ULAANBAATAR', district: 'BAYANZURKH', attributes: { manufacturer: 'Komatsu', model: 'PC200-8', with_operator: true },
    featured: true, lat: 47.92, lng: 106.92, price: 450000, unit: 'DAY',
  },
  dozer: {
    title: 'Shantui SD16 шороо түлхэнэ', category: 'machineryrent', subcategory: 'bulldozer', province: 'TUV',
    attributes: { manufacturer: 'Shantui' }, lat: 47.7, lng: 106.5, price: 50000, unit: 'HOUR',
  },
  worker: { title: 'Барилгын ажилчин авна', category: 'jobvacancy', subcategory: 'worker', province: 'DARKHANUUL', attributes: { accommodation_provided: true } },
  dump: {
    title: 'Самосвал 20 тн — хайрга, элс', category: 'transport', subcategory: 'dump_truck', province: 'ORKHON',
    details: 'Хүргэлттэй, хот дотор', lat: 49.03, lng: 104.04, price: 180000, unit: 'DAY',
  },
  heavy: { title: 'Хүнд даацын тээврийн үйлчилгээ', category: 'transport', subcategory: 'heavy_haul', province: 'UMNUGOVI' },
  jeep: {
    title: 'Toyota Land Cruiser 200 жолоочтой түрээслүүлнэ', category: 'vehiclerent', subcategory: 'suv', province: 'ULAANBAATAR',
    district: 'KHANUUL', featured: true, lat: 47.9, lng: 106.85, price: 250000, unit: 'DAY',
  },
  man: {
    title: 'MAN TGS 6x4 ачааны машин', category: 'usedequipment', subcategory: 'vehicle', province: 'SELENGE',
    attributes: { manufacturer: 'MAN', condition: 'USED' },
  },
  cement: { title: 'Хөтөл цемент М400', category: 'materialstore', subcategory: 'cement', province: 'DARKHANUUL' },
  workwear: { title: 'Ажлын хувцас, гутал', category: 'materialstore', subcategory: 'other', province: 'KHOVD' },
  // Same cell as exc at every zoom below ~17: the map must fold the two into one cluster.
  exc2: {
    title: 'Hitachi ZX200 экскаватор', category: 'machineryrent', subcategory: 'excavator', province: 'ULAANBAATAR',
    district: 'BAYANZURKH', lat: 47.9201, lng: 106.9201, price: 400000, unit: 'DAY',
  },
};

/** [query, mode, must find, must not find] */
const EXPECT: Array<[string, SearchMode, string[], string[]]> = [
  ['экскаватор', 'all', ['exc', 'exc2'], ['dozer']],
  ['экскаваторын', 'all', ['exc'], []],
  ['экскаватор түрээс', 'all', ['exc'], ['jeep']],
  ['excavator', 'all', ['exc'], []], // subcategory's en name
  ['бульдозер', 'all', ['dozer'], ['exc']], // subcategory name, absent from the text
  ['komatsu', 'all', ['exc'], []],
  ['комацу', 'all', ['exc'], []], // Cyrillic spelling of a Latin brand
  ['тоёота', 'all', ['jeep'], []],
  ['pc200-8', 'all', ['exc'], []],
  ['man', 'all', ['man'], ['exc', 'dozer']], // not the `manufacturer` key
  ['true', 'all', [], ['exc', 'worker']], // not a JSON literal
  ['operator', 'all', [], ['exc']], // not the `with_operator` key
  ['барилга', 'all', ['worker'], []], // барилга → барилгын
  ['тээвэр', 'all', ['heavy'], []], // тээвэр → тээврийн
  ['ажил', 'all', ['workwear', 'worker'], []], // ажил → ажлын
  ['хайрга', 'all', ['dump'], []],
  ['цементийн', 'all', ['cement'], []],
  ['Улаанбаатар', 'all', ['exc', 'jeep'], ['dump']], // province name, not in the text
  ['Баянзүрх', 'all', ['exc'], ['jeep']], // district name
  ['уул уурхай', 'all', [], ['worker', 'cement']], // "уул" is not Дархан-Уул
  ['экскаваор', 'all', [], ['exc']],
  ['экскаваор', 'fuzzy', ['exc'], []], // typo
  ['самасвал', 'fuzzy', ['dump'], []],
  ['самосвал түрээс', 'all', [], ['dump']],
  ['самосвал түрээс', 'any', ['dump'], []],
];

/** [query, mode, fixtures the "featured and relevant" key must be true/false for] */
const FEATURED: Array<[string, SearchMode, string[], string[]]> = [
  ['экскаватор', 'all', ['exc'], []],
  ['экскаватор түрээс', 'all', ['exc'], []],
  ['самосвал түрээс', 'any', [], ['exc', 'jeep']], // titles say only түрээс
];

/** TypeORM's `:name` placeholders → pg's `$n` (a `::cast` is not a placeholder). */
function positional(sql: string, params: Record<string, unknown>): { text: string; values: unknown[] } {
  const values: unknown[] = [];
  const index = new Map<string, number>();
  const text = sql.replace(/(?<!:):([a-zA-Z_]\w*)/g, (_, name: string) => {
    if (!(name in params)) throw new Error(`unbound :${name}`);
    if (!index.has(name)) {
      values.push(params[name]);
      index.set(name, values.length);
    }
    return `$${String(index.get(name))}`;
  });
  return { text, values };
}

let app: INestApplication;
let ds: DataSource;
let cfg: AuthConfig;
let ownerId: string;
let customerId: string | undefined;
let auth: { Authorization: string };
const phone = `7${String(randomInt(1_000_000, 10_000_000))}`;
const idOf = new Map<number, string>();
const ids: Record<string, number> = {};
const http = (): ReturnType<typeof request> => request(app.getHttpServer() as Server);
const names = (rows: Array<{ id: number }>): string[] =>
  rows.map((r) => idOf.get(r.id)).filter((n): n is string => n !== undefined).sort();
const browse = async (query: string): Promise<BrowseResponse> =>
  (await http().get(`/api/posts?limit=100&${query}`).expect(200)).body as BrowseResponse;
const found = async (query: string): Promise<string[]> => names((await browse(query)).items);

beforeAll(async () => {
  cfg = { ...authConfigFromEnv(), devMode: true, adminPhones: [] };
  const mod = await Test.createTestingModule({
    imports: [
      TypeOrmModule.forRoot({ ...dataSourceOptions(), autoLoadEntities: true }),
      RedisModule, AuthModule, UserModule, CategoryModule, PostModule,
    ],
  })
    .overrideProvider(AUTH_CONFIG)
    .useValue(cfg)
    .compile();
  app = mod.createNestApplication();
  app.setGlobalPrefix('api');
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.init();
  ds = app.get<DataSource>(getDataSourceToken());
  await app.get(CategoryService).seed();

  const users = await ds.query<Array<{ id: string }>>(
    `INSERT INTO users (phone_number, is_verified, type) VALUES ($1, true, 'PROVIDER') RETURNING id`, [phone],
  );
  ownerId = users[0].id;
  auth = { Authorization: `Bearer ${await openSession(ds, ownerId, cfg)}` };
  for (const [name, f] of Object.entries(F)) {
    const rows = await ds.query<Array<{ id: number }>>(
      `INSERT INTO posts (user_id, title, category, subcategory, province, district, details, attributes, is_featured,
                          latitude, longitude, price_amount, price_unit, approval_status, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'APPROVED','ACTIVE') RETURNING id`,
      [
        ownerId, f.title, f.category, f.subcategory, f.province, f.district ?? null, f.details ?? null,
        JSON.stringify(f.attributes ?? {}), !!f.featured, f.lat ?? null, f.lng ?? null, f.price ?? null, f.unit ?? null,
      ],
    );
    idOf.set(rows[0].id, name);
    ids[name] = rows[0].id;
  }
});

afterAll(async () => {
  await ds.query('DELETE FROM posts WHERE user_id = $1', [ownerId]);
  if (customerId) await ds.query('DELETE FROM users WHERE id = $1', [customerId]);
  await ds.query('DELETE FROM users WHERE id = $1', [ownerId]);
  await app.close();
});

describe('search terms (SQL and the saved-search matcher agree)', () => {
  let groupsFor: (q: string) => TermGroup[];
  const run = async (q: string, mode: SearchMode): Promise<Array<{ id: number; featured: boolean }>> => {
    const terms = searchTerms(q);
    const sql = searchSql(groupsFor(q), terms, mode);
    const { text, values } = positional(
      `SELECT post.id, ${sql.featured} AS featured, ${sql.rank} AS rank
         FROM posts post
        WHERE post.id = ANY(:fixtureIds) AND ${sql.where.join(' AND ')}`,
      { ...sql.params, fixtureIds: [...idOf.keys()] },
    );
    return ds.query<Array<{ id: number; featured: boolean }>>(text, values);
  };

  beforeAll(async () => {
    const labels = categoryLabelIndex(await app.get(CategoryService).listEntities(true));
    groupsFor = (q) => expandTerms(searchTerms(q), labels);
  });

  it.each(EXPECT)('"%s" (%s) finds %j and not %j', async (q, mode, must, mustNot) => {
    const got = names(await run(q, mode));
    for (const m of must) expect(got).toContain(m);
    for (const m of mustNot) expect(got).not.toContain(m);
    if (mode === 'all') {
      const js = Object.entries(F).filter(([, f]) => matchesPost(groupsFor(q), f)).map(([n]) => n).sort();
      expect(js).toEqual(got);
    }
  });

  it.each(FEATURED)('"%s" (%s) lifts featured %j and not %j', async (q, mode, on, off) => {
    const lifted = names((await run(q, mode)).filter((r) => r.featured));
    for (const m of on) expect(lifted).toContain(m);
    for (const m of off) expect(lifted).not.toContain(m);
  });
});

describe('GET /posts', () => {
  it('relaxes a query that finds nothing as typed and says so', async () => {
    const strict = await browse('q=экскаватор');
    expect(strict.relaxed).toBe(false);
    expect(names(strict.items)).toContain('exc');
    const typo = await browse('q=экскаваор');
    expect(typo.relaxed).toBe(true);
    expect(names(typo.items)).toContain('exc');
    const any = await browse('q=самосвал+түрээс');
    expect(any.relaxed).toBe(true);
    expect(names(any.items)).toContain('dump');
    const none = await browse('q=qzxv');
    expect(none.total).toBe(0);
  });

  it('featured-and-relevant leads, the category lift ranks a named subcategory first', async () => {
    // Relative order among this file's listings: the shared dev DB may hold other featured excavators.
    const order = (await browse('q=экскаватор')).items.map((r) => idOf.get(r.id)).filter((n): n is string => n !== undefined);
    expect(order.slice(0, 2)).toEqual(['exc', 'exc2']);
    expect((await browse('q=экскаватор')).items[0]?.id).toBe(ids.exc);
  });

  it('filters by family and keeps category inside it', async () => {
    expect(await found('family=JOBS')).toEqual(['worker']);
    const eq = await found('family=EQUIPMENT_VEHICLES');
    expect(eq).toEqual(expect.arrayContaining(['exc', 'dozer', 'jeep', 'man', 'dump', 'heavy']));
    expect(eq).not.toContain('worker');
    expect(await found('family=JOBS&category=machineryrent')).toEqual([]);
    await http().get('/api/posts?family=NOPE').expect(400);
  });

  it('a price range applies within one unit only and needs the unit', async () => {
    expect(await found('price_min=100000&price_unit=DAY')).toEqual(expect.arrayContaining(['exc', 'jeep', 'dump']));
    expect(await found('price_min=100000&price_unit=DAY')).not.toContain('dozer');
    expect(await found('price_min=10000&price_max=60000&price_unit=HOUR')).toEqual(['dozer']);
    await http().get('/api/posts?price_min=1').expect(400);
    await http().get('/api/posts?price_min=1&price_unit=NOPE').expect(400);
  });

  it('distance: every item carries metres, nearby sorts by it, a radius cuts', async () => {
    const res = await browse('lat=47.918&lng=106.917&sort=nearby&family=EQUIPMENT_VEHICLES');
    const withPin = res.items.filter((i) => i.distance_m !== null && i.distance_m !== undefined);
    expect(names(withPin.slice(0, 3))).toEqual(expect.arrayContaining(['exc', 'exc2']));
    expect(withPin[0]?.distance_m).toBeLessThan(1000);
    const far = res.items.find((i) => i.id === ids.dump);
    expect(far?.distance_m).toBeGreaterThan(200_000);
    // Listings without a pin sort last.
    const lastPinned = res.items.map((i) => i.distance_m).lastIndexOf(res.items.find((i) => i.distance_m === null)?.distance_m ?? null);
    expect(lastPinned === -1 || res.items.slice(lastPinned).every((i) => i.distance_m === null)).toBe(true);
    const near = await found('lat=47.918&lng=106.917&radius_km=2');
    expect(near).toEqual(['exc', 'exc2']);
    await http().get('/api/posts?sort=nearby').expect(400);
  });

  it('attribute filters still work with the search', async () => {
    expect(await found('q=экскаватор&attr.manufacturer=Komatsu')).toEqual(['exc']);
  });
});

describe('dates first', () => {
  it('never returns a booked or blocked machine on those days; the calendar and busy_dates show them', async () => {
    // Two bookings by one customer; accepting writes the BOOKED row (here by hand).
    const customer = await ds.query<Array<{ id: string }>>(`INSERT INTO users (phone_number, type) VALUES ($1, 'CUSTOMER') RETURNING id`, [`6${String(randomInt(1_000_000, 10_000_000))}`]);
    customerId = customer[0].id;
    const bookings = await ds.query<Array<{ id: number }>>(
      `INSERT INTO bookings (post_id, customer_id, provider_id, category, start_date, end_date, status)
       VALUES ($1, $2, $3, 'machineryrent', '2027-03-20', '2027-03-22', 'ACCEPTED'), ($1, $2, $3, 'machineryrent', '2027-03-22', '2027-03-25', 'DECLINED') RETURNING id`,
      [ids.exc, customerId, ownerId],
    );
    await ds.query(`INSERT INTO post_busy (post_id, kind, booking_id, days) VALUES ($1, 'BOOKED', $2, daterange('2027-03-20', '2027-03-22', '[]'))`, [ids.exc, bookings[0].id]);
    // An overlapping accepted booking is impossible by constraint.
    await expect(
      ds.query(`INSERT INTO post_busy (post_id, kind, booking_id, days) VALUES ($1, 'BOOKED', $2, daterange('2027-03-22', '2027-03-25', '[]'))`, [ids.exc, bookings[1].id]),
    ).rejects.toMatchObject({ code: '23P01' });

    // The provider blocks days on two listings at once.
    const blocked = (
      await http().post('/api/posts/availability/block').set(auth)
        .send({ post_ids: [ids.dozer, ids.exc2], start_date: '2027-03-21', end_date: '2027-03-21' }).expect(201)
    ).body as BlockDaysResponse;
    expect(blocked.blocked.map((b) => b.post_id).sort()).toEqual([ids.dozer, ids.exc2].sort());
    expect(blocked.blocked[0]).toMatchObject({ start_date: '2027-03-21', end_date: '2027-03-21', kind: 'BLOCKED' });
    // Not the caller's listing: the whole request is refused.
    const other = await ds.query<Array<{ id: number }>>(`SELECT id FROM posts WHERE user_id <> $1 AND deleted_at IS NULL LIMIT 1`, [ownerId]);
    if (other.length > 0) {
      await http().post('/api/posts/availability/block').set(auth)
        .send({ post_ids: [ids.dozer, other[0].id], start_date: '2027-03-21', end_date: '2027-03-21' }).expect(403);
    }
    await http().post('/api/posts/availability/block').set(auth)
      .send({ post_ids: [ids.dozer], start_date: '2027-03-22', end_date: '2027-03-21' }).expect(400)
      .expect((r) => {
        expect((r.body as { code: string }).code).toBe('INVALID_DATE_RANGE');
      });

    const onDay = await found('date_from=2027-03-21&date_to=2027-03-21&family=EQUIPMENT_VEHICLES');
    expect(onDay).not.toContain('exc');
    expect(onDay).not.toContain('dozer');
    expect(onDay).not.toContain('exc2');
    expect(onDay).toEqual(expect.arrayContaining(['jeep', 'dump']));
    const spanning = await found('date_from=2027-03-18&date_to=2027-03-20');
    expect(spanning).not.toContain('exc');
    expect(spanning).toContain('dozer');
    const after = await found('date_from=2027-03-23&date_to=2027-03-30');
    expect(after).toEqual(expect.arrayContaining(['exc', 'dozer', 'exc2']));
    const single = await found('date_from=2027-03-21');
    expect(single).not.toContain('exc');
    await http().get('/api/posts?date_from=2027-13-01').expect(400);
    await http().get('/api/posts?date_from=2027-03-22&date_to=2027-03-21').expect(400);

    const cal = (await http().get(`/api/posts/${String(ids.exc)}/availability?from=2027-03-01&to=2027-03-31`).expect(200)).body as AvailabilityResponse;
    expect(cal.busy).toEqual([expect.objectContaining({ start_date: '2027-03-20', end_date: '2027-03-22', kind: 'BOOKED' })]);
    const empty = (await http().get(`/api/posts/${String(ids.exc)}/availability?from=2027-04-01&to=2027-04-30`).expect(200)).body as AvailabilityResponse;
    expect(empty.busy).toEqual([]);

    // busy_dates covers the next 14 days on rentable categories only.
    const today = new Date();
    const soon = new Date(today.getTime() + 3 * 86_400_000).toISOString().slice(0, 10);
    await ds.query(`INSERT INTO post_busy (post_id, kind, days) VALUES ($1, 'BLOCKED', daterange($2::date, $2::date, '[]'))`, [ids.exc, soon]);
    const list = await browse('q=экскаватор');
    const exc = list.items.find((i) => i.id === ids.exc);
    expect(exc?.busy_dates).toContain(soon);
    const worker = (await browse('family=JOBS')).items.find((i) => i.id === ids.worker);
    expect(worker?.busy_dates).toBeUndefined();

    // Unblock: only BLOCKED rows of the caller's.
    const mine = blocked.blocked.find((b) => b.post_id === ids.dozer);
    await http().delete(`/api/posts/availability/block/${String(mine?.id ?? 0)}`).set(auth).expect(200);
    expect(await found('date_from=2027-03-21&date_to=2027-03-21&category=machineryrent')).toContain('dozer');
    const booked = (await http().get(`/api/posts/${String(ids.exc)}/availability?from=2027-03-01&to=2027-03-31`).expect(200)).body as AvailabilityResponse;
    await http().delete(`/api/posts/availability/block/${String(booked.busy[0]?.id ?? 0)}`).set(auth).expect(400);
    await http().delete('/api/posts/availability/block/999999999').set(auth).expect(404);
  });
});

describe('GET /posts/map', () => {
  it('answers the viewport only, clustering dense cells and leaving single listings as pins', async () => {
    const ub = 'bbox=106.5,47.6,107.3,48.2';
    const coarse = (await http().get(`/api/posts/map?${ub}&zoom=10&family=EQUIPMENT_VEHICLES`).expect(200)).body as MapResponse;
    expect(coarse.total).toBeGreaterThanOrEqual(4);
    const cluster = coarse.clusters.find((c) => Math.abs(c.lat - 47.92) < 0.05 && Math.abs(c.lng - 106.92) < 0.05);
    expect(cluster?.count).toBeGreaterThanOrEqual(2);
    expect(coarse.pins.map((p) => p.id)).not.toContain(ids.dump); // Orkhon is outside the box
    const fine = (await http().get(`/api/posts/map?${ub}&zoom=18&q=экскаватор`).expect(200)).body as MapResponse;
    const excPin = fine.pins.find((p) => p.id === ids.exc);
    expect(excPin).toMatchObject({ category: 'machineryrent', price_amount: '450000.00', price_unit: 'DAY', is_featured: true });
    expect(fine.pins.map((p) => p.id)).toContain(ids.exc2);
    expect(fine.pins.map((p) => p.id)).not.toContain(ids.jeep);
    const dated = (await http().get(`/api/posts/map?${ub}&zoom=18&date_from=2027-03-21&date_to=2027-03-21`).expect(200)).body as MapResponse;
    expect(dated.pins.map((p) => p.id)).not.toContain(ids.exc);
    await http().get('/api/posts/map?bbox=1,2,3').expect(400);
    await http().get('/api/posts/map?bbox=107,48,106,47').expect(400);
    await http().get('/api/posts/map?bbox=0,0,50,50').expect(400);
  });
});
