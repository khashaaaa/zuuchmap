/**
 * Development-only fixture generator for the whole domain.
 *
 * Three jobs. The obvious one is volume: posts for every category built directly
 * from CATEGORY_SEED, so every field of every schema is exercised and the
 * fixtures cannot drift from the schema.
 *
 * The second is realism. Every human-visible string — names, company names,
 * addresses, listing titles, prose, prices, brands and models — comes from the
 * catalogues below rather than from `${label} ${i}`. A corpus of "Тест 14"
 * hides exactly the problems a fixture set exists to surface: titles that wrap
 * at real length, Cyrillic sorting and full-text search over real words, prices
 * whose magnitude looks wrong, cards whose lines are all the same width.
 *
 * The third matters most — it deliberately seeds the *edge states* the code
 * branches on, so a fixture set is a standing test of them rather than a pile
 * of happy-path rows:
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
loadEnv({
  path: `${process.cwd()}/config/variables/${process.env.NODE_ENV ?? 'development'}.env`,
});
import { Client } from 'pg';
import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as sharp from 'sharp';
import { CATEGORY_SEED } from '../post/category.service';

const ADMIN_PHONES = (process.env.ADMIN_PHONES ?? '')
  .split(',')
  .map((p) => p.trim())
  .filter(Boolean);

// Deterministic pseudo-randomness so re-running produces a comparable corpus.
let s = 12345;
const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const pick = <T>(a: T[]) => a[Math.floor(rnd() * a.length)];
const int = (lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1));
// Parenthesised: without them a trailing `::date` binds to the interval literal
// rather than the sum, and Postgres refuses with "cannot cast type interval to date".
const days = (n: number) => `(now() + interval '${n} days')`;

// ---------------------------------------------------------------------------
// People, companies, places — the human layer
// ---------------------------------------------------------------------------

/** Mongolian given names, mixed gender, in the proportions a provider list has. */
const GIVEN_NAMES = [
  'Батбаяр',
  'Ганбаатар',
  'Мөнхбат',
  'Түвшинбаяр',
  'Энхбат',
  'Батсайхан',
  'Отгонбаяр',
  'Наранбаатар',
  'Ганзориг',
  'Эрдэнэбат',
  'Хүрэлбаатар',
  'Пүрэвсүрэн',
  'Амарсайхан',
  'Батмөнх',
  'Гантулга',
  'Даваасүрэн',
  'Түмэнбаяр',
  'Ганхуяг',
  'Батжаргал',
  'Мөнхөрхөн',
  'Оюунчимэг',
  'Цэцэгмаа',
  'Наранцэцэг',
  'Алтанцэцэг',
  'Болормаа',
  'Энхтуяа',
  'Ганчимэг',
  'Сарантуяа',
  'Мөнгөнцэцэг',
  'Уранчимэг',
  'Дэлгэрмаа',
  'Отгонцэцэг',
  'Эрдэнэчимэг',
  'Ариунзаяа',
  'Хишигдэлгэр',
  'Нарангэрэл',
  'Золжаргал',
  'Тэмүүлэн',
  'Ням-Осор',
  'Бат-Эрдэнэ',
];

/** Father's names — the `parent_name` column, shown first in Mongolian usage. */
const PARENT_NAMES = [
  'Дорж',
  'Лхагва',
  'Цэрэн',
  'Жаргал',
  'Дашням',
  'Пүрэвдорж',
  'Нацагдорж',
  'Гомбо',
  'Чулуун',
  'Мягмар',
  'Даваа',
  'Ням',
  'Ширчин',
  'Балдан',
  'Сүхбат',
  'Ганбат',
  'Батаа',
  'Дамдин',
  'Түмэн',
  'Очир',
  'Загдсүрэн',
  'Баттөмөр',
  'Ундрах',
  'Сандаг',
];

/** Enough of a Cyrillic→Latin map to build an email a person would actually own. */
const TRANSLIT: Record<string, string> = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  д: 'd',
  е: 'e',
  ё: 'yo',
  ж: 'j',
  з: 'z',
  и: 'i',
  й: 'i',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  ө: 'u',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ү: 'u',
  ф: 'f',
  х: 'kh',
  ц: 'ts',
  ч: 'ch',
  ш: 'sh',
  щ: 'sh',
  ъ: '',
  ы: 'y',
  ь: '',
  э: 'e',
  ю: 'yu',
  я: 'ya',
  '-': '',
};
const latin = (mn: string) =>
  mn
    .toLowerCase()
    .split('')
    .map((c) => TRANSLIT[c] ?? '')
    .join('');

/** Mobile prefixes actually issued in Mongolia (Unitel/Mobicom/Skytel/G-Mobile). */
const MOBILE_PREFIXES = [
  '99',
  '95',
  '94',
  '91',
  '90',
  '89',
  '88',
  '86',
  '85',
  '80',
];
const mobile = () => `${pick(MOBILE_PREFIXES)}${String(int(100000, 999999))}`;

const COMPANIES = [
  {
    name: 'Мон Констракшн ХХК',
    trade: 'monconstruction',
    about:
      'Иргэний болон үйлдвэрийн барилгын ерөнхий гүйцэтгэгч. 2008 оноос хойш 60 гаруй обьект ашиглалтад оруулсан.',
  },
  {
    name: 'Гоби Билдинг ХХК',
    trade: 'gobibuilding',
    about:
      'Өмнөговь, Дорноговь аймагт уул уурхайн дэд бүтэц, кемпийн барилга угсралт хийдэг.',
  },
  {
    name: 'Хөх Тэнгэр Групп ХХК',
    trade: 'khukhtenger',
    about:
      'Барилгын материалын худалдаа, ложистик. Хөтөл, Эрдэнэт чиглэлийн тогтмол хүргэлттэй.',
  },
  {
    name: 'Ундрам Трейд ХХК',
    trade: 'undramtrade',
    about: 'Барилгын тусгай зориулалтын техник түрээс, засвар үйлчилгээ.',
  },
  {
    name: 'Ар Билэг ХХК',
    trade: 'arbileg',
    about:
      'Дотор гадна засал чимэглэл, гипсэн ажил, будаг. Улаанбаатар хотод үйл ажиллагаа явуулдаг.',
  },
  {
    name: 'Эрчим Инженеринг ХХК',
    trade: 'erchimengineering',
    about:
      'Цахилгаан, дулаан, салхивчийн угсралт болон зураг төслийн үйлчилгээ.',
  },
  {
    name: 'Тэгш Талбай ХХК',
    trade: 'tegshtalbai',
    about: 'Геодезийн хэмжилт, хөрсний шинжилгээ, барилгын ажлын зураг.',
  },
  {
    name: 'Наран Бетон ХХК',
    trade: 'naranbeton',
    about: 'Бэлэн бетон, бетон блок үйлдвэрлэл. Өдөрт 400 м3 хүчин чадалтай.',
  },
  {
    name: 'Хүлэг Транс ХХК',
    trade: 'khulegtrans',
    about: 'Хүнд даацын тээвэр, самосвал, крантай үйлчилгээ улс даяар.',
  },
  {
    name: 'Идэр Металл ХХК',
    trade: 'idermetall',
    about: 'Металл хийц, хаалга цонх, ангар барилгын үйлдвэрлэл.',
  },
  {
    name: 'Цаст Уул Сервис ХХК',
    trade: 'tsastuulservice',
    about: 'Өвлийн үйлчилгээ: цас цэвэрлэгээ, хөрс гэсгээх, халаагуур түрээс.',
  },
  {
    name: 'Батсүмбэр Констракшн ХХК',
    trade: 'batsumber',
    about:
      'Төв аймаг, Улаанбаатарын захын бүсэд суурь, доторх ажил гүйцэтгэдэг.',
  },
];

/**
 * Real settlements and their coordinates. The previous corpus stamped every
 * post with a Ulaanbaatar coordinate whatever province it claimed, so a map
 * filtered by aimag showed pins over the capital — a fixture that hid the bug.
 */
const PLACES: Record<string, { lat: number; lng: number; areas: string[] }> = {
  ULAANBAATAR: { lat: 47.9185, lng: 106.9176, areas: [] }, // see UB_AREAS — its areas are per district
  ORKHON: {
    lat: 49.0275,
    lng: 104.0444,
    areas: [
      'Эрдэнэт хот, Уртбулаг баг',
      'Эрдэнэт хот, Найрамдал баг',
      'Эрдэнэт хот, Говил хороолол',
    ],
  },
  DARKHANUUL: {
    lat: 49.4867,
    lng: 105.9228,
    areas: [
      'Дархан хот, 8-р баг',
      'Дархан хот, Өргөө хороолол',
      'Хонгор сум, Дархан-Уул',
    ],
  },
  SELENGE: {
    lat: 50.2394,
    lng: 106.2075,
    areas: [
      'Сүхбаатар хот, 3-р баг',
      'Мандал сум, Зүүнхараа',
      'Сайхан сум, Сэлэнгэ',
    ],
  },
  UMNUGOVI: {
    lat: 43.5708,
    lng: 104.425,
    areas: [
      'Даланзадгад сум, Өмнөговь',
      'Ханбогд сум, Оюу толгойн бүс',
      'Цогтцэций сум, Тавантолгой',
    ],
  },
  DORNOGOVI: {
    lat: 44.8917,
    lng: 110.1394,
    areas: [
      'Сайншанд сум, 2-р баг',
      'Замын-Үүд сум, чөлөөт бүс',
      'Айраг сум, Дорноговь',
    ],
  },
  TUV: {
    lat: 47.705,
    lng: 106.89,
    areas: [
      'Зуунмод сум, Төв аймаг',
      'Батсүмбэр сум, Төв аймаг',
      'Сэргэлэн сум, Хөшигийн хөндий',
    ],
  },
  KHUVSGUL: {
    lat: 49.6342,
    lng: 100.1625,
    areas: ['Мөрөн сум, 5-р баг', 'Хатгал тосгон, Хөвсгөл'],
  },
};
/**
 * Neighbourhoods under the district they actually belong to. Picking an area
 * independently of the district produced addresses like "Баянгол дүүрэг, Яармаг"
 * — Яармаг is in Хан-Уул — which is invisible in a list and wrong on a map.
 */
