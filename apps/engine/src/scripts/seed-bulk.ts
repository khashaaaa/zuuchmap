import type { DataSource } from 'typeorm';
import { addDays, ulaanbaatarDate } from '../post/availability.service';

/**
 * The bulk half of `seed:dev`: a market's worth of generated data on top of the hand-written
 * accounts — providers and customers, listings in every category and province (no photos; the
 * clients draw the category tile), busy days, bookings in every state, Чат threads with reply
 * times, reviews with replies, saves and saved searches. Deterministic (fixed PRNG seed), bulk
 * inserted through `jsonb_to_recordset`, re-runnable: generated accounts are phones 9850xxxx
 * (providers) and 9860xxxx (customers), and everything they own is replaced.
 */

const PROVIDERS = 80;
const CUSTOMERS = 250;
const LISTINGS_PER_PROVIDER = [8, 32] as const;
const BOOKINGS = 900;
const THREADS = 450;
const REVIEWS = 600;
const LIKES = 1800;
const SAVED_SEARCHES = 160;

// ---- deterministic randomness ---------------------------------------------

let state = 20261015;
const rnd = (): number => {
  state = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(state ^ (state >>> 15), 1 | state);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const int = (a: number, b: number): number => a + Math.floor(rnd() * (b - a + 1));
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)];
const chance = (p: number): boolean => rnd() < p;
const round = (n: number, step: number): number => Math.max(step, Math.round(n / step) * step);

// ---- vocabulary -------------------------------------------------------------

const GIVEN = ['Бат-Эрдэнэ', 'Ганбат', 'Сарантуяа', 'Төмөр-Очир', 'Оюунчимэг', 'Батболд', 'Энхжаргал', 'Мөнхбат', 'Нарантуяа', 'Ариунаа', 'Болд', 'Хулан', 'Тэмүүлэн', 'Анужин', 'Ганзориг', 'Отгонбаяр', 'Сүхбат', 'Номин', 'Баярмаа', 'Эрдэнэбат', 'Ууганбаяр', 'Мягмарсүрэн', 'Цэцэгмаа', 'Пүрэвдорж', 'Золзаяа', 'Дөлгөөн', 'Билгүүн', 'Мөнхзул', 'Жаргалсайхан', 'Алтангэрэл'];
const INITIAL = ['Б.', 'Д.', 'Г.', 'Н.', 'О.', 'Т.', 'С.', 'Э.', 'Ж.', 'Ц.', 'Л.', 'М.'];
const COMPANY_A = ['Хүнд', 'Алтан', 'Хангай', 'Түмэн', 'Их', 'Говь', 'Сэлэнгэ', 'Тэнгэр', 'Монгол', 'Эрдэнэ', 'Найрамдал', 'Цогт', 'Шинэ', 'Хүчит', 'Өндөр'];
const COMPANY_B = ['Техник', 'Барилга', 'Машин', 'Тээвэр', 'Материал', 'Инженеринг', 'Констракшн', 'Трейд', 'Сервис', 'Хөгжил'];
const COMPANY_C = ['ХХК', 'ХХК', 'ХХК', 'ББСБ', 'Групп'];

const BRANDS: Record<string, string[]> = {
  vehiclerent: ['Toyota', 'Hyundai', 'Lexus', 'Nissan', 'Mitsubishi', 'Kia', 'Ford'],
  machineryrent: ['Komatsu', 'Caterpillar', 'Hitachi', 'Doosan', 'Volvo', 'XCMG', 'Sany', 'Zoomlion', 'Liugong', 'JCB', 'Shantui'],
  toolrent: ['Makita', 'Bosch', 'Hilti', 'DeWalt', 'Stihl', 'Honda', 'Metabo'],
  usedequipment: ['Komatsu', 'Caterpillar', 'Hitachi', 'Hyundai', 'Volvo', 'XCMG', 'Shacman', 'HOWO', 'Doosan'],
  materialstore: ['Хөтөл', 'Монцемент', 'Эрдэнэт', 'Knauf', 'Ceresit', 'Technonicol', 'Барилгын материал'],
  factory: ['Бетон', 'Төмөр', 'Тоосго', 'Хаалга цонх', 'Дулаалга', 'Хийц'],
};
const MODELS = ['PC200', 'PC300', '320D', 'ZX200', 'DX225', 'EC210', 'XE215', 'SY215', 'ZTC250', 'CLG856', 'SD16', '3CX', 'Land Cruiser 200', 'Prado', 'Porter', 'H100', 'Actros', 'Hilux', 'Ranger', 'Delica'];

