import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { DataSource } from 'typeorm';
import {
  reportReasonsFor,
  type Paginated, type ReportAction, type ReportCreateRequest, type ReportGroup, type ReportKind, type ReportReason, type ReportStatus,
} from '@zuuchmap/core';
import type { RequestUser } from '../auth/request-user';
import { PeopleService } from '../people/people.service';
import { LISTING_EVENTS, type ListingEventPort } from '../post/listing-events';
import { PostService } from '../post/post.service';
import { ReviewService } from '../review/review.service';

/** Open reports one account may have at once (anti-spam). */
const MAX_OPEN_REPORTS = 10;

interface GroupRow {
  subject_key: string; kind: ReportKind; post_id: number | null; review_id: number | null; owner_id: string | null;
  subject: string | null; reasons: ReportReason[]; reporters: number; detail: string | null; status: ReportStatus;
  action: ReportAction | null; resolution: string | null; first_at: Date; resolved_at: Date | null; id: string;
}

const fail = (cls: typeof BadRequestException, code: string, message: string): never => {
  throw new cls({ message, code });
};

/**
 * Phase 9. A report is about a listing or a review; owner and subject text are copied at filing,
 * so deleting either keeps it readable. One open report per person per subject. Taking a subject
 * down rejects the whole listing (pending edit included) or deletes the review, closes the
 * subject's other open reports and tells each reporter.
 */
