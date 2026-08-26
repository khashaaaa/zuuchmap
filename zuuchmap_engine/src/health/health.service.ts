import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { redisStatus } from '../utils/redis';

/** A probe must answer fast or it is useless as a probe. */
const DB_PROBE_TIMEOUT_MS = 2000;

type Check = { ok: boolean; detail?: string };

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);
  private readonly startedAt = Date.now();

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  liveness() {
    return {
      status: 'ok',
      uptime_s: Math.round((Date.now() - this.startedAt) / 1000),
      env: process.env.NODE_ENV ?? 'unknown',
    };
  }

  async readiness() {
    const database = await this.checkDatabase();
    const redis = this.checkRedis();

    const ok = database.ok && redis.ok;
    const body = {
      status: ok ? 'ok' : 'degraded',
      uptime_s: Math.round((Date.now() - this.startedAt) / 1000),
      checks: { database, redis },
    };

    // 503, not a 200 with a sad body: uptime monitors and load balancers act on
    // the status code, and most will not parse JSON to find out they should
    // have alerted.
    if (!ok) throw new ServiceUnavailableException(body);
    return body;
  }

  /**
   * `SELECT 1` through the pool — which is the point. A pool that has leaked
   * every connection accepts the query and never returns, so this races the
   * query against a timeout rather than awaiting it, and a hang is reported as
   * a failure instead of hanging the probe too.
   */
  private async checkDatabase(): Promise<Check> {
    if (!this.dataSource.isInitialized)
      return { ok: false, detail: 'not initialized' };
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        this.dataSource.query('SELECT 1'),
        new Promise((_, reject) => {
          timer = setTimeout(
            () => reject(new Error(`timed out after ${DB_PROBE_TIMEOUT_MS}ms`)),
            DB_PROBE_TIMEOUT_MS,
          );
        }),
      ]);
      return { ok: true };
    } catch (err: any) {
      this.logger.warn(`Readiness: database check failed — ${err?.message}`);
      return { ok: false, detail: err?.message ?? 'query failed' };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  /**
   * Redis is optional by design (see CLAUDE.md known issues) — "not configured"
   * is a healthy single-instance deployment, not a degradation. Only a Redis
   * that was asked for and is not connected counts as a failure.
   */
  private checkRedis(): Check {
    return redisStatus();
  }
}
