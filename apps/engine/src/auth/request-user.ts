import type { Request } from 'express';
import type { DataSource, EntityManager } from 'typeorm';
import type { UserType } from '@zuuchmap/core';
import { signHs256, verifyHs256 } from './jwt';
import { isAdminPhone, type AuthConfig } from './auth.config';

export interface RequestUser {
  id: string;
  phone_number: string;
  type: UserType;
  is_admin: boolean;
  /** The token's `auth_sessions` row: what signing out deletes. */
  session_id: string;
}

export type AuthedRequest = Request & { user?: RequestUser };

export function bearerToken(req: Request): string | null {
  const h = req.headers.authorization;
  if (!h) return null;
  const m = /^Bearer\s+(\S+)$/i.exec(h);
  return m?.[1] ?? null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Verifies the bearer token and loads the account; null for anything not valid. */
export function authenticate(req: Request, cfg: AuthConfig, ds: DataSource): Promise<RequestUser | null> {
  const token = bearerToken(req);
  return token ? authenticateToken(token, cfg, ds) : Promise.resolve(null);
}

/**
 * A token counts only while its session row exists: signature, expiry, session and account in
 * one query. Admin comes from ADMIN_PHONES now, never from the token.
 */
export async function authenticateToken(token: string, cfg: AuthConfig, ds: DataSource): Promise<RequestUser | null> {
  const claims = verifyHs256(token, cfg.jwtSecret);
  if (!claims?.sid || !UUID.test(claims.sub) || !UUID.test(claims.sid)) return null;
  const user = (await ds.query<Array<{ id: string; phone_number: string; type: UserType }>>(
    'SELECT u.id, u.phone_number, u.type FROM auth_sessions s JOIN users u ON u.id = s.user_id WHERE s.id = $1 AND s.user_id = $2',
    [claims.sid, claims.sub],
  )).at(0);
  if (!user) return null;
  return {
    id: user.id,
    phone_number: user.phone_number,
    type: user.type,
    is_admin: isAdminPhone(cfg, user.phone_number),
    session_id: claims.sid,
  };
}

/** Opens a session and signs its token; lapsed sessions of the account are cleared on the way. */
export async function openSession(q: DataSource | EntityManager, userId: string, cfg: Pick<AuthConfig, 'jwtSecret' | 'sessionTtlSeconds'>): Promise<string> {
  const [row] = await q.query<Array<{ id: string }>>('INSERT INTO auth_sessions (user_id) VALUES ($1) RETURNING id', [userId]);
  await q.query('DELETE FROM auth_sessions WHERE user_id = $1 AND created_at < now() - make_interval(secs => $2)', [userId, cfg.sessionTtlSeconds]);
  return signHs256({ sub: userId, sid: row.id }, cfg.jwtSecret, cfg.sessionTtlSeconds);
}
