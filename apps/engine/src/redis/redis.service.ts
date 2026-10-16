import { Inject, Injectable, Logger, type OnApplicationShutdown } from '@nestjs/common';
import Redis from 'ioredis';

export const REDIS_URL = Symbol('REDIS_URL');

@Injectable()
export class RedisService implements OnApplicationShutdown {
  private readonly log = new Logger(RedisService.name);
  private readonly client?: Redis;
  private readonly memory = new Map<string, number>(); // key -> expiry epoch ms
  private readonly windows = new Map<string, { count: number; resetAt: number }>();

  constructor(@Inject(REDIS_URL) url: string | undefined) {
    if (url) {
      this.client = new Redis(url, { maxRetriesPerRequest: 2, lazyConnect: false });
      this.client.on('error', (err: Error) => {
        this.log.warn(`redis: ${err.message}`);
      });
    } else {
      this.log.warn('REDIS_URL unset: using in-memory fallback (single instance only)');
    }
  }

  get configured(): boolean {
    return this.client !== undefined;
  }

  async ping(): Promise<boolean> {
    if (!this.client) return true;
    const reply: string = await this.client.ping();
    return reply === 'PONG';
  }

  /**
   * A TTL claim, not a lock: true when this caller won, and others skip until `ttlMs`
   * lapses. A job that runs longer than its TTL can overlap with the next claimer, so
   * pick a TTL comfortably above the job's worst-case runtime.
   */
  async claimCron(name: string, ttlMs: number): Promise<boolean> {
    const key = `cron:${name}`;
    if (this.client) {
      return (await this.client.set(key, '1', 'PX', ttlMs, 'NX')) === 'OK';
    }
    const now = Date.now();
    const until = this.memory.get(key);
    if (until !== undefined && until > now) return false;
    this.memory.set(key, now + ttlMs);
    return true;
  }

  /**
   * Fixed-window counter: increments `key` and returns the new count. The window
   * starts at the first hit and is never extended by later ones. Fails open
   * (returns 0) when Redis errors, so an abuse counter never blocks a real user.
   */
  async hit(key: string, ttlMs: number): Promise<number> {
    if (this.client) {
      try {
        // INCR + PEXPIRE in one script: a lost expiry would lock the key forever.
        const n = await this.client.eval(
          "local c = redis.call('INCR', KEYS[1]) if c == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end return c",
          1,
          `hit:${key}`,
          ttlMs,
        );
        return Number(n);
      } catch (err) {
        this.log.warn(`redis hit failed, allowing: ${err instanceof Error ? err.message : String(err)}`);
        return 0;
      }
    }
    const now = Date.now();
    const w = this.windows.get(key);
    if (!w || w.resetAt <= now) {
      this.windows.set(key, { count: 1, resetAt: now + ttlMs });
      return 1;
    }
    w.count += 1;
    return w.count;
  }

  // After every `beforeApplicationShutdown`: the notification drain still uses Redis.
  async onApplicationShutdown(): Promise<void> {
    if (this.client) await this.client.quit();
  }
}
