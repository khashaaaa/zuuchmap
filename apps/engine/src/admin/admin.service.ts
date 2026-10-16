import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { DataSource } from 'typeorm';
import type {
  AdminAnalytics, AdminOverview, Company, AdminUser, AdminUserDetail, AdminUserFilter, AdminUserListing, BroadcastEstimate, BroadcastRequest, Paginated,
} from '@zuuchmap/core';
import { AUTH_CONFIG, isAdminPhone, type AuthConfig } from '../auth/auth.config';
import { toCompany, type CompanyRow } from '../company/company.service';
import type { RequestUser } from '../auth/request-user';
import { broadcastRecipients } from '../notification/notification.service';
import { PaymentService } from '../payment/payment.service';
import { LISTING_EVENTS, type ListingEventPort } from '../post/listing-events';
import { PostService } from '../post/post.service';
import { ReportService } from '../report/report.service';
import type { User } from '../user/entities/user.entity';
import { toApiUser } from '../user/user.mapper';
import { deleteAccount } from '../user/user.service';

const LIVE_SQL = `p.approval_status = 'APPROVED' AND p.is_draft = false AND p.deleted_at IS NULL
  AND p.status <> 'EXPIRED' AND (p.expires_at IS NULL OR p.expires_at > now())`;
const PENDING_SQL = `p.deleted_at IS NULL AND p.is_draft = false AND (p.approval_status = 'PENDING' OR p.pending_revision IS NOT NULL)`;
const PENDING_SINCE = `COALESCE((p.pending_revision->>'submitted_at')::timestamptz, p.date_created)`;

type UserRow = User & { active_posts: number; total_posts: number };

const fail = (cls: typeof BadRequestException, code: string, message: string): never => {
  throw new cls({ message, code });
};