const DETAILS = [
  'Туршлагатай оператортой, өдрийн 10 цагийн ажлын хуваарьтай.',
  'Улаанбаатар хотын дотор хүргэлттэй. Хөдөө орон нутагт тохиролцоно.',
  '7 хоногоос дээш захиалгад 10% хөнгөлөлттэй.',
  'Техникийн үзлэг хийгдсэн, бүрэн бүтэн.',
  'Түлш захиалагчийн талаас.',
  'Шуудуу, суурийн нүх, газар шорооны ажилд тохиромжтой.',
  'Гэрээгээр ажиллана, НӨАТ-ын баримт гаргана.',
  'Яаралтай захиалга 2 цагийн дотор.',
  'Барилгын талбай дээр шууд хүргэнэ.',
  'Чанарын баталгаатай, стандартын шаардлага хангасан.',
  'Бөөний үнээр, их хэмжээний захиалгад тусгай үнэ.',
  'Ажлын туршлага 5-аас дээш жил.',
];
const CUSTOMER_LINES = [
  'Сайн байна уу. Боломжтой юу?', 'Маргааш эхлэх боломжтой юу?', 'Оператортой юу?', 'Хүргэлт хэд вэ?', 'Үнэ дээр тохирох боломжтой юу?',
  'Хан-Уул дүүрэгт ажиллана.', 'Хэдэн цагт ирэх вэ?', 'Баримт гаргаж өгөх үү?', 'За ойлголоо, баярлалаа.', 'Утсаар ярьж болох уу?',
  '3 хоногоор авъя гэж бодож байна.', 'Ажлын байршлаа явуулъя.',
];
const PROVIDER_LINES = [
  'Сайн байна уу. Боломжтой.', 'Тийм, оператортой ирнэ.', 'Хүргэлт 150,000₮.', 'Өглөө 8 цагт ирж чадна.', 'Баримт гаргана.',
  'Захиалгын хүсэлтээ илгээгээрэй.', 'Тэр өдөр завгүй, дараагийн долоо хоногт боломжтой.', 'Байршлаа явуулна уу.', 'Баярлалаа.',
];
const REVIEW_LINES = [
  'Цагтаа ирсэн, оператор нь маш туршлагатай. Дахин захиална.', 'Үнэ боломжийн, гэхдээ хүргэлт 1 цаг хоцорсон.',
  'Хугацаандаа ажлаа дуусгасан.', 'Сэтгэл хангалуун байна.', 'Техник нь хуучирсан байсан.', 'Харилцаа сайн, хурдан хариулдаг.',
  'Хоёр дахь удаагаа захиалж байна.', 'Санал болгож байна.', null, null,
];
const REPLY_LINES = ['Баярлалаа! Дахин хамтран ажиллахад баяртай байна.', 'Уучлаарай, дараагийн удаа анхаарна.', 'Сэтгэгдэл үлдээсэнд баярлалаа.'];
const QUERIES = ['экскаватор', 'кран', 'самосвал', 'цемент', 'тээвэр', 'ачигч', 'бетон', 'засвар', 'жолооч', 'гагнуурчин', 'генератор', 'чирэх'];

