import '../config/load-env';
import { DataSource } from 'typeorm';
import { CategorySchema } from '../category/category.entity';
import { CategoryService } from '../category/category.service';
import { dataSourceOptions } from '../database/data-source';
import { seedBulk } from './seed-bulk';

/**
 * Dev fixtures for the clients: a provider (Хүнд Техник ХХК, 99110000) with live listings
 * across the four families around Ulaanbaatar, a few busy days, and a customer (99120000)
 * with two saves; phase 5 adds a second customer (Сарантуяа, 99130000), booking requests in every
 * state, two Чат threads, and reviews with a reply. Then `seed-bulk.ts` generates the rest of a market
 * (80 providers, 250 customers, ~1,600 listings, bookings, threads, reviews). Re-runnable: the previous
 * seed rows are replaced.
 * `npm run seed:dev -w @zuuchmap/engine`
 */
const PROVIDER = '99110000';
const CUSTOMER = '99120000';
const CUSTOMER2 = '99130000';
const ADMIN = '99100000';

interface Seed {
  title: string;
  category: string;
  subcategory: string;
  province: string;
  district?: string;
  lat: number;
  lng: number;
  price?: number;
  unit?: string;
  attrs?: Record<string, unknown>;
  details?: string;
  featured?: boolean;
  address?: string;
  busy?: Array<[number, number]>;
}

