import { Logger } from '@nestjs/common';
import Redis, { RedisOptions } from 'ioredis';

/**
 * Optional Redis, shared across the throttler storage, cross-instance cache
 * invalidation, and the Socket.io adapter.
 *
 * When `REDIS_URL` (or `REDIS_HOST`) is unset the whole app runs exactly as
 * before — in-process throttler storage, per-process cache, single-node
 * sockets. That keeps localhost dev dependency-free. Redis is what lets pm2
 * run more than one instance: without it, rate limits, cache coherence and
 * broadcasts are all per-process (see CLAUDE.md known issues).
 */
const logger = new Logger('Redis');

export function redisEnabled(): boolean {
  return !!(process.env.REDIS_URL || process.env.REDIS_HOST);
}

/**
 * Every client this module hands out, kept so the readiness probe can report
 * on them. The alternative — opening a fresh connection per probe — would make
 * the health check the noisiest Redis client in the process.
 */
const clients = new Map<string, Redis>();

/**
 * Aggregate Redis health for `/engine/health/ready`.
 *
 * "Not configured" is healthy: Redis is optional and its absence just means
 * single-instance mode (see CLAUDE.md known issues). Only a client that was
 * asked for and is not `ready` is a degradation — and ioredis reconnects on
 * its own, so this reports the live status rather than a latched failure.
 */
export function redisStatus(): { ok: boolean; detail?: string } {
  if (!redisEnabled()) return { ok: true, detail: 'not configured' };
  if (clients.size === 0) return { ok: false, detail: 'no client created' };
  const down = [...clients.entries()].filter(([, c]) => c.status !== 'ready');
  if (down.length === 0) return { ok: true };
  return {
    ok: false,
    detail: down.map(([role, c]) => `${role}:${c.status}`).join(', '),
  };
}

function baseOptions(): RedisOptions {
  return {
    // Fail FAST, not open-ended: when Redis is unreachable a command rejects
    // immediately instead of queueing or hanging the request thread. The
    // throttler guard turns that rejection into "allow" (fail open), so a Redis
    // outage degrades rate limiting rather than 500-ing every request.
    // (Verified: with these off, a dead Redis made requests hang 6s / 500.)
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    connectTimeout: 3000,
    retryStrategy: (times) => Math.min(times * 200, 5000),
    lazyConnect: false,
  };
}

/**
 * Build a new Redis client. Each concern that needs its own connection passes
 * a distinct `role` for logging — the Socket.io adapter needs dedicated
 * pub/sub connections, and a blocking subscriber must not share with commands.
 */
export function createRedis(role: string): Redis {
  const opts = baseOptions();
  const client = process.env.REDIS_URL
    ? new Redis(process.env.REDIS_URL, opts)
    : new Redis({
        host: process.env.REDIS_HOST,
        port: Number(process.env.REDIS_PORT ?? 6379),
        password: process.env.REDIS_PASSWORD || undefined,
        ...opts,
      });

  clients.set(role, client);
  client.on('error', (err) => logger.warn(`[${role}] ${err?.message}`));
  client.on('connect', () => logger.log(`[${role}] connected`));
  client.on('reconnecting', () => logger.warn(`[${role}] reconnecting`));
  return client;
}
