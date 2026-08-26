import * as crypto from 'crypto';
import type { Request } from 'express';

/**
 * A stable, non-identifying key for an anonymous viewer.
 *
 * Views were counted for signed-in non-owners only, which meant the number a
 * provider reads on their dashboard — and which a paid plan advertises — left
 * out the anonymous landing, browse and detail traffic that is most of it.
 *
 * The client supplies `X-Visitor-Id`: a random id it generates once and keeps.
 * IP is only the fallback, and a poor one on its own — Mongolian carriers
 * CGNAT many subscribers behind a single address, so an IP-keyed count would
 * collapse a whole cell tower's worth of real people into one view. The
 * user-agent is mixed in to split that a little; it is still an undercount,
 * which is the right direction for a fallback to err in.
 *
 * Hashed with a per-deployment salt so the stored value cannot be walked back
 * to an address, and truncated because 32 hex characters is already far more
 * collision headroom than a view counter needs.
 */
export function visitorKey(req: Request): string | undefined {
  const supplied = req.headers['x-visitor-id'];
  const raw =
    typeof supplied === 'string' &&
    supplied.length >= 8 &&
    supplied.length <= 128
      ? `id:${supplied}`
      : fallback(req);
  if (!raw) return undefined;

  const salt = process.env.JWT_SECRET ?? 'zuuchmap';
  return crypto
    .createHash('sha256')
    .update(`${salt}:${raw}`)
    .digest('hex')
    .slice(0, 32);
}

function fallback(req: Request): string | undefined {
  // nginx always overwrites X-Real-IP with the connecting socket address, so
  // unlike X-Forwarded-For it cannot be spoofed to mint fresh view counts.
  const realIp = req.headers['x-real-ip'];
  const ip = (typeof realIp === 'string' && realIp) || req.ip;
  if (!ip) return undefined;
  const ua =
    typeof req.headers['user-agent'] === 'string'
      ? req.headers['user-agent']
      : '';
  return `ip:${ip}|${ua.slice(0, 120)}`;
}
