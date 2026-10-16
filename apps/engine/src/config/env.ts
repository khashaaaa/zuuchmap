import { normalizePhone } from '../auth/phone';

export interface Env {
  PORT: number;
  /** Production listens on loopback only: nginx is the one way in. Dev listens everywhere (the phone on the LAN). */
  HOST: string | undefined;
  NODE_ENV: 'development' | 'test' | 'production';
  PG_HOST: string;
  PG_PORT: number;
  PG_USER: string;
  PG_PASSWORD: string;
  PG_DATABASE: string;
  PG_SSL: boolean;
  REDIS_URL?: string;
  JWT_SECRET: string;
  ALLOWED_ORIGIN: string[];
  PUBLIC_API_URL: string;
  PUBLIC_WEB_URL: string;
  SENTRY_DSN?: string;
  /** Insert missing seed categories on boot (never overwrites edits). Default true. */
  CATEGORY_SEED_ON_BOOT: boolean;
  /** Normalised 8-digit phone numbers that are admins. Empty = no admins. */
  ADMIN_PHONES: string[];
  /** Unset => verify.mn is inert (fake auto-verify mode outside production). */
  VERIFY_MN_API_KEY?: string;
  VERIFY_MN_BASE_URL: string;
  VERIFY_MN_TIMEOUT_MS: number;
  VERIFY_TTL_MS: number;
  VERIFY_RATE_LIMIT: number;
  RATE_TTL_MS: number;
  /** Salt for hashed viewer keys; falls back to JWT_SECRET (set it to that value before rotating the secret). */
  VIEW_KEY_SALT: string;
  /** Fresh anonymous viewers one address may add to one listing per day. */
  VIEW_ANON_PER_IP_PER_DAY: number;
  /** Live-listing quota per plan. */
  POST_QUOTA_FREE: number;
  POST_QUOTA_PROVIDER: number;
  /** Default listing window in days (a category's own post_expiry_days wins). */
  POST_EXPIRY_DAYS: number;
  /** Window for a paid plan when the category sets none. */
  POST_PROVIDER_EXPIRY_DAYS: number;
  /** Cloudflare R2 photo storage; all-unset => photos answer 503. */
  R2?: { endpoint: string; accessKeyId: string; secretAccessKey: string; bucket: string; publicUrl: string };
  /** Approved listings (with zero rejections) after which a provider's edits skip review. */
  POST_PROVEN_APPROVED: number;
  /** Browser push; all-unset => web push is off and `GET /notifications/vapid-key` answers null. */
  VAPID?: { publicKey: string; privateKey: string; subject: string };
  /** Outbound e-mail for accounts with no push device; SMTP_HOST unset => no e-mail. */
  SMTP?: { host: string; port: number; secure: boolean; user?: string; pass?: string; from: string };
  /** Optional Expo access token (only when the Expo project enforces push security). */
  EXPO_ACCESS_TOKEN?: string;
  /** Stored notifications older than this are deleted nightly. */
  NOTIFICATION_RETENTION_DAYS: number;
}

type Source = Record<string, string | undefined>;

function required(src: Source, key: string): string {
  const v = src[key]?.trim();
  if (!v) throw new Error(`Missing required environment variable ${key}`);
  return v;
}

function int(src: Source, key: string, fallback?: number): number {
  const raw = src[key]?.trim();
  if (!raw) {
    if (fallback !== undefined) return fallback;
    throw new Error(`Missing required environment variable ${key}`);
  }
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 65535) {
    throw new Error(`Environment variable ${key} must be an integer 1-65535, got "${raw}"`);
  }
  return n;
}

function posInt(src: Source, key: string, fallback: number): number {
  const raw = src[key]?.trim();
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) {
    throw new Error(`Environment variable ${key} must be a positive integer, got "${raw}"`);
  }
  return n;
}

function phones(src: Source, key: string): string[] {
  const out: string[] = [];
  for (const part of (src[key] ?? '').split(',')) {
    if (!part.trim()) continue;
    const p = normalizePhone(part);
    if (!p) throw new Error(`Environment variable ${key} has an invalid phone number "${part.trim()}"`);
    out.push(p);
  }
  return out;
}

function optional(src: Source, key: string): string | undefined {
  return src[key]?.trim() || undefined;
}

function r2(src: Source): Env['R2'] {
  const accountId = optional(src, 'R2_ACCOUNT_ID');
  const endpointOverride = optional(src, 'R2_ENDPOINT');
  const accessKeyId = optional(src, 'R2_ACCESS_KEY_ID');
  const secretAccessKey = optional(src, 'R2_SECRET_ACCESS_KEY');
  const bucket = optional(src, 'R2_BUCKET');
  const publicUrl = optional(src, 'R2_PUBLIC_URL');
  if (!accountId && !endpointOverride && !accessKeyId && !secretAccessKey && !bucket && !publicUrl) return undefined;
  const endpoint = endpointOverride ?? (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : undefined);
  const need: Array<[string, string | undefined]> = [
    ['R2_ACCOUNT_ID (or R2_ENDPOINT)', endpoint],
    ['R2_ACCESS_KEY_ID', accessKeyId],
    ['R2_SECRET_ACCESS_KEY', secretAccessKey],
    ['R2_BUCKET', bucket],
    ['R2_PUBLIC_URL', publicUrl],
  ];
  for (const [name, v] of need) if (!v) throw new Error(`Missing required environment variable ${name} (R2 is partly configured)`);
  return {
    endpoint: endpoint as string,
    accessKeyId: accessKeyId as string,
    secretAccessKey: secretAccessKey as string,
    bucket: bucket as string,
    publicUrl: (publicUrl as string).replace(/\/$/, ''),
  };
}

