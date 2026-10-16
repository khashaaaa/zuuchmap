import {
  BadRequestException,
  ForbiddenException,
  GoneException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager, In, type SelectQueryBuilder } from 'typeorm';
import type {
  AdminListing,
  AvailabilityResponse,
  BrowseAlternative,
  BrowseResponse,
  BrowseSort,
  Listing,
  ListingEditDiff,
  ListingListItem,
  LandingStats,
  ListingRevision,
  MapCluster,
  MapPin,
  MapResponse,
  MyListingItem,
  MyListingStats,
  Paginated,
  PhotoIntent,
  PhotoUploaded,
  PlanUsage,
  PublicUser,
  SavedSearchParams,
} from '@zuuchmap/core';
import { CategoryService } from '../category/category.service';
import type { RequestUser } from '../auth/request-user';
import { env } from '../config/env';
import { User } from '../user/entities/user.entity';
import { UserService } from '../user/user.service';
import {
  type Content,
  applyContent,
  contentDiffers,
  contentOf,
  diffContent,
  NUM_FIELDS,
  revisionContent,
  snapshotOf,
  STR_FIELDS,
} from './content';
import { PeopleService, type TrustLevel } from '../people/people.service';
import { ContactService } from './contact.service';
import { addDays, assertDateRange, AvailabilityService } from './availability.service';
import { type AdminListQueryDto, type CreateListingDto, ListQueryDto, type MapQueryDto, type RejectListingDto, type UpdateListingDto } from './dto/post.dto';
import { Post } from './entities/post.entity';
import { LISTING_EVENTS, type ListingEventPort } from './listing-events';
import { PHOTO_STORAGE, type PhotoStorage } from './photo-storage';
import { effectivePlan, expiryDaysFor, planLimits } from './plan-limits';
import { APP_TIMEZONE } from './post-expiry.service';
import {
  type CategoryLabel, categoryLabelIndex, expandTerms, type SearchMode, type SearchSql, searchSql, searchTerms, type TermGroup,
} from './search-terms';

/** Whatever later modules know about a provider's record (upheld reports live in phase 9+). */
export const UPHELD_REPORTS = Symbol('UPHELD_REPORTS');
export interface UpheldReportCounter {
  countUpheld(userId: string): Promise<number>;
}

export const ATTR_MAX_KEYS = 60;
export const ATTR_MAX_BYTES = 8 * 1024;
/** Base wizard fields an admin may point a rejection at, besides the category's own keys. */
export const BASE_FIELD_KEYS = [
  'category', 'subcategory', 'title', 'details', 'province', 'district', 'address', 'location', 'latitude',
  'longitude', 'price', 'price_amount', 'price_unit', 'contact_phone', 'contact_email', 'available_from',
  'available_until', 'website', 'images',
];

const DAY_MS = 86_400_000;
/** Map grid: listings closer than this many screen pixels at the asked zoom become one cluster. */
export const MAP_CLUSTER_PX = 60;
/** Cells one map response may carry; the densest come first. */
export const MAP_MAX_CELLS = 400;
/** Widest viewport the map answers, in degrees (all of Mongolia is ~32° wide). */
export const MAP_MAX_SPAN_DEG = 40;
/** How far past the asked dates the empty dated browse looks for free listings. */
export const ALTERNATIVE_MAX_SHIFT_DAYS = 14;
export const ALTERNATIVES = 3;
/** Landing counters are cached in-process this long. */
const CACHE_MS = 5 * 60_000;
const LIVE_SQL = `p.approval_status = 'APPROVED' AND p.is_draft = false AND p.deleted_at IS NULL
  AND p.status <> 'EXPIRED' AND (p.expires_at IS NULL OR p.expires_at > NOW())`;

const err = (cls: typeof BadRequestException, code: string, message: string, extra?: Record<string, unknown>): never => {
  throw new cls({ message, code, ...extra });
};