/** Province centres (aimag centres; Ulaanbaatar by district). */
const UB: Record<string, [number, number]> = {
  BAYANGOL: [47.91, 106.88], BAYANZURKH: [47.92, 106.98], CHINGELTEI: [47.93, 106.91], KHANUUL: [47.88, 106.9],
  SONGINOKHAIRKHAN: [47.91, 106.78], SUKHBAATAR: [47.93, 106.92], NALAIKH: [47.75, 107.26], BAGANUUR: [47.79, 108.36], BAGAKHANGAI: [47.33, 107.48],
};
const AIMAG: Record<string, [number, number]> = {
  ARKHANGAI: [47.47, 101.45], BAYANOLGII: [48.97, 89.96], BAYANKHONGOR: [46.19, 100.72], BULGAN: [48.81, 103.53], DARKHANUUL: [49.47, 105.97],
  DORNOD: [48.07, 114.53], DORNOGOVI: [44.89, 110.12], DUNDGOVI: [45.76, 106.26], GOVIALTAI: [46.37, 96.26], GOVISUMBER: [46.36, 108.36],
  KHENTII: [47.32, 110.65], KHOVD: [48.01, 91.64], KHUVSGUL: [49.64, 100.16], UMNUGOVI: [43.57, 104.42], ORKHON: [49.03, 104.08],
  UVURKHANGAI: [46.26, 102.78], SELENGE: [50.24, 106.21], SUKHBAATAR: [46.68, 113.28], TUV: [47.71, 106.95], UVS: [49.98, 92.07], ZAVKHAN: [47.73, 96.84],
};
const UB_WEIGHTS = ['BAYANGOL', 'BAYANZURKH', 'BAYANZURKH', 'CHINGELTEI', 'KHANUUL', 'KHANUUL', 'SONGINOKHAIRKHAN', 'SONGINOKHAIRKHAN', 'SUKHBAATAR', 'NALAIKH', 'BAGANUUR', 'BAGAKHANGAI'];

function place(): { province: string; district: string | null; lat: number; lng: number } {
  if (chance(0.62)) {
    const d = pick(UB_WEIGHTS);
    const [la, ln] = UB[d];
    return { province: 'ULAANBAATAR', district: d, lat: la + (rnd() - 0.5) * 0.05, lng: ln + (rnd() - 0.5) * 0.08 };
  }
  const p = pick(Object.keys(AIMAG));
  const [la, ln] = AIMAG[p];
  return { province: p, district: null, lat: la + (rnd() - 0.5) * 0.06, lng: ln + (rnd() - 0.5) * 0.08 };
}

/** A price in the unit's usual range, rounded the way people write prices. */
function price(unit: string | null): number | null {
  switch (unit) {
    case 'DAY': return round(int(80, 2500) * 1000, 10000);
    case 'MOTO_HOUR': return round(int(60, 350) * 1000, 5000);
    case 'HOUR': return round(int(30, 200) * 1000, 5000);
    case 'TRIP': return round(int(50, 600) * 1000, 5000);
    case 'PROJECT': return round(int(500, 50000) * 1000, 50000);
    case 'UNIT': return round(int(500, 300000), 500);
    case 'TOTAL': return round(int(15, 600) * 1_000_000, 1_000_000);
    case 'MONTH': return round(int(1200, 5000) * 1000, 100000);
    default: return null;
  }
}

interface Field { key: string; type: string; options?: string[] }
interface Category { key: string; family: string; rentable: boolean; unit: string | null; subs: Array<{ value: string; mn: string }>; fields: Field[] }

function attrs(c: Category, brand: string, model: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of c.fields) {
    if (f.key === 'manufacturer') out[f.key] = brand;
    else if (f.key === 'model') out[f.key] = model;
    else if (f.key === 'year') out[f.key] = int(2008, 2024);
    else if (f.key === 'salary_min') out[f.key] = round(int(1200, 3000) * 1000, 100000);
    else if (f.key === 'salary_max') out[f.key] = round(int(3000, 6000) * 1000, 100000);
    else if (f.type === 'boolean') out[f.key] = chance(0.55);
    else if (f.type === 'number') out[f.key] = int(1, f.key.includes('min') ? 60 : 30);
    else if (f.type === 'select' && f.options?.length) out[f.key] = pick(f.options);
    else if (f.key === 'license_no') out[f.key] = String(int(100000, 999999));
    else if (f.key === 'min_order') out[f.key] = `${String(int(1, 20))} тн`;
  }
  return out;
}