const L: Seed[] = [
  {
    title: 'Komatsu PC200 экскаватор', category: 'machineryrent', subcategory: 'excavator', province: 'ULAANBAATAR', district: 'KHANUUL',
    lat: 47.886, lng: 106.905, price: 450000, unit: 'DAY', featured: true, address: 'Хан-Уул дүүрэг, 15-р хороо',
    attrs: { manufacturer: 'Komatsu', model: 'PC200', with_operator: true, year: 2019, capacity: 20 },
    details: 'Туршлагатай оператортой, өдрийн 10 цагийн ажлын хуваарьтай. Улаанбаатар хотын дотор хүргэлт 150,000₮. 7 хоногоос дээш захиалгад 10% хөнгөлөлттэй.',
    busy: [[5, 7]],
  },
  {
    title: 'Кран 25 тн, Zoomlion', category: 'machineryrent', subcategory: 'crane', province: 'ULAANBAATAR', district: 'SONGINOKHAIRKHAN',
    lat: 47.92, lng: 106.8, price: 1200000, unit: 'DAY', attrs: { manufacturer: 'Zoomlion', capacity: 25, with_operator: true, year: 2021 },
    details: 'Өргөх даац 25 тн, сум 40 м. Оператор, туслахтай.', busy: [[1, 2], [10, 12]],
  },
  {
    title: 'Hitachi ZX200 экскаватор', category: 'machineryrent', subcategory: 'excavator', province: 'ULAANBAATAR', district: 'KHANUUL',
    lat: 47.89, lng: 106.91, price: 480000, unit: 'DAY', attrs: { manufacturer: 'Hitachi', model: 'ZX200', with_operator: false, year: 2017 },
  },
  {
    title: 'Ачигч JCB 3CX', category: 'machineryrent', subcategory: 'loader', province: 'ULAANBAATAR', district: 'NALAIKH',
    lat: 47.77, lng: 107.25, price: 95000, unit: 'HOUR', attrs: { manufacturer: 'JCB', model: '3CX', with_operator: true, year: 2018 },
  },
  {
    title: 'Бульдозер Shantui SD16', category: 'machineryrent', subcategory: 'bulldozer', province: 'TUV',
    lat: 47.7, lng: 106.5, price: 50000, unit: 'HOUR', attrs: { manufacturer: 'Shantui', model: 'SD16', with_operator: true },
  },
  {
    title: 'Самосвал HOWO 25 м³', category: 'transport', subcategory: 'dump_truck', province: 'ULAANBAATAR', district: 'BAYANZURKH',
    lat: 47.93, lng: 107.0, price: 180000, unit: 'TRIP', attrs: { capacity: 25 }, details: 'Хайрга, элс, шороо. Хот дотор нэг рейс.',
  },
  {
    title: 'Toyota Land Cruiser 200, жолоочтой', category: 'vehiclerent', subcategory: 'suv', province: 'ULAANBAATAR', district: 'SUKHBAATAR',
    lat: 47.92, lng: 106.92, price: 250000, unit: 'DAY', attrs: { manufacturer: 'Toyota', year: 2020, with_operator: true },
  },
  {
    title: 'MAN TGS 6x4 ачааны машин зарна', category: 'usedequipment', subcategory: 'vehicle', province: 'SELENGE',
    lat: 50.25, lng: 106.2, price: 85000000, unit: 'TOTAL', attrs: { manufacturer: 'MAN', condition: 'USED', year: 2015 },
  },
  {
    title: 'Хөтөл цемент М400', category: 'materialstore', subcategory: 'cement', province: 'ULAANBAATAR', district: 'BAYANZURKH',
    lat: 47.94, lng: 106.98, price: 18500, unit: 'PIECE', details: '50 кг уут. 100 уутнаас дээш хүргэлт үнэгүй.',
  },
  {
    title: 'Бетон зуурагч 350 л түрээс', category: 'toolrent', subcategory: 'concrete_mixer', province: 'ULAANBAATAR', district: 'BAYANGOL',
    lat: 47.91, lng: 106.86, price: 35000, unit: 'DAY',
  },
  {
    title: 'Арматурын бэлдэц, гагнуур', category: 'factory', subcategory: 'metal', province: 'DARKHANUUL',
    lat: 49.47, lng: 105.97, price: 4500, unit: 'UNIT',
  },
  {
    title: 'Барилгын дотор засал', category: 'construction', subcategory: 'interior', province: 'ULAANBAATAR', district: 'CHINGELTEI',
    lat: 47.93, lng: 106.9, price: 65000, unit: 'SQM', details: 'Шал, хана, тааз. Материалтай эсвэл материалгүй.',
  },
  {
    title: 'Зураг төсөл, инженерийн тооцоо', category: 'designservice', subcategory: 'architecture', province: 'ULAANBAATAR', district: 'SUKHBAATAR',
    lat: 47.918, lng: 106.93, price: 2500000, unit: 'PROJECT',
  },
  {
    title: 'Арматурчин, 2+ жилийн туршлагатай', category: 'jobvacancy', subcategory: 'rebar', province: 'ULAANBAATAR', district: 'KHANUUL',
    lat: 47.88, lng: 106.9, price: 2400000, unit: 'MONTH', attrs: { experience_years: 2 },
    details: 'Хан-Уул дүүрэгт баригдаж буй 12 давхар орон сууцны барилгад арматурчин авна. Хоол, байраар хангана.',
  },
  {
    title: 'Чирэх машин 24/7 — Бат', category: 'sos', subcategory: 'towing', province: 'ULAANBAATAR', district: 'KHANUUL',
    lat: 47.9, lng: 106.9, price: 80000, unit: 'UNIT', attrs: { response_time_min: 15 }, featured: true,
  },
  {
    title: 'Дугуй засвар Зайсан', category: 'sos', subcategory: 'tire_repair', province: 'ULAANBAATAR', district: 'KHANUUL',
    lat: 47.885, lng: 106.92, price: 35000, unit: 'UNIT', attrs: { response_time_min: 20 },
  },
  {
    title: 'Шатахуун хүргэлт', category: 'sos', subcategory: 'fuel_delivery', province: 'ULAANBAATAR', district: 'BAYANZURKH',
    lat: 47.93, lng: 106.96, attrs: { response_time_min: 30 },
  },
  {
    title: 'Аккумулятор асаалт', category: 'sos', subcategory: 'battery', province: 'ULAANBAATAR', district: 'BAYANGOL',
    lat: 47.915, lng: 106.87, price: 25000, unit: 'UNIT', attrs: { response_time_min: 40 },
  },
  {
    title: 'Өвлийн цас цэвэрлэгээ', category: 'winterservice', subcategory: 'snow_removal', province: 'ULAANBAATAR', district: 'BAYANGOL',
    lat: 47.9, lng: 106.85, price: 150000, unit: 'DAY',
  },
  {
    title: 'Автогрейдер XCMG', category: 'machineryrent', subcategory: 'grader', province: 'ORKHON',
    lat: 49.03, lng: 104.04, price: 400000, unit: 'DAY', attrs: { manufacturer: 'XCMG', with_operator: true },
  },
];

