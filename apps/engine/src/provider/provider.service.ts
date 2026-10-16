import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { EXPIRY_WARNING_DAYS, type ProviderHome } from '@zuuchmap/core';
import type { RequestUser } from '../auth/request-user';
import { BookingService } from '../booking/booking.service';
import { CompanyService } from '../company/company.service';
import { PeopleService } from '../people/people.service';
import { ContactService } from '../post/contact.service';
import { PostService } from '../post/post.service';

/** E1 and the R4 account screen: everything a provider sees on either, in one request. */
@Injectable()
export class ProviderService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly bookings: BookingService,
    private readonly contacts: ContactService,
    private readonly people: PeopleService,
    private readonly posts: PostService,
    private readonly companies: CompanyService,
  ) {}

  async home(me: RequestUser): Promise<ProviderHome> {
    const pending = await this.ds.query<Array<{ n: number; oldest: Date | null }>>(
      `SELECT COUNT(*)::int AS n, MIN(date_created) AS oldest FROM bookings WHERE provider_id = $1 AND status = 'PENDING'`,
      [me.id],
    );
    const unread = await this.ds.query<Array<{ n: number }>>(
      'SELECT COUNT(*)::int AS n FROM conversations WHERE provider_id = $1 AND provider_unread > 0',
      [me.id],
    );
    const fix = await this.ds.query<Array<{ id: number; title: string | null; rejection_reason: string | null; rejection_field: string | null; approval_status: string }>>(
      `SELECT id, title, rejection_reason, rejection_field, approval_status FROM posts
        WHERE user_id = $1 AND deleted_at IS NULL AND is_draft = false
          AND (approval_status = 'REJECTED' OR (approval_status = 'APPROVED' AND rejection_reason IS NOT NULL AND pending_revision IS NULL))
        ORDER BY date_updated DESC`,
      [me.id],
    );
    const expiring = await this.ds.query<Array<{ id: number; title: string | null; expires_at: Date }>>(
      `SELECT id, title, expires_at FROM posts
        WHERE user_id = $1 AND deleted_at IS NULL AND is_draft = false AND approval_status = 'APPROVED' AND status <> 'EXPIRED'
          AND expires_at > now() AND expires_at <= now() + make_interval(days => $2)
        ORDER BY expires_at`,
      [me.id, EXPIRY_WARNING_DAYS],
    );
    const reviews = await this.ds.query<Array<{ n: number }>>('SELECT COUNT(*)::int AS n FROM reviews WHERE provider_id = $1 AND reply IS NULL', [me.id]);
    const value = await this.bookings.value(me);
    const listings = await this.ds.query<Array<{ total: number; live: number }>>(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE is_draft = false AND approval_status = 'APPROVED' AND status = 'ACTIVE')::int AS live
         FROM posts WHERE user_id = $1 AND deleted_at IS NULL`,
      [me.id],
    );
    const rating = (await this.people.ratings([me.id])).get(me.id);
    return {
      pending_requests: { count: pending[0]?.n ?? 0, oldest_at: pending[0]?.oldest?.toISOString() ?? null },
      unread_chats: { count: unread[0]?.n ?? 0, reply_minutes: (await this.people.replyMinutes([me.id])).get(me.id) ?? null },
      to_fix: fix.map((p) => ({ id: p.id, title: p.title, rejection_reason: p.rejection_reason, rejection_field: p.rejection_field, revision: p.approval_status === 'APPROVED' })),
      expiring: expiring.map((p) => ({ id: p.id, title: p.title, expires_at: p.expires_at.toISOString() })),
      unanswered_reviews: reviews[0]?.n ?? 0,
      booking_value: { month: value.month, total: value.total, count: value.count },
      week: await this.contacts.mine(me),
      rating: { average: rating?.rating_average ?? null, count: rating?.rating_count ?? 0 },
      company: await this.companies.mine(me),
      listings: { total: listings[0]?.total ?? 0, live: listings[0]?.live ?? 0 },
      plan: await this.posts.planUsage(me.id),
    };
  }
}