const UB_AREAS: Record<string, string[]> = {
  BAYANZURKH: ['13-р хороолол', 'Шархад', 'Амгалан', 'Ботаник', 'Сэлбэ'],
  KHANUUL: ['Зайсан', 'Яармаг', 'Нисэх', 'Хүннү хотхон', '19-р хороолол'],
  BAYANGOL: [
    '3-р хороолол',
    '10-р хороолол',
    'Тахилын шат',
    'Баруун дөрвөн зам',
  ],
  SUKHBAATAR: ['Сансар', 'Офицеруудын ордон', '11-р хороолол', 'Хүүхдийн 100'],
  CHINGELTEI: ['Их тойруу', 'Дэнжийн мянга', 'Гандан', '5-р хороолол'],
  SONGINOKHAIRKHAN: ['Толгойт', 'Баянхошуу', 'Ганц худаг', 'Орбит'],
  NALAIKH: ['Налайх төв', 'Уурхайчдын хороолол'],
};
const UB_DISTRICTS = Object.keys(UB_AREAS);
/** How many khoroos each district actually has — a 24-р хороо in Налайх is a tell. */
const UB_KHOROOS: Record<string, number> = {
  BAYANZURKH: 43,
  SONGINOKHAIRKHAN: 43,
  BAYANGOL: 34,
  KHANUUL: 25,
  CHINGELTEI: 24,
  SUKHBAATAR: 20,
  NALAIKH: 8,
};
const PROVINCES = Object.keys(PLACES);

/**
 * The recognisable part of an address — what a map picker would name. In the
 * capital that is the neighbourhood at the end; elsewhere it is the sum at the
 * front.
 */
function nearestLandmark(province: string, address: string): string {
  const parts = address
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  if (!parts.length) return address;
  return province === 'ULAANBAATAR' ? parts[parts.length - 1] : parts[0];
}

/** A street address as it is actually written on a Mongolian listing. */
function addressFor(province: string, district: string | null): string {
  if (province === 'ULAANBAATAR') {
    const d = district ?? 'BAYANZURKH';
    const dn: Record<string, string> = {
      BAYANZURKH: 'Баянзүрх',
      KHANUUL: 'Хан-Уул',
      BAYANGOL: 'Баянгол',
      SUKHBAATAR: 'Сүхбаатар',
      CHINGELTEI: 'Чингэлтэй',
      SONGINOKHAIRKHAN: 'Сонгинохайрхан',
      NALAIKH: 'Налайх',
    };
    return `${dn[d]} дүүрэг, ${int(1, UB_KHOROOS[d])}-р хороо, ${pick(UB_AREAS[d])}`;
  }
  const area = pick(PLACES[province].areas);
  // Outside the capital the settlement name is part of the area string itself —
  // prefixing the aimag again gives "Дархан Дархан сум".
  return area;
}

// ---------------------------------------------------------------------------
// Listing catalogue — real brands, real machines, titles a provider would write
// ---------------------------------------------------------------------------

type Catalog = {
  /** manufacturer → models actually sold under it, for the identity fields. */
  brands?: Record<string, string[]>;
  /**
   * Machines that are actually *that* kind of machine, per subcategory. A
   * category-wide brand list is enough for an attribute but not for a title:
   * it produces "Форклифт Komatsu D65EX-15", a forklift named after a
   * bulldozer, which is worse than a placeholder because it reads as real.
   * First token is the manufacturer, the rest the model.
   */
  subModels?: Record<string, string[]>;
  /** Title templates per subcategory. `{bm}` expands to "Brand Model". */
  titles: Record<string, string[]>;
  /** Body prose. One is picked and joined with the generated location line. */
  details: string[];
};

