import { env } from '../config/env';

export const AUTH_CONFIG = Symbol('AUTH_CONFIG');

export interface AuthConfig {
  jwtSecret: string;
  /** A signed-in session (and a trusted device) lasts a year. */
  sessionTtlSeconds: number;
  verifyTtlMs: number;
  rateLimit: number;
  rateTtlMs: number;
  adminPhones: readonly string[];
  /** Public API base the verify.mn callback is registered against. */
  callbackBase: string;
  shortcode: string;
  verifyMn: { apiKey?: string; baseUrl: string; timeoutMs: number };
  /** Fake auto-verify mode: only ever outside production and with no API key. */
  devMode: boolean;
  production: boolean;
}

export const SESSION_TTL_SECONDS = 365 * 24 * 60 * 60;

export function authConfigFromEnv(): AuthConfig {
  const e = env();
  return {
    jwtSecret: e.JWT_SECRET,
    sessionTtlSeconds: SESSION_TTL_SECONDS,
    verifyTtlMs: e.VERIFY_TTL_MS,
    rateLimit: e.VERIFY_RATE_LIMIT,
    rateTtlMs: e.RATE_TTL_MS,
    adminPhones: e.ADMIN_PHONES,
    callbackBase: e.PUBLIC_API_URL.replace(/\/$/, ''),
    shortcode: '144773',
    verifyMn: { apiKey: e.VERIFY_MN_API_KEY, baseUrl: e.VERIFY_MN_BASE_URL, timeoutMs: e.VERIFY_MN_TIMEOUT_MS },
    devMode: e.NODE_ENV !== 'production' && !e.VERIFY_MN_API_KEY,
    production: e.NODE_ENV === 'production',
  };
}

export function isAdminPhone(cfg: Pick<AuthConfig, 'adminPhones'>, phone: string | null): boolean {
  return phone !== null && cfg.adminPhones.includes(phone);
}
