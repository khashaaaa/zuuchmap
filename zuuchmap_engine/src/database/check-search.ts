/**
 * The search gate (`npm run check:search`, run by CI after migrations).
 *
 * Browse search is SQL (`searchSql`) and the saved-search matcher is JS
 * (`matchesPost`); both are built from `utils/search-terms.ts`, and nothing
 * else stops them drifting apart or a tweak to the stemmer quietly breaking a
 * query people type. This inserts a handful of fixture posts inside a
 * transaction, runs real queries against the real generated column, and rolls
 * back — so it is safe against any database, including a developer's own.
 *
 * Two kinds of check:
 *   - parity: for every strict query, the SQL and the JS matcher pick the same
 *     fixtures;
 *   - expectations: what a query must find and must not find, per mode. These
 *     are the regressions each rule exists for — add a line when adding one.
 */
import { config as loadEnv } from 'dotenv';
loadEnv({
  path: `${process.cwd()}/config/variables/${process.env.NODE_ENV ?? 'development'}.env`,
});
import { Client } from 'pg';
import { CATEGORY_SEED } from '../post/category.service';
import {
  categoryLabelIndex,
  expandTerms,
  matchesPost,
  SearchMode,
  searchSql,
  searchTerms,
} from '../utils/search-terms';

type Fixture = {
  title: string;
  category: string;
  subcategory: string;
  province: string;
  district?: string;
  details?: string;
  attributes?: Record<string, unknown>;
  featured?: boolean;
};

const F: Record<string, Fixture> = {
  exc: {
    title: 'Komatsu PC200-8 экскаватор түрээслүүлнэ',
    category: 'machineryrent',
    subcategory: 'excavator',
    province: 'ULAANBAATAR',
    district: 'BAYANZURKH',
    attributes: {
      manufacturer: 'Komatsu',
      model: 'PC200-8',
      with_operator: true,
    },
    featured: true,
  },
  dozer: {
    title: 'Shantui SD16 шороо түлхэнэ',
    category: 'machineryrent',
    subcategory: 'bulldozer',
    province: 'TUV',
    attributes: { manufacturer: 'Shantui' },
  },
  worker: {
    title: 'Барилгын ажилчин авна',
    category: 'jobvacancy',
    subcategory: 'worker',
    province: 'DARKHANUUL',
    attributes: { accommodation_provided: true },
  },
  dump: {
    title: 'Самосвал 20 тн — хайрга, элс',
    category: 'transport',
    subcategory: 'dump_truck',
    province: 'ORKHON',
    details: 'Хүргэлттэй, хот дотор',
  },
  heavy: {
    title: 'Хүнд даацын тээврийн үйлчилгээ',
    category: 'transport',
    subcategory: 'heavy_haul',
    province: 'UMNUGOVI',
  },
  jeep: {
    title: 'Toyota Land Cruiser 200 жолоочтой түрээслүүлнэ',
    category: 'vehiclerent',
    subcategory: 'suv',
    province: 'ULAANBAATAR',
    district: 'KHANUUL',
    featured: true,
  },
  man: {
    title: 'MAN TGS 6x4 ачааны машин',
    category: 'usedequipment',
    subcategory: 'vehicle',
    province: 'SELENGE',
    attributes: { manufacturer: 'MAN', condition: 'USED' },
  },
  cement: {
    title: 'Хөтөл цемент М400',
    category: 'materialstore',
    subcategory: 'cement',
    province: 'DARKHANUUL',
  },
  workwear: {
    title: 'Ажлын хувцас, гутал',
    category: 'materialstore',
    subcategory: 'other',
    province: 'KHOVD',
  },
};

