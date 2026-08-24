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
