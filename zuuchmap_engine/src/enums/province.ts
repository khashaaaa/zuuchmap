/**
 * Province codes. These are the storage format for `post.province` and the
 * i18n lookup key on every client (`province.<CODE>`), so a value that is not
 * in this list renders as a raw code and can never be matched by the province
 * filter. Mongolia has 21 aimags; Ulaanbaatar is carried in the same list
 * because it is what a listing's location actually is.
 *
 * Keep in sync with `zuuchmap_app/src/config/app.config.js` and
 * `zuuchmap_web/src/lib/utils.js`.
 */
export enum Province {
  ULAANBAATAR = 'ULAANBAATAR',
  ARKHANGAI = 'ARKHANGAI',
  BAYANOLGII = 'BAYANOLGII',
  BAYANKHONGOR = 'BAYANKHONGOR',
  BULGAN = 'BULGAN',
  DARKHANUUL = 'DARKHANUUL',
  DORNOD = 'DORNOD',
  DORNOGOVI = 'DORNOGOVI',
  DUNDGOVI = 'DUNDGOVI',
  GOVIALTAI = 'GOVIALTAI',
  GOVISUMBER = 'GOVISUMBER',
  KHENTII = 'KHENTII',
  KHOVD = 'KHOVD',
  KHUVSGUL = 'KHUVSGUL',
  UMNUGOVI = 'UMNUGOVI',
  ORKHON = 'ORKHON',
  UVURKHANGAI = 'UVURKHANGAI',
  SELENGE = 'SELENGE',
  SUKHBAATAR = 'SUKHBAATAR',
  TUV = 'TUV',
  UVS = 'UVS',
  ZAVKHAN = 'ZAVKHAN',
}

/** Districts of Ulaanbaatar. Only meaningful when province is ULAANBAATAR. */
export enum District {
  BAGANUUR = 'BAGANUUR',
  BAGAKHANGAI = 'BAGAKHANGAI',
  BAYANGOL = 'BAYANGOL',
  BAYANZURKH = 'BAYANZURKH',
  CHINGELTEI = 'CHINGELTEI',
  KHANUUL = 'KHANUUL',
  NALAIKH = 'NALAIKH',
  SONGINOKHAIRKHAN = 'SONGINOKHAIRKHAN',
  SUKHBAATAR = 'SUKHBAATAR',
}

export const PROVINCE_CODES = Object.values(Province);
export const DISTRICT_CODES = Object.values(District);

/**
 * Legacy underscore spellings written by an old test seeder. They never matched
 * the client code lists, so posts carrying them showed a raw code and were
 * invisible to the province filter. Normalised on write; migration
 * 1784334000000 fixed the rows already stored.
 */
const LEGACY_ALIASES: Record<string, string> = {
  DARKHAN_UUL: Province.DARKHANUUL,
  KHAN_UUL: District.KHANUUL,
  UVUR_KHANGAI: Province.UVURKHANGAI,
  UMNU_GOVI: Province.UMNUGOVI,
  GOVI_ALTAI: Province.GOVIALTAI,
  GOVI_SUMBER: Province.GOVISUMBER,
  BAYAN_OLGII: Province.BAYANOLGII,
  BAYAN_KHONGOR: Province.BAYANKHONGOR,
};

/** Maps a legacy spelling onto its canonical code; passes anything else through. */
export const normalizeLocationCode = (value?: string | null): string | null => {
  if (!value) return null;
  const upper = String(value).trim().toUpperCase();
  return LEGACY_ALIASES[upper] ?? upper;
};

/**
 * Place names, for search only: `post.province` / `post.district` store a code,
 * and an Ulaanbaatar address never spells out the city, so "Улаанбаатар" found
 * 9 of 171 posts there. The clients' `province.*` / `district.*` strings are
 * the authority — `npm run check:sync` holds these equal to the app's mn and en.
 */
export const PROVINCE_NAMES: Record<Province, { mn: string; en: string }> = {
  ULAANBAATAR: { mn: 'Улаанбаатар', en: 'Ulaanbaatar' },
  ARKHANGAI: { mn: 'Архангай', en: 'Arkhangai' },
  BAYANOLGII: { mn: 'Баян-Өлгий', en: 'Bayan-Ölgii' },
  BAYANKHONGOR: { mn: 'Баянхонгор', en: 'Bayankhongor' },
  BULGAN: { mn: 'Булган', en: 'Bulgan' },
  GOVIALTAI: { mn: 'Говь-Алтай', en: 'Govi-Altai' },
  GOVISUMBER: { mn: 'Говьсүмбэр', en: 'Govisümber' },
  DARKHANUUL: { mn: 'Дархан-Уул', en: 'Darkhan-Uul' },
  DORNOGOVI: { mn: 'Дорноговь', en: 'Dornogovi' },
  DORNOD: { mn: 'Дорнод', en: 'Dornod' },
  DUNDGOVI: { mn: 'Дундговь', en: 'Dundgovi' },
  ZAVKHAN: { mn: 'Завхан', en: 'Zavkhan' },
  ORKHON: { mn: 'Орхон', en: 'Orkhon' },
  UVURKHANGAI: { mn: 'Өвөрхангай', en: 'Övörkhangai' },
  UMNUGOVI: { mn: 'Өмнөговь', en: 'Ömnögovi' },
  SUKHBAATAR: { mn: 'Сүхбаатар', en: 'Sükhbaatar' },
  SELENGE: { mn: 'Сэлэнгэ', en: 'Selenge' },
  TUV: { mn: 'Төв', en: 'Töv' },
  UVS: { mn: 'Увс', en: 'Uvs' },
  KHOVD: { mn: 'Ховд', en: 'Khovd' },
  KHUVSGUL: { mn: 'Хөвсгөл', en: 'Khövsgöl' },
  KHENTII: { mn: 'Хэнтий', en: 'Khentii' },
};

export const DISTRICT_NAMES: Record<District, { mn: string; en: string }> = {
  BAGANUUR: { mn: 'Багануур', en: 'Baganuur' },
  BAGAKHANGAI: { mn: 'Багахангай', en: 'Bagakhangai' },
  BAYANGOL: { mn: 'Баянгол', en: 'Bayangol' },
  BAYANZURKH: { mn: 'Баянзүрх', en: 'Bayanzürkh' },
  NALAIKH: { mn: 'Налайх', en: 'Nalaikh' },
  SONGINOKHAIRKHAN: { mn: 'Сонгинохайрхан', en: 'Songinokhairkhan' },
  SUKHBAATAR: { mn: 'Сүхбаатар', en: 'Sükhbaatar' },
  KHANUUL: { mn: 'Хан-Уул', en: 'Khan-Uul' },
  CHINGELTEI: { mn: 'Чингэлтэй', en: 'Chingeltei' },
};