/** [query, mode, must find, must not find] */
const EXPECT: [string, SearchMode, string[], string[]][] = [
  ['экскаватор', 'all', ['exc'], ['dozer']],
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
const FEATURED: [string, SearchMode, string[], string[]][] = [
  ['экскаватор', 'all', ['exc'], []],
  ['экскаватор түрээс', 'all', ['exc'], []],
  ['самосвал түрээс', 'any', [], ['exc', 'jeep']], // titles say only түрээс
];

/** TypeORM's `:name` placeholders → pg's `$n`. */
function positional(sql: string, params: Record<string, unknown>) {
  const values: unknown[] = [];
  const index = new Map<string, number>();
  const text = sql.replace(/(?<!:):([a-zA-Z_]\w*)/g, (_, name: string) => {
    if (!(name in params)) throw new Error(`unbound :${name}`);
    if (!index.has(name)) {
      values.push(params[name]);
      index.set(name, values.length);
    }
    return `$${index.get(name)}`;
  });
  return { text, values };
}

async function main() {
  const client = new Client({
    host: process.env.PG_HOST,
    port: Number(process.env.PG_PORT),
    user: process.env.PG_USER,
    password: process.env.PG_PWD,
    database: process.env.PG_NAME,
  });
  await client.connect();
  const failures: string[] = [];
  const labels = categoryLabelIndex(CATEGORY_SEED as any[]);
  await client.query('BEGIN');
  try {
    const idOf = new Map<number, string>();
    for (const [name, f] of Object.entries(F)) {
      const { rows } = await client.query(
        `INSERT INTO post (title, category, subcategory, province, district, details, attributes, is_featured, approval_status, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'APPROVED','ACTIVE') RETURNING id`,
        [
          f.title,
          f.category,
          f.subcategory,
          f.province,
          f.district ?? null,
          f.details ?? null,
          JSON.stringify(f.attributes ?? {}),
          !!f.featured,
        ],
      );
      idOf.set(rows[0].id, name);
    }
    const ids = [...idOf.keys()];

    const run = async (q: string, mode: SearchMode) => {
      const terms = searchTerms(q);
      const groups = expandTerms(terms, labels);
      const sql = searchSql(groups, terms, mode);
      const { text, values } = positional(
        `SELECT post.id, ${sql.featured} AS featured, ${sql.rank} AS rank
           FROM post post
          WHERE post.id = ANY(:fixtureIds) AND ${sql.where.join(' AND ')}`,
        { ...sql.params, fixtureIds: ids },
      );
      const { rows } = await client.query(text, values);
      return { groups, rows: rows as { id: number; featured: boolean }[] };
    };
    const names = (rows: { id: number }[]) =>
      rows.map((r) => idOf.get(r.id)!).sort();

    for (const [q, mode, must, mustNot] of EXPECT) {
      const { groups, rows } = await run(q, mode);
      const got = names(rows);
      for (const m of must)
        if (!got.includes(m))
          failures.push(`"${q}" (${mode}) missed ${m} — got [${got}]`);
      for (const m of mustNot)
        if (got.includes(m))
          failures.push(`"${q}" (${mode}) wrongly found ${m}`);
      if (mode === 'all') {
        // The saved-search matcher must agree with browse, fixture for fixture.
        const js = Object.entries(F)
          .filter(([, f]) => matchesPost(groups, f))
          .map(([n]) => n)
          .sort();
        if (JSON.stringify(js) !== JSON.stringify(got))
          failures.push(
            `"${q}" parity: SQL [${got}] vs saved-search matcher [${js}]`,
          );
      }
    }

    for (const [q, mode, on, off] of FEATURED) {
      const { rows } = await run(q, mode);
      const lifted = names(rows.filter((r) => r.featured));
      for (const m of on)
        if (!lifted.includes(m))
          failures.push(`"${q}" (${mode}) should lift featured ${m}`);
      for (const m of off)
        if (lifted.includes(m))
          failures.push(`"${q}" (${mode}) must not lift featured ${m}`);
    }
  } finally {
    await client.query('ROLLBACK');
    await client.end();
  }

  const checks = EXPECT.length + FEATURED.length;
  if (failures.length) {
    console.error(
      `✗ search: ${failures.length} failure(s) over ${checks} checks`,
    );
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(
    `✓ search OK — ${checks} checks, SQL and saved-search matcher agree`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
