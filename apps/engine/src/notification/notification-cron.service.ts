import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { APP_TIMEZONE } from '../post/post-expiry.service';
import { RedisService } from '../redis/redis.service';
import { NotificationService } from './notification.service';

/** Every minute: resend what a restart left in the outbox. 03:30 Ulaanbaatar: prune the centre; claimed so one server runs it. */
@Injectable()
export class NotificationCronService {
  private readonly log = new Logger(NotificationCronService.name);

  constructor(
    private readonly notifications: NotificationService,
    private readonly redis: RedisService,
  ) {}

  // Not claimed: each outbox row is claimed on its own, so both servers may sweep.
  @Cron(CronExpression.EVERY_MINUTE)
  async sweep(): Promise<void> {
    try {
      const n = await this.notifications.sweep();
      if (n) this.log.warn(`outbox: resent ${String(n)}`);
    } catch (e) {
      this.log.error(`outbox sweep failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  @Cron('30 3 * * *', { timeZone: APP_TIMEZONE })
  async prune(): Promise<void> {
    try {
      if (!(await this.redis.claimCron(`notifications:prune:${new Date().toISOString().slice(0, 10)}`, 6 * 60 * 60 * 1000))) return;
      const n = await this.notifications.prune();
      if (n) this.log.log(`pruned ${String(n)}`);
    } catch (e) {
      this.log.error(`prune failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}
