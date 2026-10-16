import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager } from 'typeorm';
import type { AvailabilityResponse, BlockDaysResponse, BusyKind, BusyRange } from '@zuuchmap/core';
import type { RequestUser } from '../auth/request-user';
import { APP_TIMEZONE } from './post-expiry.service';

/** Days of busy dates a list item carries (`busy_dates`). */
export const BUSY_DATES_DAYS = 14;
/** Longest range one request may ask about or block. */
export const MAX_RANGE_DAYS = 366;
/** Default availability window a calendar asks for. */
export const DEFAULT_WINDOW_DAYS = 90;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

const dayUtc = (s: string): number => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
const isRealDate = (s: string): boolean => {
  if (!DATE_RE.test(s)) return false;
  const d = new Date(dayUtc(s));
  return d.toISOString().slice(0, 10) === s;
};

/** `YYYY-MM-DD` both ends, start ≤ end, at most MAX_RANGE_DAYS; anything else is 400 INVALID_DATE_RANGE. */
export function assertDateRange(start: string, end: string): void {
  if (!isRealDate(start) || !isRealDate(end) || dayUtc(end) < dayUtc(start) || (dayUtc(end) - dayUtc(start)) / DAY_MS >= MAX_RANGE_DAYS) {
    throw new BadRequestException({ message: 'Invalid date range', code: 'INVALID_DATE_RANGE' });
  }
}

/** `YYYY-MM-DD` plus `days`. */
export const addDays = (s: string, days: number): string => new Date(dayUtc(s) + days * DAY_MS).toISOString().slice(0, 10);

/** Today in Ulaanbaatar as `YYYY-MM-DD`, plus `days`. */
export function ulaanbaatarDate(days = 0, now = new Date()): string {
  // +08:00 all year (Mongolia dropped DST in 2017).
  return new Date(now.getTime() + 8 * 3_600_000 + days * DAY_MS).toISOString().slice(0, 10);
}

interface BusyRow {
  id: number;
  post_id: number;
  start_date: string;
  end_date: string;
  kind: BusyKind;
}

/** Postgres stores a daterange half-open; `lower`/`upper - 1` give the inclusive days back. */
const BUSY_SELECT = `SELECT b.id, b.post_id, to_char(lower(b.days), 'YYYY-MM-DD') AS start_date,
  to_char(upper(b.days) - 1, 'YYYY-MM-DD') AS end_date, b.kind FROM post_busy b`;

const toRange = (r: BusyRow): BusyRange => ({ id: r.id, start_date: r.start_date, end_date: r.end_date, kind: r.kind });

/**
 * The days a listing is not free: BOOKED rows written by accepted bookings (phase 5), BLOCKED
 * rows by the provider. Browse's dates filter reads the same table (`PostService`).
 */
@Injectable()
export class AvailabilityService {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  /** Busy ranges overlapping the window, oldest first. */
  async busy(postId: number, from?: string, to?: string): Promise<AvailabilityResponse> {
    const start = from ?? ulaanbaatarDate();
    const end = to ?? ulaanbaatarDate(DEFAULT_WINDOW_DAYS);
    assertDateRange(start, end);
    const rows = await this.ds.query<BusyRow[]>(
      `${BUSY_SELECT} WHERE b.post_id = $1 AND b.days && daterange($2::date, $3::date, '[]') ORDER BY lower(b.days), b.id`,
      [postId, start, end],
    );
    return { busy: rows.map(toRange) };
  }

  /** `post id → busy days (YYYY-MM-DD)` over the next BUSY_DATES_DAYS, for list items. */
  async busyDatesFor(postIds: number[], now = new Date()): Promise<Map<number, string[]>> {
    const out = new Map<number, string[]>();
    if (postIds.length === 0) return out;
    const start = ulaanbaatarDate(0, now);
    const end = ulaanbaatarDate(BUSY_DATES_DAYS - 1, now);
    const rows = await this.ds.query<Array<{ post_id: number; day: string }>>(
      `SELECT DISTINCT b.post_id, to_char(d, 'YYYY-MM-DD') AS day
         FROM post_busy b, generate_series(GREATEST(lower(b.days), $2::date), LEAST(upper(b.days) - 1, $3::date), '1 day') AS d
        WHERE b.post_id = ANY($1::int[]) AND b.days && daterange($2::date, $3::date, '[]')
        ORDER BY b.post_id, day`,
      [postIds, start, end],
    );
    for (const r of rows) {
      const list = out.get(r.post_id) ?? [];
      list.push(r.day);
      out.set(r.post_id, list);
    }
    return out;
  }

