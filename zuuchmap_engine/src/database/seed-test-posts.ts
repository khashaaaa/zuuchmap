/**
 * Development-only fixture generator for the whole domain.
 *
 * Two jobs. The obvious one is volume: posts for every category built directly
 * from CATEGORY_SEED, so every field of every schema is exercised and the
 * fixtures cannot drift from the schema.
 *
 * The less obvious one matters more — it deliberately seeds the *edge states*
 * the code branches on, so a fixture set is a standing test of them rather than
 * a pile of happy-path rows:
 *
 *   - a post past `expires_at` but still marked ACTIVE (the window between
 *     expiry and the midnight sweep, which quota, browse and booking must all
 *     agree is not live)
 *   - a post APPROVED but lapsed (the relist-on-approval path)
 *   - RENTED posts (approved but unavailable, which booking must refuse)
 *   - a PROVIDER plan already past `plan_expires_at` (entitlement decays on read)
 *   - a provider sitting exactly on the FREE quota
 *   - featured windows both live and lapsed
 *   - bookings past, live and future, plus an ACCEPTED one on a post that gets
 *     deleted, to exercise `ON DELETE SET NULL` and review eligibility surviving
 *
 * Wipes first: `--wipe` truncates every domain table (never `migrations`).
 * Run: npx ts-node -r tsconfig-paths/register src/database/seed-test-posts.ts --wipe
 */
// Not `dotenv/config`: that reads ./.env, and this project keeps its
// settings in config/variables/<NODE_ENV>.env — the same file app.module
// loads. Without this the documented command below dies in the pg driver
// with "client password must be a string".
import { config as loadEnv } from 'dotenv';
loadEnv({ path: `${process.cwd()}/config/variables/${process.env.NODE_ENV ?? 'development'}.env` });
import { Client } from 'pg';
import { createHash } from 'crypto';
import { CATEGORY_SEED } from '../post/category.service';

const PROVINCES = ['ULAANBAATAR', 'ORKHON', 'DARKHANUUL', 'SELENGE', 'UMNUGOVI', 'DORNOGOVI'];
const UB_DISTRICTS = ['CHINGELTEI', 'KHANUUL', 'BAYANGOL', 'SUKHBAATAR', 'BAYANZURKH', 'SONGINOKHAIRKHAN'];
const ADMIN_PHONES = (process.env.ADMIN_PHONES ?? '').split(',').map((p) => p.trim()).filter(Boolean);

// Deterministic pseudo-randomness so re-running produces a comparable corpus.
let s = 12345;
const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
const int = (lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1));
// Parenthesised: without them a trailing `::date` binds to the interval literal
// rather than the sum, and Postgres refuses with "cannot cast type interval to date".
const days = (n: number) => `(now() + interval '${n} days')`;

/** A type-appropriate value for one field definition. */
function valueFor(f: any, i: number): any {
  switch (f.type) {
    case 'boolean': return rnd() > 0.4;
    case 'number': {
      const ph = Number(f.placeholder);
      const base = Number.isFinite(ph) && ph > 0 ? ph : 10;
      if (f.key === 'year') return int(2008, 2024);
      if (f.key.startsWith('salary')) return int(6, 30) * 100000;
      return Math.max(1, Math.round(base * (0.5 + rnd())));
    }
    case 'select': return pick(f.options ?? ['']);
    case 'multiselect': {
      const opts = f.options ?? [];
      const n = Math.max(1, Math.floor(rnd() * opts.length));
      return opts.slice(0, n);
    }
    case 'text':
    default:
      return f.placeholder ? `${f.placeholder}` : `${f.label} ${i + 1}`;
  }
}

/**
 * The lifecycle each post is stamped with. Weighted toward the ordinary case,
 * but every branch the read paths care about appears at least once per category.
 */
