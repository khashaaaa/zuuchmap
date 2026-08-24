import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';
import * as crypto from 'crypto';
import { createRedis, redisEnabled } from './redis';
import {
  setCacheBroadcaster,
  applyCacheInvalidation,
  CacheInvalidationScope,
} from './cache';

// One warning a minute is enough to see an outage without flooding the log.
const PUBLISH_WARN_INTERVAL_MS = 60_000;

const CHANNEL = 'zuuchmap:cache:invalidate';

/**
 * Cross-instance cache coherence over Redis pub/sub.
 *
 * The cache itself stays a per-process L1 — each instance recomputes a missed
 * read model from Postgres. What must be global is *invalidation*: when one pm2
 * worker approves a post, every other worker has to drop its stale `posts:list`
 * cache. This publishes each local invalidation to a channel and applies
 * inbound ones locally.
 *
 * Without Redis this provider does nothing and the app is single-process, so
 * the in-process cache is already coherent.
 */
@Injectable()
export class CacheCoordinator implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CacheCoordinator.name);
  private pub?: Redis;
  private lastPublishWarnAt = 0;
  private sub?: Redis;
  // Distinguishes our own messages from other instances', so a publish doesn't
  // echo back and re-clear (harmless, but wasteful).
  private readonly originId = crypto.randomUUID();

  onModuleInit(): void {
    if (!redisEnabled()) {
      this.logger.log('Redis not configured — cache invalidation stays process-local');
      return;
    }
    this.pub = createRedis('cache-pub');
    this.sub = createRedis('cache-sub');

    setCacheBroadcaster((scope: CacheInvalidationScope) => {
      // Fire-and-forget: a Redis outage must never block a DB write. But it is
      // not nothing — a publish that never lands leaves every other worker
      // serving a cache this one just invalidated, which is exactly the
      // cross-instance staleness this class exists to prevent. Rate-limited so
      // a sustained outage does not drown the log.
      this.pub?.publish(CHANNEL, `${this.originId}:${scope}`).catch((err) => {
        const now = Date.now();
        if (now - this.lastPublishWarnAt > PUBLISH_WARN_INTERVAL_MS) {
          this.lastPublishWarnAt = now;
          this.logger.warn(
            `Cache invalidation broadcast failed (${scope}): ${err?.message}. `
            + 'Other instances may be serving stale reads.',
          );
        }
      });
    });

    // Subscribe on 'ready', which ioredis emits on the initial connect AND
    // after every reconnect. A one-shot subscribe() would fail silently if
    // Redis were briefly down at boot (offline queue is disabled), leaving
    // this worker serving stale caches with no error ever surfacing again.
    this.sub.on('ready', () => {
      this.sub?.subscribe(CHANNEL).catch((err) =>
        this.logger.warn(`subscribe failed: ${err?.message}`),
      );
    });
    this.sub.on('message', (_channel, message) => {
      const sep = message.indexOf(':');
      if (sep < 0) return;
      const origin = message.slice(0, sep);
      const scope = message.slice(sep + 1) as CacheInvalidationScope;
      if (origin === this.originId) return; // our own echo
      // apply-only (never re-broadcast) — avoids a publish loop.
      applyCacheInvalidation(scope);
    });
    this.logger.log('Cross-instance cache invalidation active');
  }

  onModuleDestroy(): void {
    setCacheBroadcaster(() => {});
    this.pub?.disconnect();
    this.sub?.disconnect();
  }
}