const CATALOG: Record<string, Catalog> = {
  vehiclerent: {
    brands: {
      Toyota: [
        'Land Cruiser 200',
        'Land Cruiser Prado 150',
        'Hiace',
        'Coaster',
        'Hilux',
      ],
      Hyundai: ['Porter II', 'County', 'Starex', 'Universe'],
      Nissan: ['Patrol Y61', 'Caravan'],
      Mitsubishi: ['Delica', 'Canter'],
      Ford: ['Ranger', 'Transit'],
    },
    subModels: {
      car: [
        'Toyota Prius 30',
        'Toyota Camry 40',
        'Hyundai Sonata',
        'Nissan Teana',
      ],
      suv: [
        'Toyota Land Cruiser 200',
        'Toyota Land Cruiser Prado 150',
        'Nissan Patrol Y61',
        'Mitsubishi Pajero',
      ],
      truck: [
        'Hyundai Porter II',
        'Mitsubishi Canter',
        'Isuzu Elf',
        'Toyota Dyna',
      ],
      bus: [
        'Hyundai County',
        'Toyota Coaster',
        'Hyundai Universe',
        'Daewoo BS106',
      ],
      van: [
        'Toyota Hiace',
        'Hyundai Starex',
        'Mitsubishi Delica',
        'Ford Transit',
      ],
    },
    titles: {
      car: [
        '{bm} суудлын машин хоногоор түрээслүүлнэ',
        'Хотын дотор явах {bm} түрээслүүлнэ',
      ],
      suv: [
        '{bm} жийп жолоочтой түрээслүүлнэ',
        'Хээрийн ажилд {bm} — жолоочтой, шатахуунгүй үнэ',
      ],
      truck: [
        '{bm} ачааны машин түрээслүүлнэ',
        '{bm} — 3 тн ачаа, хот орон нутаг',
      ],
      bus: [
        '{bm} автобус — хамт олны аялал, ээлжийн тээвэрт',
        '{bm} 35 суудалтай автобус захиалгаар',
      ],
      van: [
        '{bm} микроавтобус — ажилчид зөөх, 14 суудал',
        '{bm} микро түрээслүүлнэ, жолоочтой',
      ],
    },
    details: [
      'Техникийн бүрэн бүтэн, даатгалтай. Хоногоор, 7 хоногоор болон сараар түрээслэнэ. Шатахуун захиалагчийн тал даана.',
      'Туршлагатай жолоочтой. Орон нутагт явахад хоногийн доод хязгаар 3 хоног. Гэрээ байгуулж ажиллана.',
      'Цэвэр, тамхины үнэргүй. Хүлээлгэн өгөхдөө шатахууны түвшинг адил байлгана. Урьдчилгаа 30%.',
    ],
  },
  machineryrent: {
    brands: {
      Komatsu: ['PC200-8', 'PC300-7', 'D65EX-15', 'WA380-6'],
      Caterpillar: ['320D', '336D2', 'D6R', '950H'],
      Hitachi: ['ZX200-3', 'ZX330-5G'],
      Hyundai: ['R220LC-9S', 'R300LC-9S', 'HL760-9'],
      XCMG: ['QY25K5', 'XE215C', 'GR180'],
      Sany: ['SY215C', 'STC250', 'SYM5250'],
      Doosan: ['DX225LCA', 'DL300'],
    },
    subModels: {
      crane: ['XCMG QY25K5', 'Sany STC250', 'Zoomlion QY50V', 'Kato NK-250'],
      excavator: [
        'Komatsu PC200-8',
        'Caterpillar 320D',
        'Hitachi ZX200-3',
        'Hyundai R220LC-9S',
        'Doosan DX225LCA',
        'Sany SY215C',
      ],
      bulldozer: ['Komatsu D65EX-15', 'Caterpillar D6R', 'Shantui SD16'],
      loader: [
        'Komatsu WA380-6',
        'Caterpillar 950H',
        'Hyundai HL760-9',
        'XCMG LW300FN',
      ],
      compactor: ['Bomag BW213D', 'Dynapac CA250', 'XCMG XS163J'],
      forklift: ['Toyota 8FD30', 'Komatsu FD30', 'Heli CPCD30'],
      grader: ['Caterpillar 140G', 'XCMG GR180', 'Komatsu GD511A'],
      concrete_mixer: ['Howo ZZ1257', 'Shacman F3000', 'Sany SY306C'],
      drilling_rig: ['Sany SR155', 'XCMG XR150D', 'Epiroc T35'],
    },
    titles: {
      crane: [
        '{bm} 25 тн кран операторчтой түрээслүүлнэ',
        'Автокран {bm} — өргөх ажил гүйцэтгэнэ',
      ],
      excavator: [
        '{bm} экскаватор операторчтой түрээслүүлнэ',
        '{bm} — суурийн ухалт, шороон ажил',
      ],
      bulldozer: [
        '{bm} бульдозер түрээслүүлнэ',
        'Талбай тэгшлэх {bm} бульдозер, мото цагаар',
      ],
      loader: [
        '{bm} дугуйт ачигч түрээслүүлнэ',
        '{bm} ачигч — хайрга, элс ачилт',
      ],
      compactor: [
        '{bm} нягтруулагч, зам талбайн ажилд',
        'Виброкаток {bm} түрээслүүлнэ',
      ],
      forklift: [
        '{bm} сэрээт өргөгч 3 тн — агуулахын ажилд',
        'Форклифт {bm} өдрөөр түрээслүүлнэ',
      ],
      grader: [
        '{bm} автогрейдер — зам засвар, тэгшилгээ',
        'Грейдер {bm} мото цагаар',
      ],
      concrete_mixer: [
        'Бетон зуурагч {bm} — 6 м3 миксер',
        'Бетон зөөвөрлөх миксер машин түрээслүүлнэ',
      ],
      drilling_rig: [
        '{bm} өрөмдлөгийн төхөөрөмж, свайны ажилд',
        'Хөрс өрөмдөх төхөөрөмж — операторчтой',
      ],
    },
    details: [
      'Мото цагаар тооцно. Операторын цалин, засвар үйлчилгээ үнэд багтсан. Шатахуун болон талбай хүртэлх тээвэр захиалагчийн тал.',
      'Техник 2 жилийн дотор их засвар хийсэн, актаар хүлээлгэн өгнө. Өдрийн доод хязгаар 8 мото цаг.',
      'Улаанбаатар болон орон нутагт ажиллана. Урт хугацааны гэрээнд хөнгөлөлт үзүүлнэ. Тээвэрлэлт трал машинаар.',
    ],
  },
  toolrent: {
    brands: {
      Bosch: ['GBH 2-26', 'GSH 11E', 'GWS 22-230'],
      Makita: ['HR2470', 'DGA504', 'HM1307C'],
      DeWalt: ['D25133K', 'DWE4157'],
      Hilti: ['TE 60-ATC', 'DD 150-U'],
      Stanley: ['STHR272', 'FMEG220'],
    },
    subModels: {
      power_tools: [
        'Bosch GBH 2-26',
        'Makita HR2470',
        'DeWalt D25133K',
        'Hilti TE 60-ATC',
      ],
      measuring: [
        'Leica Rugby 620',
        'Bosch GLL 3-80',
        'Topcon RL-H5A',
        'Sokkia B40',
      ],
    },
    titles: {
      power_tools: [
        '{bm} перфоратор өдрөөр түрээслүүлнэ',
        'Цахилгаан багаж түрээс — {bm} багц',
      ],
      formwork: [
        'Баганы болон хананы хэв түрээслүүлнэ',
        'Дам нурууны хэв, тулгуур — м2-оор',
      ],
      scaffolding: [
        'Барилгын шат (леса) түрээслүүлнэ, м2-оор',
        'Хүрээт шат — өргөлт 12 м хүртэл',
      ],
      measuring: [
        'Лазер нивелир {bm} түрээслүүлнэ',
        'Теодолит, нивелир — хоногоор',
      ],
    },
    details: [
      'Хоногоор түрээслэнэ. Барьцаа: иргэний үнэмлэх эсвэл 50,000₮. Эвдрэл гэмтэл гарвал засварын зардлыг захиалагч хариуцна.',
      'Багаж бүрэн иж бүрдэлтэй, хайрцагтай. Хүргэлт хотын дотор нэмэлт төлбөртэй.',
      'Их хэмжээгээр авбал хөнгөлөлттэй. Ажлын өдрүүдэд 09:00–19:00 цагт олгож, хүлээж авна.',
    ],
  },
  materialstore: {
    titles: {
      cement: [
        'Хөтөл цемент М400 — тонноор нийлүүлнэ',
        'Портланд цемент, шуудайгаар ба задгайгаар',
      ],
      aggregate: [
        'Хайрга, элс — самосвалаар хүргэнэ',
        'Угаасан элс, 5-20 фракцын хайрга',
      ],
      rebar: [
        'Арматур 12, 14, 16 мм — тонноор',
        'Хар төмөр, профиль хоолой худалдана',
      ],
      timber: [
        'Сибирийн нарсан банз, дүнз',
        'Модон материал — 25, 40, 50 мм зузаантай',
      ],
      insulation: [
        'Хөөсөнцөр, шилэн хөвөн дулаалга',
        'Пеноплекс 50 мм — м2-оор',
      ],
      brick_block: [
        'Улаан тоосго, хөнгөн блок нийлүүлнэ',
        'Керамзит блок 390х190х190',
      ],
      roofing: [
        'Дээврийн модон хийц, зэвэрдэггүй бүрхүүл',
        'Профиль хуудас, ондулин дээвэр',
      ],
      finishing: [
        'Гипсэн хавтан, шпаклёвк, будаг',
        'Заслын материал — бөөний үнээр',
      ],
      plumbing_electrical: [
        'Сантехникийн хоолой, фитинг',
        'Цахилгааны кабель, автомат таслуур',
      ],
      other: [
        'Барилгын туслах материал, хэрэгсэл',
        'Холбогч материал, өнгөлгөө',
      ],
    },
    details: [
      'Бөөний болон жижиглэн худалдаа. Хотын дотор 1 тонноос дээш захиалгад хүргэлт үнэгүй.',
      'Чанарын гэрчилгээтэй. Нэхэмжлэх, НӨАТ-ын баримт гаргана. Урьдчилгаагүй ажиллана.',
      'Агуулахаас шууд олгоно. Орон нутгийн захиалгыг ачаа тээврийн компаниар илгээнэ.',
    ],
  },
  construction: {
    titles: {
      general: [
        'Барилгын ерөнхий гүйцэтгэгч — түлхүүр гардуулах',
        'Суурь, каркас, ханын ажил гүйцэтгэнэ',
      ],
      interior: [
        'Дотор засал — гипсэн хана, таазны ажил',
        'Орон сууцны бүрэн засвар, материалтай',
      ],
      exterior: [
        'Гадна фасадны ажил, дулаалга',
        'Гадна засал — өнгөлгөө, шавардлага',
      ],
      electrical: [
        'Цахилгааны угсралт, суурилуулалт',
        'Цахилгааны шугам сүлжээ, самбарын ажил',
      ],
      plumbing: [
        'Сантехникийн угсралт, халаалтын шугам',
        'Ус, дулаан, ариутгах татуургын ажил',
      ],
      roofing: [
        'Дээврийн ажил — модон хийц, бүрхүүл',
        'Дээвэр засвар, ус тусгаарлалт',
      ],
      flooring: [
        'Шалны ажил — ламинат, паркет, плита',
        'Өөрөө тэгшрэх шал, наливной',
      ],
      painting: ['Будаг, шпаклёвк — м2-оор', 'Ханын будгийн ажил, тортой'],
    },
    details: [
      'Туршлагатай баг ажиллана. Ажлын хэмжээг газар дээр нь үзэж үнэлгээ өгнө. Гэрээ, баталгаат хугацаатай.',
      'Материалтай болон материалгүй хувилбараар ажиллана. Урьдчилгаа 40%, үлдэгдлийг ажил дууссаны дараа.',
      'Хийсэн ажлын зураг, дүрс бичлэгээр танилцуулна. Хугацаандаа багтаана.',
    ],
  },
  jobvacancy: {
    titles: {
      engineer: [
        'Барилгын инженер авна',
        'Технологич инженер — уул уурхайн төсөлд',
      ],
      worker: [
        'Барилгын ажилчин авна (байр, хоолтой)',
        'Туслах ажилчид яаралтай авна',
      ],
      driver: [
        'Экскаваторын оператор авна — ээлжийн ажил',
        'Самосвалын жолооч авна, С ангилал',
      ],
      welder: [
        'Гагнуурчин авна — аргон, хагас автомат',
        'Туршлагатай гагнуурчин, хийцийн ажилд',
      ],
      electrician: [
        'Цахилгаанчин авна, 3-р зэрэгтэй',
        'Цахилгааны угсралтын ажилтан авна',
      ],
      plumber: [
        'Сантехникч авна — халаалтын угсралт',
        'Сантехникийн туслах ажилтан авна',
      ],
      manager: ['Обьектын менежер авна', 'Ханган нийлүүлэлтийн менежер авна'],
      accountant: [
        'Нягтлан бодогч авна (барилгын салбар)',
        'Ахлах нягтлан бодогч авна',
      ],
    },
    details: [
      'Ажлын байрны шаардлага: холбогдох мэргэжлээр төгссөн, салбартаа туршлагатай. Анкетаа имэйлээр илгээнэ үү.',
      'Ээлжийн ажил: 21 хоног ажиллаж 7 хоног амарна. Унаа, хоол, байраар хангана.',
      'Цалин туршлагаас хамаарч тохирно. НДШ бүрэн төлнө. Ажилд орох хугацаа: яаралтай.',
    ],
  },
  factory: {
    titles: {
      concrete: [
        'Бэлэн бетон М200–М400 үйлдвэрлэл',
        'Бетон блок, хашлага үйлдвэрлэнэ',
      ],
      metal: [
        'Металл хийц, ферм үйлдвэрлэл',
        'Ангар барилгын каркас захиалгаар',
      ],
      wood: [
        'Модон эдлэл, шат, хаалга үйлдвэрлэл',
        'Мебель, интерьерийн модон хийц',
      ],
      brick: [
        'Улаан тоосго үйлдвэрлэл — өдөрт 20,000 ш',
        'Хөнгөн блок, керамзит блок',
      ],
      glass: [
        'Шилэн хийц, витраж үйлдвэрлэл',
        'Хатуулагдсан шил, толь захиалгаар',
      ],
      door_window: [
        'ПВЦ цонх, хаалга захиалгаар',
        'Төмөр хаалга, орцны хаалга үйлдвэрлэл',
      ],
    },
    details: [
      'Захиалгаар үйлдвэрлэнэ. Хэмжилтийг үнэгүй хийж, төсөв гаргана. Хүргэлт, суурилуулалттай.',
      'Өөрийн лабораторитой, чанарын гэрчилгээ олгоно. Их хэмжээний захиалгад уян хатан үнэ.',
      'Үйлдвэр 7 хоногийн 6 өдөр ажиллана. Бэлэн бүтээгдэхүүн агуулахад байнга бий.',
    ],
  },
  sos: {
    titles: {
      tire_repair: [
        'Дуудлагын дугуй засвар — 24 цаг',
        'Хээрийн дугуй засвар, ачааны машины дугуй',
      ],
      towing: [
        'Эвакуатор — чирэх үйлчилгээ 24/7',
        'Ачааны машин чирэх, трал үйлчилгээ',
      ],
      battery: [
        'Аккумулятор солих, цэнэглэх дуудлага',
        'Хээрийн аккумуляторын үйлчилгээ',
      ],
      fuel_delivery: [
        'Шатахуун хүргэлт — дизель, А92',
        'Хээрийн шатахуун хүргэлт, 24 цаг',
      ],
      mobile_repair: [
        'Дуудлагын авто засвар, хөдөлгүүрийн оношилгоо',
        'Замд гэмтсэн техникийн засвар',
      ],
      jump_start: [
        'Асаалт өгөх үйлчилгээ — хот, орон нутаг',
        'Хүйтэнд асаахад тусална, 24 цаг',
      ],
    },
    details: [
      'Дуудлага авснаас хойш дунджаар 30 минутад хүрэлцэн очно. Шөнийн цагаар нэмэлт төлбөртэй.',
      'Хот доторх дуудлагын үндсэн үнэ. Хотоос гадагш км тутамд нэмэгдэнэ. Бэлэн бус тооцоо боломжтой.',
      'Бүтэн жилийн турш, амралтын өдрүүдэд ч ажиллана. Утсаар байршлаа хэлэхэд хангалттай.',
    ],
  },
  usedequipment: {
    brands: {
      Komatsu: ['PC200-8', 'WA320-5', 'D31PX-22'],
      Caterpillar: ['320C', '426C', '140G'],
      Hyundai: ['R220LC-9S', 'HL740-7A'],
      Toyota: ['Land Cruiser 105', 'Hiace', 'Dyna'],
      Howo: ['ZZ3257', 'ZZ4257'],
      Shacman: ['F3000', 'X3000'],
    },
    subModels: {
      vehicle: [
        'Toyota Land Cruiser 105',
        'Toyota Hiace',
        'Hyundai Porter II',
        'Howo ZZ3257',
        'Shacman F3000',
      ],
      machinery: [
        'Komatsu PC200-8',
        'Caterpillar 320C',
        'Hyundai R220LC-9S',
        'Komatsu WA320-5',
        'Caterpillar 140G',
      ],
    },
    titles: {
      vehicle: [
        '{bm} зарна — гүйлт бага, бүрэн бүтэн',
        '{bm} худалдана, үнэ тохирно',
      ],
      machinery: [
        '{bm} экскаватор зарна',
        '{bm} — мото цаг бага, ажлын байдалтай',
      ],
      tools: [
        'Барилгын багаж хэрэгсэл бөөнөөр зарна',
        'Гагнуурын аппарат, компрессор зарна',
      ],
      spare_parts: [
        'Экскаваторын сэлбэг зарна',
        'Хүнд машины сэлбэг — гинж, хувин, шүд',
      ],
    },
    details: [
      'Өөрийн нэр дээр, торгуульгүй. Үзэж танилцах боломжтой, оношилгоо хийлгэхийг зөвшөөрнө.',
      'Ажлын байдалтай, шууд ажиллуулж болно. Бичиг баримт бүрэн. Лизингээр авах боломжтой.',
      'Яаралтай зарна. Бага зэргийн засвар шаардлагатай, үнэд тусгагдсан.',
    ],
  },
  transport: {
    titles: {
      freight: [
        'Ачаа тээвэр — хот, орон нутаг',
        'Бүх төрлийн ачаа тээвэрлэнэ, гэрээгээр',
      ],
      dump_truck: [
        'Самосвал 20 тн — хайрга, элс, шороо',
        'Самосвалаар шороо зөөнө, өдрөөр',
      ],
      crane_service: [
        'Крантай машин — 10 тн өргөнө',
        'Крантай үйлчилгээ, ачилт буулгалт',
      ],
      heavy_haul: [
        'Трал — хүнд даацын техник тээвэрлэнэ',
        'Хүнд даацын тээвэр, зөвшөөрөлтэй',
      ],
      water_delivery: [
        'Ус хүргэлт — 8 м3 цистерн',
        'Барилгын талбайд ус хүргэнэ',
      ],
    },
    details: [
      'Рейсээр болон тонн километрээр тооцно. Ачилт, буулгалт үнэд багтсан эсэхийг тохирно.',
      'Улс дотор бүх чиглэлд явна. Ачааны даатгал хийж болно. Нэхэмжлэхээр ажиллана.',
      'Хотын дотор өдөрт 4-6 рейс хийнэ. Урт хугацааны гэрээнд хөнгөлөлттэй.',
    ],
  },
  designservice: {
    titles: {
      architecture: [
        'Архитектур зураг төсөл боловсруулна',
        'Амины орон сууцны зураг төсөл',
      ],
      structural: [
        'Бүтээцийн тооцоо, ажлын зураг',
        'Төмөр бетон бүтээцийн зураг төсөл',
      ],
      surveying: [
        'Геодезийн хэмжилт, топо зураг',
        'Барилгын тэнхлэг тавих, гүйцэтгэлийн зураг',
      ],
      soil_testing: [
        'Хөрсний шинжилгээ, инженер геологи',
        'Суурийн хөрсний судалгаа, дүгнэлт',
      ],
      permits: [
        'Барилгын зөвшөөрөл, баримт бичиг бүрдүүлнэ',
        'Ашиглалтад оруулах комисс, бичиг баримт',
      ],
      interior_design: [
        'Интерьер дизайн, 3D визуализаци',
        'Орон сууцны интерьер зураг төсөл',
      ],
    },
    details: [
      'БНбД-ын шаардлагын дагуу боловсруулж, магадлалын шинжилгээнд оруулна. Тусгай зөвшөөрөлтэй.',
      'Ажлын зураг, төсөв, спецификацийг багцаар нь гүйцэтгэнэ. Хугацаа: ажлын 14 хоног.',
      'Эхний уулзалт, зөвлөгөө үнэгүй. Гүйцэтгэсэн төслүүдээ танилцуулна.',
    ],
  },
  miningsupport: {
    titles: {
      drilling_blasting: [
        'Өрөмдлөг, тэсэлгээний ажил гүйцэтгэнэ',
        'Тэсэлгээний үйлчилгээ — зөвшөөрөлтэй',
      ],
      earthworks: [
        'Уурхайн шороон ажил — өөрийн техниктэй',
        'Хуулалт, овоолго, тэгшилгээний ажил',
      ],
      haulage: [
        'Уурхайн дотоод тээвэр, хүдэр зөөвөрлөлт',
        'Хүдэр, хаягдал чулуу тээвэрлэнэ',
      ],
      camp_services: [
        'Кемпийн үйлчилгээ — байр, хоол, цэвэрлэгээ',
        'Ажилчдын кемп ажиллуулна',
      ],
      maintenance: [
        'Хүнд машин механизмын засвар үйлчилгээ',
        'Хээрийн засварын баг — уурхайн техник',
      ],
    },
    details: [
      'Уурхайн стандарт, ХАБЭА-н шаардлага бүрэн хангасан баг. Гэрээгээр урт хугацаанд ажиллана.',
      'Өөрийн техник, оператор, ээлжийн зохион байгуулалттай. Өмнөговь, Дорноговьд ажиллаж байсан туршлагатай.',
      'Мото цагаар болон гүйцэтгэлээр тооцно. Тайлан, актыг сар бүр гаргана.',
    ],
  },
  winterservice: {
    titles: {
      snow_removal: [
        'Цас цэвэрлэгээ — гэрээгээр, техниктэй',
        'Байгууллагын талбайн цас цэвэрлэнэ',
      ],
      ground_thawing: [
        'Хөрс гэсгээх үйлчилгээ — цахилгаан халаагуур',
        'Өвлийн ухалтад хөрс гэсгээнэ',
      ],
      heating_rental: [
        'Дизель халаагуур түрээслүүлнэ',
        'Барилгын халаагуур, тепловой пушка',
      ],
      winterization: [
        'Өвөлжилтийн бэлтгэл — шугам хоолойн дулаалга',
        'Талбайн өвөлжилтийн бэлтгэл ажил',
      ],
    },
    details: [
      'Улирлын гэрээгээр ажиллана. Цас орсноос хойш 6 цагийн дотор талбайг цэвэрлэнэ.',
      'Техник, оператор, шатахуун үнэд багтсан. Хотын дотор болон захын бүсэд ажиллана.',
      'Өдөр шөнөгүй дуудлагаар ажиллана. Урт хугацааны захиалагчид хөнгөлөлттэй.',
    ],
  },
};