const LIFECYCLES = [
  { approval: 'APPROVED', status: 'ACTIVE',  expires: 30,   featured: null, note: 'live' },
  { approval: 'APPROVED', status: 'ACTIVE',  expires: 12,   featured: null, note: 'live' },
  { approval: 'APPROVED', status: 'ACTIVE',  expires: 3,    featured: null, note: 'expiring soon' },
  { approval: 'APPROVED', status: 'ACTIVE',  expires: 45,   featured: 14,   note: 'featured, live window' },
  { approval: 'APPROVED', status: 'ACTIVE',  expires: 60,   featured: -5,   note: 'featured window lapsed' },
  { approval: 'APPROVED', status: 'RENTED',  expires: 30,   featured: null, note: 'approved but unavailable' },
  // Past expiry, status not yet swept — the drift window the cron leaves open.
  { approval: 'APPROVED', status: 'ACTIVE',  expires: -2,   featured: null, note: 'lapsed, unswept' },
  { approval: 'APPROVED', status: 'EXPIRED', expires: -20,  featured: null, note: 'lapsed and swept' },
  { approval: 'PENDING',  status: 'ACTIVE',  expires: 30,   featured: null, note: 'awaiting moderation' },
  { approval: 'PENDING',  status: 'ACTIVE',  expires: 30,   featured: null, note: 'awaiting moderation' },
  { approval: 'REJECTED', status: 'ACTIVE',  expires: 30,   featured: null, note: 'rejected' },
  { approval: 'APPROVED', status: 'ACTIVE',  expires: null, featured: null, note: 'no expiry set' },
];

const REJECTIONS = [
  'Зураг тодорхойгүй байна.',
  'Утасны дугаар буруу.',
  'Ангилал тохирохгүй байна.',
];

async function wipe(client: Client) {
  // Every domain table, never `migrations` — the schema stays, the data goes.
  // RESTART IDENTITY so serial ids start from 1 and CASCADE for the FK web.
  await client.query(`
    TRUNCATE TABLE
      analytics_event, review, booking, likedpost, viewedpost,
      trusted_device, verification_session, post, "user", company
    RESTART IDENTITY CASCADE`);
  console.log('wiped: all domain tables (schema and migrations untouched)');
}