function title(c: Category, sub: string, brand: string, model: string): string {
  switch (c.family) {
    case 'JOBS': return `${sub} ажилтан авна`;
    case 'SERVICES': return chance(0.5) ? `${sub} үйлчилгээ` : `${sub} — ${pick(['24/7', 'шуурхай', 'баталгаатай', 'туршлагатай баг'])}`;
    case 'MATERIALS_PRODUCTION': return `${brand} ${sub.toLowerCase()}`;
    default: return chance(0.7) ? `${brand} ${model} ${sub.toLowerCase()}` : `${sub} ${brand}`;
  }
}

// ---- bulk insert ------------------------------------------------------------

async function bulk(ds: DataSource, table: string, columns: Record<string, string>, rows: Array<Record<string, unknown>>, returning = 'id'): Promise<Array<Record<string, unknown>>> {
  const out: Array<Record<string, unknown>> = [];
  const names = Object.keys(columns);
  const spec = names.map((n) => `"${n}" ${columns[n]}`).join(', ');
  for (let i = 0; i < rows.length; i += 1000) {
    const chunk = rows.slice(i, i + 1000);
    const res = await ds.query<Array<Record<string, unknown>>>(
      `INSERT INTO ${table} (${names.map((n) => `"${n}"`).join(', ')})
       SELECT ${names.map((n) => `x."${n}"`).join(', ')} FROM jsonb_to_recordset($1::jsonb) AS x(${spec}) RETURNING ${returning}`,
      [JSON.stringify(chunk)],
    );
    out.push(...res);
  }
  return out;
}

const iso = (daysAgo: number, minutes = 0): string => new Date(Date.now() - daysAgo * 86_400_000 - minutes * 60_000).toISOString();

// ---- main -------------------------------------------------------------------

