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

  client.on('error', (err) => logger.warn(`[${role}] ${err?.message}`));
  client.on('connect', () => logger.log(`[${role}] connected`));
  client.on('reconnecting', () => logger.warn(`[${role}] reconnecting`));
  return client;
}