async function seedCompanies(client: Client) {
  const rows: string[] = [];
  for (let i = 0; i < 12; i++) {
    // A third verified, and one deliberately verified with no registration
    // number so the admin screen's "check the number" flow has a counter-example.
    const verified = i % 3 === 0;
    const reg = i === 3 ? null : `${int(1000000, 9999999)}`;
    const { rows: [c] } = await client.query(
      `INSERT INTO company (name, description, address, phone_number, email, registration_number, tax_id, is_verified)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [
        `Барилга ХХК ${i + 1}`,
        `Барилгын чиглэлийн ${i + 1} дугаар компани. Туршилтын тайлбар.`,
        `Улаанбаатар, ${pick(UB_DISTRICTS)} дүүрэг, ${int(1, 40)}-р байр`,
        `7${int(1000000, 9999999)}`,
        `company${i + 1}@example.mn`,
        reg,
        `${int(1000000, 9999999)}`,
        verified,
      ],
    );
    rows.push(c.id);
  }
  console.log(`companies: ${rows.length} (4 verified, 1 verified without a reg number)`);
  return rows;
}

async function seedUsers(client: Client, companies: string[]) {
  const providers: string[] = [];
  const customers: string[] = [];
  const admins: string[] = [];

  // Admins are phone-derived (ADMIN_PHONES), so they must exist under those
  // exact numbers or nothing in the app is reachable as an admin.
  for (const phone of ADMIN_PHONES) {
    const { rows: [u] } = await client.query(
      `INSERT INTO "user" (type, phone_number, given_name, is_verified, plan)
       VALUES ('PROVIDER',$1,$2,true,'FREE') RETURNING id`,
      [phone, `Админ ${phone.slice(-4)}`],
    );
    admins.push(u.id);
  }

  for (let i = 0; i < 24; i++) {
    // plan coverage: free, active paid, and one already past its expiry so the
    // "entitlement is derived on read" path has a subject.
    let plan = 'FREE';
    let planExpires: string | null = null;
    if (i % 4 === 1) { plan = 'PROVIDER'; planExpires = `now() + interval '${int(20, 300)} days'`; }
    if (i % 8 === 3) { plan = 'PROVIDER'; planExpires = `now() - interval '${int(1, 40)} days'`; }

    const { rows: [u] } = await client.query(
      `INSERT INTO "user" (type, phone_number, given_name, parent_name, email, address, is_verified, "companyId", plan, plan_expires_at)
       VALUES ('PROVIDER',$1,$2,$3,$4,$5,$6,$7,$8,${planExpires ?? 'NULL'}) RETURNING id`,
      [
        `88${String(100000 + i).slice(-6)}`,
        `Нийлүүлэгч ${i + 1}`,
        `Эцгийн нэр ${i + 1}`,
        i % 5 === 0 ? null : `provider${i + 1}@example.mn`,
        i % 4 === 0 ? null : `Улаанбаатар, ${pick(UB_DISTRICTS)}`,
        // one unverified provider — every read path must tolerate it
        i !== 7,
        i % 2 === 0 ? companies[i % companies.length] : null,
        plan,
      ],
    );
    providers.push(u.id);
  }

  for (let i = 0; i < 40; i++) {
    const { rows: [u] } = await client.query(
      `INSERT INTO "user" (type, phone_number, given_name, email, is_verified, plan)
       VALUES ('CUSTOMER',$1,$2,$3,true,'FREE') RETURNING id`,
      [`95${String(100000 + i).slice(-6)}`, `Худалдан авагч ${i + 1}`, i % 3 === 0 ? null : `customer${i + 1}@example.mn`],
    );
    customers.push(u.id);
  }

  // A user with no type at all — the state between verification and role choice.
  await client.query(
    `INSERT INTO "user" (phone_number, is_verified, plan) VALUES ($1,true,'FREE')`,
    ['99000001'],
  );

  console.log(`users: ${admins.length} admin, ${providers.length} provider, ${customers.length} customer, 1 role-less`);
  return { providers, customers, admins };
}

async function seedPosts(client: Client, owners: string[]) {
  const ids: number[] = [];
  let lifecycleIdx = 0;

  for (const cat of CATEGORY_SEED) {
    const subs = (cat.subcategories ?? []).map((x: any) => x.value);
    for (let i = 0; i < LIFECYCLES.length; i++) {
      const lc = LIFECYCLES[lifecycleIdx++ % LIFECYCLES.length];

      // Every field gets a value on most posts so the corpus covers the optional
      // half of each schema; a slice gets only required fields, because that is
      // what a real hurried listing looks like.
      const attributes: Record<string, any> = {};
      const sparse = i % 5 === 4;
      for (const f of cat.fields ?? []) {
        if (sparse && !f.required) continue;
        attributes[f.key] = valueFor(f, i);
      }

      const province = pick(PROVINCES);
      const district = province === 'ULAANBAATAR' ? pick(UB_DISTRICTS) : null;
      const sub = subs.length ? subs[i % subs.length] : null;
      // A tenth of posts carry no coordinates — they must stay in browse and
      // stay off the map, rather than becoming a null pin.
      const located = i % 10 !== 7;
      const images = i % 6 === 5 ? '[]' : JSON.stringify([`seed-${cat.key}-${i + 1}.jpg`]);

      const { rows: [p] } = await client.query(
        `INSERT INTO "post"
           (category, subcategory, title, details, province, district, address,
            latitude, longitude, price_amount, price_unit, contact_phone, contact_email, website,
            available_from, available_until,
            attributes, images, status, approval_status, rejection_reason, views,
            expires_at, featured_until, "userId", date_created)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,
                 ${cat.has_availability_dates ? `now() - interval '5 days', now() + interval '${int(20, 90)} days'` : 'NULL, NULL'},
                 $15::jsonb,$16::jsonb,$17,$18,$19,$20,
                 ${lc.expires === null ? 'NULL' : days(lc.expires)},
                 ${lc.featured === null ? 'NULL' : days(lc.featured)},
                 $21, now() - interval '${int(0, 200)} days')
         RETURNING id`,
        [
          cat.key, sub,
          `${cat.labels?.mn ?? cat.label} — ${lc.note} #${i + 1}`,
          `${cat.labels?.mn ?? cat.label} чиглэлийн туршилтын дэлгэрэнгүй мэдээлэл. Төлөв: ${lc.note}. `
            + 'Энэ бол хайлтын индекс болон урт текстийн харагдацыг шалгах зорилготой тайлбар юм.',
          province, district, `Тестийн хаяг ${i + 1}`,
          located ? 47.85 + rnd() * 0.25 : null,
          located ? 106.75 + rnd() * 0.35 : null,
          cat.has_price ? int(50, 900) * 1000 : null,
          cat.has_price ? (cat.default_price_unit ?? 'DAY') : null,
          `99${int(100000, 999999)}`,
          i % 4 === 0 ? `post${i + 1}@example.mn` : null,
          i % 7 === 0 ? `example-${cat.key}.mn` : null,
          JSON.stringify(attributes), images,
          lc.status, lc.approval,
          lc.approval === 'REJECTED' ? pick(REJECTIONS) : null,
          int(0, 400),
          pick(owners),
        ],
      );
      ids.push(p.id);
    }
  }
  console.log(`posts: ${ids.length} across ${CATEGORY_SEED.length} categories, ${LIFECYCLES.length} lifecycle states each`);
  return ids;
}

