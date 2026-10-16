import { createHash } from 'node:crypto';
import type { Request } from 'express';
import { env } from '../config/env';

function hash(raw: string): string {
  return createHash('sha256').update(`${env().VIEW_KEY_SALT}:${raw}`).digest('hex').slice(0, 32);
}

/** `req.ip` is the visitor's address: `trust proxy` takes it from nginx's X-Forwarded-For hop, which a client cannot forge. */
function clientIp(req: Request): string | undefined {
  return req.ip || undefined;
}

/** Device key from `X-Visitor-Id`; without one, anonymous viewers fall back to address+agent. */
export function visitorKey(req: Request, fallbackToAddress: boolean): string | null {
  const v = req.headers['x-visitor-id'];
  if (typeof v === 'string' && v.length > 0 && v.length <= 128) return hash(`id:${v}`);
  if (!fallbackToAddress) return null;
  const ip = clientIp(req);
  if (!ip) return null;
  const ua = typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : '';
  return hash(`ip:${ip}|${ua.slice(0, 120)}`);
}

/** The connecting address alone, hashed: what one source cannot rotate per request. */
export function ipKey(req: Request): string | null {
  const ip = clientIp(req);
  return ip ? hash(`addr:${ip}`) : null;
}
