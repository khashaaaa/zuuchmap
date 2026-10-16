import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { Response } from 'express';
import type { DataSource } from 'typeorm';
import { RedisService } from '../redis/redis.service';

const VERSION = process.env.npm_package_version ?? '0.1.0';

const PROBE_TIMEOUT_MS = 2000;

function within<T>(p: Promise<T>): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error('probe timeout'));
    }, PROBE_TIMEOUT_MS);
  });
  return Promise.race([p, timeout]).finally(() => {
    clearTimeout(timer);
  });
}

type Probe = 'up' | 'down' | 'off';

@Controller('health')
export class HealthController {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly redis: RedisService,
  ) {}

  @Get()
  live(): { ok: true; version: string } {
    return { ok: true, version: VERSION };
  }

  @Get('ready')
  async ready(@Res({ passthrough: true }) res: Response): Promise<{ ok: boolean; db: Probe; redis: Probe }> {
    const db: Probe = await within(this.db.query('SELECT 1')).then(
      () => 'up',
      () => 'down',
    );
    const redis: Probe = !this.redis.configured
      ? 'off'
      : await within(this.redis.ping()).then(
          (ok) => (ok ? 'up' : 'down'),
          () => 'down',
        );
    if (db === 'down' || redis === 'down') {
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
      return { ok: false, db, redis };
    }
    return { ok: true, db, redis };
  }
}
