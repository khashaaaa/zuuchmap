import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { EXPIRY_WARNING_DAYS } from '@zuuchmap/core';
import { RedisService } from '../redis/redis.service';
import { LISTING_EVENTS, type ListingEventPort } from './listing-events';

export const APP_TIMEZONE = 'Asia/Ulaanbaatar';
const CLAIM_TTL_MS = 6 * 60 * 60 * 1000;

interface Row {
  id: number;
  user_id: string | null;
  title: string | null;
  expires_at?: Date;
}

@Injectable()
export class PostExpiryService {
  private readonly log = new Logger(PostExpiryService.name);

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly redis: RedisService,
    @Inject(LISTING_EVENTS) private readonly events: ListingEventPort,
  ) {}

  /** Marks lapsed listings EXPIRED. Returns how many. Rows are returned by the UPDATE itself. */
  async expireLapsed(now = new Date()): Promise<number> {
    const res = await this.ds.query<[Row[], number] | Row[]>(
      `UPDATE posts SET status = 'EXPIRED'
        WHERE status <> 'EXPIRED' AND deleted_at IS NULL AND is_draft = false
          AND expires_at IS NOT NULL AND expires_at <= $1
        RETURNING id, user_id, title`,
      [now],
    );
    const rows = (Array.isArray(res[0]) ? res[0] : res) as Row[];
    for (const r of rows) this.events.emit({ type: 'listing.expired', post_id: r.id, user_id: r.user_id, title: r.title });
    return rows.length;
  }

  /** One warning per window: stamped by the UPDATE, so a re-run (or a second server) finds nothing. */
  async warnExpiring(now = new Date()): Promise<number> {
    const res = await this.ds.query<[Row[], number] | Row[]>(
      `UPDATE posts SET expiry_warned_at = $1
        WHERE approval_status = 'APPROVED' AND is_draft = false AND deleted_at IS NULL AND status <> 'EXPIRED'
          AND expiry_warned_at IS NULL AND expires_at > $1
          AND expires_at <= $1::timestamptz + make_interval(days => $2)
        RETURNING id, user_id, title, expires_at`,
      [now, EXPIRY_WARNING_DAYS],
    );
    const rows = (Array.isArray(res[0]) ? res[0] : res) as Row[];
    for (const r of rows) {
      const left = Math.max(1, Math.ceil(((r.expires_at?.getTime() ?? now.getTime()) - now.getTime()) / 86_400_000));
      this.events.emit({
        type: 'listing.expiring', post_id: r.id, user_id: r.user_id, title: r.title,
        expires_at: (r.expires_at ?? now).toISOString(), days_left: left,
      });
    }
    return rows.length;
  }

  /** Whichever server claims the day runs it; the others skip. Returns null when skipped. */
  async runExpiry(now = new Date()): Promise<number | null> {
    if (!(await this.redis.claimCron(`post:expire:${now.toISOString().slice(0, 10)}`, CLAIM_TTL_MS))) return null;
    return this.expireLapsed(now);
  }

  async runWarning(now = new Date()): Promise<number | null> {
    if (!(await this.redis.claimCron(`post:warn:${now.toISOString().slice(0, 10)}`, CLAIM_TTL_MS))) return null;
    return this.warnExpiring(now);
  }

  @Cron('0 0 * * *', { timeZone: APP_TIMEZONE })
  async nightlyExpiry(): Promise<void> {
    try {
      const n = await this.runExpiry();
      if (n) this.log.log(`expired ${String(n)} listing(s)`);
    } catch (e) {
      this.log.error(`expiry failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  @Cron('0 1 * * *', { timeZone: APP_TIMEZONE })
  async nightlyWarning(): Promise<void> {
    try {
      const n = await this.runWarning();
      if (n) this.log.log(`warned ${String(n)} listing(s)`);
    } catch (e) {
      this.log.error(`warning failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}