/** Price bands per category, in tögrög, matching the schema's default unit. */
const PRICE_BANDS: Record<string, [number, number]> = {
  vehiclerent: [120_000, 450_000], // DAY
  machineryrent: [80_000, 260_000], // MOTO_HOUR
  toolrent: [15_000, 120_000], // DAY
  materialstore: [3_000, 380_000], // UNIT
  construction: [25_000, 450_000], // per schema default
  factory: [1_500, 250_000], // UNIT
  sos: [40_000, 250_000], // TRIP
  usedequipment: [8_000_000, 320_000_000], // TOTAL
  transport: [60_000, 900_000], // TRIP
  designservice: [300_000, 9_000_000],
  miningsupport: [90_000, 320_000], // MOTO_HOUR
  winterservice: [50_000, 600_000],
};

const REJECTIONS = [
  'Зураг тодорхойгүй, бүтээгдэхүүн танигдахгүй байна.',
  'Холбоо барих утасны дугаар буруу эсвэл ажиллахгүй байна.',
  'Сонгосон ангилал зарын агуулгад тохирохгүй байна.',
  'Үнийн мэдээлэл дутуу. Тодорхой үнэ эсвэл үнийн санал оруулна уу.',
  'Гарчиг дэх том үсэг, олон анхаарлын тэмдгийг арилгана уу.',
];

