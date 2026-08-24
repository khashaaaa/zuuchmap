// Canonical provider plans. Mirrored in zuuchmap_web/src/lib/utils.js and
// zuuchmap_app/src/config/app.config.js — change all three together.
export enum Plan {
  /** Default. 3 active posts, category-default expiry, basic stats. */
  FREE = 'FREE',
  /** Paid. 25 active posts, 90-day expiry, full stats. */
  PROVIDER = 'PROVIDER',
}

export const isPlan = (value: unknown): value is Plan =>
  typeof value === 'string' && Object.values(Plan).includes(value as Plan);