const day = (offset: number): string => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

/** Bookings, threads and reviews between the seed accounts (phase 5). */
async function seedDeals(ds: DataSource, provider: string, customer: string, customer2: string, ids: number[]): Promise<void> {
  const [exc, crane, truck] = ids;
  const booking = async (post: number, who: string, from: number, to: number, status: string, extra: { message?: string; address?: string; time?: string; response?: string } = {}): Promise<number> => {
    const rows = await ds.query<Array<{ id: number }>>(
      `INSERT INTO bookings (post_id, customer_id, provider_id, post_title, category, start_date, end_date, price_amount, price_unit,
                             message, address, start_time, status, response_message, responded_at, date_created)
       SELECT p.id, $2, $3, p.title, p.category, $4::date, $5::date, p.price_amount, p.price_unit, $6, $7, $8, $9::varchar, $10,
              CASE WHEN $9::varchar <> 'PENDING' THEN now() END, now() - interval '2 hours'
         FROM posts p WHERE p.id = $1 RETURNING id`,
      [post, who, provider, day(from), day(to), extra.message ?? null, extra.address ?? null, extra.time ?? null, status, extra.response ?? null],
    );
    const id = rows[0].id;
    if (status === 'ACCEPTED') {
      await ds.query(`INSERT INTO post_busy (post_id, kind, booking_id, days) VALUES ($1, 'BOOKED', $2, daterange($3::date, $4::date, '[]'))`, [post, id, day(from), day(to)]);
    }
    return id;
  };
  const b1 = await booking(exc, customer, 12, 14, 'PENDING', { message: 'Оператортой хэрэгтэй. Хан-Уул, 19-р хороолол.', address: 'Хан-Уул, 19-р хороолол', time: '08:00' });
  await booking(exc, customer2, 13, 15, 'PENDING');
  await booking(crane, customer, 20, 20, 'ACCEPTED', { address: 'Баянзүрх, 26-р хороо', time: '09:00', response: 'Түлш таны талаас.' });
  await booking(truck, customer, -18, -18, 'ACCEPTED');
  await booking(truck, customer2, -10, -10, 'DECLINED', { response: 'Тэр өдөр завгүй.' });
  await booking(exc, customer2, 3, 4, 'ACCEPTED', { address: 'Сонгинохайрхан, 20-р хороо', time: '08:30' });

  const thread = async (post: number, who: string, lines: Array<[string, string, number, string?]>): Promise<void> => {
    const rows = await ds.query<Array<{ id: string }>>(
      `INSERT INTO conversations (post_id, post_title, customer_id, provider_id) SELECT p.id, p.title, $2, $3 FROM posts p WHERE p.id = $1 RETURNING id`,
      [post, who, provider],
    );
    const id = rows[0].id;
    for (const [sender, body, minutesAgo, kind] of lines) {
      await ds.query(
        `INSERT INTO messages (conversation_id, sender_id, kind, body, booking_id, date_created) VALUES ($1, $2, $3, $4, $5, now() - make_interval(mins => $6))`,
        [id, sender, kind ?? 'TEXT', body, kind ? b1 : null, minutesAgo],
      );
    }
    const last = lines[lines.length - 1];
    const firstCustomer = lines.find((l) => l[0] === who && !l[3]);
    const firstReply = lines.find((l) => l[0] === provider && !l[3] && firstCustomer && l[2] < firstCustomer[2]);
    await ds.query(
      `UPDATE conversations SET last_message_at = now() - make_interval(mins => $2), last_message_preview = NULLIF($3, ''), last_message_kind = $4,
              last_sender_id = $5, provider_unread = $6, first_customer_at = now() - make_interval(mins => $7),
              first_reply_at = CASE WHEN $8::int IS NULL THEN NULL ELSE now() - make_interval(mins => $8::int) END
        WHERE id = $1`,
      [id, last[2], last[1], last[3] ?? 'TEXT', last[0], last[0] === who ? 1 : 0, firstCustomer?.[2] ?? 0, firstReply?.[2] ?? null],
    );
  };
  await thread(exc, customer, [
    [customer, 'Сайн байна уу. Экскаватор боломжтой юу?', 150],
    [provider, 'Сайн байна уу. Боломжтой, оператортой ирнэ.', 140],
    [customer, 'Хаана ажиллах вэ гэвэл Хан-Уул, 19-р хороолол. Суурийн нүх ухна.', 126],
    [customer, '', 120, 'BOOKING_REQUESTED'],
  ]);
  await thread(crane, customer2, [
    [customer2, 'Маргааш 8 цагт эхлэх боломжтой юу?', 600],
    [provider, 'Тийм, боломжтой.', 480],
    [customer2, 'Баярлалаа.', 470],
  ]);

  await ds.query(
    `INSERT INTO reviews (provider_id, author_id, rating, comment, reply, reply_at, date_created) VALUES
       ($1, $2, 5, 'Цагтаа ирсэн, оператор нь маш туршлагатай. Дахин захиална.', 'Баярлалаа! Дахин хамтран ажиллахад баяртай байна.', now(), now() - interval '20 days'),
       ($1, $3, 4, 'Үнэ боломжийн, гэхдээ хүргэлт 1 цаг хоцорсон.', NULL, NULL, now() - interval '9 days')`,
    [provider, customer2, customer],
  );
}