  /** One BLOCKED range on several of the caller's listings; a listing that is not theirs refuses the whole request. */
  async block(me: RequestUser, postIds: number[], start: string, end: string): Promise<BlockDaysResponse> {
    assertDateRange(start, end);
    const ids = [...new Set(postIds)];
    const owned = await this.ds.query<Array<{ id: number; user_id: string | null }>>(
      'SELECT id, user_id FROM posts WHERE id = ANY($1::int[]) AND deleted_at IS NULL',
      [ids],
    );
    if (owned.length !== ids.length) throw new NotFoundException({ message: 'Listing not found', code: 'POST_NOT_FOUND' });
    if (owned.some((p) => p.user_id !== me.id)) throw new ForbiddenException({ message: 'Not your listing', code: 'NOT_POST_OWNER' });
    const rows = await this.ds.query<BusyRow[]>(
      `WITH ins AS (
         INSERT INTO post_busy (post_id, user_id, kind, days)
         SELECT id, $2::uuid, 'BLOCKED', daterange($3::date, $4::date, '[]') FROM unnest($1::int[]) AS id
         RETURNING *
       ) SELECT ins.id, ins.post_id, to_char(lower(ins.days), 'YYYY-MM-DD') AS start_date,
                to_char(upper(ins.days) - 1, 'YYYY-MM-DD') AS end_date, ins.kind FROM ins ORDER BY ins.post_id`,
      [ids, me.id, start, end],
    );
    return { blocked: rows.map((r) => ({ ...toRange(r), post_id: r.post_id })) };
  }

  /** Removes one BLOCKED range of the caller's; BOOKED rows belong to their booking. */
  async unblock(me: RequestUser, id: number): Promise<{ ok: true }> {
    const rows = await this.ds.query<Array<{ user_id: string | null; kind: BusyKind }>>(
      'SELECT p.user_id, b.kind FROM post_busy b JOIN posts p ON p.id = b.post_id WHERE b.id = $1',
      [id],
    );
    const row = rows.at(0);
    if (!row) throw new NotFoundException({ message: 'Range not found', code: 'POST_NOT_FOUND' });
    if (row.user_id !== me.id) throw new ForbiddenException({ message: 'Not your listing', code: 'NOT_POST_OWNER' });
    if (row.kind !== 'BLOCKED') throw new BadRequestException({ message: 'A booked range is released by its booking', code: 'POST_HAS_LIVE_BOOKING' });
    await this.ds.query('DELETE FROM post_busy WHERE id = $1', [id]);
    return { ok: true };
  }

  /**
   * Marks a range BOOKED for a booking (phase 5 calls this inside the accept transaction).
   * The exclusion constraint turns a concurrent overlapping accept into a unique-violation,
   * surfaced as BOOKING_OVERLAP.
   */
  async book(em: EntityManager, postId: number, bookingId: number, start: string, end: string): Promise<void> {
    assertDateRange(start, end);
    try {
      await em.query(
        `INSERT INTO post_busy (post_id, kind, booking_id, days) VALUES ($1, 'BOOKED', $2, daterange($3::date, $4::date, '[]'))`,
        [postId, bookingId, start, end],
      );
    } catch (e) {
      if ((e as { code?: string }).code === '23P01') {
        throw new BadRequestException({ message: 'Those days overlap an accepted booking', code: 'BOOKING_OVERLAP' });
      }
      throw e;
    }
  }

  /** The timezone every date in this table is read in. */
  static readonly TIMEZONE = APP_TIMEZONE;
}