const BOOKING_MESSAGES = [
  'Сайн байна уу. Тухайн өдрүүдэд захиалах боломжтой юу? Байршил Баянзүрх дүүрэг.',
  'Танай техник сул байвал 4 хоног авъя. Үнийн саналаа хэлнэ үү.',
  'Хан-Уул дүүрэгт суурийн ухалт хийх ажилтай. Операторчтой авмаар байна.',
  'Ажлын хэмжээ 300 м3 орчим. Хугацаа болон үнээ тохироод гэрээ хийе.',
  'Өмнөговь руу явах шаардлагатай. Тээврийн зардлыг тусад нь тооцох уу?',
  'Өглөө 08:00 цагаас эхэлж болох уу? Талбай бэлэн байгаа.',
];

const REVIEW_COMMENTS = [
  'Цаг барьсан, найдвартай ажиллалаа. Дахин хамтарна.',
  'Техник нь сайн байсан, оператор туршлагатай. Санал болгож байна.',
  'Харилцаа сайн боловч эхний өдөр 2 цаг хоцорсон.',
  'Үнэ бага зэрэг өндөр санагдсан ч ажлын чанар сайн.',
  'Ярьсан хугацаандаа багтаасан. Баримтаа цэвэрхэн гаргаж өгсөн.',
  'Материалын чанар тааруу байсан тул нэг хэсгийг нь буцаасан.',
  'Дуудлагын дараа 20 минутад ирсэн. Маш хурдан шуурхай.',
];

// ---------------------------------------------------------------------------
// Fixture images
// ---------------------------------------------------------------------------

/**
 * Real files on disk, not filenames pointing at nothing.
 *
 * Production stores a full R2 URL; a bare filename is resolved by every client
 * against `<API>/uploads/<kind>/<name>`, which main.ts serves from ./uploads.
 * The old corpus wrote `seed-vehiclerent-3.jpg` and no such file existed, so
 * every card in every list rendered its broken-image fallback — the one state
 * guaranteed *not* to be what a user sees, and the photo grid, the gallery and
 * the aspect-ratio handling were never exercised at all.
 *
 * Each image is the category's own colour with its label drawn on it, so a
 * screenshot of a list is still readable as a list of that category.
 */
async function makeImage(
  dir: string,
  name: string,
  hex: string,
  label: string,
  w = 1200,
  h = 900,
) {
  const file = path.join(process.cwd(), 'uploads', dir, name);
  await fs.mkdir(path.dirname(file), { recursive: true });
  const svg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
       <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
         <stop offset="0%" stop-color="${hex}" stop-opacity="0.95"/>
         <stop offset="100%" stop-color="${hex}" stop-opacity="0.55"/>
       </linearGradient></defs>
       <rect width="${w}" height="${h}" fill="url(#g)"/>
       <text x="50%" y="50%" font-family="DejaVu Sans, sans-serif" font-size="${Math.round(w / 18)}"
             fill="#ffffff" text-anchor="middle" dominant-baseline="middle">${label}</text>
     </svg>`,
  );
  await sharp(svg).jpeg({ quality: 72 }).toFile(file);
  return name;
}

/** Four photos per category, so a post can carry a gallery rather than one image. */
async function seedImageFiles(): Promise<Record<string, string[]>> {
  const pools: Record<string, string[]> = {};
  for (const cat of CATEGORY_SEED) {
    const key = cat.key as string;
    const hex = (cat.color as string) ?? '#6A7BC2';
    const label = (cat.labels as any)?.mn ?? cat.label ?? key;
    pools[key] = [];
    for (let n = 1; n <= 4; n++) {
      pools[key].push(
        await makeImage('posts', `seed-${key}-${n}.jpg`, hex, `${label} ${n}`),
      );
    }
  }
  const total = Object.values(pools).reduce((a, p) => a + p.length, 0);
  console.log(`images: ${total} post photos written to uploads/posts`);
  return pools;
}

// ---------------------------------------------------------------------------
// Field values
// ---------------------------------------------------------------------------

/** What a post carries beyond its columns: the brand/model chosen for it. */
type PostCtx = { brand?: string; model?: string; sub?: string | null };

/**
 * A believable value for one field definition.
 *
 * Keyed on `f.key` first, because the field key carries the meaning the type
 * does not: `year` is not any number, and `salary_min` is not `capacity`. The
 * type switch is the fallback for keys nothing knows about, so a newly added
 * schema field still gets a value of the right shape.
 */
function valueFor(f: any, i: number, cat: any, ctx: PostCtx): any {
  switch (f.key) {
    case 'manufacturer':
      return ctx.brand ?? pick(['Bosch', 'Makita', 'XCMG']);
    case 'model':
      return ctx.model ?? `${pick(['ZM', 'HX', 'TR'])}-${int(100, 900)}`;
    case 'year':
      return int(2009, 2024);
    case 'capacity':
      return cat.key === 'transport'
        ? pick([3, 5, 10, 15, 20, 25, 40])
        : cat.key === 'factory'
          ? int(20, 400) * 50
          : pick([1.5, 5, 12, 20, 25, 50]);
    case 'seats':
      return ctx.sub === 'bus'
        ? pick([24, 35, 45])
        : ctx.sub === 'van'
          ? pick([11, 14, 18])
          : pick([4, 5, 7]);
    case 'fuel_type':
      return ctx.sub === 'car'
        ? pick(['PETROL', 'GAS', 'ELECTRIC'])
        : pick(['DIESEL', 'DIESEL', 'PETROL']);
    case 'experience_years':
      return int(2, 25);
    case 'team_size':
      return int(4, 30);
    case 'crew_size':
      return int(6, 45);
    case 'positions':
      return int(1, 12);
    case 'vehicle_count':
      return int(1, 14);
    case 'quantity_available':
      return int(2, 60);
    case 'min_rental_days':
      return pick([1, 3, 5, 7]);
    case 'min_moto_hours_per_day':
      return pick([6, 8, 10, 12]);
    case 'warranty_months':
      return pick([6, 12, 24, 36]);
    case 'delivery_days':
      return pick([7, 10, 14, 21, 30, 45]);
    case 'project_count':
      return int(4, 140);
    case 'response_time_min':
      return pick([15, 20, 30, 45, 60, 90]);
    case 'mileage_km':
      return int(30, 420) * 1000;
    case 'moto_hours':
      return int(800, 14000);
    // "БА" for барилга, the shape the licence actually takes on a permit.
    case 'license_no':
      return `${pick(['БА', 'ГА', 'УУ'])}-${int(2016, 2025)}/${int(100, 4999)}`;
    case 'min_order':
      return cat.key === 'factory'
        ? pick(['50 ш', '100 ш', '500 ш', '1 багц'])
        : pick(['1 тонн', '5 тонн', '1 машин', '10 шуудай', '20 м2']);
    case 'salary_min':
      return int(12, 30) * 100_000;
    case 'salary_max':
      return 0; // rewritten below, once salary_min is known
    default:
      break;
  }
  switch (f.type) {
    case 'boolean':
      return rnd() > 0.4;
    case 'number': {
      const ph = Number(f.placeholder);
      const base = Number.isFinite(ph) && ph > 0 ? ph : 10;
      return Math.max(1, Math.round(base * (0.5 + rnd())));
    }
    case 'select':
      return pick(f.options ?? ['']);
    case 'multiselect': {
      const opts = f.options ?? [];
      const n = Math.max(1, Math.floor(rnd() * opts.length));
      return opts.slice(0, n);
    }
    case 'text':
    default:
      return f.placeholder ? `${f.placeholder}` : `${f.label}`;
  }
}

/**
 * The lifecycle each post is stamped with. Weighted toward the ordinary case,
 * but every branch the read paths care about appears at least once per category.
 */
const LIFECYCLES = [
  {
    approval: 'APPROVED',
    status: 'ACTIVE',
    expires: 30,
    featured: null,
    note: 'live',
  },
  {
    approval: 'APPROVED',
    status: 'ACTIVE',
    expires: 12,
    featured: null,
    note: 'live',
  },
  {
    approval: 'APPROVED',
    status: 'ACTIVE',
    expires: 3,
    featured: null,
    note: 'expiring soon',
  },
  {
    approval: 'APPROVED',
    status: 'ACTIVE',
    expires: 45,
    featured: 14,
    note: 'featured, live window',
  },
  {
    approval: 'APPROVED',
    status: 'ACTIVE',
    expires: 60,
    featured: -5,
    note: 'featured window lapsed',
  },
  {
    approval: 'APPROVED',
    status: 'RENTED',
    expires: 30,
    featured: null,
    note: 'approved but unavailable',
  },
  // Past expiry, status not yet swept — the drift window the cron leaves open.
  {
    approval: 'APPROVED',
    status: 'ACTIVE',
    expires: -2,
    featured: null,
    note: 'lapsed, unswept',
  },
  {
    approval: 'APPROVED',
    status: 'EXPIRED',
    expires: -20,
    featured: null,
    note: 'lapsed and swept',
  },
  {
    approval: 'PENDING',
    status: 'ACTIVE',
    expires: 30,
    featured: null,
    note: 'awaiting moderation',
  },
  {
    approval: 'PENDING',
    status: 'ACTIVE',
    expires: 30,
    featured: null,
    note: 'awaiting moderation',
  },
  {
    approval: 'REJECTED',
    status: 'ACTIVE',
    expires: 30,
    featured: null,
    note: 'rejected',
  },
  {
    approval: 'APPROVED',
    status: 'ACTIVE',
    expires: null,
    featured: null,
    note: 'no expiry set',
  },
];

async function wipe(client: Client) {
  // Every domain table, never `migrations` — the schema stays, the data goes.
  // RESTART IDENTITY so serial ids start from 1 and CASCADE for the FK web.
  await client.query(`
    TRUNCATE TABLE
      analytics_event, review, booking, likedpost, viewedpost,
      saved_search, push_device, trusted_device, verification_session,
      post, "user", company
    RESTART IDENTITY CASCADE`);
  console.log('wiped: all domain tables (schema and migrations untouched)');
}

/** Palette the generated logos and avatars draw from — the category colours. */
const BRAND_HEXES = CATEGORY_SEED.map((c: any) => c.color as string).filter(
  Boolean,
);

async function seedCompanies(client: Client) {
  const rows: string[] = [];
  for (let i = 0; i < COMPANIES.length; i++) {
    const c = COMPANIES[i];
    // A third verified, and one deliberately verified with no registration
    // number so the admin screen's "check the number" flow has a counter-example.
    const verified = i % 3 === 0;
    const reg = i === 3 ? null : `${int(2000000, 6999999)}`;
    const province = pick(PROVINCES);
    const district = province === 'ULAANBAATAR' ? pick(UB_DISTRICTS) : null;
    // Two of the twelve have no logo — the initials fallback has to be a state
    // the corpus actually contains, not one nothing ever reaches.
    const logo =
      i < 10
        ? await makeImage(
            'companylogo',
            `seed-logo-${i + 1}.jpg`,
            BRAND_HEXES[i % BRAND_HEXES.length],
            c.name.replace(' ХХК', ''),
            512,
            512,
          )
        : null;
    const {
      rows: [row],
    } = await client.query(
      `INSERT INTO company (name, description, address, phone_number, email, registration_number, tax_id, is_verified, logo, website)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
      [
        c.name,
        c.about,
        addressFor(province, district),
        // 7xxxxxxx is the landline range a registered company publishes.
        `7${int(0, 9)}${int(100000, 999999)}`,
        `info@${c.trade}.mn`,
        reg,
        reg ? `${reg}` : `${int(2000000, 6999999)}`,
        verified,
        logo,
        i % 4 === 3 ? null : `www.${c.trade}.mn`,
      ],
    );
    rows.push(row.id);
  }
  console.log(
    `companies: ${rows.length} named firms (${rows.filter((_, i) => i % 3 === 0).length} verified, 1 verified without a reg number)`,
  );
  return rows;
}

