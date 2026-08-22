import { Logger } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { SimpleCache } from './cache';
import { createRedis, redisEnabled } from './redis';

/**
 * A small fixed-window counter that is correct across pm2 instances.
 *
 * Used for abuse controls that must hold globally — e.g. the per-phone hourly
 * cap on paid SMS verifications. With Redis it's a shared INCR+EXPIRE; without
 * Redis it falls back to a per-process bounded cache (single-instance only,
 * which matches the no-Redis deployment constraint).
 *
 * Fails OPEN on a Redis error, like the throttler: an abuse counter being
 * unavailable must not block a legitimate user.
 */
const logger = new Logger('RateCounter');
const local = new SimpleCache();
let client: Redis | null = null;

function redis(): Redis | null {
  if (!redisEnabled()) return null;
  if (!client) client = createRedis('rate-counter');
  return client;
}

// INCR + PEXPIRE in one script: a plain INCR-then-PEXPIRE pair can lose the
// expiry (process dies or Redis errors between the two calls), leaving a key
// that counts forever and permanently locks the phone out.
const ATOMIC_INCR = `local c = redis.call('INCR', KEYS[1])
if c == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
return c`;

interface Window {
  count: number;
  resetAt: number;
}

/**
 * Increment `key`'s window and report whether it is now OVER `limit`.
 * Fixed window: attempts while blocked still count but never move `resetAt`,
 * so "try again in an hour" is true no matter how often the user retries.
 * Returns false (allow) on any storage error.
 */
export async function incrAndCheckOverLimit(key: string, limit: number, ttlMs: number): Promise<boolean> {
  const r = redis();
  if (r) {
    try {
      const count = (await r.eval(ATOMIC_INCR, 1, `rate:${key}`, ttlMs)) as number;
      return count > limit;
    } catch (err: any) {
      logger.warn(`rate counter storage error — allowing (fail open): ${err?.message}`);
      return false;
    }
  }
  // In-process fallback (single instance).
  const now = Date.now();
  const entry = local.get<Window>(key);
  if (!entry || now >= entry.resetAt) {
    local.set(key, { count: 1, resetAt: now + ttlMs }, ttlMs);
    return 1 > limit;
  }
  const count = entry.count + 1;
  local.set(key, { count, resetAt: entry.resetAt }, entry.resetAt - now);
  return count > limit;
}

/** Test-only: clear the in-process fallback window between cases. */
export function __resetLocalRateCounter(): void {
  local.invalidatePrefix('');
}
