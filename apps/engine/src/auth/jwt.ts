import { createHmac, timingSafeEqual } from 'node:crypto';

export interface JwtClaims {
  sub: string;
  /** The `auth_sessions` row this token belongs to. */
  sid?: string;
  admin?: boolean;
  exp: number;
  nbf?: number;
  iat?: number;
}

const b64 = (v: unknown): string => Buffer.from(JSON.stringify(v)).toString('base64url');

function sign(data: string, secret: string): Buffer {
  return createHmac('sha256', secret).update(data).digest();
}

function parseJson(part: string): Record<string, unknown> | null {
  try {
    const v: unknown = JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
    return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function signHs256(
  payload: { sub: string; sid?: string; admin?: boolean },
  secret: string,
  ttlSeconds: number,
  nowMs: number = Date.now(),
): string {
  const iat = Math.floor(nowMs / 1000);
  const data = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ ...payload, iat, exp: iat + ttlSeconds })}`;
  return `${data}.${sign(data, secret).toString('base64url')}`;
}

/** Returns the claims, or null for anything malformed, forged, expired or not yet valid. */
export function verifyHs256(token: string, secret: string, nowMs: number = Date.now()): JwtClaims | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [h, p, s] = parts as [string, string, string];
  const header = parseJson(h);
  if (header?.alg !== 'HS256' || header.typ !== 'JWT') return null;
  const expected = sign(`${h}.${p}`, secret);
  const given = Buffer.from(s, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  const c = parseJson(p);
  if (!c) return null;
  const now = nowMs / 1000;
  if (typeof c.sub !== 'string' || !c.sub) return null;
  if (typeof c.exp !== 'number' || !Number.isFinite(c.exp) || c.exp <= now) return null;
  if (c.nbf !== undefined && (typeof c.nbf !== 'number' || !Number.isFinite(c.nbf) || c.nbf > now)) return null;
  return {
    sub: c.sub,
    ...(typeof c.sid === 'string' ? { sid: c.sid } : {}),
    admin: c.admin === true,
    exp: c.exp,
    ...(typeof c.nbf === 'number' ? { nbf: c.nbf } : {}),
  };
}