type Owner = { id: string; phone: string; email: string | null };

async function seedUsers(client: Client, companies: string[]) {
  const providers: Owner[] = [];
  const customers: string[] = [];
  const admins: Owner[] = [];
  const usedPhones = new Set<string>();
  const uniquePhone = () => {
    let p = mobile();
    while (usedPhones.has(p)) p = mobile();
    usedPhones.add(p);
    return p;
  };

  // Admins are phone-derived (ADMIN_PHONES), so they must exist under those
  // exact numbers or nothing in the app is reachable as an admin.
  for (let i = 0; i < ADMIN_PHONES.length; i++) {
    const phone = ADMIN_PHONES[i];
    usedPhones.add(phone);
    const given = GIVEN_NAMES[i % GIVEN_NAMES.length];
    const parent = PARENT_NAMES[i % PARENT_NAMES.length];
    const {
      rows: [u],
    } = await client.query(
      `INSERT INTO "user" (type, phone_number, given_name, parent_name, email, is_verified, plan)
       VALUES ('PROVIDER',$1,$2,$3,$4,true,'FREE') RETURNING id`,
      [phone, given, parent, `${latin(given)}@zuuchmap.mn`],
    );
    admins.push({ id: u.id, phone, email: `${latin(given)}@zuuchmap.mn` });
  }

  for (let i = 0; i < 24; i++) {
    // plan coverage: free, active paid, and one already past its expiry so the
    // "entitlement is derived on read" path has a subject.
    let plan = 'FREE';
    let planExpires: string | null = null;
    if (i % 4 === 1) {
      plan = 'PROVIDER';
      planExpires = `now() + interval '${int(20, 300)} days'`;
    }
    if (i % 8 === 3) {
      plan = 'PROVIDER';
      planExpires = `now() - interval '${int(1, 40)} days'`;
    }

    const given = GIVEN_NAMES[i % GIVEN_NAMES.length];
    const parent = PARENT_NAMES[(i * 3) % PARENT_NAMES.length];
    const phone = uniquePhone();
    const email =
      i % 5 === 0
        ? null
        : `${latin(parent).slice(0, 3)}.${latin(given)}@${pick(['gmail.com', 'yahoo.com', 'mail.mn'])}`;
    const province = pick(PROVINCES);
    const district = province === 'ULAANBAATAR' ? pick(UB_DISTRICTS) : null;

    // Two thirds carry a photo; the rest exercise the initials avatar.
    const avatar =
      i % 3 !== 2
        ? await makeImage(
            'profilepicture',
            `seed-avatar-p${i + 1}.jpg`,
            BRAND_HEXES[i % BRAND_HEXES.length],
            given.slice(0, 1),
            400,
            400,
          )
        : null;
    const {
      rows: [u],
    } = await client.query(
      `INSERT INTO "user" (type, phone_number, given_name, parent_name, email, address, is_verified, "companyId", plan, plan_expires_at, profile_picture)
       VALUES ('PROVIDER',$1,$2,$3,$4,$5,$6,$7,$8,${planExpires ?? 'NULL'},$9) RETURNING id`,
      [
        phone,
        given,
        parent,
        email,
        i % 4 === 0 ? null : addressFor(province, district),
        // one unverified provider — every read path must tolerate it
        i !== 7,
        i % 2 === 0 ? companies[i % companies.length] : null,
        plan,
        avatar,
      ],
    );
    providers.push({ id: u.id, phone, email });
  }

  for (let i = 0; i < 40; i++) {
    const given = GIVEN_NAMES[(i * 7) % GIVEN_NAMES.length];
    const parent = PARENT_NAMES[(i * 5) % PARENT_NAMES.length];
    const avatar =
      i % 4 === 0
        ? await makeImage(
            'profilepicture',
            `seed-avatar-c${i + 1}.jpg`,
            BRAND_HEXES[(i * 3) % BRAND_HEXES.length],
            given.slice(0, 1),
            400,
            400,
          )
        : null;
    const {
      rows: [u],
    } = await client.query(
      `INSERT INTO "user" (type, phone_number, given_name, parent_name, email, is_verified, plan, profile_picture)
       VALUES ('CUSTOMER',$1,$2,$3,$4,true,'FREE',$5) RETURNING id`,
      [
        uniquePhone(),
        given,
        parent,
        i % 3 === 0
          ? null
          : `${latin(given)}${int(70, 99)}@${pick(['gmail.com', 'yahoo.com'])}`,
        avatar,
      ],
    );
    customers.push(u.id);
  }

  // A user with no type at all — the state between verification and role choice.
  await client.query(
    `INSERT INTO "user" (phone_number, is_verified, plan) VALUES ($1,true,'FREE')`,
    [uniquePhone()],
  );

  console.log(
    `users: ${admins.length} admin, ${providers.length} provider, ${customers.length} customer, 1 role-less`,
  );
  return { providers, customers, admins };
}

/** Rounds to a price a person would actually type, not 384,127₮. */
function priceFor(catKey: string): number {
  const [lo, hi] = PRICE_BANDS[catKey] ?? [50_000, 500_000];
  const raw = lo + rnd() * (hi - lo);
  const step =
    raw > 10_000_000
      ? 1_000_000
      : raw > 1_000_000
        ? 100_000
        : raw > 100_000
          ? 10_000
          : 500;
  return Math.max(step, Math.round(raw / step) * step);
}

