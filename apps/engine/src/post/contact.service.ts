import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager } from 'typeorm';
import type { ContactKind, ListingPerformance, ListingPerformanceDetail, MyPerformance, PerformanceWindow } from '@zuuchmap/core';
import type { RequestUser } from '../auth/request-user';
import { ulaanbaatarDate } from './availability.service';

/** The provider's performance window, and the default of `GET /posts/mine/performance`. */
export const PERFORMANCE_DAYS = 7;

interface WindowRow {
  post_id: number;
  title: string | null;
  views: number;
  saves: number;
  contacts: number;
  booking_requests: number;
  views_prev: number;
  saves_prev: number;
  contacts_prev: number;
  booking_requests_prev: number;
}

const zero = (): PerformanceWindow => ({ views: 0, saves: 0, contacts: 0, booking_requests: 0 });
const add = (a: PerformanceWindow, b: PerformanceWindow): PerformanceWindow => ({
  views: a.views + b.views, saves: a.saves + b.saves, contacts: a.contacts + b.contacts, booking_requests: a.booking_requests + b.booking_requests,
});
const toPerformance = (r: WindowRow): ListingPerformance => ({
  id: r.post_id,
  title: r.title,
  current: { views: r.views, saves: r.saves, contacts: r.contacts, booking_requests: r.booking_requests },
  previous: { views: r.views_prev, saves: r.saves_prev, contacts: r.contacts_prev, booking_requests: r.booking_requests_prev },
});

/**
 * Contacts (a call, a Чат opened, a booking requested) and the windows a provider's performance
 * reads: counted views, saves, contacts and booking requests over the last `days` days against
 * the `days` before. The owner never counts as their own contact.
 */
/** Distinct anonymous devices one address may add per listing per kind per day. */
const ANON_CONTACTS_PER_IP_PER_DAY = 5;

@Injectable()
export class ContactService {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  /**
   * One per viewer per kind per Ulaanbaatar day. `viewer` is the account id when signed in,
   * else the hashed device key; with neither the contact cannot be deduped and is dropped.
   * Anonymous contacts are also capped per address (`ipKey`): a device id is the client's to rotate.
   */
  async record(postId: number, kind: ContactKind, userId: string | null, visitorKey: string | null, em?: EntityManager, ipKey: string | null = null): Promise<boolean> {
    const viewer = userId ?? visitorKey;
    if (!viewer) return false;
    const ip = userId ? null : ipKey;
    const rows = await (em ?? this.ds.manager).query<unknown[]>(
      `INSERT INTO post_contacts (post_id, user_id, viewer, kind, day, ip_key)
       SELECT p.id, $2::uuid, $3::varchar, $4::varchar, $5::date, $6::varchar FROM posts p
        WHERE p.id = $1 AND p.deleted_at IS NULL AND p.user_id IS DISTINCT FROM $2::uuid
          AND ($6::varchar IS NULL OR (
            SELECT COUNT(*) FROM post_contacts c WHERE c.post_id = $1 AND c.kind = $4::varchar AND c.ip_key = $6::varchar AND c.day = $5::date
          ) < $7)
       ON CONFLICT DO NOTHING RETURNING id`,
      [postId, userId, viewer, kind, ulaanbaatarDate(), ip, ANON_CONTACTS_PER_IP_PER_DAY],
    );
    return rows.length > 0;
  }

  /** Lifetime contacts per listing. */
  async lifetime(postIds: number[]): Promise<Map<number, number>> {
    if (!postIds.length) return new Map();
    const rows = await this.ds.query<Array<{ post_id: number; n: number }>>(
      'SELECT post_id, COUNT(*)::int AS n FROM post_contacts WHERE post_id = ANY($1::int[]) GROUP BY post_id',
      [postIds],
    );
    return new Map(rows.map((r) => [r.post_id, r.n]));
  }