async function seedEngagement(client: Client, postIds: number[], customers: string[]) {
  const cats = (await client.query('SELECT id, category, "userId" FROM post')).rows;
  const byId = new Map(cats.map((r: any) => [r.id, r]));

  let likes = 0;
  let views = 0;
  for (const uid of customers) {
    for (const pid of postIds) {
      const post: any = byId.get(pid);
      if (!post || post.userId === uid) continue;   // nobody likes their own post
      if (rnd() < 0.06) {
        await client.query(
          `INSERT INTO likedpost (user_id, post_type, post_id, date_liked)
           VALUES ($1,$2,$3, now() - interval '${int(0, 60)} days') ON CONFLICT DO NOTHING`,
          [uid, post.category, pid],
        );
        likes++;
      }
      if (rnd() < 0.1) {
        await client.query(
          `INSERT INTO viewedpost (user_id, post_type, post_id, date_viewed)
           VALUES ($1,'post',$2, now() - interval '${int(0, 60)} days') ON CONFLICT DO NOTHING`,
          [uid, pid],
        );
        views++;
      }
    }
  }
  console.log(`engagement: ${likes} likes, ${views} recorded views`);
}

async function seedBookings(client: Client, customers: string[]) {
  // Only bookable categories, and only posts a customer could actually reach.
  const bookableKeys = CATEGORY_SEED.filter((c: any) => c.has_rental_status).map((c: any) => c.key);
  const { rows: posts } = await client.query(
    `SELECT id, "userId" FROM post
      WHERE category = ANY($1) AND approval_status = 'APPROVED' AND status = 'ACTIVE'
      ORDER BY id`,
    [bookableKeys],
  );

  const plans = [
    { status: 'PENDING',   from: 5,    to: 9   },
    { status: 'PENDING',   from: 20,   to: 24  },
    { status: 'ACCEPTED',  from: 2,    to: 6   },   // live commitment — blocks deletion
    { status: 'ACCEPTED',  from: -40,  to: -35 },   // concluded — review eligibility
    { status: 'ACCEPTED',  from: 40,   to: 46  },   // future
    { status: 'DECLINED',  from: 8,    to: 12  },
    { status: 'CANCELLED', from: 15,   to: 18  },
    // Requested, never answered, dates gone — what the nightly sweep leaves.
    { status: 'EXPIRED',   from: -25,  to: -20 },
  ];

  let made = 0;
  const counts: Record<string, number> = {};
  const skipped: string[] = [];
  for (let i = 0; i < posts.length; i++) {
    const post = posts[i];
    const plan = plans[i % plans.length];
    const customer = customers[i % customers.length];
    if (customer === post.userId) continue;
    try {
      await client.query(
        `INSERT INTO booking (start_date, end_date, message, status, response_message, "postId", "customerId", "providerId", date_created)
         VALUES (${days(plan.from)}::date, ${days(plan.to)}::date, $1, $2, $3, $4, $5, $6, now() - interval '${int(1, 30)} days')`,
        [
          `Сайн байна уу. ${plan.from > 0 ? 'Удахгүй' : 'Өмнө нь'} захиалах хүсэлтэй байна.`,
          plan.status,
          plan.status === 'DECLINED' ? 'Уучлаарай, тухайн өдрүүдэд завгүй байна.' : null,
          post.id, customer, post.userId,
        ],
      );
      counts[plan.status] = (counts[plan.status] ?? 0) + 1;
      made++;
    } catch (err: any) {
      // The partial unique index and the accepted-overlap exclusion are doing
      // their job; a fixture that trips them is one we did not need. Anything
      // else is a broken fixture and must not be swallowed — a silent catch here
      // is how "bookings: 0" gets reported as success.
      const constraint = err?.constraint ?? '';
      if (constraint !== 'UQ_booking_one_pending_per_customer_post'
        && constraint !== 'EX_booking_accepted_no_overlap') {
        skipped.push(err?.message ?? String(err));
      }
    }
  }
  console.log(`bookings: ${made} — ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(', ')}`);
  if (skipped.length) {
    console.log(`  ${skipped.length} unexpected failure(s); first: ${skipped[0]}`);
  }
  if (!made) console.log(`  candidate posts: ${posts.length}, bookable categories: ${bookableKeys.length}`);
}