async function seedPosts(
  client: Client,
  owners: Owner[],
  imagePool: Record<string, string[]>,
) {
  const ids: number[] = [];
  let lifecycleIdx = 0;

  for (const cat of CATEGORY_SEED) {
    const catalog = CATALOG[cat.key as string];
    const subs = (cat.subcategories ?? []).map((x: any) => x.value);
    for (let i = 0; i < LIFECYCLES.length; i++) {
      const lc = LIFECYCLES[lifecycleIdx++ % LIFECYCLES.length];
      const sub = subs.length ? subs[i % subs.length] : null;

      // Brand and model are chosen once, then reused by both the title and the
      // identity fields — a listing headed "Komatsu PC200-8" whose manufacturer
      // attribute says "Bosch" is exactly the kind of incoherence that makes a
      // fixture set useless for eyeballing a screen.
      const subModels = sub ? catalog?.subModels?.[sub] : undefined;
      const brands = catalog?.brands;
      let brand: string | undefined;
      let model: string | undefined;
      if (subModels) {
        const [b, ...rest] = pick(subModels).split(' ');
        brand = b;
        model = rest.join(' ');
      } else if (brands) {
        brand = pick(Object.keys(brands));
        model = pick(brands[brand]);
      }
      const ctx: PostCtx = { brand, model, sub };

      // Every field gets a value on most posts so the corpus covers the optional
      // half of each schema; a slice gets only required fields, because that is
      // what a real hurried listing looks like.
      const attributes: Record<string, any> = {};
      const sparse = i % 5 === 4;
      for (const f of cat.fields ?? []) {
        if (sparse && !f.required) continue;
        attributes[f.key] = valueFor(f, i, cat, ctx);
      }
      // The pair has to be ordered or the range filter has nothing to match.
      if (
        attributes.salary_min !== undefined &&
        attributes.salary_max !== undefined
      ) {
        attributes.salary_max = attributes.salary_min + int(2, 12) * 100_000;
      }

      const titleTpl = pick(
        catalog?.titles?.[sub ?? ''] ??
          catalog?.titles?.[Object.keys(catalog?.titles ?? {})[0]] ?? ['{bm}'],
      );
      const title = titleTpl
        .replace('{bm}', `${brand ?? ''} ${model ?? ''}`.trim())
        .replace(/\s+/g, ' ')
        .trim();

      const province = pick(PROVINCES);
      const place = PLACES[province];
      const district = province === 'ULAANBAATAR' ? pick(UB_DISTRICTS) : null;
      const address = addressFor(province, district);
      // A tenth of posts carry no coordinates — they must stay in browse and
      // stay off the map, rather than becoming a null pin.
      const located = i % 10 !== 7;
      // A real spread: some listings have no photo, most have one or two, a few
      // carry a gallery. One image on every post never exercises the carousel,
      // the counter badge or the detail-screen swipe.
      const pool = imagePool[cat.key as string] ?? [];
      const shots = i % 6 === 5 ? 0 : i % 4 === 3 ? 4 : i % 3 === 1 ? 2 : 1;
      const images = JSON.stringify(pool.slice(0, shots));
      const owner = pick(owners);

      const details =
        `${pick(catalog?.details ?? ['Дэлгэрэнгүй мэдээллийг утсаар авна уу.'])}` +
        ` Байршил: ${address}.` +
        (rnd() < 0.5 ? ` Холбоо барих: ${owner.phone}.` : '');

      const {
        rows: [p],
      } = await client.query(
        `INSERT INTO "post"
           (category, subcategory, title, details, province, district, address, location,
            latitude, longitude, price_amount, price_unit, contact_phone, contact_email, website,
            available_from, available_until,
            attributes, images, status, approval_status, rejection_reason, views,
            expires_at, featured_until, is_featured, "userId", date_created)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$22,$8,$9,$10,$11,$12,$13,$14,
                 ${cat.has_availability_dates ? `now() - interval '5 days', now() + interval '${int(20, 90)} days'` : 'NULL, NULL'},
                 $15::jsonb,$16::jsonb,$17,$18,$19,$20,
                 ${lc.expires === null ? 'NULL' : days(lc.expires)},
                 ${lc.featured === null ? 'NULL' : days(lc.featured)},
                 ${lc.featured !== null && lc.featured > 0 ? 'true' : 'false'},
                 $21, now() - interval '${int(0, 200)} days')
         RETURNING id`,
        [
          cat.key,
          sub,
          title,
          details,
          province,
          district,
          address,
          // Scattered around the settlement, not around the capital regardless
          // of the aimag the post claims to be in.
          located ? +(place.lat + (rnd() - 0.5) * 0.14).toFixed(6) : null,
          located ? +(place.lng + (rnd() - 0.5) * 0.22).toFixed(6) : null,
          cat.has_price ? priceFor(cat.key as string) : null,
          cat.has_price ? (cat.default_price_unit ?? 'DAY') : null,
          owner.phone,
          i % 4 === 0 ? owner.email : null,
          i % 7 === 0 ? `www.${pick(COMPANIES).trade}.mn` : null,
          JSON.stringify(attributes),
          images,
          lc.status,
          lc.approval,
          lc.approval === 'REJECTED' ? pick(REJECTIONS) : null,
          int(0, 400),
          owner.id,
          // The map picker's reverse-geocoded name, which the app submits on
          // create. The old corpus left it null on every row, which reads like
          // a dead column until you check what the client actually sends.
          // Derived from this post's own address so the two agree — in the
          // capital the neighbourhood is the recognisable part, elsewhere the
          // sum is.
          located ? `${nearestLandmark(province, address)} орчим` : null,
        ],
      );
      ids.push(p.id);
    }
  }
  console.log(
    `posts: ${ids.length} across ${CATEGORY_SEED.length} categories, ${LIFECYCLES.length} lifecycle states each`,
  );
  return ids;
}