/**
 * Phase 6 states on the hand-written provider: a rejected listing to fix on its field, a live one
 * whose edit was refused, a draft, one lapsing in two days, and two weeks of views and contacts.
 */
async function seedProviderStates(ds: DataSource, ids: number[]): Promise<void> {
  const reason = 'Өдрийн үнийг ₮-өөр, тоогоор бичнэ үү.';
  const [rejected, refused, draft, expiring] = ids.slice(-4);
  await ds.query(`UPDATE posts SET approval_status = 'REJECTED', rejection_reason = $2, rejection_field = 'price_amount', published_at = NULL WHERE id = $1`, [rejected, reason]);
  await ds.query(`UPDATE posts SET rejection_reason = $2, rejection_field = 'price_amount' WHERE id = $1`, [refused, reason]);
  // The counter an admin rejection bumps; without it the seeded provider passes as "proven" and edits skip review.
  await ds.query(`UPDATE users SET posts_rejected = 2 WHERE id = (SELECT user_id FROM posts WHERE id = $1)`, [rejected]);
  await ds.query(`UPDATE posts SET is_draft = true, approval_status = 'PENDING', expires_at = NULL, published_at = NULL, price_amount = NULL WHERE id = $1`, [draft]);
  await ds.query(`UPDATE posts SET expires_at = now() + interval '2 days' WHERE id = $1`, [expiring]);
  // A paid plan, so 18 live listings sit inside the quota (25) instead of reading "3-аас 18".
  await ds.query(`UPDATE users SET plan = 'PROVIDER', plan_expires_at = now() + interval '75 days' WHERE id = (SELECT user_id FROM posts WHERE id = $1)`, [expiring]);
  await ds.query(
    `INSERT INTO post_views (post_id, visitor_key, counted, date_viewed)
     SELECT p, 'cur' || p || '-' || g, true, now() - random() * interval '14 days' FROM unnest($1::int[]) p, generate_series(1, 45) g`,
    [ids],
  );
  await ds.query(
    `INSERT INTO post_contacts (post_id, viewer, kind, day, created_at)
     -- \`g\` in the LATERAL makes it per row; uncorrelated, Postgres draws one time for all.
     SELECT p, 'cur' || p || '-' || g, (ARRAY['CALL','CALL','CHAT','BOOKING'])[1 + floor(random() * 4)::int], (t AT TIME ZONE 'Asia/Ulaanbaatar')::date, t
       FROM unnest($1::int[]) p, generate_series(1, 7) g, LATERAL (SELECT now() - random() * interval '14 days' + g * interval '0' AS t) x
     ON CONFLICT DO NOTHING`,
    [ids],
  );
  await ds.query(`UPDATE posts p SET views = (SELECT COUNT(*) FROM post_views v WHERE v.post_id = p.id AND v.counted) WHERE p.id = ANY($1::int[])`, [ids]);
}