export async function seedBulk(ds: DataSource): Promise<Record<string, number>> {
  // Replace the previous run: generated accounts and everything they own.
  const old = `SELECT id FROM users WHERE phone_number LIKE '9850%' OR phone_number LIKE '9860%'`;
  await ds.query(`DELETE FROM posts WHERE user_id IN (${old})`);
  await ds.query(`DELETE FROM users WHERE id IN (${old})`);

  const cats = (await ds.query<Array<{ key: string; family: string; has_rental_status: boolean; default_price_unit: string | null; subcategories: Array<{ value: string; labels?: { mn?: string }; display?: string }>; fields: Field[] }>>(
    'SELECT key, family, has_rental_status, default_price_unit, subcategories, fields FROM category_schema WHERE active',
  )).map<Category>((c) => ({
    key: c.key, family: c.family, rentable: c.has_rental_status, unit: c.default_price_unit,
    subs: c.subcategories.map((s) => ({ value: s.value, mn: s.labels?.mn ?? s.display ?? s.value })),
    fields: c.fields.map((f) => ({ key: f.key, type: f.type, options: (f.options as unknown[] | undefined)?.map((o) => (typeof o === 'string' ? o : String((o as { value: unknown }).value))) })),
  }));
  // More machines and services than jobs, as on the live site.
  const weighted = cats.flatMap((c) => Array<Category>(c.family === 'EQUIPMENT_VEHICLES' ? 4 : c.family === 'SERVICES' ? 2 : 1).fill(c));

  const people = [
    ...Array.from({ length: PROVIDERS }, (_, i) => ({
      phone_number: `9850${String(i).padStart(4, '0')}`, type: 'PROVIDER', is_verified: true,
      given_name: pick(GIVEN), parent_name: pick(INITIAL), role_set_at: iso(int(30, 700)), date_created: iso(int(30, 700)),
    })),
    ...Array.from({ length: CUSTOMERS }, (_, i) => ({
      phone_number: `9860${String(i).padStart(4, '0')}`, type: 'CUSTOMER', is_verified: true,
      given_name: pick(GIVEN), parent_name: pick(INITIAL), role_set_at: null, date_created: iso(int(1, 400)),
    })),
  ];
  const users = await bulk(ds, 'users', { phone_number: 'varchar', type: 'varchar', is_verified: 'boolean', given_name: 'varchar', parent_name: 'varchar', role_set_at: 'timestamptz', date_created: 'timestamptz' }, people, 'id, phone_number, type');
  const providers = users.filter((u) => u.type === 'PROVIDER') as Array<{ id: string; phone_number: string }>;
  const customers = users.filter((u) => u.type === 'CUSTOMER') as Array<{ id: string; phone_number: string }>;

  // Seven in ten providers trade as a company; a third of those are verified.
  const companies = providers.filter(() => chance(0.7)).map((p) => {
    const name = `${pick(COMPANY_A)} ${pick(COMPANY_B)} ${pick(COMPANY_C)}`;
    return {
      owner_id: p.id, name, description: `${pick(DETAILS)} ${pick(DETAILS)}`, phone_number: p.phone_number,
      website: chance(0.4) ? `${name.split(' ')[0].toLowerCase()}.mn` : null, registration_number: String(int(1000000, 9999999)),
      service_area: chance(0.6) ? ['ULAANBAATAR'] : ['ULAANBAATAR', pick(Object.keys(AIMAG))],
      is_verified: chance(0.35),
    };
  });
  await bulk(ds, 'companies', { owner_id: 'uuid', name: 'varchar', description: 'varchar', phone_number: 'varchar', website: 'varchar', registration_number: 'varchar', service_area: 'jsonb', is_verified: 'boolean' }, companies);

  // Listings.
  const posts: Array<Record<string, unknown>> = [];
  for (const p of providers) {
    const n = int(...LISTINGS_PER_PROVIDER);
    const home = place();
    for (let i = 0; i < n; i++) {
      const c = pick(weighted);
      const sub = pick(c.subs);
      const brand = pick(BRANDS[c.key] ?? BRANDS.machineryrent);
      const model = pick(MODELS);
      const where = chance(0.7) ? { ...home, lat: home.lat + (rnd() - 0.5) * 0.03, lng: home.lng + (rnd() - 0.5) * 0.04 } : place();
      const age = int(0, 120);
      const roll = rnd();
      const state = roll < 0.84 ? 'live' : roll < 0.9 ? 'expired' : roll < 0.94 ? 'pending' : roll < 0.97 ? 'rejected' : 'draft';
      const unit = c.family === 'JOBS' ? null : c.unit ?? 'DAY';
      posts.push({
        user_id: p.id, title: title(c, sub.mn, brand, model).slice(0, 100), category: c.key, subcategory: sub.value,
        details: Array.from({ length: int(1, 4) }, () => pick(DETAILS)).join(' '),
        province: where.province, district: where.district, latitude: where.lat, longitude: where.lng,
        address: where.district ? `${String(int(1, 30))}-р хороо` : null,
        price_amount: c.family === 'JOBS' ? null : price(unit), price_unit: unit,
        attributes: attrs(c, brand, model), contact_phone: p.phone_number,
        approval_status: state === 'pending' ? 'PENDING' : state === 'rejected' ? 'REJECTED' : 'APPROVED',
        rejection_reason: state === 'rejected' ? 'Зураг, үнийн мэдээлэл дутуу байна.' : null,
        is_draft: state === 'draft', status: state === 'expired' ? 'EXPIRED' : 'ACTIVE',
        expires_at: state === 'expired' ? iso(int(1, 30)) : new Date(Date.now() + (chance(0.08) ? int(1, 3) : int(4, 60)) * 86_400_000 - int(0, 600) * 60_000).toISOString(),
        is_featured: state === 'live' && chance(0.06), featured_until: null,
        views: state === 'live' ? Math.floor(rnd() ** 2 * 900) : int(0, 20),
        date_created: iso(age, int(0, 1400)), published_at: state === 'live' || state === 'expired' ? iso(age) : null,
        rentable: c.rentable,
      });
    }
  }
  for (const p of posts) if (p.is_featured) p.featured_until = new Date(Date.now() + int(3, 30) * 86_400_000).toISOString();
  const postCols = {
    user_id: 'uuid', title: 'varchar', category: 'varchar', subcategory: 'varchar', details: 'text', province: 'varchar', district: 'varchar',
    latitude: 'float8', longitude: 'float8', address: 'varchar', price_amount: 'numeric', price_unit: 'varchar', attributes: 'jsonb',
    contact_phone: 'varchar', approval_status: 'varchar', rejection_reason: 'text', is_draft: 'boolean', status: 'varchar', expires_at: 'timestamptz',
    is_featured: 'boolean', featured_until: 'timestamptz', views: 'int', date_created: 'timestamptz', published_at: 'timestamptz',
  };
  const inserted = await bulk(ds, 'posts', postCols, posts, 'id, user_id, category, title, price_amount, price_unit');
  const isLive = (i: number): boolean => posts[i].approval_status === 'APPROVED' && !posts[i].is_draft && posts[i].status === 'ACTIVE';
  const live = inserted.filter((_, i) => isLive(i));
  const rentable = inserted.filter((_, i) => isLive(i) && posts[i].rentable);

  // Days each rentable listing is taken, so BOOKED and BLOCKED ranges never collide.
  const taken = new Map<number, Array<[number, number]>>();
  const free = (post: number, a: number, b: number): boolean => !(taken.get(post) ?? []).some(([x, y]) => a <= y && x <= b);
  const take = (post: number, a: number, b: number): void => void taken.set(post, [...(taken.get(post) ?? []), [a, b]]);
  const today = ulaanbaatarDate();

  const blocked: Array<Record<string, unknown>> = [];
  for (const p of rentable) {
    if (!chance(0.15)) continue;
    const a = int(1, 40);
    const b = a + int(0, 4);
    take(p.id as number, a, b);
    blocked.push({ post_id: p.id, user_id: p.user_id, kind: 'BLOCKED', days: `[${addDays(today, a)},${addDays(today, b)}]` });
  }
  await bulk(ds, 'post_busy', { post_id: 'int', user_id: 'uuid', kind: 'varchar', days: 'daterange' }, blocked);

  // Bookings: finished and future accepted ones hold their days; the rest may overlap anything.
  const bookings: Array<Record<string, unknown>> = [];
  const pendingKey = new Set<string>();
  for (let i = 0; i < BOOKINGS && rentable.length; i++) {
    const p = pick(rentable);
    const cust = pick(customers);
    const roll = rnd();
    const status = roll < 0.35 ? 'ACCEPTED' : roll < 0.55 ? 'PENDING' : roll < 0.7 ? 'DECLINED' : roll < 0.82 ? 'CANCELLED' : 'EXPIRED';
    const len = int(0, 5);
    let a = status === 'EXPIRED' ? -int(2, 60) : status === 'ACCEPTED' && chance(0.6) ? -int(len + 1, 90) : int(1, 45);
    if (status === 'ACCEPTED') {
      let tries = 0;
      while (!free(p.id as number, a, a + len) && tries++ < 10) a += len + 2;
      if (!free(p.id as number, a, a + len)) continue;
      take(p.id as number, a, a + len);
    }
    if (status === 'PENDING') {
      const k = `${String(p.id)}:${cust.id}`;
      if (pendingKey.has(k)) continue;
      pendingKey.add(k);
    }
    bookings.push({
      post_id: p.id, customer_id: cust.id, provider_id: p.user_id, post_title: p.title, category: p.category,
      start_date: addDays(today, a), end_date: addDays(today, a + len), price_amount: p.price_amount, price_unit: p.price_unit,
      message: chance(0.5) ? pick(CUSTOMER_LINES) : null, address: chance(0.6) ? `${pick(Object.keys(UB))}, ${String(int(1, 30))}-р хороо` : null,
      start_time: chance(0.5) ? `${String(int(7, 10)).padStart(2, '0')}:${pick(['00', '30'])}` : null, status,
      closed_reason: status === 'DECLINED' && chance(0.3) ? 'OVERLAP' : null,
      response_message: status !== 'PENDING' && chance(0.3) ? pick(PROVIDER_LINES) : null,
      responded_at: status === 'PENDING' || status === 'EXPIRED' ? null : iso(int(0, 30)),
      review_prompted_at: status === 'ACCEPTED' && a + len < 0 ? iso(1) : null,
      date_created: iso(Math.max(0, -a) + int(1, 10)),
    });
  }
  const bookingRows = await bulk(ds, 'bookings', {
    post_id: 'int', customer_id: 'uuid', provider_id: 'uuid', post_title: 'varchar', category: 'varchar', start_date: 'date', end_date: 'date',
    price_amount: 'numeric', price_unit: 'varchar', message: 'varchar', address: 'varchar', start_time: 'varchar', status: 'varchar',
    closed_reason: 'varchar', response_message: 'varchar', responded_at: 'timestamptz', review_prompted_at: 'timestamptz', date_created: 'timestamptz',
  }, bookings, 'id, post_id, status, start_date::text AS start_date, end_date::text AS end_date');
  const booked = bookingRows.filter((b) => b.status === 'ACCEPTED').map((b) => ({ post_id: b.post_id, kind: 'BOOKED', booking_id: b.id, days: `[${String(b.start_date)},${String(b.end_date)}]` }));
  await bulk(ds, 'post_busy', { post_id: 'int', kind: 'varchar', booking_id: 'int', days: 'daterange' }, booked);

  // Чат: one thread per listing and customer, messages alternating; the first provider text sets reply time.
  const threads: Array<Record<string, unknown>> = [];
  const lines: Array<Array<{ who: 'c' | 'p'; body: string; at: string }>> = [];
  const seen = new Set<string>();
  for (let i = 0; i < THREADS; i++) {
    const p = pick(live);
    const cust = pick(customers);
    const k = `${String(p.id)}:${cust.id}`;
    if (seen.has(k)) continue;
    seen.add(k);
    const start = int(0, 60) * 1440 + int(0, 1400);
    const replyAfter = chance(0.85) ? int(3, chance(0.8) ? 240 : 3000) : null;
    const msgs: Array<{ who: 'c' | 'p'; body: string; at: string }> = [{ who: 'c', body: pick(CUSTOMER_LINES), at: iso(0, start) }];
    let t = start;
    if (replyAfter !== null) {
      t -= replyAfter;
      msgs.push({ who: 'p', body: pick(PROVIDER_LINES), at: iso(0, Math.max(0, t)) });
      for (let m = 0; m < int(0, 6); m++) {
        t -= int(1, 90);
        msgs.push({ who: m % 2 === 0 ? 'c' : 'p', body: pick(m % 2 === 0 ? CUSTOMER_LINES : PROVIDER_LINES), at: iso(0, Math.max(0, t)) });
      }
    }
    const last = msgs[msgs.length - 1];
    threads.push({
      post_id: p.id, post_title: p.title, customer_id: cust.id, provider_id: p.user_id,
      last_message_at: last.at, last_message_preview: last.body, last_message_kind: 'TEXT',
      last_sender_id: last.who === 'c' ? cust.id : p.user_id,
      customer_unread: last.who === 'p' && chance(0.4) ? 1 : 0, provider_unread: last.who === 'c' ? int(1, 2) : 0,
      first_customer_at: msgs[0].at, first_reply_at: replyAfter !== null ? msgs[1].at : null, date_created: msgs[0].at,
    });
    lines.push(msgs);
  }
  const threadRows = await bulk(ds, 'conversations', {
    post_id: 'int', post_title: 'varchar', customer_id: 'uuid', provider_id: 'uuid', last_message_at: 'timestamptz', last_message_preview: 'varchar',
    last_message_kind: 'varchar', last_sender_id: 'uuid', customer_unread: 'int', provider_unread: 'int', first_customer_at: 'timestamptz',
    first_reply_at: 'timestamptz', date_created: 'timestamptz',
  }, threads, 'id');
  const messages = threadRows.flatMap((c, i) => lines[i].map((m, j) => ({
    conversation_id: c.id, sender_id: m.who === 'c' ? threads[i].customer_id : threads[i].provider_id, kind: 'TEXT', body: m.body,
    read_at: j < lines[i].length - 1 ? m.at : null, date_created: m.at,
  })));
  await bulk(ds, 'messages', { conversation_id: 'uuid', sender_id: 'uuid', kind: 'varchar', body: 'varchar', read_at: 'timestamptz', date_created: 'timestamptz' }, messages);

  // Reviews: one per author and provider, skewed positive, about half answered.
  const reviews: Array<Record<string, unknown>> = [];
  const pairs = new Set<string>();
  for (let i = 0; i < REVIEWS; i++) {
    const p = pick(providers);
    const cust = pick(customers);
    const k = `${p.id}:${cust.id}`;
    if (pairs.has(k)) continue;
    pairs.add(k);
    const rating = pick([5, 5, 5, 5, 4, 4, 4, 3, 2, 1]);
    const replied = chance(0.45);
    const age = int(1, 300);
    reviews.push({
      provider_id: p.id, author_id: cust.id, rating, comment: pick(REVIEW_LINES),
      reply: replied ? pick(REPLY_LINES) : null, reply_at: replied ? iso(Math.max(0, age - 1)) : null, date_created: iso(age),
    });
  }
  await bulk(ds, 'reviews', { provider_id: 'uuid', author_id: 'uuid', rating: 'int', comment: 'varchar', reply: 'varchar', reply_at: 'timestamptz', date_created: 'timestamptz' }, reviews);

  // Two weeks of counted views and contacts, so the 7-day performance compares two real windows.
  const views: Array<Record<string, unknown>> = [];
  const contactRows: Array<Record<string, unknown>> = [];
  for (const p of live) {
    const n = Math.min(60, Math.floor(rnd() ** 2 * 70));
    for (let v = 0; v < n; v++) views.push({ post_id: p.id, visitor_key: `seed${String(p.id)}-${String(v)}`, counted: true, date_viewed: iso(rnd() * 14) });
    for (let c = 0; c < Math.floor(n / 6); c++) {
      const at = rnd() * 14;
      contactRows.push({ post_id: p.id, viewer: `seed${String(p.id)}-${String(c)}`, kind: pick(['CALL', 'CALL', 'CHAT', 'BOOKING']), day: iso(at).slice(0, 10), created_at: iso(at) });
    }
  }
  await bulk(ds, 'post_views', { post_id: 'int', visitor_key: 'varchar', counted: 'boolean', date_viewed: 'timestamptz' }, views);
  // The lifetime counter at least covers the two weeks of rows.
  await ds.query(`UPDATE posts p SET views = GREATEST(p.views, (SELECT COUNT(*) FROM post_views v WHERE v.post_id = p.id AND v.counted)) WHERE p.id = ANY($1::int[])`, [live.map((p) => p.id)]);
  await bulk(ds, 'post_contacts', { post_id: 'int', viewer: 'varchar', kind: 'varchar', day: 'date', created_at: 'timestamptz' }, contactRows);

  // Saves and saved searches.
  const likeKeys = new Set<string>();
  const likes: Array<Record<string, unknown>> = [];
  for (let i = 0; i < LIKES; i++) {
    const p = pick(live);
    const cust = pick(customers);
    const k = `${cust.id}:${String(p.id)}`;
    if (likeKeys.has(k)) continue;
    likeKeys.add(k);
    likes.push({ user_id: cust.id, post_id: p.id, created_at: iso(int(0, 60)) });
  }
  await bulk(ds, 'post_likes', { user_id: 'uuid', post_id: 'int', created_at: 'timestamptz' }, likes, 'post_id');
  const searches = Array.from({ length: SAVED_SEARCHES }, () => {
    const q = pick(QUERIES);
    const params: Record<string, unknown> = { q };
    if (chance(0.5)) params.province = 'ULAANBAATAR';
    return { user_id: pick(customers).id, name: q, params, notify: chance(0.7), last_seen_at: iso(int(0, 20)) };
  });
  await bulk(ds, 'saved_searches', { user_id: 'uuid', name: 'varchar', params: 'jsonb', notify: 'boolean', last_seen_at: 'timestamptz' }, searches);

  return {
    providers: providers.length, companies: companies.length, customers: customers.length, views: views.length, contacts: contactRows.length, listings: inserted.length, live: live.length, bookings: bookingRows.length,
    threads: threadRows.length, messages: messages.length, reviews: reviews.length, saves: likes.length, saved_searches: searches.length,
  };
}
