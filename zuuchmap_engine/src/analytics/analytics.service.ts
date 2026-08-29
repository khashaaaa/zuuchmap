import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, LessThan } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { sharedCache } from '../utils/cache';
import { AnalyticsEvent } from './entities/analytics-event.entity';
import { User } from '../user/entities/user.entity';
import { APP_TIMEZONE } from '../utils/timezone';

const SUMMARY_TTL = 60_000;
/** Drop raw events after this long — aggregates are what matter long-term. */
const RETENTION_DAYS = Number(process.env.ANALYTICS_RETENTION_DAYS) || 180;
const MAX_BATCH = 50;

export interface IncomingEvent {
  name: string;
  path?: string;
  referrer?: string;
  platform?: string;
  props?: Record<string, unknown>;
  occurred_at?: string;
}

interface DailyPoint {
  day: string;
  value: number;
}

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);
  private readonly cache = sharedCache;

  constructor(
    @InjectRepository(AnalyticsEvent)
    private readonly eventRepository: Repository<AnalyticsEvent>,
    private readonly dataSource: DataSource,
  ) {}

  async collect(
    events: IncomingEvent[],
    anonId: string | undefined,
    userId: string | undefined,
  ): Promise<number> {
    if (!Array.isArray(events) || events.length === 0) return 0;

    const rows = events
      .slice(0, MAX_BATCH)
      .filter((e) => typeof e?.name === 'string' && e.name.length <= 80)
      .map((e) =>
        this.eventRepository.create({
          name: e.name,
          anon_id: anonId?.slice(0, 64),
          path: e.path?.slice(0, 255),
          referrer: e.referrer?.slice(0, 255),
          platform: e.platform?.slice(0, 32),
          props: e.props && typeof e.props === 'object' ? e.props : undefined,
          user: userId ? { id: userId } : undefined,
          // Client clocks lie; never let one write the future or ancient history.
          occurred_at: this.safeTimestamp(e.occurred_at),
        }),
      );

    if (!rows.length) return 0;
    // The endpoint returns 202 — don't make the client wait on the inserts.
    this.eventRepository
      .save(rows)
      .catch((err) =>
        this.logger.warn(`collect insert failed: ${err?.message}`),
      );
    return rows.length;
  }

  /**
   * Server-side event write (search instrumentation etc.). Fire-and-forget:
   * recording must never slow down or fail the request that triggered it.
   */
  record(name: string, props: Record<string, unknown>): void {
    this.eventRepository
      .save(
        this.eventRepository.create({
          name,
          platform: 'server',
          props,
          occurred_at: new Date(),
        }),
      )
      .catch((err) =>
        this.logger.warn(`record(${name}) failed: ${err?.message}`),
      );
  }

  private safeTimestamp(raw?: string): Date {
    const now = Date.now();
    if (!raw) return new Date(now);
    const parsed = Date.parse(raw);
    if (Number.isNaN(parsed)) return new Date(now);
    if (parsed > now + 60_000 || parsed < now - 7 * 24 * 60 * 60 * 1000)
      return new Date(now);
    return new Date(parsed);
  }

  /**
   * Everything the admin dashboard charts, in one round of queries.
   *
   * Business counts come from the domain tables (so they are correct for data
   * that predates analytics); engagement and funnel come from the event log.
   */
  async summary(days: number): Promise<Record<string, unknown>> {
    const window = Math.min(Math.max(days || 30, 1), 365);
    const key = `analytics:summary:${window}`;
    const cached = this.cache.get<Record<string, unknown>>(key);
    if (cached) return cached;

    const since = new Date(Date.now() - window * 24 * 60 * 60 * 1000);
    const q = (sql: string, params: unknown[] = []) =>
      this.dataSource.query(sql, params);

    const [
      signupSeries,
      postSeries,
      bookingSeries,
      activeSeries,
      totals,
      categoryMix,
      provinceMix,
      funnel,
      topPosts,
      statusMix,
      clientErrors,
      searchGaps,
    ] = await Promise.all([
      q(
        `SELECT to_char(date_trunc('day', date_created), 'YYYY-MM-DD') AS day, COUNT(*)::int AS value
         FROM "user" WHERE date_created >= $1 GROUP BY 1 ORDER BY 1`,
        [since],
      ),

      q(
        `SELECT to_char(date_trunc('day', date_created), 'YYYY-MM-DD') AS day,
                COUNT(*) FILTER (WHERE approval_status = 'APPROVED')::int AS approved,
                COUNT(*) FILTER (WHERE approval_status = 'PENDING')::int AS pending,
                COUNT(*) FILTER (WHERE approval_status = 'REJECTED')::int AS rejected,
                COUNT(*)::int AS total
         FROM "post" WHERE date_created >= $1 GROUP BY 1 ORDER BY 1`,
        [since],
      ),

      q(
        `SELECT to_char(date_trunc('day', date_created), 'YYYY-MM-DD') AS day,
                COUNT(*)::int AS created,
                COUNT(*) FILTER (WHERE status = 'ACCEPTED')::int AS accepted
         FROM "booking" WHERE date_created >= $1 GROUP BY 1 ORDER BY 1`,
        [since],
      ),

      q(
        `SELECT to_char(date_trunc('day', occurred_at), 'YYYY-MM-DD') AS day,
                COUNT(DISTINCT COALESCE("userId"::text, anon_id))::int AS value
         FROM "analytics_event" WHERE occurred_at >= $1 GROUP BY 1 ORDER BY 1`,
        [since],
      ),

      q(`SELECT
           (SELECT COUNT(*)::int FROM "user") AS users,
           (SELECT COUNT(*)::int FROM "user" WHERE type = 'PROVIDER') AS providers,
           (SELECT COUNT(*)::int FROM "user" WHERE type = 'CUSTOMER') AS customers,
           (SELECT COUNT(*)::int FROM "post") AS posts,
           (SELECT COUNT(*)::int FROM "post" WHERE approval_status = 'APPROVED') AS approved_posts,
           (SELECT COUNT(*)::int FROM "post" WHERE approval_status = 'PENDING') AS pending_posts,
           (SELECT COALESCE(SUM(views), 0)::int FROM "post") AS post_views,
           (SELECT COUNT(*)::int FROM "booking") AS bookings,
           (SELECT COUNT(*)::int FROM "booking" WHERE status = 'ACCEPTED') AS accepted_bookings`),

      q(`SELECT category AS key, COUNT(*)::int AS posts, COALESCE(SUM(views), 0)::int AS views
         FROM "post" WHERE approval_status = 'APPROVED'
         GROUP BY 1 ORDER BY posts DESC`),

      q(`SELECT COALESCE(province, 'unknown') AS key, COUNT(*)::int AS posts
         FROM "post" WHERE approval_status = 'APPROVED'
         GROUP BY 1 ORDER BY posts DESC`),

      q(
        `SELECT name, COUNT(DISTINCT COALESCE("userId"::text, anon_id))::int AS people
         FROM "analytics_event"
         WHERE occurred_at >= $1
           AND name IN ('page.view','browse.search','post.detail.view','auth.start',
                        'auth.verified','post.create.started','post.create.submitted',
                        'booking.requested','contact.revealed')
         GROUP BY 1`,
        [since],
      ),

      q(`SELECT p.id, p.title, p.category, p.views
         FROM "post" p WHERE p.approval_status = 'APPROVED'
         ORDER BY p.views DESC NULLS LAST LIMIT 10`),

      q(`SELECT COALESCE(status, 'UNKNOWN') AS key, COUNT(*)::int AS value
         FROM "post" WHERE approval_status = 'APPROVED' GROUP BY 1`),

      // Client crash log. Grouped by message so one recurring bug is one row,
      // not a thousand — this is the only place a phone-side crash is visible.
      q(
        `SELECT COALESCE(props->>'message', 'unknown') AS message,
                COALESCE(platform, 'unknown') AS platform,
                COUNT(*)::int AS count,
                COUNT(DISTINCT COALESCE("userId"::text, anon_id))::int AS people,
                to_char(MAX(occurred_at), 'YYYY-MM-DD HH24:MI') AS last_seen
         FROM "analytics_event"
         WHERE occurred_at >= $1 AND name = 'client.error'
         GROUP BY 1, 2 ORDER BY count DESC LIMIT 20`,
        [since],
      ),

      // Demand-gap radar: what people searched for and how much supply answered.
      // Zero-result searches ranked first — that's where providers are missing.
      q(
        `SELECT COALESCE(NULLIF(props->>'q', ''), '—') AS q,
                COALESCE(NULLIF(props->>'category', ''), 'all') AS category,
                COALESCE(NULLIF(props->>'province', ''), 'all') AS province,
                COUNT(*)::int AS searches,
                COUNT(*) FILTER (WHERE (props->>'total')::int = 0)::int AS zero_results,
                ROUND(AVG((props->>'total')::int))::int AS avg_results
         FROM "analytics_event"
         WHERE occurred_at >= $1 AND name = 'search.performed'
           AND props ? 'total'
         GROUP BY 1, 2, 3
         ORDER BY zero_results DESC, searches DESC LIMIT 30`,
        [since],
      ),
    ]);

    const funnelMap: Record<string, number> = {};
    for (const row of funnel) funnelMap[row.name] = Number(row.people);

    const result = {
      window_days: window,
      generated_at: new Date().toISOString(),
      totals: totals[0] ?? {},
      series: {
        signups: this.fill(signupSeries as DailyPoint[], window),
        active_people: this.fill(activeSeries as DailyPoint[], window),
        posts: postSeries,
        bookings: bookingSeries,
      },
      breakdowns: {
        categories: categoryMix,
        provinces: provinceMix,
        rental_status: statusMix,
      },
      funnel: {
        visited: funnelMap['page.view'] ?? 0,
        searched: funnelMap['browse.search'] ?? 0,
        viewed_post: funnelMap['post.detail.view'] ?? 0,
        started_auth: funnelMap['auth.start'] ?? 0,
        verified: funnelMap['auth.verified'] ?? 0,
        started_post: funnelMap['post.create.started'] ?? 0,
        submitted_post: funnelMap['post.create.submitted'] ?? 0,
        requested_booking: funnelMap['booking.requested'] ?? 0,
        revealed_contact: funnelMap['contact.revealed'] ?? 0,
      },
      top_posts: topPosts,
      client_errors: clientErrors,
      search_gaps: searchGaps,
    };

    this.cache.set(key, result, SUMMARY_TTL);
    return result;
  }

  /** Pads missing days with zero so charts show real gaps rather than skipping them. */
  private fill(rows: DailyPoint[], days: number): DailyPoint[] {
    const byDay = new Map(rows.map((r) => [r.day, Number(r.value)]));
    const out: DailyPoint[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      const key = d.toISOString().slice(0, 10);
      out.push({ day: key, value: byDay.get(key) ?? 0 });
    }
    return out;
  }

  @Cron(CronExpression.EVERY_DAY_AT_4AM, { timeZone: APP_TIMEZONE })
  async prune(): Promise<void> {
    try {
      const cutoff = new Date(
        Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000,
      );
      const { affected } = await this.eventRepository.delete({
        occurred_at: LessThan(cutoff),
      });
      if (affected)
        this.logger.log(
          `Pruned ${affected} analytics events older than ${RETENTION_DAYS}d.`,
        );
    } catch (err) {
      this.logger.error(`prune failed: ${err?.message}`);
    }
  }
}