async function seedReviews(client: Client) {
  // Eligibility is "has an ACCEPTED booking with this provider", so derive the
  // review set from bookings rather than inventing pairs the API would refuse.
  const { rows: pairs } = await client.query(
    `SELECT DISTINCT "customerId", "providerId" FROM booking WHERE status = 'ACCEPTED'`,
  );
  let made = 0;
  for (const p of pairs) {
    const rating = int(1, 5);
    // A third leave a rating with no comment — the column is nullable and the
    // display has to hold up without prose.
    const comment = rnd() < 0.33 ? null
      : pick([
        'Цаг барьсан, найдвартай үйлчилгээ.',
        'Техник хэрэгсэл сайн байсан. Дахин ажиллана.',
        'Харилцаа сайн, гэхдээ жаахан хоцорсон.',
        'Үнэ өндөр санагдсан ч ажил чанартай.',
      ]);
    try {
      await client.query(
        `INSERT INTO review (rating, comment, "providerId", "authorId", date_created)
         VALUES ($1,$2,$3,$4, now() - interval '${int(1, 60)} days')`,
        [rating, comment, p.providerId, p.customerId],
      );
      made++;
    } catch { /* one review per author per provider */ }
  }
  console.log(`reviews: ${made} (a third with no comment)`);
}

async function seedAuthArtifacts(client: Client, users: string[]) {
  const statuses = ['PENDING', 'VERIFIED', 'CONSUMED', 'EXPIRED'];
  for (let i = 0; i < 16; i++) {
    const st = statuses[i % statuses.length];
    await client.query(
      `INSERT INTO verification_session (provider_session_id, phone_number, code, status, device_hash, verified_at, expires_at)
       VALUES ($1,$2,$3,$4,$5, ${st === 'PENDING' ? 'NULL' : 'now()'}, ${st === 'EXPIRED' ? `now() - interval '1 day'` : days(1)})`,
      [
        `remote-${i + 1}`, `88${String(100000 + i).slice(-6)}`, `ZM${int(1000, 9999)}`, st,
        createHash('sha256').update(`device-${i}`).digest('hex'),
      ],
    );
  }
  for (let i = 0; i < 20; i++) {
    await client.query(
      `INSERT INTO trusted_device (device_hash, last_seen_at, "userId")
       VALUES ($1, now() - interval '${int(0, 30)} days', $2)`,
      [createHash('sha256').update(`trusted-${i}`).digest('hex'), users[i % users.length]],
    );
  }
  console.log('auth: 16 verification sessions (all four statuses), 20 trusted devices');
}

async function seedAnalytics(client: Client, users: string[]) {
  const events = ['browse.search', 'post.view', 'post.create.started', 'post.create.submitted', 'contact.revealed', 'auth.start', 'auth.verified'];
  let made = 0;
  for (let i = 0; i < 400; i++) {
    const name = pick(events);
    await client.query(
      `INSERT INTO analytics_event (name, anon_id, path, platform, props, occurred_at, "userId")
       VALUES ($1,$2,$3,$4,$5::jsonb, now() - interval '${int(0, 89)} days', $6)`,
      [
        name,
        `anon-${int(1, 120)}`,
        pick(['/', '/browse', '/customer/map', '/posts/12']),
        pick(['web', 'ios', 'android', 'server']),
        JSON.stringify(name === 'browse.search' ? { query_length: int(2, 20), total: int(0, 40) } : { seeded: true }),
        rnd() < 0.5 ? pick(users) : null,
      ],
    );
    made++;
  }
  console.log(`analytics: ${made} events spread over 90 days`);
}

async function main() {
  const client = new Client({
    host: process.env.PG_HOST, port: Number(process.env.PG_PORT),
    user: process.env.PG_USER, password: process.env.PG_PWD, database: process.env.PG_NAME,
  });
  await client.connect();

  if (process.argv.includes('--wipe')) await wipe(client);

  const companies = await seedCompanies(client);
  const { providers, customers, admins } = await seedUsers(client, companies);
  const owners = [...providers, ...admins];
  const postIds = await seedPosts(client, owners);
  await seedEngagement(client, postIds, customers);
  await seedBookings(client, customers);
  await seedReviews(client);
  await seedAuthArtifacts(client, [...providers, ...customers]);
  await seedAnalytics(client, [...providers, ...customers]);

  await client.end();
  console.log('\ndone.');
}

main().catch((e) => { console.error(e); process.exit(1); });