async function seedEngagement(
  client: Client,
  postIds: number[],
  customers: string[],
) {
  const cats = (await client.query('SELECT id, category, "userId" FROM post'))
    .rows;
  const byId = new Map(cats.map((r: any) => [r.id, r]));

  let likes = 0;
  let views = 0;
  for (const uid of customers) {
    for (const pid of postIds) {
      const post: any = byId.get(pid);
      if (!post || post.userId === uid) continue; // nobody likes their own post
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
  // post.views is the public counter; viewedpost is the deduped per-user log
  // the provider stats screen counts. Seeding them independently — a random
  // 0-400 against 664 real rows — put the two screens ~45x apart, which would
  // have drowned out any genuine disagreement between them. Anonymous traffic
  // is the only legitimate gap, so the counter is the log plus a share of it.
  await client.query(`
    UPDATE post p
       SET views = sub.logged + (sub.logged * 2) + (p.id % 17)
      FROM (SELECT post_id, COUNT(*)::int AS logged FROM viewedpost GROUP BY post_id) sub
     WHERE sub.post_id = p.id`);
  await client.query(
    `UPDATE post SET views = id % 9 WHERE id NOT IN (SELECT post_id FROM viewedpost)`,
  );
  console.log(
    `engagement: ${likes} likes, ${views} recorded views (post.views reconciled with the log)`,
  );
}

/**
 * Browse filters customers asked to be told about. The saved-search fan-out
 * runs on every approval, so with an empty table that whole path — match,
 * rate-limit, push — was dead code in every local run.
 */
async function seedSavedSearches(client: Client, customers: string[]) {
  const searches = [
    {
      name: 'Экскаватор — УБ',
      category: 'machineryrent',
      subcategory: 'excavator',
      province: 'ULAANBAATAR',
      q: null,
      attrs: { with_operator: true },
    },
    {
      name: 'Кран түрээс',
      category: 'machineryrent',
      subcategory: 'crane',
      province: null,
      q: 'кран',
      attrs: {},
    },
    {
      name: 'Цемент бөөний',
      category: 'materialstore',
      subcategory: 'cement',
      province: 'ULAANBAATAR',
      q: 'цемент',
      attrs: { sale_type: 'WHOLESALE' },
    },
    {
      name: 'Жолоочийн ажил',
      category: 'jobvacancy',
      subcategory: 'driver',
      province: null,
      q: null,
      attrs: { accommodation_provided: true },
    },
    {
      name: 'Самосвал — Өмнөговь',
      category: 'transport',
      subcategory: 'dump_truck',
      province: 'UMNUGOVI',
      q: null,
      attrs: {},
    },
    {
      name: 'Дотор засал',
      category: 'construction',
      subcategory: 'interior',
      province: 'ULAANBAATAR',
      q: 'засал',
      attrs: { with_materials: true },
    },
    {
      name: 'Хямд жийп',
      category: 'vehiclerent',
      subcategory: 'suv',
      province: 'ULAANBAATAR',
      q: null,
      attrs: {},
    },
    {
      name: 'Хуучин техник',
      category: 'usedequipment',
      subcategory: 'machinery',
      province: null,
      q: 'экскаватор',
      attrs: { condition: 'GOOD' },
    },
  ];
  let made = 0;
  for (let i = 0; i < 18; i++) {
    const user = customers[i % customers.length];
    const s = searches[i % searches.length];
    await client.query(
      `INSERT INTO saved_search (user_id, name, category, subcategory, province, district, q, attrs, created_at, last_notified_at)
       VALUES ($1,$2,$3,$4,$5,NULL,$6,$7::jsonb, now() - interval '${int(1, 90)} days',
               ${i % 3 === 0 ? `now() - interval '${int(1, 20)} days'` : 'NULL'})`,
      [
        user,
        s.name,
        s.category,
        s.subcategory,
        s.province,
        s.q,
        JSON.stringify(s.attrs),
      ],
    );
    made++;
  }
  console.log(
    `saved searches: ${made} across ${new Set(Array.from({ length: 18 }, (_, i) => customers[i % customers.length])).size} customers (a third already notified once)`,
  );
}

/**
 * Push targets. Every notification path in the app fans out through this table;
 * empty, it silently no-ops, so a broken fan-out looks exactly like a quiet one.
 */
async function seedPushDevices(client: Client, userIds: string[]) {
  let made = 0;
  for (let i = 0; i < 34; i++) {
    // A tenth of users have two devices — a phone and a tablet — which is the
    // case the per-device token table exists to handle.
    const user = userIds[i % userIds.length];
    await client.query(
      `INSERT INTO push_device (token, platform, last_seen_at, "userId", date_created)
       VALUES ($1,$2, now() - interval '${int(0, 25)} days', $3, now() - interval '${int(25, 120)} days')
       ON CONFLICT DO NOTHING`,
      [
        `ExponentPushToken[${createHash('sha256').update(`push-${i}`).digest('hex').slice(0, 22)}]`,
        pick(['ios', 'android', 'android']),
        user,
      ],
    );
    made++;
  }
  console.log(`push devices: ${made} tokens (some users on two devices)`);
}

async function seedBookings(client: Client, customers: string[]) {
  // Only bookable categories, and only posts a customer could actually reach.
  const bookableKeys = CATEGORY_SEED.filter(
    (c: any) => c.has_rental_status,
  ).map((c: any) => c.key);
  const { rows: posts } = await client.query(
    `SELECT id, "userId" FROM post
      WHERE category = ANY($1) AND approval_status = 'APPROVED' AND status = 'ACTIVE'
      ORDER BY id`,
    [bookableKeys],
  );

  // How long the provider took to answer, in hours. Unanswered states stay
  // null: `responded_at` is the column provider stats average over, and a
  // request nobody replied to must not score as an instant reply.
  const RESPONSE_HOURS: Record<string, number | null> = {
    PENDING: null,
    EXPIRED: null,
    CANCELLED: null,
    ACCEPTED: 3,
    DECLINED: 9,
  };

  const plans = [
    { status: 'PENDING', from: 5, to: 9 },
    { status: 'PENDING', from: 20, to: 24 },
    { status: 'ACCEPTED', from: 2, to: 6 }, // live commitment — blocks deletion
    { status: 'ACCEPTED', from: -40, to: -35 }, // concluded — review eligibility
    { status: 'ACCEPTED', from: 40, to: 46 }, // future
    { status: 'DECLINED', from: 8, to: 12 },
    { status: 'CANCELLED', from: 15, to: 18 },
    // Requested, never answered, dates gone — what the nightly sweep leaves.
    { status: 'EXPIRED', from: -25, to: -20 },
  ];

  let made = 0;
  const counts: Record<string, number> = {};
  const skipped: string[] = [];
  for (let i = 0; i < posts.length; i++) {
    const post = posts[i];
    const plan = plans[i % plans.length];
    const customer = customers[i % customers.length];
    if (customer === post.userId) continue;
    const createdDaysAgo = int(1, 30);
    const respHours = RESPONSE_HOURS[plan.status];
    // Answered a plausible number of hours after the request, and date_updated
    // moved with it. Leaving date_updated at insert-time now() made every
    // provider look like they replied 400 hours late.
    const respondedAt =
      respHours == null
        ? 'NULL'
        : `(now() - interval '${createdDaysAgo} days' + interval '${respHours + int(0, 20)} hours')`;
    try {
      await client.query(
        `INSERT INTO booking (start_date, end_date, message, status, response_message, "postId", "customerId", "providerId", date_created, responded_at, date_updated)
         VALUES (${days(plan.from)}::date, ${days(plan.to)}::date, $1, $2, $3, $4, $5, $6,
                 now() - interval '${createdDaysAgo} days', ${respondedAt},
                 COALESCE(${respondedAt}, now() - interval '${createdDaysAgo} days'))`,
        [
          pick(BOOKING_MESSAGES),
          plan.status,
          plan.status === 'DECLINED'
            ? pick([
                'Уучлаарай, тухайн өдрүүдэд захиалгатай байна.',
                'Тэр хугацаанд техник засварт орно. Дараа долоо хоногт боломжтой.',
              ])
            : null,
          post.id,
          customer,
          post.userId,
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
      if (
        constraint !== 'UQ_booking_one_pending_per_customer_post' &&
        constraint !== 'EX_booking_accepted_no_overlap'
      ) {
        skipped.push(err?.message ?? String(err));
      }
    }
  }
  console.log(
    `bookings: ${made} — ${Object.entries(counts)
      .map(([k, v]) => `${k} ${v}`)
      .join(', ')}`,
  );
  if (skipped.length) {
    console.log(
      `  ${skipped.length} unexpected failure(s); first: ${skipped[0]}`,
    );
  }
  if (!made)
    console.log(
      `  candidate posts: ${posts.length}, bookable categories: ${bookableKeys.length}`,
    );
}

async function seedReviews(client: Client) {
  // Eligibility is "has an ACCEPTED booking with this provider", so derive the
  // review set from bookings rather than inventing pairs the API would refuse.
  const { rows: pairs } = await client.query(
    `SELECT DISTINCT "customerId", "providerId" FROM booking WHERE status = 'ACCEPTED'`,
  );
  let made = 0;
  for (const p of pairs) {
    // Skewed high, the way marketplace ratings actually are — a uniform 1–5
    // makes the average meaningless and hides how a 2★ card really looks.
    const rating = rnd() < 0.68 ? 5 : rnd() < 0.6 ? 4 : int(1, 3);
    // A third leave a rating with no comment — the column is nullable and the
    // display has to hold up without prose.
    const comment = rnd() < 0.33 ? null : pick(REVIEW_COMMENTS);
    try {
      await client.query(
        `INSERT INTO review (rating, comment, "providerId", "authorId", date_created)
         VALUES ($1,$2,$3,$4, now() - interval '${int(1, 60)} days')`,
        [rating, comment, p.providerId, p.customerId],
      );
      made++;
    } catch {
      /* one review per author per provider */
    }
  }
  console.log(`reviews: ${made} (a third with no comment)`);
}

async function seedAuthArtifacts(
  client: Client,
  users: { id: string; phone: string }[],
) {
  const statuses = ['PENDING', 'VERIFIED', 'CONSUMED', 'EXPIRED'];
  for (let i = 0; i < 16; i++) {
    const st = statuses[i % statuses.length];
    await client.query(
      `INSERT INTO verification_session (provider_session_id, phone_number, code, status, device_hash, verified_at, expires_at)
       VALUES ($1,$2,$3,$4,$5, ${st === 'PENDING' ? 'NULL' : 'now()'}, ${st === 'EXPIRED' ? `now() - interval '1 day'` : days(1)})`,
      [
        `remote-${i + 1}`,
        users[i % users.length].phone,
        `ZM${int(1000, 9999)}`,
        st,
        createHash('sha256').update(`device-${i}`).digest('hex'),
      ],
    );
  }
  for (let i = 0; i < 20; i++) {
    await client.query(
      `INSERT INTO trusted_device (device_hash, last_seen_at, "userId")
       VALUES ($1, now() - interval '${int(0, 30)} days', $2)`,
      [
        createHash('sha256').update(`trusted-${i}`).digest('hex'),
        users[i % users.length].id,
      ],
    );
  }
  console.log(
    'auth: 16 verification sessions (all four statuses), 20 trusted devices',
  );
}

async function seedAnalytics(client: Client, userIds: string[]) {
  const events = [
    'browse.search',
    'post.view',
    'post.create.started',
    'post.create.submitted',
    'contact.revealed',
    'auth.start',
    'auth.verified',
  ];
  let made = 0;
  for (let i = 0; i < 400; i++) {
    const name = pick(events);
    await client.query(
      `INSERT INTO analytics_event (name, anon_id, path, platform, props, occurred_at, "userId")
       VALUES ($1,$2,$3,$4,$5::jsonb, now() - interval '${int(0, 89)} days', $6)`,
      [
        name,
        `anon-${int(1, 120)}`,
        pick([
          '/',
          '/browse',
          '/customer/map',
          '/customer/saved',
          `/posts/${int(1, 150)}`,
        ]),
        pick(['web', 'ios', 'android', 'server']),
        JSON.stringify(
          name === 'browse.search'
            ? { query_length: int(2, 20), total: int(0, 40) }
            : { seeded: true },
        ),
        rnd() < 0.5 ? pick(userIds) : null,
      ],
    );
    made++;
  }
  console.log(`analytics: ${made} events spread over 90 days`);
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

  if (process.argv.includes('--wipe')) await wipe(client);

  const imagePool = await seedImageFiles();
  const companies = await seedCompanies(client);
  const { providers, customers, admins } = await seedUsers(client, companies);
  const owners = [...providers, ...admins];
  const postIds = await seedPosts(client, owners, imagePool);
  await seedEngagement(client, postIds, customers);
  await seedBookings(client, customers);
  await seedReviews(client);
  await seedSavedSearches(client, customers);
  await seedPushDevices(client, [...owners.map((o) => o.id), ...customers]);
  await seedAuthArtifacts(client, owners);
  await seedAnalytics(client, [...owners.map((o) => o.id), ...customers]);

  await client.end();
  console.log('\ndone.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