function vapid(src: Source): Env['VAPID'] {
  const publicKey = optional(src, 'VAPID_PUBLIC_KEY');
  const privateKey = optional(src, 'VAPID_PRIVATE_KEY');
  const subject = optional(src, 'VAPID_SUBJECT');
  if (!publicKey && !privateKey && !subject) return undefined;
  if (!publicKey || !privateKey || !subject) throw new Error('Missing required environment variable VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY or VAPID_SUBJECT (web push is partly configured)');
  return { publicKey, privateKey, subject };
}

function smtp(src: Source): Env['SMTP'] {
  const host = optional(src, 'SMTP_HOST');
  if (!host) return undefined;
  const port = int(src, 'SMTP_PORT', 587);
  return {
    host,
    port,
    secure: (optional(src, 'SMTP_SECURE') ?? (port === 465 ? 'true' : 'false')).toLowerCase() === 'true',
    user: optional(src, 'SMTP_USER'),
    pass: optional(src, 'SMTP_PASSWORD'),
    from: optional(src, 'SMTP_FROM') ?? 'ZuuchMap <no-reply@zuuchmap.com>',
  };
}

export function parseEnv(src: Source): Env {
  const nodeEnv = src.NODE_ENV?.trim() || 'development';
  if (nodeEnv !== 'development' && nodeEnv !== 'test' && nodeEnv !== 'production') {
    throw new Error(`NODE_ENV must be development, test or production, got "${nodeEnv}"`);
  }
  const jwt = required(src, 'JWT_SECRET');
  if (jwt.length < 32) throw new Error('JWT_SECRET must be at least 32 characters');
  const pgSsl = (src.PG_SSL?.trim() || 'false').toLowerCase();
  if (pgSsl !== 'true' && pgSsl !== 'false') {
    throw new Error(`PG_SSL must be "true" or "false", got "${pgSsl}"`);
  }
  const redisUrl = optional(src, 'REDIS_URL');
  if (nodeEnv === 'production' && !redisUrl) {
    throw new Error('Missing required environment variable REDIS_URL (required in production)');
  }
  return {
    PORT: int(src, 'PORT', 8383),
    HOST: optional(src, 'HOST') ?? (nodeEnv === 'production' ? '127.0.0.1' : undefined),
    NODE_ENV: nodeEnv,
    PG_HOST: required(src, 'PG_HOST'),
    PG_PORT: int(src, 'PG_PORT', 5432),
    PG_USER: required(src, 'PG_USER'),
    PG_PASSWORD: required(src, 'PG_PASSWORD'),
    PG_DATABASE: required(src, 'PG_DATABASE'),
    PG_SSL: pgSsl === 'true',
    REDIS_URL: redisUrl,
    JWT_SECRET: jwt,
    ALLOWED_ORIGIN: required(src, 'ALLOWED_ORIGIN')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    PUBLIC_API_URL: required(src, 'PUBLIC_API_URL'),
    PUBLIC_WEB_URL: required(src, 'PUBLIC_WEB_URL'),
    SENTRY_DSN: optional(src, 'SENTRY_DSN'),
    CATEGORY_SEED_ON_BOOT: (src.CATEGORY_SEED_ON_BOOT?.trim() || 'true').toLowerCase() !== 'false',
    ADMIN_PHONES: phones(src, 'ADMIN_PHONES'),
    VERIFY_MN_API_KEY: optional(src, 'VERIFY_MN_API_KEY'),
    VERIFY_MN_BASE_URL: (optional(src, 'VERIFY_MN_BASE_URL') ?? 'https://api.verify.mn').replace(/\/$/, ''),
    VERIFY_MN_TIMEOUT_MS: posInt(src, 'VERIFY_MN_TIMEOUT_MS', 10_000),
    VERIFY_TTL_MS: posInt(src, 'VERIFY_TTL_MS', 5 * 60 * 1000),
    VERIFY_RATE_LIMIT: posInt(src, 'VERIFY_RATE_LIMIT', 5),
    RATE_TTL_MS: posInt(src, 'RATE_TTL_MS', 60 * 60 * 1000),
    VIEW_KEY_SALT: optional(src, 'VIEW_KEY_SALT') ?? jwt,
    VIEW_ANON_PER_IP_PER_DAY: posInt(src, 'VIEW_ANON_PER_IP_PER_DAY', 30),
    POST_QUOTA_FREE: posInt(src, 'POST_QUOTA_FREE', 3),
    POST_QUOTA_PROVIDER: posInt(src, 'POST_QUOTA_PROVIDER', 25),
    POST_EXPIRY_DAYS: posInt(src, 'POST_EXPIRY_DAYS', 30),
    POST_PROVIDER_EXPIRY_DAYS: posInt(src, 'POST_PROVIDER_EXPIRY_DAYS', 90),
    POST_PROVEN_APPROVED: posInt(src, 'POST_PROVEN_APPROVED', 3),
    R2: r2(src),
    VAPID: vapid(src),
    SMTP: smtp(src),
    EXPO_ACCESS_TOKEN: optional(src, 'EXPO_ACCESS_TOKEN'),
    NOTIFICATION_RETENTION_DAYS: posInt(src, 'NOTIFICATION_RETENTION_DAYS', 90),
  };
}

let cached: Env | undefined;

/** Validated environment; throws at first call (boot) naming the offending variable. */
export function env(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}