@Injectable()
export class ReportService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly posts: PostService,
    private readonly reviews: ReviewService,
    private readonly people: PeopleService,
    @Inject(LISTING_EVENTS) private readonly events: ListingEventPort,
  ) {}

  async create(me: RequestUser, req: ReportCreateRequest): Promise<{ id: string }> {
    const isPost = req.kind === 'POST';
    if (isPost === !req.post_id || (!isPost && !req.review_id) || (req.post_id && req.review_id)) {
      fail(BadRequestException, 'REPORT_NEEDS_ONE_SUBJECT', 'Report either a listing or a review');
    }
    if (!reportReasonsFor(req.kind).includes(req.reason)) fail(BadRequestException, 'REPORT_REASON_INVALID', 'That reason does not fit this kind of report');

    let owner: string | null;
    let subject: string | null;
    let key: string;
    if (isPost) {
      const p = (await this.ds.query<Array<{ user_id: string | null; title: string | null; deleted_at: Date | null }>>(
        'SELECT user_id, title, deleted_at FROM posts WHERE id = $1', [req.post_id],
      )).at(0);
      if (!p || p.deleted_at) return fail(NotFoundException, 'POST_NOT_FOUND', 'Listing not found');
      if (p.user_id === me.id) fail(ForbiddenException, 'CANNOT_REPORT_OWN_POST', 'Cannot report your own listing');
      owner = p.user_id;
      subject = p.title;
      key = `POST:${String(req.post_id)}`;
    } else {
      const r = (await this.ds.query<Array<{ provider_id: string; author_id: string; comment: string | null; rating: number }>>(
        'SELECT provider_id, author_id, comment, rating FROM reviews WHERE id = $1', [req.review_id],
      )).at(0) ?? fail(NotFoundException, 'REVIEW_NOT_FOUND', 'Review not found');
      if (r.author_id === me.id) fail(ForbiddenException, 'CANNOT_REPORT_OWN_REVIEW', 'Cannot report your own review');
      // The review's author is whom a take-down is held against; the provider is usually the reporter.
      owner = r.author_id;
      subject = `★${String(r.rating)}${r.comment ? ` · ${r.comment.slice(0, 900)}` : ''}`;
      key = `REVIEW:${String(req.review_id)}`;
    }

    const [{ n }] = await this.ds.query<Array<{ n: number }>>(`SELECT COUNT(*)::int AS n FROM reports WHERE reporter_id = $1 AND status = 'OPEN'`, [me.id]);
    if (n >= MAX_OPEN_REPORTS) fail(BadRequestException, 'TOO_MANY_OPEN_REPORTS', 'Too many open reports');
    const rows = await this.ds.query<Array<{ id: string }>>(
      `INSERT INTO reports (reporter_id, kind, post_id, review_id, subject_key, owner_id, subject, reason, detail)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (reporter_id, subject_key) WHERE status = 'OPEN' DO NOTHING RETURNING id`,
      [me.id, req.kind, req.post_id ?? null, req.review_id ?? null, key, owner, subject, req.reason, req.detail?.trim() || null],
    );
    const row = rows.at(0) ?? fail(ConflictException, 'REPORT_ALREADY_OPEN', 'You already reported this');
    return { id: row.id };
  }

  /** Figma J4: one card per subject, the oldest open first; resolved ones newest first. */
  async list(status: 'OPEN' | 'CLOSED', page = 1, limit = 30): Promise<Paginated<ReportGroup>> {
    const open = status === 'OPEN';
    const where = open ? `status = 'OPEN'` : `status <> 'OPEN'`;
    // Closed reports group by the resolution that closed them (same subject, same moment).
    const groupBy = open ? 'subject_key' : 'subject_key, resolved_at';
    const rows = await this.ds.query<GroupRow[]>(
      `SELECT subject_key, (array_agg(kind))[1] AS kind, (array_agg(post_id))[1] AS post_id, (array_agg(review_id))[1] AS review_id,
              (array_agg(owner_id))[1] AS owner_id, (array_agg(subject ORDER BY date_created DESC))[1] AS subject,
              array_agg(DISTINCT reason) AS reasons, COUNT(*)::int AS reporters,
              (array_agg(detail ORDER BY date_created DESC) FILTER (WHERE detail IS NOT NULL))[1] AS detail,
              (array_agg(status))[1] AS status, (array_agg(action))[1] AS action, (array_agg(resolution))[1] AS resolution,
              MIN(date_created) AS first_at, MAX(resolved_at) AS resolved_at,
              (array_agg(id ORDER BY date_created DESC))[1] AS id
         FROM reports WHERE ${where}
        GROUP BY ${groupBy}
        ORDER BY ${open ? 'MIN(date_created) ASC' : 'MAX(resolved_at) DESC NULLS LAST'}
        LIMIT $1 OFFSET $2`,
      [limit, (page - 1) * limit],
    );
    const [{ n }] = await this.ds.query<Array<{ n: number }>>(
      `SELECT COUNT(*)::int AS n FROM (SELECT 1 FROM reports WHERE ${where} GROUP BY ${groupBy}) g`,
    );
    const [items, reviews, owners] = await Promise.all([
      this.posts.itemsByIds(rows.flatMap((r) => (r.post_id ? [r.post_id] : []))),
      this.reviews.byIds(rows.flatMap((r) => (r.review_id ? [r.review_id] : []))),
      this.people.publicUsers(rows.map((r) => r.owner_id)),
    ]);
    return {
      total: n,
      items: rows.map((r) => ({
        id: r.id, kind: r.kind, post_id: r.post_id, review_id: r.review_id, subject: r.subject,
        owner: r.owner_id ? owners.get(r.owner_id) ?? null : null,
        post: r.post_id ? items.get(r.post_id) ?? null : null,
        review: r.review_id ? reviews.get(r.review_id) ?? null : null,
        reasons: r.reasons, reporters: r.reporters, detail: r.detail, status: r.status, action: r.action, resolution: r.resolution,
        first_at: r.first_at.toISOString(), resolved_at: r.resolved_at?.toISOString() ?? null,
      })),
    };
  }

  async openCount(): Promise<number> {
    const [{ n }] = await this.ds.query<Array<{ n: number }>>(`SELECT COUNT(DISTINCT subject_key)::int AS n FROM reports WHERE status = 'OPEN'`);
    return n;
  }

  /** Resolves every open report on the report's subject at once. */
  async resolve(admin: RequestUser, id: string, action: ReportAction, resolution?: string): Promise<{ ok: true; closed: number }> {
    const r = (await this.ds.query<Array<{ subject_key: string; kind: ReportKind; post_id: number | null; review_id: number | null; status: ReportStatus; subject: string | null }>>(
      'SELECT subject_key, kind, post_id, review_id, status, subject FROM reports WHERE id = $1', [id],
    )).at(0) ?? fail(NotFoundException, 'REPORT_NOT_FOUND', 'Report not found');
    if (r.status !== 'OPEN') fail(ConflictException, 'REPORT_ALREADY_RESOLVED', 'Already resolved');

    let title = r.subject;
    if (action === 'TAKE_DOWN') {
      if (r.kind === 'POST' && r.post_id) {
        const res = await this.posts.takeDown(r.post_id, resolution?.trim() || 'Taken down after reports');
        title = res?.title ?? title;
      } else if (r.kind === 'REVIEW' && r.review_id) {
        await this.reviews.takeDown(r.review_id);
      }
    }
    // One UPDATE closes the subject; a second admin resolving at the same time finds nothing left.
    const [closed] = await this.ds.query<[Array<{ reporter_id: string | null }>, number]>(
      `UPDATE reports SET status = $2, action = $3, resolution = $4, resolved_by = $5, resolved_at = now(), date_updated = now()
        WHERE subject_key = $1 AND status = 'OPEN' RETURNING reporter_id`,
      [r.subject_key, action === 'TAKE_DOWN' ? 'RESOLVED' : 'DISMISSED', action, resolution?.trim() || null, admin.id],
    );
    if (action === 'TAKE_DOWN') {
      for (const c of closed) {
        if (c.reporter_id) this.events.emit({ type: 'report.resolved', user_id: c.reporter_id, report_kind: r.kind, title });
      }
    }
    return { ok: true, closed: closed.length };
  }
}
