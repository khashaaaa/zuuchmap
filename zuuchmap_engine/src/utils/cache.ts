/**
 * Minimal in-memory TTL cache for reducing repetitive DB queries.
 * Keys expire after `ttl` milliseconds. No external dependencies.
 *
 * Bounded: expired entries are swept opportunistically and the store is capped
 * so attacker-controlled keys (e.g. list-cache keys minted from query params)
 * cannot grow memory without limit. Eviction is oldest-inserted-first, which
 * is close enough to LRU for short-TTL read caches.
 */
export class SimpleCache {
  private store = new Map<string, { value: unknown; expiresAt: number }>();
  private setsSinceSweep = 0;

  constructor(private readonly maxEntries = 1000) {}

  get<T>(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value as T;
  }

  set(key: string, value: unknown, ttlMs: number): void {
    if (++this.setsSinceSweep >= 100) this.sweep();
    if (this.store.size >= this.maxEntries && !this.store.has(key)) {
      this.sweep();
      // Still full after dropping expired entries — evict the oldest.
      if (this.store.size >= this.maxEntries) {
        const oldest = this.store.keys().next().value;
        if (oldest !== undefined) this.store.delete(oldest);
      }
    }
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  del(key: string): void {
    this.store.delete(key);
  }

  /** Delete all keys that start with `prefix`. */
  invalidatePrefix(prefix: string): void {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) this.store.delete(key);
    }
  }

  private sweep(): void {
    this.setsSinceSweep = 0;
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (now > entry.expiresAt) this.store.delete(key);
    }
  }
}

/**
 * Shared instance for post-derived read models (post lists, map, public stats,
 * admin stats, category schemas). Services used to hold private instances,
 * which made cross-service invalidation impossible — an admin approval could
 * not clear PostService's list caches. Key namespaces: `posts:*`, `admin:*`,
 * `categor*`.
 */
export const sharedCache = new SimpleCache();

// ─── Cross-instance invalidation ────────────────────────────────────────────
// The cache stays a per-process L1 (reads are synchronous, no async rewrite of
// every call site). Only *invalidation events* need to be global: when one pm2
// instance approves a post, the others must drop their stale list caches too.
// A Redis pub/sub broadcaster is injected at boot (CacheCoordinator); with no
// Redis it stays a no-op and behaviour is exactly single-process.

export type CacheInvalidationScope = 'post' | 'category';

let broadcast: (scope: CacheInvalidationScope) => void = () => {};

/** Wired by CacheCoordinator when Redis is enabled. */
export function setCacheBroadcaster(fn: (scope: CacheInvalidationScope) => void): void {
  broadcast = fn;
}

/** Local-only clear — used both by the local write path and the Redis subscriber. */
export function applyCacheInvalidation(scope: CacheInvalidationScope): void {
  if (scope === 'post') {
    sharedCache.invalidatePrefix('posts:list:');
    sharedCache.del('posts:map');
    sharedCache.del('posts:public-stats');
    sharedCache.del('admin:stats');
  } else if (scope === 'category') {
    sharedCache.del('categories');
    sharedCache.invalidatePrefix('category:');
  }
}

/**
 * Every post write (create/update/delete/approve/reject/expire) must clear all
 * derived read models, wherever they are served from — locally and on every
 * other instance. One helper so a new cached view can't be forgotten.
 */
export function invalidatePostReadCaches(): void {
  applyCacheInvalidation('post');
  broadcast('post');
}

/** Category schema writes — clear the category caches everywhere. */
export function invalidateCategoryCaches(): void {
  applyCacheInvalidation('category');
  broadcast('category');
}
