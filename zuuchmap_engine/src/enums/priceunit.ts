// Canonical price units. Both clients mirror this list; see
// zuuchmap_app/src/config/app.config.js and zuuchmap_web/src/lib/utils.js.
export enum PriceUnit {
  HOUR = 'HOUR',
  // Engine-meter hour (мото цаг), read off the machine's hour meter. Heavy
  // equipment is billed this way so idle time on site is not charged at
  // working rates — deliberately distinct from HOUR (clock time).
  MOTO_HOUR = 'MOTO_HOUR',
  DAY = 'DAY',
  WEEK = 'WEEK',
  MONTH = 'MONTH',
  PROJECT = 'PROJECT',
  UNIT = 'UNIT',
  PIECE = 'PIECE',
  SQM = 'SQM',
  TRIP = 'TRIP',
  TOTAL = 'TOTAL',
}

export const PRICE_UNITS: string[] = Object.values(PriceUnit);

export const isPriceUnit = (v: unknown): boolean =>
  typeof v === 'string' && (PRICE_UNITS as string[]).includes(v);