@Injectable()
export class PostService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly categories: CategoryService,
    private readonly users: UserService,
    @Inject(PHOTO_STORAGE) private readonly photos: PhotoStorage,
    @Inject(LISTING_EVENTS) private readonly events: ListingEventPort,
    private readonly availability: AvailabilityService,
    private readonly people: PeopleService,
    private readonly contacts: ContactService,
    @Optional() @Inject(UPHELD_REPORTS) private readonly upheld?: UpheldReportCounter,
  ) {}

  private get posts() {
    return this.ds.getRepository(Post);
  }

  // ---- lookup & visibility -------------------------------------------------

  /** A missing id is 404 POST_NOT_FOUND; a soft-deleted one is 410 POST_GONE. */
  async loadPost(id: number, em?: EntityManager, lock = false): Promise<Post> {
    const repo = (em ?? this.ds.manager).getRepository(Post);
    const post = await repo.findOne({ where: { id }, ...(lock ? { lock: { mode: 'pessimistic_write' as const } } : {}) });
    if (!post) return err(NotFoundException, 'POST_NOT_FOUND', 'Listing not found');
    if (post.deleted_at) return err(GoneException, 'POST_GONE', 'Listing was deleted');
    return post;
  }

  isLive(p: Post, now = Date.now()): boolean {
    return (
      p.approval_status === 'APPROVED' &&
      !p.is_draft &&
      !p.deleted_at &&
      p.status !== 'EXPIRED' &&
      (!p.expires_at || p.expires_at.getTime() > now)
    );
  }

  private assertOwner(p: Post, me: RequestUser): void {
    if (p.user_id !== me.id) err(ForbiddenException, 'NOT_POST_OWNER', 'Not your listing');
  }

  // ---- mapping -------------------------------------------------------------

  /** Listing owners with their rating (`full` adds reply time, for the detail). */
  private owners(posts: Post[], trust: TrustLevel = 'rating'): Promise<Map<string, PublicUser>> {
    return this.people.publicUsers(posts.map((p) => p.user_id), trust);
  }

  private item(p: Post, owners: Map<string, PublicUser>): ListingListItem {
    return {
      id: p.id,
      category: p.category,
      subcategory: p.subcategory,
      title: p.title,
      province: p.province,
      district: p.district,
      address: p.address,
      latitude: p.latitude,
      longitude: p.longitude,
      location: p.location,
      price_amount: p.price_amount,
      price_unit: p.price_unit,
      contact_phone: p.contact_phone,
      contact_email: p.contact_email,
      available_from: p.available_from?.toISOString() ?? null,
      available_until: p.available_until?.toISOString() ?? null,
      website: p.website,
      images: p.images,
      attributes: p.attributes,
      views: p.views,
      status: p.status,
      approval_status: p.approval_status,
      expires_at: p.expires_at?.toISOString() ?? null,
      featured_until: p.featured_until?.toISOString() ?? null,
      is_featured: p.is_featured,
      user: p.user_id ? (owners.get(p.user_id) ?? null) : null,
      date_created: p.date_created.toISOString(),
      date_updated: p.date_updated.toISOString(),
    };
  }

  /** List shape plus, on `has_rental_status` categories, the next 14 days that are booked or blocked. */
  async items(posts: Post[], trust: TrustLevel = 'rating'): Promise<ListingListItem[]> {
    const owners = await this.owners(posts, trust);
    const rentable = new Set((await this.categories.listEntities(true)).filter((c) => c.has_rental_status).map((c) => c.key));
    const busy = await this.availability.busyDatesFor(posts.filter((p) => rentable.has(p.category)).map((p) => p.id));
    return posts.map((p) => {
      const it = this.item(p, owners);
      if (rentable.has(p.category)) it.busy_dates = busy.get(p.id) ?? [];
      return it;
    });
  }

  private async mine(posts: Post[], plan: string): Promise<MyListingItem[]> {
    const owners = await this.owners(posts);
    const schemas = new Map((await this.categories.listEntities(true)).map((c) => [c.key, c]));
    return posts.map((p) => ({
      ...this.item(p, owners),
      is_draft: p.is_draft,
      rejection_reason: p.rejection_reason,
      rejection_field: p.rejection_field,
      pending_revision: p.pending_revision,
      previous_snapshot: p.previous_snapshot,
      renew_days: expiryDaysFor(schemas.get(p.category), plan),
    }));
  }

  /** Owner/admin responses carry the moderation fields; everyone else gets the public shape. */
  private async detail(p: Post, privileged: boolean, viewerId?: string): Promise<Listing> {
    const [base] = await this.items([p], 'full');
    const likes = await this.ds.query<Array<{ n: number; mine: boolean }>>(
      'SELECT COUNT(*)::int AS n, bool_or(user_id = $2::uuid) AS mine FROM post_likes WHERE post_id = $1',
      [p.id, viewerId ?? null],
    );
    // The viewer's open request, so the client says "request sent" instead of offering a request that would 409.
    const pending = viewerId
      ? await this.ds.query<Array<{ id: number }>>(
          `SELECT id FROM bookings WHERE post_id = $1 AND customer_id = $2::uuid AND status = 'PENDING' LIMIT 1`,
          [p.id, viewerId],
        )
      : [];
    const out: Listing = {
      ...base, details: p.details, like_count: likes[0]?.n ?? 0, liked: likes[0]?.mine ?? false, my_pending_booking_id: pending[0]?.id ?? null,
    };
    if (privileged) {
      out.pending_revision = p.pending_revision;
      out.previous_snapshot = p.previous_snapshot;
      out.rejection_reason = p.rejection_reason;
      out.rejection_field = p.rejection_field;
      out.is_draft = p.is_draft;
    }
    return out;
  }

  // ---- validation ----------------------------------------------------------

  private checkAttributeBounds(attrs: Record<string, unknown> | null | undefined): void {
    if (!attrs) return;
    if (Object.keys(attrs).length > ATTR_MAX_KEYS) err(BadRequestException, 'INVALID_ATTRIBUTES', 'Too many attributes');
    if (Buffer.byteLength(JSON.stringify(attrs)) > ATTR_MAX_BYTES) err(BadRequestException, 'INVALID_ATTRIBUTES', 'Attributes too large');
  }

  /** Keys must be the caller's own uploads and actually present in storage. */
  private async checkPhotos(ownerId: string, keys: string[], known: string[]): Promise<void> {
    for (const key of keys) {
      if (known.includes(key)) continue;
      if (!key.startsWith(`posts/${ownerId}/`)) err(BadRequestException, 'INVALID_PHOTO_KEY', 'Photo key is not yours');
      if (!(await this.photos.exists(key))) err(BadRequestException, 'PHOTO_NOT_UPLOADED', 'Photo was never uploaded');
    }
  }

  // ---- quota ---------------------------------------------------------------

  /** Everything not rejected, expired, draft or deleted holds a slot (pending included). */
  async activeCount(userId: string, em?: EntityManager): Promise<number> {
    const rows = await (em ?? this.ds.manager).query<Array<{ n: number }>>(
      `SELECT COUNT(*)::int AS n FROM posts p
        WHERE p.user_id = $1 AND p.deleted_at IS NULL AND p.is_draft = false
          AND p.approval_status <> 'REJECTED' AND p.status <> 'EXPIRED'
          AND (p.expires_at IS NULL OR p.expires_at > NOW())`,
      [userId],
    );
    return rows[0]?.n ?? 0;
  }

  private async assertQuota(userId: string, plan: string, em?: EntityManager): Promise<void> {
    const { posts: limit } = planLimits(plan);
    if ((await this.activeCount(userId, em)) >= limit) {
      err(BadRequestException, 'POST_QUOTA_EXCEEDED', 'Listing quota reached for your plan', { limit, plan });
    }
  }

  private async lockUser(em: EntityManager, userId: string): Promise<void> {
    await em.query('SELECT 1 FROM users WHERE id = $1 FOR UPDATE', [userId]);
  }

  private async owner(userId: string): Promise<User> {
    return this.ds.getRepository(User).findOneByOrFail({ id: userId });
  }

  private async windowEnd(category: string, plan: string): Promise<Date> {
    const schema = await this.categories.get(category).catch(() => null);
    return new Date(Date.now() + expiryDaysFor(schema, plan) * DAY_MS);
  }

  // ---- create / submit -----------------------------------------------------

  /** Sequential: sharp decodes to raw pixels, so ten parallel photos would spike memory. */
  async uploadPhotos(me: RequestUser, files: Buffer[]): Promise<PhotoUploaded[]> {
    const out: PhotoUploaded[] = [];
    try {
      for (const f of files) out.push(await this.photos.putImage(me.id, f));
    } catch (e) {
      await this.photos.delete(out.map((p) => p.key));
      throw e;
    }
    return out;
  }

  async createUploadIntent(me: RequestUser, contentType: string): Promise<PhotoIntent> {
    return this.photos.createUploadIntent(me.id, contentType);
  }

  async create(me: RequestUser, dto: CreateListingDto): Promise<Listing> {
    // A draft may lack required fields; submitting it checks them (`submitDraft`).
    const attributes = await this.categories.assertValidAttributes(dto.category, dto.subcategory, dto.attributes ?? {}, dto.draft === true);
    this.checkAttributeBounds(attributes);
    const images = dto.images ?? [];
    await this.checkPhotos(me.id, images, []);
    const draft = dto.draft === true;
    const user = await this.owner(me.id);
    const plan = effectivePlan(user);
    if (!draft) await this.assertQuota(me.id, plan);
    const expiresAt = draft ? null : await this.windowEnd(dto.category, plan);

    // Everyone is a customer until their first listing; this is the only place that changes it.
    await this.users.setRole(me.id, 'PROVIDER');

    const saved = await this.ds.transaction(async (em) => {
      await this.lockUser(em, me.id);
      if (!draft) await this.assertQuota(me.id, plan, em);
      const post = em.getRepository(Post).create({
        user_id: me.id,
        category: dto.category,
        subcategory: dto.subcategory ?? null,
        title: dto.title,
        details: dto.details ?? null,
        province: dto.province ?? null,
        district: dto.district ?? null,
        address: dto.address ?? null,
        latitude: dto.latitude ?? null,
        longitude: dto.longitude ?? null,
        location: dto.location ?? null,
        price_amount: dto.price_amount === undefined || dto.price_amount === null ? null : String(dto.price_amount),
        price_unit: dto.price_unit ?? null,
        contact_phone: dto.contact_phone ?? null,
        contact_email: dto.contact_email ?? null,
        available_from: dto.available_from ? new Date(dto.available_from) : null,
        available_until: dto.available_until ? new Date(dto.available_until) : null,
        website: dto.website ?? null,
        images,
        attributes,
        status: dto.status ?? 'ACTIVE',
        approval_status: 'PENDING',
        is_draft: draft,
        expires_at: expiresAt,
      });
      return em.getRepository(Post).save(post);
    });
    if (!draft) {
      this.events.emit({ type: 'listing.submitted', post_id: saved.id, user_id: me.id, title: saved.title, category: saved.category });
    }
    return this.detail(saved, true);
  }

  /** Sends a draft to moderation; this is where the quota applies to it. */
  async submitDraft(me: RequestUser, id: number): Promise<Listing> {
    const post = await this.loadPost(id);
    this.assertOwner(post, me);
    if (!post.is_draft) err(BadRequestException, 'POST_NOT_DRAFT', 'Listing is not a draft');
    // The draft was saved leniently; publishing needs every required field.
    await this.categories.assertValidAttributes(post.category, post.subcategory, post.attributes);
    const user = await this.owner(me.id);
    const plan = effectivePlan(user);
    const expires = await this.windowEnd(post.category, plan);
    const saved = await this.ds.transaction(async (em) => {
      await this.lockUser(em, me.id);
      await this.assertQuota(me.id, plan, em);
      post.is_draft = false;
      post.approval_status = 'PENDING';
      post.expires_at = expires;
      post.expiry_warned_at = null;
      return em.getRepository(Post).save(post);
    });
    this.events.emit({ type: 'listing.submitted', post_id: saved.id, user_id: me.id, title: saved.title, category: saved.category });
    return this.detail(saved, true);
  }

  // ---- edit ----------------------------------------------------------------

  /**
   * Trusted-provider rule: N approved listings (POST_PROVEN_APPROVED), no rejection ever, no
   * upheld report. Applies to edits only — a new listing always goes through review.
   */
  async isProvenProvider(userId: string): Promise<boolean> {
    const rows = await this.ds.query<Array<{ approved: number; rejected: number }>>(
      `SELECT (SELECT COUNT(*)::int FROM posts WHERE user_id = $1 AND approval_status = 'APPROVED'
                 AND is_draft = false AND deleted_at IS NULL) AS approved,
              (SELECT posts_rejected FROM users WHERE id = $1) AS rejected`,
      [userId],
    );
    const r = rows[0];
    if (r.rejected > 0 || r.approved < env().POST_PROVEN_APPROVED) return false;
    return ((await this.upheld?.countUpheld(userId)) ?? 0) === 0;
  }

  /** Saves the fields; with `submit`, a draft is then sent for review in the same request. */
  async update(me: RequestUser, id: number, dto: UpdateListingDto): Promise<Listing> {
    const saved = await this.applyUpdate(me, id, dto);
    return dto.submit ? this.submitDraft(me, id) : saved;
  }

  private async applyUpdate(me: RequestUser, id: number, dto: UpdateListingDto): Promise<Listing> {
    const post = await this.loadPost(id);
    this.assertOwner(post, me);

    const wasApproved = post.approval_status === 'APPROVED' && !post.is_draft;
    const live = contentOf(post);
    // The owner edits from their pending proposal when they have one, never from the live row.
    const base: Content = post.pending_revision ? revisionContent(post.pending_revision) : live;
    const proposed: Content = { ...base };
    for (const f of STR_FIELDS) {
      const v = dto[f];
      if (v !== undefined) proposed[f] = v;
    }
    for (const f of NUM_FIELDS) {
      const v = dto[f];
      if (v !== undefined) proposed[f] = v;
    }
    if (dto.attributes !== undefined) proposed.attributes = dto.attributes;
    if (dto.attributes !== undefined || dto.subcategory !== undefined) {
      proposed.attributes = await this.categories.assertValidAttributes(post.category, proposed.subcategory, proposed.attributes, post.is_draft);
    }
    this.checkAttributeBounds(proposed.attributes);
    if (dto.images !== undefined) {
      await this.checkPhotos(me.id, dto.images, [...base.images, ...live.images]);
      proposed.images = dto.images;
    }

    // Operational fields never gate visibility.
    if (dto.available_from !== undefined) post.available_from = dto.available_from ? new Date(dto.available_from) : null;
    if (dto.available_until !== undefined) post.available_until = dto.available_until ? new Date(dto.available_until) : null;
    if (dto.status !== undefined) post.status = dto.status;

    const changed = contentDiffers(proposed, base);
    const reclaim: string[] = [];
    const notLive = (keys: string[], keep: string[]): string[] => keys.filter((k) => !keep.includes(k));

    if (!wasApproved) {
      // Nothing live to protect: write straight onto the row.
      reclaim.push(...notLive(base.images, proposed.images));
      applyContent(post, proposed);
      let resubmit = false;
      if (changed && !post.is_draft) {
        resubmit = post.approval_status === 'REJECTED';
        post.approval_status = 'PENDING';
        post.rejection_reason = null;
        post.rejection_field = null;
      }
      const lapsed = resubmit && (post.status === 'EXPIRED' || (post.expires_at !== null && post.expires_at.getTime() <= Date.now()));
      const plan = effectivePlan(await this.owner(me.id));
      if (lapsed) {
        post.expires_at = await this.windowEnd(post.category, plan);
        post.status = 'ACTIVE';
        post.expiry_warned_at = null;
      }
      const saved = await this.ds.transaction(async (em) => {
        if (resubmit) {
          await this.lockUser(em, me.id);
          await this.assertQuota(me.id, plan, em);
        }
        return em.getRepository(Post).save(post);
      });
      await this.photos.delete(reclaim);
      if (resubmit) this.events.emit({ type: 'listing.submitted', post_id: saved.id, user_id: me.id, title: saved.title, category: saved.category });
      return this.detail(saved, true);
    }

    // APPROVED: the row keeps serving the approved version.
    const revisionImages = post.pending_revision?.images ?? [];
    let parked = false;
    if (!contentDiffers(proposed, live)) {
      // Edited back to what is published: nothing left to review.
      reclaim.push(...notLive(revisionImages, live.images));
      if (post.pending_revision) post.previous_snapshot = null;
      post.pending_revision = null;
    } else if (await this.isProvenProvider(me.id)) {
      reclaim.push(...notLive([...live.images, ...revisionImages], proposed.images));
      post.previous_snapshot = snapshotOf(live);
      applyContent(post, proposed);
      post.pending_revision = null;
      post.rejection_reason = null;
      post.rejection_field = null;
    } else {
      reclaim.push(...notLive(revisionImages, [...live.images, ...proposed.images]));
      post.previous_snapshot = snapshotOf(live);
      post.rejection_reason = null;
      post.rejection_field = null;
      parked = true;
      // A resubmit of the same proposal keeps its place in the queue.
      post.pending_revision = {
        ...proposed,
        submitted_at: changed || !post.pending_revision ? new Date().toISOString() : post.pending_revision.submitted_at,
      };
    }
    const saved = await this.posts.save(post);
    await this.photos.delete(reclaim);
    if (parked && changed) {
      this.events.emit({ type: 'listing.submitted', post_id: saved.id, user_id: me.id, title: saved.title, category: saved.category });
    }
    return this.detail(saved, true);
  }

  /** Soft delete: the row stays (bookings, reports, rejection counters) and answers 410. */
  async remove(me: RequestUser, id: number): Promise<{ ok: true }> {
    const post = await this.loadPost(id);
    this.assertOwner(post, me);
    post.deleted_at = new Date();
    post.pending_revision = null;
    await this.posts.save(post);
    return { ok: true };
  }

  async renew(me: RequestUser, id: number): Promise<Listing> {
    const post = await this.loadPost(id);
    this.assertOwner(post, me);
    if (post.approval_status !== 'APPROVED' || post.is_draft) err(BadRequestException, 'POST_NOT_APPROVED', 'Only an approved listing can be renewed');
    const plan = effectivePlan(await this.owner(me.id));
    const lapsed = post.status === 'EXPIRED' || (post.expires_at !== null && post.expires_at.getTime() <= Date.now());
    const next = await this.windowEnd(post.category, plan);
    const saved = await this.ds.transaction(async (em) => {
      if (lapsed) {
        // Renewing brings it back into browse, so it passes the quota create does.
        await this.lockUser(em, me.id);
        await this.assertQuota(me.id, plan, em);
      }
      post.expires_at = next;
      post.expiry_warned_at = null;
      if (post.status === 'EXPIRED') post.status = 'ACTIVE';
      return em.getRepository(Post).save(post);
    });
    this.events.emit({ type: 'listing.renewed', post_id: saved.id, user_id: me.id, expires_at: next.toISOString() });
    return this.detail(saved, true);
  }

  // ---- reads ---------------------------------------------------------------

  /** `GET /posts/:id`: the only route returning `details`. */
  async getOne(id: number, viewer: RequestUser | undefined): Promise<Listing> {
    const post = await this.loadPost(id);
    const privileged = viewer !== undefined && (viewer.is_admin || post.user_id === viewer.id);
    if (!privileged) {
      if (post.is_draft || post.approval_status !== 'APPROVED') err(NotFoundException, 'POST_NOT_FOUND', 'Listing not found');
      if (!this.isLive(post)) err(NotFoundException, 'POST_NOT_AVAILABLE', 'Listing is no longer available');
    }
    return this.detail(post, privileged, viewer?.id);
  }

  /** Throws 404/410 for a missing or deleted listing; used before counting a view. */
  async assertExists(id: number): Promise<void> {
    await this.loadPost(id);
  }

  // ---- browse / search -----------------------------------------------------

  /** Live listings only, aliased `post`; every read that is not the owner's or an admin's starts here. */
  private liveQuery(): SelectQueryBuilder<Post> {
    return this.posts
      .createQueryBuilder('post')
      .where("post.approval_status = 'APPROVED'")
      .andWhere('post.is_draft = false')
      .andWhere('post.deleted_at IS NULL')
      .andWhere("post.status <> 'EXPIRED'")
      .andWhere('(post.expires_at IS NULL OR post.expires_at > NOW())');
  }

  /** The viewer's location as a geography point; bound from `:lat` / `:lng`. */
  private static readonly POINT = 'ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography';

  private async labelIndex(): Promise<CategoryLabel[]> {
    return categoryLabelIndex(await this.categories.listEntities(true));
  }

  /**
   * What browse and the map share: family, category, place, dates, distance, price within one
   * unit, schema attributes. Returns whether the query carries a viewer location.
   */
  private async applyFilters(qb: SelectQueryBuilder<Post>, q: ListQueryDto, attrs: Record<string, string>): Promise<{ located: boolean }> {
    if (q.family) {
      const family = q.family;
      const keys = (await this.categories.listEntities(true)).filter((c) => c.family === family).map((c) => c.key);
      qb.andWhere('post.category = ANY(:familyKeys)', { familyKeys: keys });
    }
    if (q.category) qb.andWhere('post.category = :category', { category: q.category });
    if (q.subcategory) qb.andWhere('post.subcategory = :subcategory', { subcategory: q.subcategory });
    if (q.province) qb.andWhere('post.province = :province', { province: q.province });
    if (q.district) qb.andWhere('post.district = :district', { district: q.district });

    // Dates first: a listing booked or blocked on any asked day is not a result, and its own
    // availability window has to cover the asked days.
    const from = q.date_from ?? q.date_to;
    if (from !== undefined) {
      const to = q.date_to ?? from;
      assertDateRange(from, to);
      qb.andWhere(
        `NOT EXISTS (SELECT 1 FROM post_busy b WHERE b.post_id = post.id AND b.days && daterange(CAST(:dateFrom AS date), CAST(:dateTo AS date), '[]'))`,
        { dateFrom: from, dateTo: to },
      )
        .andWhere(`(post.available_from IS NULL OR (post.available_from AT TIME ZONE '${APP_TIMEZONE}')::date <= CAST(:dateTo AS date))`)
        .andWhere(`(post.available_until IS NULL OR (post.available_until AT TIME ZONE '${APP_TIMEZONE}')::date >= CAST(:dateFrom AS date))`);
    }

    const located = q.lat !== undefined && q.lng !== undefined;
    if (located) {
      qb.setParameters({ lat: q.lat, lng: q.lng });
      if (q.radius_km !== undefined) qb.andWhere(`ST_DWithin(post.geo, ${PostService.POINT}, :radiusM)`, { radiusM: q.radius_km * 1000 });
    }

    if (q.price_min !== undefined || q.price_max !== undefined) {
      // Within one unit only: a monthly rate never competes with a daily one.
      qb.andWhere('post.price_unit = :priceUnit', { priceUnit: q.price_unit });
      if (q.price_min !== undefined) qb.andWhere('post.price_amount >= :priceMin', { priceMin: q.price_min });
      if (q.price_max !== undefined) qb.andWhere('post.price_amount <= :priceMax', { priceMax: q.price_max });
    }

    Object.entries(attrs)
      .slice(0, 10)
      .forEach(([rawKey, value], i) => {
        const m = /^([a-z0-9_]+?)(_min|_max)?$/.exec(rawKey);
        if (!m?.[1]) return;
        const k = `ak${String(i)}`;
        const v = `av${String(i)}`;
        if (m[2]) {
          const n = Number(value);
          if (!Number.isFinite(n)) return;
          const op = m[2] === '_min' ? '>=' : '<=';
          // Guarded cast: a non-numeric stored value must not fail the whole query.
          qb.andWhere(
            `(CASE WHEN jsonb_typeof(post.attributes -> :${k}) = 'number' THEN (post.attributes ->> :${k})::numeric END) ${op} :${v}`,
            { [k]: m[1], [v]: n },
          );
        } else {
          qb.andWhere(
            `((post.attributes ->> :${k}) = :${v} OR (jsonb_typeof(post.attributes -> :${k}) = 'array' AND jsonb_exists(post.attributes -> :${k}, :${v})))`,
            { [k]: m[1], [v]: value },
          );
        }
      });
    return { located };
  }

  private order(qb: SelectQueryBuilder<Post>, sort: BrowseSort, search: SearchSql | null): void {
    switch (sort) {
      case 'nearby':
        qb.orderBy('distance_m', 'ASC', 'NULLS LAST');
        break;
      case 'price_asc':
        qb.orderBy('post.price_amount', 'ASC', 'NULLS LAST');
        break;
      case 'price_desc':
        qb.orderBy('post.price_amount', 'DESC', 'NULLS LAST');
        break;
      case 'newest':
        qb.orderBy('post.is_featured', 'DESC');
        break;
      default:
        // Featured-and-relevant leads, then text rank with the category lift, then newest.
        if (search) qb.orderBy(search.featured, 'DESC').addOrderBy(search.rank, 'DESC');
        else qb.orderBy('post.is_featured', 'DESC');
    }
    qb.addOrderBy('post.date_created', 'DESC').addOrderBy('post.id', 'DESC');
  }

  /**
   * `GET /posts`. A query is tried as typed (`all`); one that finds nothing is retried with a
   * near-spelling of each term (`fuzzy`) and then, for two or more terms, with any term
   * (`any`), and the response says `relaxed: true` so the clients can say so too.
   */
  async browse(q: ListQueryDto, attrs: Record<string, string>): Promise<BrowseResponse> {
    const page = q.page ?? 1;
    const limit = q.limit ?? 20;
    const sort = q.sort ?? 'relevance';
    if (sort === 'nearby' && (q.lat === undefined || q.lng === undefined)) {
      throw new BadRequestException('sort=nearby needs lat and lng');
    }
    const terms = searchTerms(q.q);
    const groups = terms.length ? expandTerms(terms, await this.labelIndex()) : [];
    const modes: SearchMode[] = terms.length === 0 ? ['all'] : terms.length >= 2 ? ['all', 'fuzzy', 'any'] : ['all', 'fuzzy'];
    for (const [i, mode] of modes.entries()) {
      const { qb, located, search } = await this.searchQuery(q, attrs, terms, groups, mode);
      this.order(qb, sort, search);
      const total = await qb.getCount();
      if (total === 0 && i < modes.length - 1) continue;
      if (total === 0) return this.emptyBrowse(q, attrs, terms, groups);
      const { entities, raw } = await qb
        .offset((page - 1) * limit)
        .limit(limit)
        .getRawAndEntities<{ distance_m: string | number | null }>();
      const items = await this.items(entities);
      if (located) {
        items.forEach((it, j) => {
          const d = raw.at(j)?.distance_m;
          it.distance_m = d === null || d === undefined ? null : Math.round(Number(d));
        });
      }
      return { items, total, relaxed: mode !== 'all' };
    }
    return this.emptyBrowse(q, attrs, terms, groups);
  }

  /** Live listings under the browse filters and one search mode; `distance_m` is selected when the viewer is located. */
  private async searchQuery(
    q: ListQueryDto, attrs: Record<string, string>, terms: string[], groups: TermGroup[], mode: SearchMode,
  ): Promise<{ qb: SelectQueryBuilder<Post>; located: boolean; search: SearchSql | null }> {
    const qb = this.liveQuery();
    const { located } = await this.applyFilters(qb, q, attrs);
    if (located) qb.addSelect(`ST_Distance(post.geo, ${PostService.POINT})`, 'distance_m');
    const search = terms.length ? searchSql(groups, terms, mode) : null;
    if (search) {
      for (const w of search.where) qb.andWhere(w);
      qb.setParameters(search.params);
    }
    return { qb, located, search };
  }

  /**
   * Nothing on the asked days: say how many match without dates and offer the nearest later
   * windows of the same length that have free listings ("Ойролцоо өдрүүд"). Undated searches
   * answer plain empty.
   */
  private async emptyBrowse(q: ListQueryDto, attrs: Record<string, string>, terms: string[], groups: TermGroup[]): Promise<BrowseResponse> {
    const empty: BrowseResponse = { items: [], total: 0, relaxed: false };
    const from = q.date_from ?? q.date_to;
    if (from === undefined) return empty;
    const to = q.date_to ?? from;
    const count = async (dates: Pick<ListQueryDto, 'date_from' | 'date_to'>): Promise<number> =>
      (await this.searchQuery(Object.assign(new ListQueryDto(), q, dates), attrs, terms, groups, 'all')).qb.getCount();
    const undated = await count({ date_from: undefined, date_to: undefined });
    if (undated === 0) return empty;
    const length = (Date.parse(to) - Date.parse(from)) / 86_400_000 + 1;
    const alternatives: BrowseAlternative[] = [];
    let nextShift = 1;
    for (let shift = 1; shift <= ALTERNATIVE_MAX_SHIFT_DAYS && alternatives.length < ALTERNATIVES; shift++) {
      if (shift < nextShift) continue;
      const window = { date_from: addDays(from, shift), date_to: addDays(to, shift) };
      const n = await count(window);
      if (n === 0) continue;
      alternatives.push({ ...window, count: n });
      nextShift = shift + length;
    }
    return { ...empty, undated_total: undated, alternatives };
  }

  /** Live listings a saved search matches that appeared after `since` (its "N new"); never relaxed. */
  async countSince(params: SavedSearchParams, since: Date): Promise<number> {
    const { attrs = {}, ...rest } = params;
    const q = Object.assign(new ListQueryDto(), rest);
    const terms = searchTerms(q.q);
    const groups = terms.length ? expandTerms(terms, await this.labelIndex()) : [];
    const { qb } = await this.searchQuery(q, attrs, terms, groups, 'all');
    // A listing created earlier but approved after the search was opened is new to it.
    return qb.andWhere('COALESCE(post.published_at, post.date_created) > :since', { since }).getCount();
  }

  private landing: { at: number; value: Promise<LandingStats> } | null = null;

  /** `GET /posts/stats`: the landing counters, the same visibility rule as browse, cached CACHE_MS. */
  landingStats(): Promise<LandingStats> {
    if (this.landing && Date.now() - this.landing.at < CACHE_MS) return this.landing.value;
    const value = (async (): Promise<LandingStats> => {
      const byCategory = await this.countLiveByCategory();
      const schemas = await this.categories.listEntities(true);
      const families = new Map<string, number>();
      for (const c of schemas) families.set(c.family, (families.get(c.family) ?? 0) + (byCategory[c.key] ?? 0));
      const provinces = await this.ds.query<Array<{ n: number }>>(
        `SELECT COUNT(DISTINCT p.province)::int AS n FROM posts p WHERE ${LIVE_SQL} AND p.province IS NOT NULL`,
      );
      return {
        total: Object.values(byCategory).reduce((n, c) => n + c, 0),
        provinces: provinces[0]?.n ?? 0,
        verified_providers: (await this.ds.query<Array<{ n: number }>>('SELECT COUNT(*)::int AS n FROM companies WHERE is_verified'))[0]?.n ?? 0,
        reply_hours: await this.people.landingReplyHours(),
        families: [...families].map(([key, count]) => ({ key, count })),
        categories: Object.entries(byCategory).map(([key, count]) => ({ key, count })),
      };
    })();
    this.landing = { at: Date.now(), value };
    value.catch(() => {
      this.landing = null;
    });
    return value;
  }

  /** A seller's live listings for their page: featured first, then newest. */
  async liveByOwner(userId: string, limit = 50): Promise<ListingListItem[]> {
    const posts = await this.liveQuery()
      .andWhere('post.user_id = :uid', { uid: userId })
      .orderBy('post.is_featured', 'DESC')
      .addOrderBy('post.date_created', 'DESC')
      .addOrderBy('post.id', 'DESC')
      .take(limit)
      .getMany();
    return this.items(posts, 'none');
  }

  /**
   * `GET /posts/:id/similar`: same category, same district first, then same province, then the
   * rest; within each ring the closest price in the same unit wins, other units and unpriced
   * last, newest as the tiebreaker. Not cached: a stale list would show a removed listing.
   */
  async similar(id: number, limit = 6): Promise<ListingListItem[]> {
    const post = await this.loadPost(id);
    if (!this.isLive(post)) err(NotFoundException, 'POST_NOT_AVAILABLE', 'Listing is no longer available');
    const rows = await this.liveQuery()
      .addSelect('CASE WHEN post.district = :district THEN 0 WHEN post.province = :province THEN 1 ELSE 2 END', 'loc_rank')
      .addSelect('CASE WHEN post.price_unit = :unit THEN ABS(post.price_amount - CAST(:price AS numeric)) END', 'price_dist')
      .andWhere('post.category = :category')
      .andWhere('post.id <> :id')
      .setParameters({
        id, category: post.category, district: post.district ?? '', province: post.province ?? '', price: post.price_amount, unit: post.price_unit ?? '',
      })
      .orderBy('loc_rank', 'ASC')
      .addOrderBy('price_dist', 'ASC', 'NULLS LAST')
      .addOrderBy('post.date_created', 'DESC')
      .addOrderBy('post.id', 'DESC')
      .limit(limit)
      .getMany();
    return this.items(rows);
  }

  /**
   * `GET /posts/map`: listings with a pin inside the viewport, grouped on a grid of
   * MAP_CLUSTER_PX screen pixels at `zoom`. A cell holding one listing is a pin with its
   * price; a denser cell is a cluster with a count. Never more than MAP_MAX_CELLS cells.
   */
  async map(q: MapQueryDto, attrs: Record<string, string>): Promise<MapResponse> {
    const box = q.bbox.split(',').map(Number);
    const [w, s, e, n] = box as [number, number, number, number];
    if (
      box.length !== 4 || box.some((v) => !Number.isFinite(v)) || w >= e || s >= n ||
      e - w > MAP_MAX_SPAN_DEG || n - s > MAP_MAX_SPAN_DEG || Math.abs(s) > 90 || Math.abs(n) > 90 || Math.abs(w) > 180 || Math.abs(e) > 180
    ) {
      throw new BadRequestException(`bbox must be west,south,east,north spanning at most ${String(MAP_MAX_SPAN_DEG)} degrees`);
    }
    const zoom = q.zoom ?? 12;
    const cell = (360 / (256 * 2 ** zoom)) * MAP_CLUSTER_PX;

    const qb = this.liveQuery();
    await this.applyFilters(qb, q, attrs);
    const terms = searchTerms(q.q);
    if (terms.length) {
      const search = searchSql(expandTerms(terms, await this.labelIndex()), terms, 'all');
      for (const where of search.where) qb.andWhere(where);
      qb.setParameters(search.params);
    }
    qb.andWhere('post.geo IS NOT NULL').andWhere('post.geo && ST_MakeEnvelope(:w, :s, :e, :n, 4326)::geography', { w, s, e, n });
    const total = await qb.getCount();
    // pg returns double precision as numbers and int4 as numbers; typed loosely and coerced below.
    interface Cell {
      cx: string; cy: string; n: number; lat: number | string; lng: number | string; id: number | string;
      category: string; price_amount: string | null; price_unit: string | null; is_featured: boolean;
    }
    const cells = await qb
      .select('floor(post.longitude / :cell)', 'cx')
      .addSelect('floor(post.latitude / :cell)', 'cy')
      .addSelect('COUNT(*)::int', 'n')
      .addSelect('AVG(post.latitude)', 'lat')
      .addSelect('AVG(post.longitude)', 'lng')
      .addSelect('MAX(post.id)', 'id')
      .addSelect('MAX(post.category)', 'category')
      .addSelect('MAX(post.price_amount)', 'price_amount')
      .addSelect('MAX(post.price_unit)', 'price_unit')
      .addSelect('bool_or(post.is_featured)', 'is_featured')
      .setParameter('cell', cell)
      .groupBy('cx')
      .addGroupBy('cy')
      .orderBy('n', 'DESC')
      .addOrderBy('id', 'DESC')
      .limit(MAP_MAX_CELLS)
      .getRawMany<Cell>();
    const pins: MapPin[] = [];
    const clusters: MapCluster[] = [];
    for (const c of cells) {
      const lat = Number(c.lat);
      const lng = Number(c.lng);
      if (c.n === 1) {
        pins.push({ id: Number(c.id), lat, lng, category: c.category, price_amount: c.price_amount, price_unit: c.price_unit, is_featured: c.is_featured });
      } else {
        clusters.push({ id: `${c.cx}:${c.cy}`, lat, lng, count: c.n });
      }
    }
    return { pins, clusters, total };
  }

  /** `GET /posts/:id/availability`: only a live listing (or the owner's / an admin's) has a calendar. */
  async availabilityOf(id: number, from?: string, to?: string): Promise<AvailabilityResponse> {
    const post = await this.loadPost(id);
    if (post.is_draft || post.approval_status !== 'APPROVED') err(NotFoundException, 'POST_NOT_FOUND', 'Listing not found');
    return this.availability.busy(id, from, to);
  }

  async listMine(me: RequestUser): Promise<MyListingItem[]> {
    const rows = await this.posts.find({
      where: { user_id: me.id, deleted_at: undefined as never },
      order: { date_created: 'DESC', id: 'DESC' },
    });
    return this.mine(rows.filter((p) => p.deleted_at === null), effectivePlan(await this.owner(me.id)));
  }

  async stats(me: RequestUser): Promise<MyListingStats> {
    const rows = (await this.posts.find({ order: { date_created: 'DESC', id: 'DESC' }, where: { user_id: me.id } })).filter(
      (p) => p.deleted_at === null,
    );
    const user = await this.owner(me.id);
    const saved = await this.ds.query<Array<{ post_id: number; n: number }>>(
      'SELECT post_id, COUNT(*)::int AS n FROM post_likes WHERE post_id = ANY($1::int[]) GROUP BY post_id',
      [rows.map((p) => p.id)],
    );
    const saves = new Map(saved.map((r) => [r.post_id, r.n]));
    const contacts = await this.contacts.lifetime(rows.map((p) => p.id));
    const posts = rows.map((p) => ({
      id: p.id,
      title: p.title,
      approval_status: p.approval_status,
      status: p.status,
      views: p.views,
      saves: saves.get(p.id) ?? 0,
      contacts: contacts.get(p.id) ?? 0,
    }));
    return {
      totals: {
        posts: posts.length,
        views: posts.reduce((n, p) => n + p.views, 0),
        saves: posts.reduce((n, p) => n + p.saves, 0),
        contacts: posts.reduce((n, p) => n + p.contacts, 0),
      },
      posts,
      plan: await this.planUsage(me.id, user),
    };
  }

  /** `planUsage` for a provider; null for a customer (the shell shows no quota). */
  async providerPlan(userId: string): Promise<PlanUsage | null> {
    const u = await this.owner(userId);
    return u.type === 'PROVIDER' ? this.planUsage(userId, u) : null;
  }

  /** The caller's plan and how many live listings count against it. */
  async planUsage(userId: string, user?: User): Promise<PlanUsage> {
    const u = user ?? (await this.owner(userId));
    const plan = effectivePlan(u);
    return {
      name: plan,
      post_limit: planLimits(plan).posts,
      active_posts: await this.activeCount(userId),
      expires_at: plan === 'FREE' ? null : (u.plan_expires_at?.toISOString() ?? null),
    };
  }

  /** Live-listing counts per category key; registered with CategoryService. */
  async countLiveByCategory(): Promise<Record<string, number>> {
    const rows = await this.ds.query<Array<{ category: string; n: number }>>(
      `SELECT p.category, COUNT(*)::int AS n FROM posts p WHERE ${LIVE_SQL} GROUP BY p.category`,
    );
    return Object.fromEntries(rows.map((r) => [r.category, r.n]));
  }

  // ---- moderation ----------------------------------------------------------

  async adminList(q: AdminListQueryDto): Promise<Paginated<AdminListing>> {
    const page = q.page ?? 1;
    const limit = q.limit ?? 50;
    const status = q.approval_status;
    const where =
      status === 'PENDING'
        ? "(approval_status = 'PENDING' OR pending_revision IS NOT NULL)"
        : status
          ? 'approval_status = $3'
          : 'TRUE';
    const base = `FROM posts WHERE deleted_at IS NULL AND is_draft = false AND ${where}`;
    const params: unknown[] = [limit, (page - 1) * limit];
    if (status && status !== 'PENDING') params.push(status);
    const order =
      status === 'PENDING'
        ? "COALESCE((pending_revision->>'submitted_at')::timestamptz, date_created) ASC, id ASC"
        : 'date_created DESC, id DESC';
    const [ids, count] = await Promise.all([
      this.ds.query<Array<{ id: number }>>(`SELECT id ${base} ORDER BY ${order} LIMIT $1 OFFSET $2`, params),
      this.ds.query<Array<{ n: number }>>(`SELECT COUNT(*)::int AS n ${base.replace('$3', '$1')}`, status && status !== 'PENDING' ? [status] : []),
    ]);
    const rows = await this.posts.findBy({ id: In(ids.map((r) => r.id)) });
    const byId = new Map(rows.map((p) => [p.id, p]));
    const ordered = ids.map((r) => byId.get(r.id)).filter((p): p is Post => p !== undefined);
    const owners = await this.owners(ordered);
    const items = ordered.map((p): AdminListing => this.adminItem(p, owners));
    return { items, total: count[0]?.n ?? 0 };
  }

  private adminItem(p: Post, owners: Map<string, PublicUser>): AdminListing {
    const edit_diff: ListingEditDiff[] | null = p.pending_revision
      ? diffContent(contentOf(p), revisionContent(p.pending_revision))
      : null;
    return {
      ...this.item(p, owners),
      details: p.details,
      like_count: 0,
      liked: false,
      my_pending_booking_id: null,
      pending_revision: p.pending_revision,
      previous_snapshot: p.previous_snapshot,
      rejection_reason: p.rejection_reason,
      rejection_field: p.rejection_field,
      is_draft: p.is_draft,
      edit_diff,
    };
  }

  private async adminView(id: number): Promise<AdminListing> {
    const p = await this.loadPost(id);
    return this.adminItem(p, await this.owners([p]));
  }

  async approve(id: number): Promise<AdminListing> {
    const reclaim: string[] = [];
    let revision = false;
    const post = await this.ds.transaction(async (em) => {
      const p = await this.loadPost(id, em, true);
      if (p.is_draft) return err(BadRequestException, 'POST_NOT_AVAILABLE', 'A draft is not in the queue');
      if (p.approval_status === 'APPROVED' && !p.pending_revision) return p; // idempotent
      if (p.pending_revision) {
        revision = true;
        const live = contentOf(p);
        const rev = revisionContent(p.pending_revision);
        reclaim.push(...live.images.filter((k) => !rev.images.includes(k)));
        p.previous_snapshot ??= snapshotOf(live);
        applyContent(p, rev);
        p.pending_revision = null;
      } else {
        p.previous_snapshot = null;
      }
      p.approval_status = 'APPROVED';
      // First publication only: saved searches count a listing as new from this moment.
      p.published_at ??= new Date();
      p.rejection_reason = null;
      p.rejection_field = null;
      // An edit or resubmit can reach the front of the queue after its window closed.
      if (p.status === 'EXPIRED' || (p.expires_at !== null && p.expires_at.getTime() <= Date.now())) {
        const plan = p.user_id ? effectivePlan(await em.getRepository(User).findOneBy({ id: p.user_id })) : 'FREE';
        p.expires_at = await this.windowEnd(p.category, plan);
        p.status = 'ACTIVE';
        p.expiry_warned_at = null;
      }
      return em.getRepository(Post).save(p);
    });
    await this.photos.delete(reclaim);
    this.events.emit({ type: 'listing.approved', post_id: post.id, user_id: post.user_id, title: post.title, revision });
    return this.adminView(post.id);
  }

  /** Validates a rejection's field key against the base wizard fields and the category schema. */
  private async assertFieldKey(category: string, key: string | null): Promise<void> {
    if (key === null || BASE_FIELD_KEYS.includes(key)) return;
    const schema = await this.categories.get(category).catch(() => null);
    if (schema?.fields.some((f) => f.key === key)) return;
    err(BadRequestException, 'INVALID_FIELD_KEY', `Unknown field '${key}'`);
  }

  async reject(id: number, dto: RejectListingDto): Promise<AdminListing> {
    const fieldKey = dto.field_key?.trim() || null;
    const reclaim: string[] = [];
    let revision = false;
    const post = await this.ds.transaction(async (em) => {
      const p = await this.loadPost(id, em, true);
      if (p.is_draft) return err(BadRequestException, 'POST_NOT_AVAILABLE', 'A draft is not in the queue');
      await this.assertFieldKey(p.category, fieldKey);
      if (p.pending_revision) {
        // Refuses the edit, not the listing: the approved version stays in browse.
        revision = true;
        reclaim.push(...p.pending_revision.images.filter((k) => !p.images.includes(k)));
        p.pending_revision = null;
      } else {
        const newly = p.approval_status !== 'REJECTED';
        p.approval_status = 'REJECTED';
        if (newly && p.user_id) {
          await em.query('UPDATE users SET posts_rejected = posts_rejected + 1 WHERE id = $1', [p.user_id]);
        }
      }
      p.rejection_reason = dto.reason;
      p.rejection_field = fieldKey;
      p.previous_snapshot = null;
      return em.getRepository(Post).save(p);
    });
    await this.photos.delete(reclaim);
    this.events.emit({
      type: 'listing.rejected', post_id: post.id, user_id: post.user_id, title: post.title,
      revision, reason: dto.reason, field_key: fieldKey,
    });
    return this.adminView(post.id);
  }
}

export type { ListingRevision };