async function main(): Promise<void> {
  const ds = new DataSource({ ...dataSourceOptions(), entities: [CategorySchema] });
  await ds.initialize();
  try {
    // The engine seeds categories on boot; a freshly reset database has not booted yet.
    await new CategoryService(ds.getRepository(CategorySchema)).seed();
    const upsertUser = async (phone: string, type: string, given: string, parent: string | null): Promise<string> => {
      const rows = await ds.query<Array<{ id: string }>>(
        `INSERT INTO users (phone_number, is_verified, type, given_name, parent_name, role_set_at)
         VALUES ($1, true, $2, $3, $4, now())
         ON CONFLICT (phone_number) DO UPDATE SET given_name = EXCLUDED.given_name, parent_name = EXCLUDED.parent_name
         RETURNING id`,
        [phone, type, given, parent],
      );
      return rows[0].id;
    };
    const provider = await upsertUser(PROVIDER, 'PROVIDER', 'Бат-Эрдэнэ', 'Д.');
    const customer = await upsertUser(CUSTOMER, 'CUSTOMER', 'Ганбат', 'Д.');
    const customer2 = await upsertUser(CUSTOMER2, 'CUSTOMER', 'Сарантуяа', 'Б.');
    // The dev admin (moderation until phase 9): admin rights come from ADMIN_PHONES in .env.
    await upsertUser(ADMIN, 'CUSTOMER', 'Админ', null);
    const people = [provider, customer, customer2];
    await ds.query('DELETE FROM reviews WHERE provider_id = ANY($1::uuid[])', [people]);
    await ds.query('DELETE FROM conversations WHERE provider_id = ANY($1::uuid[])', [people]);
    await ds.query('DELETE FROM bookings WHERE provider_id = ANY($1::uuid[])', [people]);
    await ds.query('DELETE FROM posts WHERE user_id = $1', [provider]);
    await ds.query(
      `INSERT INTO companies (owner_id, name, description, phone_number, website, registration_number, service_area, is_verified, verified_at)
       VALUES ($1, 'Хүнд Техник ХХК', '2014 оноос хүнд техник түрээслэж байна. Бүх техник оператортой, хот дотор хүргэлттэй.',
               '99112233', 'hundtechnik.mn', '6123457', '["ULAANBAATAR","TUV"]', true, now())
       ON CONFLICT (owner_id) DO UPDATE SET name = EXCLUDED.name, is_verified = true`,
      [provider],
    );
    const ids: number[] = [];
    for (const s of L) {
      const rows = await ds.query<Array<{ id: number }>>(
        `INSERT INTO posts (user_id, title, category, subcategory, province, district, address, latitude, longitude, price_amount, price_unit,
                            attributes, details, is_featured, featured_until, contact_phone, approval_status, status, expires_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14, CASE WHEN $14 THEN now() + interval '30 days' END, $15, 'APPROVED', 'ACTIVE', now() + interval '60 days')
         RETURNING id`,
        [
          provider, s.title, s.category, s.subcategory, s.province, s.district ?? null, s.address ?? null, s.lat, s.lng, s.price ?? null,
          s.unit ?? null, JSON.stringify(s.attrs ?? {}), s.details ?? null, !!s.featured, PROVIDER,
        ],
      );
      const id = rows[0].id;
      ids.push(id);
      for (const [a, b] of s.busy ?? []) {
        await ds.query(`INSERT INTO post_busy (post_id, user_id, kind, days) VALUES ($1, $2, 'BLOCKED', daterange($3::date, $4::date, '[]'))`, [
          id, provider, day(a), day(b),
        ]);
      }
    }
    await ds.query('INSERT INTO post_likes (user_id, post_id) VALUES ($1, $2), ($1, $3) ON CONFLICT DO NOTHING', [customer, ids[0], ids[5]]);
    await seedDeals(ds, provider, customer, customer2, ids);
    await seedProviderStates(ds, ids);
    const bulk = await seedBulk(ds);
    console.log(JSON.stringify({ provider: PROVIDER, customer: CUSTOMER, customer2: CUSTOMER2, listings: ids.length, generated: bulk }));
  } finally {
    await ds.destroy();
  }
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