  private windows(where: string, params: unknown[], days: number, now: Date): Promise<WindowRow[]> {
    const i = params.length;
    return this.ds.query<WindowRow[]>(
      `WITH b AS (SELECT $${String(i + 1)}::timestamptz AS now, make_interval(days => $${String(i + 2)}) AS span)
       SELECT p.id AS post_id, p.title,
         (SELECT COUNT(*) FROM post_views v, b WHERE v.post_id = p.id AND v.counted AND v.date_viewed > b.now - b.span)::int AS views,
         (SELECT COUNT(*) FROM post_likes l, b WHERE l.post_id = p.id AND l.created_at > b.now - b.span)::int AS saves,
         (SELECT COUNT(*) FROM post_contacts c, b WHERE c.post_id = p.id AND c.created_at > b.now - b.span)::int AS contacts,
         (SELECT COUNT(*) FROM bookings k, b WHERE k.post_id = p.id AND k.date_created > b.now - b.span)::int AS booking_requests,
         (SELECT COUNT(*) FROM post_views v, b WHERE v.post_id = p.id AND v.counted AND v.date_viewed > b.now - 2 * b.span AND v.date_viewed <= b.now - b.span)::int AS views_prev,
         (SELECT COUNT(*) FROM post_likes l, b WHERE l.post_id = p.id AND l.created_at > b.now - 2 * b.span AND l.created_at <= b.now - b.span)::int AS saves_prev,
         (SELECT COUNT(*) FROM post_contacts c, b WHERE c.post_id = p.id AND c.created_at > b.now - 2 * b.span AND c.created_at <= b.now - b.span)::int AS contacts_prev,
         (SELECT COUNT(*) FROM bookings k, b WHERE k.post_id = p.id AND k.date_created > b.now - 2 * b.span AND k.date_created <= b.now - b.span)::int AS booking_requests_prev
       FROM posts p WHERE ${where}`,
      [...params, now, days],
    );
  }

  /** `GET /posts/mine/performance`: every listing of the caller's that is not deleted or a draft, busiest first. */
  async mine(me: RequestUser, days = PERFORMANCE_DAYS, now = new Date()): Promise<MyPerformance> {
    const rows = await this.windows('p.user_id = $1 AND p.deleted_at IS NULL AND p.is_draft = false', [me.id], days, now);
    const posts = rows.map(toPerformance).sort((a, b) => b.current.views - a.current.views || b.current.contacts - a.current.contacts || a.id - b.id);
    return {
      days,
      totals: { current: posts.reduce((t, p) => add(t, p.current), zero()), previous: posts.reduce((t, p) => add(t, p.previous), zero()) },
      posts,
    };
  }

  /** `GET /posts/:id/performance`: the owner's E6. */
  async one(me: RequestUser, id: number, days = PERFORMANCE_DAYS, now = new Date()): Promise<ListingPerformanceDetail> {
    const owner = await this.ds.query<Array<{ user_id: string | null; expires_at: Date | null }>>(
      'SELECT user_id, expires_at FROM posts WHERE id = $1 AND deleted_at IS NULL',
      [id],
    );
    const p = owner.at(0);
    if (!p) throw new NotFoundException({ message: 'Listing not found', code: 'POST_NOT_FOUND' });
    if (p.user_id !== me.id && !me.is_admin) throw new ForbiddenException({ message: 'Not your listing', code: 'NOT_POST_OWNER' });
    const [row] = await this.windows('p.id = $1', [id], days, now);
    const pending = await this.ds.query<Array<{ n: number }>>(`SELECT COUNT(*)::int AS n FROM bookings WHERE post_id = $1 AND status = 'PENDING'`, [id]);
    return {
      ...toPerformance(row),
      days,
      pending_requests: pending[0]?.n ?? 0,
      days_left: p.expires_at ? Math.max(0, Math.ceil((p.expires_at.getTime() - now.getTime()) / 86_400_000)) : null,
    };
  }
}
