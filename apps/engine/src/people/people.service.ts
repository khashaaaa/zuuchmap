import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { toPublicCompany, type CompanyRow } from '../company/company.service';
import { LANDING_REPLY_MIN_THREADS, REPLY_TIME_MIN_THREADS, type PublicUser, type UserType } from '@zuuchmap/core';

/** The window reply time is measured over. */
export const REPLY_WINDOW_DAYS = 30;

interface UserRow {
  id: string;
  type: string;
  parent_name: string | null;
  given_name: string | null;
  profile_picture: string | null;
  is_verified: boolean | null;
  date_created: Date;
}

export interface Trust {
  rating_average: number | null;
  rating_count: number;
  reply_minutes: number | null;
}

/** How much seller trust a mapping carries: none, the rating (list items), or rating and reply time. */
export type TrustLevel = 'none' | 'rating' | 'full';

const round1 = (n: number): number => Math.round(n * 10) / 10;

/**
 * The public face of an account (never its phone or email), its company, and the trust facts the clients show
 * beside it: rating from `reviews`, reply time from `conversations`.
 */
@Injectable()
export class PeopleService {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  async publicUsers(ids: Array<string | null | undefined>, trust: TrustLevel = 'none'): Promise<Map<string, PublicUser>> {
    const unique = [...new Set(ids.filter((x): x is string => typeof x === 'string'))];
    const out = new Map<string, PublicUser>();
    if (unique.length === 0) return out;
    const rows = await this.ds.query<UserRow[]>(
      'SELECT id, type, parent_name, given_name, profile_picture, is_verified, date_created FROM users WHERE id = ANY($1::uuid[])',
      [unique],
    );
    const ratings = trust === 'none' ? new Map<string, Pick<Trust, 'rating_average' | 'rating_count'>>() : await this.ratings(unique);
    const replies = trust === 'full' ? await this.replyMinutes(unique) : new Map<string, number | null>();
    const companies = new Map(
      (await this.ds.query<CompanyRow[]>('SELECT * FROM companies WHERE owner_id = ANY($1::uuid[])', [unique])).map((c) => [c.owner_id, toPublicCompany(c)]),
    );
    for (const u of rows) {
      const user: PublicUser = {
        id: u.id,
        type: u.type as UserType,
        phone_number: null,
        parent_name: u.parent_name,
        given_name: u.given_name,
        email: null,
        profile_picture: u.profile_picture,
        is_verified: u.is_verified,
        date_created: u.date_created.toISOString(),
        company: companies.get(u.id) ?? null,
      };
      if (trust !== 'none') {
        const r = ratings.get(u.id);
        user.rating_average = r?.rating_average ?? null;
        user.rating_count = r?.rating_count ?? 0;
      }
      if (trust === 'full') user.reply_minutes = replies.get(u.id) ?? null;
      out.set(u.id, user);
    }
    return out;
  }

  async publicUser(id: string, trust: TrustLevel = 'none'): Promise<PublicUser | null> {
    return (await this.publicUsers([id], trust)).get(id) ?? null;
  }

  async ratings(ids: string[]): Promise<Map<string, Pick<Trust, 'rating_average' | 'rating_count'>>> {
    const rows = await this.ds.query<Array<{ provider_id: string; avg: string; n: number }>>(
      'SELECT provider_id, AVG(rating) AS avg, COUNT(*)::int AS n FROM reviews WHERE provider_id = ANY($1::uuid[]) GROUP BY provider_id',
      [ids],
    );
    return new Map(rows.map((r) => [r.provider_id, { rating_average: round1(Number(r.avg)), rating_count: r.n }]));
  }

  /**
   * Median minutes from a customer's first message to the provider's first typed reply, over
   * threads opened in the last REPLY_WINDOW_DAYS; null below REPLY_TIME_MIN_THREADS answered
   * threads. Never below one minute, so "replies in 0 minutes" is never shown.
   */
  async replyMinutes(ids: string[], now = new Date()): Promise<Map<string, number | null>> {
    const rows = await this.ds.query<Array<{ provider_id: string; n: number; median: number }>>(
      `SELECT provider_id, COUNT(*)::int AS n,
              percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM first_reply_at - first_customer_at)) AS median
         FROM conversations
        WHERE provider_id = ANY($1::uuid[]) AND first_reply_at IS NOT NULL
          AND first_customer_at > $2::timestamptz - make_interval(days => $3)
        GROUP BY provider_id`,
      [ids, now, REPLY_WINDOW_DAYS],
    );
    return new Map(
      rows.map((r) => [r.provider_id, r.n >= REPLY_TIME_MIN_THREADS ? Math.max(1, Math.round(r.median / 60)) : null]),
    );
  }

  /** The landing counter: median first-reply hours across every provider, LANDING_REPLY_MIN_THREADS threads at least. */
  async landingReplyHours(now = new Date()): Promise<number | null> {
    const rows = await this.ds.query<Array<{ n: number; median: number | null }>>(
      `SELECT COUNT(*)::int AS n,
              percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM first_reply_at - first_customer_at)) AS median
         FROM conversations
        WHERE first_reply_at IS NOT NULL AND first_customer_at > $1::timestamptz - make_interval(days => $2)`,
      [now, REPLY_WINDOW_DAYS],
    );
    const r = rows.at(0);
    if (!r || r.n < LANDING_REPLY_MIN_THREADS || r.median === null) return null;
    return Math.max(1, Math.round(r.median / 3600));
  }
}