/** Phase 9: the web admin's look-ups and configuration, and the counts both admin clients show. */
@Injectable()
export class AdminService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    @Inject(AUTH_CONFIG) private readonly cfg: AuthConfig,
    private readonly posts: PostService,
    private readonly payments: PaymentService,
    private readonly reports: ReportService,
    @Inject(LISTING_EVENTS) private readonly events: ListingEventPort,
  ) {}

  private toAdminUser(u: UserRow): AdminUser {
    return { ...toApiUser(u, this.cfg), is_admin: isAdminPhone(this.cfg, u.phone_number), active_posts: u.active_posts, total_posts: u.total_posts };
  }

  private userSelect(where: string): string {
    return `SELECT u.*,
              (SELECT COUNT(*)::int FROM posts p WHERE p.user_id = u.id AND ${LIVE_SQL}) AS active_posts,
              (SELECT COUNT(*)::int FROM posts p WHERE p.user_id = u.id AND p.deleted_at IS NULL AND p.is_draft = false) AS total_posts
         FROM users u LEFT JOIN companies c ON c.owner_id = u.id
        WHERE ${where}`;
  }

  /** Figma J6: by phone, name or company; by role; newest first. */
  async users(q: string | undefined, type: AdminUserFilter | undefined, page: number, limit: number): Promise<Paginated<AdminUser>> {
    const params: unknown[] = [];
    const where: string[] = ['TRUE'];
    const text = q?.trim();
    if (text) {
      params.push(`%${text.replace(/[%_\\]/g, (c) => `\\${c}`).replace(/\s+/g, '')}%`, `%${text.replace(/[%_\\]/g, (c) => `\\${c}`)}%`);
      where.push(`(u.phone_number LIKE $${String(params.length - 1)} OR concat_ws(' ', u.parent_name, u.given_name) ILIKE $${String(params.length)} OR c.name ILIKE $${String(params.length)})`);
    }
    if (type === 'ADMIN') {
      params.push([...this.cfg.adminPhones]);
      where.push(`u.phone_number = ANY($${String(params.length)}::varchar[])`);
    } else if (type) {
      params.push(type);
      where.push(`u.type = $${String(params.length)}`);
    }
    const cond = where.join(' AND ');
    const [rows, count] = await Promise.all([
      this.ds.query<UserRow[]>(`${this.userSelect(cond)} ORDER BY u.date_created DESC, u.id LIMIT ${String(limit)} OFFSET ${String((page - 1) * limit)}`, params),
      this.ds.query<Array<{ n: number }>>(`SELECT COUNT(*)::int AS n FROM users u LEFT JOIN companies c ON c.owner_id = u.id WHERE ${cond}`, params),
    ]);
    const people = await this.companyOf(rows.map((r) => r.id));
    return { items: rows.map((r) => ({ ...this.toAdminUser(r), company: people.get(r.id) ?? null })), total: count[0].n };
  }

  /** The company with its registration and tax numbers (Figma J11d checks them). */
  private async companyOf(ids: string[]): Promise<Map<string, Company>> {
    if (!ids.length) return new Map();
    const rows = await this.ds.query<CompanyRow[]>('SELECT * FROM companies WHERE owner_id = ANY($1::uuid[])', [ids]);
    return new Map(rows.map((c) => [c.owner_id, toCompany(c)]));
  }

  /** Figma J11d: the account, its company, plan, listings and payments. */
  async user(id: string): Promise<AdminUserDetail> {
    const row = (await this.ds.query<UserRow[]>(this.userSelect('u.id = $1'), [id])).at(0) ?? fail(NotFoundException, 'USER_NOT_FOUND', 'User not found');
    const [company, posts, payments] = await Promise.all([
      this.companyOf([id]),
      this.ds.query<Array<{ id: number; title: string | null; category: string; approval_status: AdminUserListing['approval_status']; status: AdminUserListing['status']; live: boolean; pending: boolean; views: number; expires_at: Date | null; featured_until: Date | null }>>(
        `SELECT p.id, p.title, p.category, p.approval_status, p.status, (${LIVE_SQL}) AS live, (p.pending_revision IS NOT NULL) AS pending,
                p.views, p.expires_at, p.featured_until
           FROM posts p WHERE p.user_id = $1 AND p.deleted_at IS NULL AND p.is_draft = false
          ORDER BY p.date_created DESC LIMIT 200`,
        [id],
      ),
      this.payments.forUser(id),
    ]);
    return {
      ...this.toAdminUser(row),
      company: company.get(id) ?? null,
      posts: posts.map((p) => ({
        id: p.id, title: p.title, category: p.category, approval_status: p.approval_status, status: p.status, is_live: p.live,
        has_pending_edit: p.pending, views: p.views, expires_at: p.expires_at?.toISOString() ?? null,
        featured_until: p.featured_until && p.featured_until.getTime() > Date.now() ? p.featured_until.toISOString() : null,
      })),
      payments,
    };
  }

  async deleteUser(id: string): Promise<{ ok: true }> {
    const found = await deleteAccount(this.ds, id);
    if (!found) fail(NotFoundException, 'USER_NOT_FOUND', 'User not found');
    return { ok: true };
  }

  /** Figma J13d: the badge is granted only after checking the registration number; editing name/registration/tax drops it. */
  async verifyCompany(companyId: string, verified: boolean): Promise<{ ok: true }> {
    const res = await this.ds.query<[unknown, number]>(
      `UPDATE companies SET is_verified = $2, verified_at = CASE WHEN $2 THEN now() ELSE NULL END, date_updated = now() WHERE id = $1`,
      [companyId, verified],
    );
    if (!res[1]) fail(NotFoundException, 'COMPANY_FORBIDDEN', 'Company not found');
    return { ok: true };
  }

  async overview(): Promise<AdminOverview> {
    const [[posts], [users], reportsOpen, byCategory] = await Promise.all([
      this.ds.query<Array<{ total: number; new_7d: number; pending: number; oldest: Date | null; approved: number; rejected: number }>>(
        `SELECT COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE p.date_created > now() - interval '7 days')::int AS new_7d,
                COUNT(*) FILTER (WHERE ${PENDING_SQL})::int AS pending,
                MIN(${PENDING_SINCE}) FILTER (WHERE ${PENDING_SQL}) AS oldest,
                COUNT(*) FILTER (WHERE p.approval_status = 'APPROVED')::int AS approved,
                COUNT(*) FILTER (WHERE p.approval_status = 'REJECTED')::int AS rejected
           FROM posts p WHERE p.deleted_at IS NULL AND p.is_draft = false`,
      ),
      this.ds.query<Array<{ total: number; new_7d: number; providers: number; customers: number }>>(
        `SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE date_created > now() - interval '7 days')::int AS new_7d,
                COUNT(*) FILTER (WHERE type = 'PROVIDER')::int AS providers, COUNT(*) FILTER (WHERE type = 'CUSTOMER')::int AS customers
           FROM users`,
      ),
      this.reports.openCount(),
      this.posts.countLiveByCategory(),
    ]);
    return {
      posts: { total: posts.total, new_7d: posts.new_7d, pending: posts.pending, oldest_pending_at: posts.oldest?.toISOString() ?? null, approved: posts.approved, rejected: posts.rejected },
      users,
      reports_open: reportsOpen,
      by_category: Object.entries(byCategory).map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count),
    };
  }

  /** Figma J7: a window of 7, 30 or 90 days, each count against the window before where it compares. */
  async analytics(days: number): Promise<AdminAnalytics> {
    const win = `now() - make_interval(days => $1)`;
    const prev = `now() - make_interval(days => $1 * 2)`;
    const [[users], [live], [pending], [bookings], [funnel], byCategory, gaps] = await Promise.all([
      this.ds.query<Array<{ total: number; new: number }>>(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE date_created > ${win})::int AS new FROM users`, [days]),
      this.ds.query<Array<{ total: number; new: number }>>(
        `SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE p.published_at > ${win})::int AS new FROM posts p WHERE ${LIVE_SQL}`, [days],
      ),
      this.ds.query<Array<{ count: number; oldest: Date | null }>>(`SELECT COUNT(*)::int AS count, MIN(${PENDING_SINCE}) AS oldest FROM posts p WHERE ${PENDING_SQL}`),
      this.ds.query<Array<{ count: number; previous: number }>>(
        `SELECT COUNT(*) FILTER (WHERE responded_at > ${win})::int AS count,
                COUNT(*) FILTER (WHERE responded_at > ${prev} AND responded_at <= ${win})::int AS previous
           FROM bookings WHERE status = 'ACCEPTED'`,
        [days],
      ),
      this.ds.query<Array<{ viewed: number; contacted: number; requested: number; accepted: number }>>(
        `SELECT (SELECT COUNT(DISTINCT COALESCE(user_id::text, visitor_key)) FROM post_views WHERE date_viewed > ${win})::int AS viewed,
                (SELECT COUNT(DISTINCT COALESCE(user_id::text, viewer)) FROM post_contacts WHERE created_at > ${win})::int AS contacted,
                (SELECT COUNT(DISTINCT customer_id) FROM bookings WHERE date_created > ${win})::int AS requested,
                (SELECT COUNT(DISTINCT customer_id) FROM bookings WHERE responded_at > ${win} AND status = 'ACCEPTED')::int AS accepted`,
        [days],
      ),
      this.posts.countLiveByCategory(),
      this.ds.query<Array<{ query: string; province: string; count: number }>>(
        `SELECT query, province, SUM(count)::int AS count FROM search_misses
          WHERE day > (now() AT TIME ZONE 'Asia/Ulaanbaatar')::date - $1::int
          GROUP BY query, province ORDER BY count DESC, query LIMIT 10`,
        [days],
      ),
    ]);
    return {
      days,
      users,
      live,
      pending: { count: pending.count, oldest_at: pending.oldest?.toISOString() ?? null },
      bookings_accepted: bookings,
      funnel,
      by_category: Object.entries(byCategory).map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count),
      search_gaps: gaps.map((g) => ({ query: g.query, province: g.province || null, count: g.count })),
    };
  }

  /** Who a broadcast would reach: accounts with the "news" switch on, and their devices. */
  async estimate(req: Pick<BroadcastRequest, 'audience' | 'category'>): Promise<BroadcastEstimate> {
    const ids = await broadcastRecipients(this.ds, req.audience, req.category ?? null);
    if (!ids.length) return { users: 0, devices: 0 };
    const [r] = await this.ds.query<Array<{ users: number; devices: number }>>(
      `SELECT COUNT(DISTINCT u.id)::int AS users, COUNT(d.id)::int AS devices
         FROM users u LEFT JOIN push_devices d ON d.user_id = u.id
        WHERE u.id = ANY($1::uuid[]) AND COALESCE((u.notify_topics->>'news')::boolean, true)`,
      [ids],
    );
    return r;
  }

  /** Figma J12d: sent at once to every chosen device, no undo. Stored for the centre of each recipient. */
  async broadcast(admin: RequestUser, req: BroadcastRequest): Promise<BroadcastEstimate> {
    if (req.category) {
      const ok = await this.ds.query<unknown[]>('SELECT 1 FROM category_schema WHERE key = $1', [req.category]);
      if (!ok.length) fail(BadRequestException, 'VALIDATION_FAILED', `Unknown category '${req.category}'`);
    }
    const reach = await this.estimate(req);
    const [b] = await this.ds.query<Array<{ id: string }>>(
      `INSERT INTO broadcasts (title, body, audience, category, users, devices, sent_by) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [req.title.trim(), req.body.trim(), req.audience, req.category ?? null, reach.users, reach.devices, admin.id],
    );
    this.events.emit({ type: 'broadcast', broadcast_id: b.id });
    return reach;
  }
}
