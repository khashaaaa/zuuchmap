/**
 * Development-only fixture generator. Builds posts for every category directly
 * from CATEGORY_SEED, so every field of every category is exercised and the
 * fixtures cannot drift from the schema. Run: npx ts-node -r tsconfig-paths/register src/database/seed-test-posts.ts
 */
import 'dotenv/config';
import { Client } from 'pg';
import { CATEGORY_SEED } from '../post/category.service';

const PROVINCES = ['ULAANBAATAR', 'ORKHON', 'DARKHAN_UUL', 'SELENGE', 'UMNUGOVI', 'DORNOGOVI'];
const DISTRICTS: Record<string, string[]> = {
  ULAANBAATAR: ['CHINGELTEI', 'KHAN_UUL', 'BAYANGOL', 'SUKHBAATAR', 'BAYANZURKH', 'SONGINOKHAIRKHAN'],
};
const APPROVALS = ['APPROVED', 'APPROVED', 'APPROVED', 'PENDING', 'REJECTED'];

// Deterministic pseudo-randomness so re-running produces a comparable corpus.
let s = 12345;
const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
const int = (lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1));

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

async function main() {
  const client = new Client({
    host: process.env.PG_HOST, port: Number(process.env.PG_PORT),
    user: process.env.PG_USER, password: process.env.PG_PWD, database: process.env.PG_NAME,
  });
  await client.connect();

  const users = (await client.query('SELECT id FROM "user" LIMIT 20')).rows as Array<{ id: string }>;
  if (!users.length) throw new Error('no users to own the posts');

  const PER_CATEGORY = Number(process.argv[2] ?? 8);
  let made = 0;

  for (const cat of CATEGORY_SEED) {
    const subs = (cat.subcategories ?? []).map((x: any) => x.value);
    for (let i = 0; i < PER_CATEGORY; i++) {
      // Every field gets a value — details included — so the corpus covers the
      // optional half of each schema too, not just the required core.
      const attributes: Record<string, any> = {};
      for (const f of cat.fields ?? []) attributes[f.key] = valueFor(f, i);

      const province = pick(PROVINCES);
      const district = province === 'ULAANBAATAR' ? pick(DISTRICTS.ULAANBAATAR) : null;
      const sub = subs.length ? subs[i % subs.length] : null;

      await client.query(
        `INSERT INTO "post"
           (category, subcategory, title, details, province, district, address,
            latitude, longitude, price_amount, price_unit, contact_phone,
            attributes, images, status, approval_status, views, expires_at, "userId")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,'[]'::jsonb,
                 'ACTIVE',$14,$15, now() + interval '30 days', $16)`,
        [
          cat.key, sub,
          `${cat.labels?.mn ?? cat.label} — туршилтын зар #${i + 1}`,
          `${cat.labels?.mn ?? cat.label} чиглэлийн туршилтын дэлгэрэнгүй мэдээлэл. Бүх талбар бөглөгдсөн.`,
          province, district, `Тестийн хаяг ${i + 1}`,
          47.9 + rnd(), 106.9 + rnd(),
          cat.has_price ? int(50, 900) * 1000 : null,
          cat.has_price ? (cat.default_price_unit ?? 'DAY') : null,
          `99${int(100000, 999999)}`,
          JSON.stringify(attributes),
          pick(APPROVALS), int(0, 400),
          pick(users).id,
        ],
      );
      made++;
    }
  }

  console.log(`seeded ${made} posts across ${CATEGORY_SEED.length} categories`);
  await client.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
