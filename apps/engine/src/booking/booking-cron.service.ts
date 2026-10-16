import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { RedisService } from '../redis/redis.service';
import { APP_TIMEZONE } from '../post/post-expiry.service';
import { BookingService } from './booking.service';

const CLAIM_TTL_MS = 6 * 60 * 60 * 1000;

/** Booking jobs, each claimed per day so one server runs it. */
@Injectable()
export class BookingCronService {
  private readonly log = new Logger(BookingCronService.name);

  constructor(
    private readonly bookings: BookingService,
    private readonly redis: RedisService,
  ) {}

  private async run(name: string, job: () => Promise<number>): Promise<void> {
    try {
      if (!(await this.redis.claimCron(`booking:${name}:${new Date().toISOString().slice(0, 13)}`, CLAIM_TTL_MS))) return;
      const n = await job();
      if (n) this.log.log(`${name}: ${String(n)}`);
    } catch (e) {
      this.log.error(`${name} failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  @Cron('5 0 * * *', { timeZone: APP_TIMEZONE })
  expire(): Promise<void> {
    return this.run('expire', () => this.bookings.expireStale());
  }

  @Cron('0 1 * * *', { timeZone: APP_TIMEZONE })
  reviewPrompts(): Promise<void> {
    return this.run('review-prompt', () => this.bookings.promptReviews());
  }

  /** The evening before: 18:00 in Ulaanbaatar. */
  @Cron('0 18 * * *', { timeZone: APP_TIMEZONE })
  reminders(): Promise<void> {
    return this.run('remind', () => this.bookings.remindTomorrow());
  }
}
