import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { ProviderReviews, PublicUser, Review, ReviewSort, SellerProfile } from '@zuuchmap/core';
import type { RequestUser } from '../auth/request-user';
import { PeopleService } from '../people/people.service';
import { ulaanbaatarDate } from '../post/availability.service';
import { LISTING_EVENTS, type ListingEventPort } from '../post/listing-events';
import { PostService } from '../post/post.service';

interface ReviewRow {
  id: number;
  provider_id: string;
  author_id: string;
  rating: number;
  comment: string | null;
  reply: string | null;
  reply_at: Date | null;
  date_created: Date;
  date_updated: Date;
}

const ORDER: Record<ReviewSort, string> = {
  new: 'date_created DESC, id DESC',
  high: 'rating DESC, date_created DESC, id DESC',
  low: 'rating ASC, date_created DESC, id DESC',
};

/** Reviews shown on the seller page before "all reviews". */
export const SELLER_PAGE_REVIEWS = 3;

/**
 * Reviews of providers: one per author and provider, editable (an upsert). Allowed after a
 * finished booking (ACCEPTED, last day past) or a thread the provider answered with text. The
 * provider may post one public reply per review and edit it.
 */
@Injectable()
export class ReviewService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly people: PeopleService,
    private readonly posts: PostService,
    @Inject(LISTING_EVENTS) private readonly events: ListingEventPort,
  ) {}

  private async views(rows: ReviewRow[]): Promise<Review[]> {
    const authors = await this.people.publicUsers(rows.map((r) => r.author_id));
    return rows.map((r) => ({
      id: r.id,
      provider_id: r.provider_id,
      author: authors.get(r.author_id) ?? ({ id: r.author_id, type: null, phone_number: null, parent_name: null, given_name: null, email: null, profile_picture: null, is_verified: null, date_created: r.date_created.toISOString() } satisfies PublicUser),
      rating: r.rating,
      comment: r.comment,
      reply: r.reply,
      reply_at: r.reply_at?.toISOString() ?? null,
      date_created: r.date_created.toISOString(),
      date_updated: r.date_updated.toISOString(),
    }));
  }

  async canReview(authorId: string, providerId: string): Promise<boolean> {
    if (authorId === providerId) return false;
    const rows = await this.ds.query<Array<{ ok: boolean }>>(
      `SELECT EXISTS (
          SELECT 1 FROM bookings WHERE customer_id = $1 AND provider_id = $2 AND status = 'ACCEPTED' AND end_date < $3::date
        ) OR EXISTS (
          SELECT 1 FROM conversations WHERE customer_id = $1 AND provider_id = $2 AND first_reply_at IS NOT NULL
        ) AS ok`,
      [authorId, providerId, ulaanbaatarDate()],
    );
    return rows[0]?.ok ?? false;
  }

  /** `POST /reviews`: create or edit the caller's review of a provider. */
  async upsert(me: RequestUser, providerId: string, rating: number, comment?: string | null): Promise<Review> {
    if (providerId === me.id) throw new BadRequestException({ message: 'Cannot review yourself', code: 'REVIEW_SELF' });
    if (!(await this.canReview(me.id, providerId))) {
      throw new ForbiddenException({ message: 'Review needs a finished booking or an answered chat', code: 'REVIEW_NEEDS_BOOKING' });
    }
    const rows = await this.ds.query<Array<ReviewRow & { inserted: boolean }>>(
      `INSERT INTO reviews (provider_id, author_id, rating, comment) VALUES ($1, $2, $3, $4)
       ON CONFLICT (provider_id, author_id) DO UPDATE SET rating = EXCLUDED.rating, comment = EXCLUDED.comment, date_updated = now()
       RETURNING *, (xmax = 0) AS inserted`,
      [providerId, me.id, rating, comment?.trim() || null],
    );
    const row = rows[0];
    if (row.inserted) this.events.emit({ type: 'review.created', review_id: row.id, user_id: providerId, rating });
    return (await this.views([row]))[0];
  }

  /** `PUT /reviews/:id/reply`: the reviewed provider's one public reply, editable. */
  async reply(me: RequestUser, id: number, reply: string): Promise<Review> {
    const text = reply.trim();
    if (!text) throw new BadRequestException({ message: 'Write a reply first', code: 'EMPTY_MESSAGE' });
    const found = await this.ds.query<ReviewRow[]>('SELECT * FROM reviews WHERE id = $1', [id]);
    const row = found.at(0);
    if (!row) throw new NotFoundException({ message: 'Review not found', code: 'REVIEW_NOT_FOUND' });
    if (row.provider_id !== me.id) throw new ForbiddenException({ message: 'Not a review of you', code: 'REVIEW_NOT_YOURS' });
    const rows = await this.ds.query<ReviewRow[]>(
      'UPDATE reviews SET reply = $2, reply_at = now() WHERE id = $1 RETURNING *',
      [id, text],
    );
    const updated = (Array.isArray(rows[0]) ? rows[0][0] : rows[0]) as ReviewRow;
    if (!row.reply) this.events.emit({ type: 'review.replied', review_id: id, user_id: updated.author_id, provider_id: me.id });
    return (await this.views([updated]))[0];
  }

  /** `GET /reviews/provider/:id`. */
  async forProvider(viewer: RequestUser | undefined, providerId: string, sort: ReviewSort = 'new', page = 1, limit = 20): Promise<ProviderReviews> {
    const stats = await this.ds.query<Array<{ rating: number; n: number }>>(
      'SELECT rating, COUNT(*)::int AS n FROM reviews WHERE provider_id = $1 GROUP BY rating',
      [providerId],
    );
    const per = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 } as ProviderReviews['stats'];
    let count = 0;
    let sum = 0;
    for (const s of stats) {
      per[String(s.rating) as keyof ProviderReviews['stats']] = s.n;
      count += s.n;
      sum += s.rating * s.n;
    }
    const rows = await this.ds.query<ReviewRow[]>(
      `SELECT * FROM reviews WHERE provider_id = $1 ORDER BY ${ORDER[sort]} LIMIT $2 OFFSET $3`,
      [providerId, limit, (page - 1) * limit],
    );
    let own: Review | null = null;
    let can = false;
    if (viewer && viewer.id !== providerId) {
      const mine = await this.ds.query<ReviewRow[]>('SELECT * FROM reviews WHERE provider_id = $1 AND author_id = $2', [providerId, viewer.id]);
      own = mine.length ? (await this.views(mine))[0] : null;
      can = await this.canReview(viewer.id, providerId);
    }
    return {
      items: await this.views(rows),
      total: count,
      average: count ? Math.round((sum / count) * 10) / 10 : null,
      count,
      stats: per,
      own,
      can_review: can,
    };
  }

  /** `GET /sellers/:id`: the seller page. */
  async seller(id: string): Promise<SellerProfile> {
    const user = await this.people.publicUser(id, 'full');
    if (!user) throw new NotFoundException({ message: 'Seller not found' });
    const jobs = await this.ds.query<Array<{ n: number }>>(
      `SELECT COUNT(*)::int AS n FROM bookings WHERE provider_id = $1 AND status = 'ACCEPTED' AND end_date < $2::date`,
      [id, ulaanbaatarDate()],
    );
    const latest = await this.ds.query<ReviewRow[]>(
      'SELECT * FROM reviews WHERE provider_id = $1 ORDER BY date_created DESC, id DESC LIMIT $2',
      [id, SELLER_PAGE_REVIEWS],
    );
    return {
      user,
      jobs: jobs[0]?.n ?? 0,
      listings: await this.posts.liveByOwner(id),
      reviews: await this.views(latest),
    };
  }
}
