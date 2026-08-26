import { Controller, Get, Header } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { HealthService } from './health.service';

/**
 * Liveness and readiness probes.
 *
 * `@SkipThrottle()` on the whole controller: an uptime monitor polls on a fixed
 * interval from one IP, and the global 100/min bucket would eventually 429 it —
 * which the monitor would report as an outage that isn't one.
 *
 * `no-store` on both: a cache in front of the engine returning a stale "ok"
 * would defeat the entire point of the probe.
 */
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  /**
   * Liveness — "is this process running and able to answer". Touches nothing
   * external on purpose: pm2 and nginx use this to decide whether to restart,
   * and a DB blip must not trigger a restart loop that cannot fix it.
   */
  @Get()
  @Header('Cache-Control', 'no-store')
  live() {
    return this.health.liveness();
  }

  /**
   * Readiness — "can this process actually serve requests". Checks the DB (and
   * Redis when configured) and answers 503 when a dependency is down, which is
   * the state pm2 cannot see: the process is up, the pool is dead, and every
   * real route 500s. That was the shape of the 9-day 502.
   */
  @Get('ready')
  @Header('Cache-Control', 'no-store')
  ready() {
    return this.health.readiness();
  }
}
