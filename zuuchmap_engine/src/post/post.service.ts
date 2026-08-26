import { Injectable, NotFoundException, ForbiddenException, BadRequestException, Logger, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { Status } from '../enums/status';
import { Plan } from '../enums/plan';
import { Post, PostSnapshot } from './entities/post.entity';
import { CategorySchema, FieldDef } from './entities/category-schema.entity';
import { isPriceUnit } from '../enums/priceunit';
import { User } from '../user/entities/user.entity';
import { CreatePostDto } from './dto/create-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { ImageUploadHandler, deleteMultipleImages } from '../utils/uploader';
import { publicUser } from '../utils/public-user';
import { ViewedpostService } from './viewedpost.service';
import { EventsGateway } from '../events/events.gateway';
import { sharedCache, invalidatePostReadCaches } from '../utils/cache';
import { CategoryService } from './category.service';
import { PostNotificationService } from './post-notification.service';
import { AnalyticsService } from '../analytics/analytics.service';

const POST_EXPIRY_DAYS = 30;

/**
 * What each plan entitles a provider to. `expiryDays: null` means "use the
 * category's own `post_expiry_days`", which is the pre-monetization behaviour.
 */
export const PLAN_LIMITS: Record<string, { posts: number; expiryDays: number | null }> = {
  [Plan.FREE]: { posts: 3, expiryDays: null },
  [Plan.PROVIDER]: { posts: 25, expiryDays: 90 },
};

/**
 * How long a new (or relisted) post stays live. The plan can lengthen the
 * default window but never override a category that has deliberately chosen a
 * shorter one (SOS, for example).
 */
export const expiryDaysFor = (
  schema: { post_expiry_days?: number | null } | null | undefined,
  plan: string,
): number => {
  const categoryDays = schema?.post_expiry_days || POST_EXPIRY_DAYS;
  const planDays = (PLAN_LIMITS[plan] ?? PLAN_LIMITS[Plan.FREE]).expiryDays;
  return schema?.post_expiry_days ? categoryDays : Math.max(categoryDays, planDays ?? 0);
};

const TTL = {
  posts: 30_000,   // 30 s
  map: 60_000,     // 60 s
  similar: 5 * 60_000, // 5 min
  // Longer than `posts` on purpose: a total that is a minute stale is a
  // cosmetic difference on a result header, and it saves a full pass per page.
  count: 60_000,   // 60 s
} as const;

/** How far ahead `busy_dates` looks. Two weeks is what a booking calendar shows. */
export const BUSY_DATES_DAYS = 14;

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Expands ACCEPTED booking ranges into the per-post set of ISO days that fall
 * inside `[today, today + days)`. Pure so the calendar arithmetic is testable
 * without a database; bookings are whole-day, so the maths is in UTC days.
 */
export function expandBusyDates(
  rows: { postId: number; start_date: Date | string; end_date: Date | string }[],
  today: Date = new Date(),
  days: number = BUSY_DATES_DAYS,
): Map<number, string[]> {
  const from = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const to = from + days * 86_400_000;
  const out = new Map<number, Set<string>>();
  for (const r of rows) {
    const s = new Date(r.start_date); const e = new Date(r.end_date);
    if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) continue;
    let cur = Math.max(Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate()), from);
    const end = Math.min(Date.UTC(e.getUTCFullYear(), e.getUTCMonth(), e.getUTCDate()), to - 86_400_000);
    for (; cur <= end; cur += 86_400_000) {
      if (!out.has(r.postId)) out.set(r.postId, new Set());
      out.get(r.postId)!.add(isoDay(new Date(cur)));
    }
  }
  return new Map([...out].map(([id, set]) => [id, [...set].sort()]));
}

/**
 * The content fields an admin diffs when a post comes back for re-approval.
 * `price` is `price_amount` under the name the clients use.
 */
export function snapshotOf(post: Post): PostSnapshot {
  return {
    title: post.title ?? null,
    details: post.details ?? null,
    price: post.price_amount == null ? null : Number(post.price_amount),
    price_unit: post.price_unit ?? null,
    attributes: post.attributes ?? null,
    images: [...(post.images ?? [])],
    subcategory: post.subcategory ?? null,
    province: post.province ?? null,
    district: post.district ?? null,
  };
}

/**
 * Hard ceiling on map pins. A backstop against an unbounded payload, not a
 * product decision — when the marketplace outgrows it the answer is a
 * viewport-bounded query, and `findForMap` logs a warning on the way there.
 */
const MAP_PIN_LIMIT = 5000;

// Returns the keys of required fields the payload does not answer.
// The false/0 cases are the whole reason this is not a truthiness check:
// "operator not included" and "capacity 0" are answers, not omissions.
export function validateRequiredAttributes(
  schema: { fields?: FieldDef[] },
  attributes: Record<string, any>,
): string[] {
  const attrs = attributes ?? {};
  return (schema?.fields ?? [])
    .filter((f) => f.required)
    .filter((f) => {
      const v = attrs[f.key];
      if (v === undefined || v === null) return true;
      if (typeof v === 'string') return v.trim() === '';
      if (Array.isArray(v)) return v.length === 0;
      return false;
    })
    .map((f) => f.key);
}

// Builds the `attr.<key>` WHERE clauses onto a query builder.
// Exported for unit testing. `fieldTypes` maps a field key to its FieldDef type.
export function buildAttrFilter(
  qb: { andWhere: (sql: string, params: Record<string, any>) => any },
  attrs: Record<string, any>,
  fieldTypes: Map<string, string>,
): void {
  let i = 0;
  for (const [rawKey, val] of Object.entries(attrs ?? {})) {
    if (val === undefined || val === '') continue;
    const m = rawKey.match(/^([a-z0-9_]+?)(_min|_max)?$/);
    if (!m) continue;
    const [, key, range] = m;
    const p = `attr${i}`;
    const type = fieldTypes.get(key);

    if (range) {
      const num = Number(val);
      if (Number.isNaN(num)) continue;
      qb.andWhere(
        `post.attributes->>'${key}' ~ '^[0-9]+\\.?[0-9]*$' AND (post.attributes->>'${key}')::numeric ${range === '_min' ? '>=' : '<='} :${p}`,
        { [p]: num },
      );
    } else if (type === 'boolean') {
      // A real JSON boolean, not the string "true" — containment hits the GIN index.
      qb.andWhere(`post.attributes @> :${p}::jsonb`, {
        [p]: JSON.stringify({ [key]: String(val) === 'true' }),
      });
    } else if (type === 'multiselect') {
      // `?` asks whether the stored array contains this value.
      qb.andWhere(`post.attributes->:${p}_k ? :${p}`, { [`${p}_k`]: key, [p]: String(val) });
    } else if (type === 'select') {
      // Enumerated fields match by containment so the GIN index can serve them.
      qb.andWhere(`post.attributes @> :${p}::jsonb`, {
        [p]: JSON.stringify({ [key]: String(val) }),
      });
    } else {
      // Free text stays a substring scan.
      qb.andWhere(`post.attributes->>'${key}' ILIKE :${p}`, { [p]: `%${String(val)}%` });
    }
    i++;
  }
}

@Injectable()
export class PostService {
  private readonly logger = new Logger(PostService.name);
  private readonly cache = sharedCache;

  constructor(
    @InjectRepository(Post)
    private readonly postRepository: Repository<Post>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly viewedpostService: ViewedpostService,
    private readonly categoryService: CategoryService,
    private readonly notifications: PostNotificationService,
    @Optional() private readonly events: EventsGateway,
    @Optional() private readonly analytics?: AnalyticsService,
  ) {}

  /**
   * Maps attribute key → field type for one category, so the query builder can
   * pick an indexable predicate. Returns an empty map when no category filter
   * is set (a cross-category attribute query cannot assume a single schema).
   */
  private async attributeFieldTypes(category?: string): Promise<Map<string, string>> {
    const types = new Map<string, string>();
    if (!category) return types;

    try {
      const schemas = await this.categoryService.getCategories();
      const schema = schemas.find((c) => c.key === category);
      for (const field of schema?.fields ?? []) {
        if (field?.key && field?.type) types.set(field.key, field.type);
      }
    } catch (err) {
      // Filtering must still work if the schema lookup fails — fall back to ILIKE.
      this.logger.warn(`Could not resolve field types for ${category}: ${err?.message}`);
    }
    return types;
  }

  /** `price_unit` is a plain varchar column, so the enum is only enforced here. */
  private assertPriceUnit(unit?: string | null): void {
    if (unit !== undefined && unit !== null && unit !== '' && !isPriceUnit(unit)) {
      throw new BadRequestException('INVALID_PRICE_UNIT');
    }
  }

  // ─── Posts ────────────────────────────────────────────────────────────────

  /** Rejects categories/subcategories that no schema defines, and bad statuses. Returns the schema. */

/**
 * The category, or null when there genuinely is no such category.
 *
 * `.catch(() => null)` used to stand here, which flattened a failed lookup into
 * the same answer as an unknown key — so a database blip reached the provider as
 * "Unknown category 'vehiclerent'" and sent them off to fix a category that was
 * never broken. Only NotFound is the caller's problem; everything else is ours
 * and must keep its own status code.
 */
  private async findCategory(key: string): Promise<CategorySchema | null> {
    try {
      return await this.categoryService.getCategory(key);
    } catch (err) {
      if (err instanceof NotFoundException) return null;
      throw err;
    }
  }

  private async validateCategoryAndStatus(
    category: string, subcategory?: string, status?: string,
  ): Promise<CategorySchema> {
    const schema = await this.findCategory(category);
    if (!schema || schema.active === false) {
      throw new BadRequestException(`Unknown category '${category}'`);
    }
    if (
      subcategory &&
      (schema.subcategories?.length ?? 0) > 0 &&
      !schema.subcategories.some((s) => s.value === subcategory)
    ) {
      throw new BadRequestException(`Unknown subcategory '${subcategory}' for category '${category}'`);
    }
    this.validateStatus(status);
    return schema;
  }

  private validateStatus(status?: string): void {
    if (status && !Object.values(Status).includes(status as Status)) {
      throw new BadRequestException(`Invalid status '${status}'`);
    }
  }

  /**
   * The plan a user is actually entitled to right now. A PROVIDER whose
   * `plan_expires_at` has passed is FREE until it is renewed — entitlement is
   * derived on read rather than swept by a job, so a missed cron run can never
   * hand out paid features for free.
   */
  private effectivePlan(user?: { plan?: string; plan_expires_at?: Date | null } | null): string {
    if (!user?.plan || user.plan === Plan.FREE) return Plan.FREE;
    if (user.plan_expires_at && new Date(user.plan_expires_at).getTime() <= Date.now()) return Plan.FREE;
    return user.plan;
  }

  /**
   * How many posts currently occupy a slot in the owner's quota.
   *
   * Rejected posts do not count — they were never live, and counting them would
   * let a bad first attempt lock a provider out of the tier.
   *
   * Expiry is read off `expires_at`, not off `status`, for the same reason
   * `findAll` does: the sweep cron only runs at midnight, so for up to a day a
   * post is already gone from browse while still marked ACTIVE. Counting those
   * would lock a provider out of replacing a post they can no longer see —
   * quota and visibility have to agree on what "live" means.
   *
   * Shared with `providerStats` so the number the provider is shown is the same
   * one the create path measures against.
   */
  private activePostCount(ownerId: string): Promise<number> {
    return this.postRepository
      .createQueryBuilder('post')
      .where('post.userId = :ownerId', { ownerId })
      .andWhere('post.approval_status != :rejected', { rejected: 'REJECTED' })
      .andWhere('post.status != :expired', { expired: Status.EXPIRED })
      .andWhere('(post.expires_at IS NULL OR post.expires_at > NOW())')
      .getCount();
  }

  private async assertQuota(ownerId: string, plan: string): Promise<void> {
    const limit = (PLAN_LIMITS[plan] ?? PLAN_LIMITS[Plan.FREE]).posts;
    const active = await this.activePostCount(ownerId);
    if (active >= limit) {
      throw new BadRequestException({ message: 'POST_QUOTA_EXCEEDED', limit, plan });
    }
  }

  async create(dto: CreatePostDto, files: Express.Multer.File[], ownerId: string): Promise<Post> {
    const schema = await this.validateCategoryAndStatus(dto.category, dto.subcategory ?? dto.secondcategory, dto.status);
    this.assertPriceUnit(dto.price_unit);
    const owner = ownerId ? await this.userRepository.findOne({ where: { id: ownerId } }) : null;
    const plan = this.effectivePlan(owner);
    if (ownerId) await this.assertQuota(ownerId, plan);
    const missing = validateRequiredAttributes(schema, dto.attributes ?? {});
    if (missing.length) {
      throw new BadRequestException({ message: 'MISSING_REQUIRED_ATTRIBUTES', fields: missing });
    }
    const expiryDays = expiryDaysFor(schema, plan);
    const postData: Partial<Post> = {
      category: dto.category,
      subcategory: dto.subcategory ?? dto.secondcategory,
      title: dto.title,
      details: dto.details,
      province: dto.province,
      district: dto.district,
      address: dto.address,
      latitude: dto.latitude,
      longitude: dto.longitude,
      location: dto.location,
      price_amount: dto.price_amount,
      price_unit: dto.price_unit,
      contact_phone: dto.contact_phone,
      contact_email: dto.contact_email,
      available_from: dto.available_from ? new Date(dto.available_from) : undefined,
      available_until: dto.available_until ? new Date(dto.available_until) : undefined,
      website: dto.website,
      attributes: dto.attributes || {},
      images: [],
      status: dto.status ?? Status.ACTIVE,
      approval_status: 'PENDING',
      expires_at: new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000),
    };
    const post = this.postRepository.create(postData as Post);

    if (ownerId) {
      const user = await this.userRepository.findOne({ where: { id: ownerId } });
      if (user) post.user = user;
    }

    const saved = await this.postRepository.save(post);

    if (files?.length) {
      const processedImages = await ImageUploadHandler.processAfterSave(files);
      saved.images = processedImages;
      await this.postRepository.save(saved);
    }

    invalidatePostReadCaches();
    this.events?.emitPostCreated({ id: saved.id, category: saved.category, title: saved.title });

    // Push notification to admins (fires async, doesn't block response)
    this.notifications.notifyAdmins(saved.id, saved.title, saved.category)
      .catch(err => this.logger.warn(`notifyAdmins backstop: ${err?.message}`));

    return saved;
  }

  async findAll(filters: {
    category?: string;
    subcategory?: string;
    province?: string;
    district?: string;
    approval_status?: string;
    status?: string;
    page?: number;
    limit?: number;
    q?: string;
    attrs?: Record<string, string>;
    sort?: string;
    price_min?: string;
    price_max?: string;
  } = {}): Promise<{ items: Post[]; total: number }> {
    const hasAttrs = filters.attrs && Object.keys(filters.attrs).length > 0;
    const useCache = !filters.q && !hasAttrs;
    // Clamp pagination before anything touches SQL: Postgres rejects negative
    // LIMIT/OFFSET outright, and an uncapped limit lets one request drag the
    // whole table (with user+company joins) into memory.
    const limit = Math.min(Math.max(Math.floor(filters.limit || 50) || 50, 1), 100);
    const page = Math.max(Math.floor(filters.page || 1) || 1, 1);
    // encodeURIComponent each part so a ':' inside a query param can't
    // collide with the key separator.
    const k = (v: unknown) => encodeURIComponent(String(v ?? ''));
    const cacheKey = `posts:list:${k(filters.category)}:${k(filters.subcategory)}:${k(filters.province)}:${k(filters.district)}:${k(filters.approval_status)}:${k(filters.status)}:${page}:${limit}:${k(filters.sort)}:${k(filters.price_min)}:${k(filters.price_max)}`;
    if (useCache) {
      const cached = this.cache.get<{ items: Post[]; total: number }>(cacheKey);
      if (cached) return cached;
    }

    const qb = this.postRepository.createQueryBuilder('post')
      .leftJoinAndSelect('post.user', 'user')
      .leftJoinAndSelect('user.company', 'company');

    // Whitelisted sort orders — anything else falls back to newest-first.
    // Price sorts push unpriced posts last so "cheapest" never means "no price".
    switch (filters.sort) {
      case 'price_asc':
        qb.orderBy('post.price_amount', 'ASC', 'NULLS LAST').addOrderBy('post.date_created', 'DESC');
        break;
      case 'price_desc':
        qb.orderBy('post.price_amount', 'DESC', 'NULLS LAST').addOrderBy('post.date_created', 'DESC');
        break;
      case 'views':
        qb.orderBy('post.views', 'DESC').addOrderBy('post.date_created', 'DESC');
        break;
      default:
        // Paid placement applies only to the default (newest-first) browse.
        // Featured never hides or filters anything — it lifts within the same
        // result set, so an unpaid post is always still reachable.
        // Ordered by the stored `is_featured`, not by `featured_until > NOW()`.
        // The predicate form could not be indexed — NOW() is not immutable — so
        // every browse read and sorted the whole matching set to return one
        // page. IDX_post_browse_order serves this ordering directly.
        qb.orderBy('post.is_featured', 'DESC')
          .addOrderBy('post.date_created', 'DESC');
    }

    const priceMin = Number(filters.price_min);
    if (filters.price_min !== undefined && filters.price_min !== '' && !Number.isNaN(priceMin)) {
      qb.andWhere('post.price_amount >= :priceMin', { priceMin });
    }
    const priceMax = Number(filters.price_max);
    if (filters.price_max !== undefined && filters.price_max !== '' && !Number.isNaN(priceMax)) {
      qb.andWhere('post.price_amount <= :priceMax', { priceMax });
    }

    if (filters.category) qb.andWhere('post.category = :category', { category: filters.category });
    if (filters.subcategory) qb.andWhere('post.subcategory = :subcategory', { subcategory: filters.subcategory });
    if (filters.province) qb.andWhere('post.province = :province', { province: filters.province });
    if (filters.district) qb.andWhere('post.district = :district', { district: filters.district });
    if (filters.approval_status) qb.andWhere('post.approval_status = :approval_status', { approval_status: filters.approval_status });
    if (filters.status) qb.andWhere('post.status = :status', { status: filters.status });

    // Exclude expired posts from public queries. The expiry-date guard applies
    // even when the caller filters by status: the cron flips `status` on a
    // schedule, so a post can be past `expires_at` while still marked ACTIVE,
    // and `?status=ACTIVE` must not resurrect it.
    if (filters.approval_status === 'APPROVED') {
      if (!filters.status) {
        qb.andWhere('post.status != :expired', { expired: Status.EXPIRED });
      }
      qb.andWhere('(post.expires_at IS NULL OR post.expires_at > NOW())');
    }

    if (filters.q) {
      // A duplicated ?q= param arrives as an array — take the first value
      const raw = String(Array.isArray(filters.q) ? filters.q[0] : filters.q);
      // Prefix-matching full-text search on the generated search_vector column
      const terms = raw.trim().substring(0, 100).split(/\s+/)
        .map((t) => t.replace(/[^\p{L}\p{N}]/gu, ''))
        .filter(Boolean)
        .slice(0, 8);
      if (terms.length) {
        const tsq = terms.map((t) => `${t}:*`).join(' & ');
        qb.andWhere(`post.search_vector @@ to_tsquery('simple', :tsq)`, { tsq });
      }
    }

    if (hasAttrs) {
      const fieldTypes = await this.attributeFieldTypes(filters.category);
      buildAttrFilter(qb, filters.attrs ?? {}, fieldTypes);
    }

    qb.take(limit).skip((page - 1) * limit);

    // The count is the same for every page of a filter set, and it costs a
    // second full pass (20 ms / 12k buffers at 62k posts) that getManyAndCount
    // paid on every request. Cache it under a key that deliberately omits page,
    // limit and sort, so paging and re-sorting reuse one count — and so a
    // search, which the item cache skips, still only counts once per window.
    const countKey = `posts:count:${k(filters.category)}:${k(filters.subcategory)}:${k(filters.province)}:${k(filters.district)}:${k(filters.approval_status)}:${k(filters.status)}:${k(filters.price_min)}:${k(filters.price_max)}:${k(filters.q)}:${hasAttrs ? JSON.stringify(filters.attrs) : ''}`;
    const cachedTotal = this.cache.get<number>(countKey);
    // getCount() ignores take/skip, so it counts the filter set, not the page.
    const [items, total] = await Promise.all([
      qb.getMany(),
      cachedTotal !== undefined && cachedTotal !== null
        ? Promise.resolve(cachedTotal)
        : qb.getCount().then((n) => { this.cache.set(countKey, n, TTL.count); return n; }),
    ]);

    // Demand-gap signal: record public searches (text/attribute queries) and any
    // filtered browse that came back empty. Cached repeats within the TTL are not
    // re-recorded — aggregates need the shape of demand, not every request.
    const isSearch = !!(filters.q || hasAttrs);
    const isFilteredBrowse = !!(filters.category || filters.subcategory || filters.province || filters.district);
    if (filters.approval_status === 'APPROVED' && page === 1 && (isSearch || (isFilteredBrowse && total === 0))) {
      this.analytics?.record('search.performed', {
        q: filters.q ? String(filters.q).slice(0, 100) : undefined,
        category: filters.category,
        subcategory: filters.subcategory,
        province: filters.province,
        district: filters.district,
        attrs: hasAttrs ? Object.keys(filters.attrs ?? {}) : undefined,
        total,
      });
    }

    // Never let raw User entities (push_token, device fields, …) reach clients.
    const result = {
      items: await this.attachBusyDates(items.map((p) => ({ ...p, user: publicUser(p.user) }) as Post)),
      total,
    };
    if (useCache) this.cache.set(cacheKey, result, TTL.posts);
    return result;
  }

  /**
   * Adds `busy_dates` to every post whose category is bookable. One query over
   * the ACCEPTED bookings of the whole page, never per post. Bookings live in
   * their own module, which imports this one — so this reads the table directly
   * rather than closing a module cycle for one SELECT.
   */
  async attachBusyDates<T extends Pick<Post, 'id' | 'category'>>(posts: T[], days = BUSY_DATES_DAYS): Promise<T[]> {
    if (!posts.length) return posts;
    let rentalKeys: Set<string>;
    try {
      const schemas = await this.categoryService.getCategories();
      rentalKeys = new Set(schemas.filter((c) => c.has_rental_status).map((c) => c.key));
    } catch (err) {
      this.logger.warn(`attachBusyDates: schema lookup failed — ${err?.message}`);
      return posts;
    }
    const ids = posts.filter((p) => rentalKeys.has(p.category)).map((p) => p.id);
    if (!ids.length) return posts;

    const rows: { postId: number; start_date: Date; end_date: Date }[] = await this.postRepository.manager.query(
      `SELECT "postId", start_date, end_date FROM "booking"
        WHERE "postId" = ANY($1) AND status = 'ACCEPTED'
          AND end_date >= CURRENT_DATE AND start_date < CURRENT_DATE + ($2 || ' days')::interval`,
      [ids, String(days)],
    );
    const busy = expandBusyDates(rows, new Date(), days);
    for (const p of posts) {
      if (rentalKeys.has(p.category)) (p as any).busy_dates = busy.get(p.id) ?? [];
    }
    return posts;
  }

  /**
   * Same-category listings a reader of `id` would plausibly want next: same
   * district first, then same province, then the rest — and within each ring
   * the closest price wins, unpriced last, newest as the tiebreaker.
   */
  async findSimilar(id: number, limit = 6): Promise<Post[]> {
    const take = Math.min(Math.max(Math.floor(limit || 6) || 6, 1), 20);
    const cacheKey = `posts:similar:${id}:${take}`;
    const cached = this.cache.get<Post[]>(cacheKey);
    if (cached) return cached;

    const post = await this.findOne(id);
    const price = post.price_amount == null ? null : Number(post.price_amount);

    const items = await this.postRepository.createQueryBuilder('post')
      .leftJoinAndSelect('post.user', 'user')
      .leftJoinAndSelect('user.company', 'company')
      .addSelect(
        `CASE WHEN post.district = :district THEN 0 WHEN post.province = :province THEN 1 ELSE 2 END`,
        'loc_rank',
      )
      .addSelect('ABS(post.price_amount - :price::numeric)', 'price_dist')
      .where('post.category = :category', { category: post.category })
      .andWhere('post.id != :id', { id })
      .andWhere('post.approval_status = :approved', { approved: 'APPROVED' })
      .andWhere('post.status = :active', { active: Status.ACTIVE })
      .andWhere('(post.expires_at IS NULL OR post.expires_at > NOW())')
      .setParameters({ district: post.district ?? '', province: post.province ?? '', price })
      .orderBy('loc_rank', 'ASC')
      .addOrderBy('price_dist', 'ASC', 'NULLS LAST')
      .addOrderBy('post.date_created', 'DESC')
      .take(take)
      .getMany();

    const result = items.map((p) => ({ ...p, user: publicUser(p.user) }) as Post);
    await this.attachBusyDates(result);
    this.cache.set(cacheKey, result, TTL.similar);
    return result;
  }

  async findForMap(): Promise<Post[]> {
    const cached = this.cache.get<Post[]>('posts:map');
    if (cached) return cached;

    // Slim payload: map pins only need display fields — no user join (privacy + size)
    const result = await this.postRepository.createQueryBuilder('post')
      .select([
        'post.id', 'post.category', 'post.subcategory', 'post.title',
        'post.latitude', 'post.longitude', 'post.province', 'post.district',
        'post.price_amount', 'post.price_unit', 'post.images',
        'post.status', 'post.date_created',
      ])
      .where('post.latitude IS NOT NULL AND post.longitude IS NOT NULL')
      .andWhere('post.latitude BETWEEN -90 AND 90')
      .andWhere('post.longitude BETWEEN -180 AND 180')
      .andWhere('post.approval_status = :s', { s: 'APPROVED' })
      .andWhere('post.status != :expired', { expired: Status.EXPIRED })
      .andWhere('(post.expires_at IS NULL OR post.expires_at > NOW())')
      .orderBy('post.date_created', 'DESC')
      // Safety cap so an uncapped getMany() can't scale the payload with the
      // whole table. Raised past the live approved count (and paid for by
      // dropping `attributes`, which no map client reads) — at 2000 the map was
      // quietly hiding hundreds of pins while browse counted them.
      .take(MAP_PIN_LIMIT)
      .getMany();

    if (result.length === MAP_PIN_LIMIT) {
      // Never silent: hitting the cap means pins are missing from the map and
      // the fix is a viewport-bounded query, not a bigger number.
      this.logger.warn(`Map pin cap reached (${MAP_PIN_LIMIT}) — some approved posts are not on the map`);
    }

    await this.attachBusyDates(result);
    this.cache.set('posts:map', result, TTL.map);
    return result;
  }

  /**
   * Per-post attention stats for the provider dashboard: views, saves, and
   * booking requests for every post the user owns, plus rolled-up totals.
   * Likes join on (post_id, post_type) because the app likes by category key.
   *
   * The like/booking counts are correlated subqueries rather than grouped
   * derived tables: a derived table has no reference to the caller, so Postgres
   * aggregated the whole of `likedpost` and `booking` to answer for one
   * provider's handful of posts — cost that grew with the marketplace instead
   * of with the dashboard being rendered.
   */
  async providerStats(userId: string): Promise<{
    totals: { posts: number; views: number; likes: number; bookings_pending: number; bookings_accepted: number };
    posts: Array<Record<string, unknown>>;
    plan: { name: string; expires_at: Date | null; post_limit: number; posts_active: number };
  }> {
    const rows = await this.postRepository.manager.query(
      `SELECT p.id, p.title, p.category, p.approval_status, p.status,
              COALESCE(p.views, 0)::int AS views,
              p.date_created, p.expires_at,
              COALESCE(l.likes, 0)::int AS likes,
              COALESCE(b.pending, 0)::int AS bookings_pending,
              COALESCE(b.accepted, 0)::int AS bookings_accepted
         FROM "post" p
         LEFT JOIN LATERAL (
           SELECT COUNT(*)::int AS likes
             FROM "likedpost" lp
            WHERE lp.post_id = p.id AND lp.post_type = p.category
         ) l ON TRUE
         LEFT JOIN LATERAL (
           SELECT COUNT(*) FILTER (WHERE bk.status = 'PENDING')::int AS pending,
                  COUNT(*) FILTER (WHERE bk.status = 'ACCEPTED')::int AS accepted
             FROM "booking" bk
            WHERE bk."postId" = p.id
         ) b ON TRUE
        WHERE p."userId" = $1
        ORDER BY p.date_created DESC`,
      [userId],
    );
    const totals = rows.reduce(
      (acc, r) => ({
        posts: acc.posts + 1,
        views: acc.views + Number(r.views),
        likes: acc.likes + Number(r.likes),
        bookings_pending: acc.bookings_pending + Number(r.bookings_pending),
        bookings_accepted: acc.bookings_accepted + Number(r.bookings_accepted),
      }),
      { posts: 0, views: 0, likes: 0, bookings_pending: 0, bookings_accepted: 0 },
    );

    // The plan belongs in this payload rather than a second endpoint: a provider
    // asking "how are my posts doing" and "how many more may I publish, and
    // until when" is one question. `effectivePlan` re-derives entitlement here
    // exactly as the create path does, so a lapsed plan reads as FREE on both.
    const owner = await this.userRepository.findOne({ where: { id: userId } });
    const name = this.effectivePlan(owner);
    const plan = {
      name,
      // A lapsed plan reports no expiry — it is FREE now, and showing the date
      // it ran out beside the word "Free" reads as if it were still running.
      expires_at: name === Plan.FREE ? null : (owner?.plan_expires_at ?? null),
      post_limit: (PLAN_LIMITS[name] ?? PLAN_LIMITS[Plan.FREE]).posts,
      posts_active: await this.activePostCount(userId),
    };

    return { totals, posts: rows, plan };
  }

  /**
   * Gives a lapsed post a fresh window, sized by its category and its owner's
   * plan. Returns true when it actually moved the date.
   *
   * Approval and expiry were independent: a provider could edit an expired
   * post, watch it go back into moderation, get approved — and never see it
   * again, because `findAll` filters on `expires_at` and nothing had renewed
   * it. Approving is the admin saying "this should be live now", so it is the
   * point where the window is reopened.
   */
  async relistIfLapsed(post: Post): Promise<boolean> {
    if (!post.expires_at || new Date(post.expires_at).getTime() > Date.now()) return false;

    const owner = post.user?.id
      ? await this.userRepository.findOne({ where: { id: post.user.id } })
      : null;
    // A failed lookup here would silently hand a category that chose a short
    // window (SOS) the 30-day default, so let it surface rather than guess.
    const schema = await this.findCategory(post.category);
    const days = expiryDaysFor(schema, this.effectivePlan(owner));

    const next = new Date();
    next.setDate(next.getDate() + days);
    post.expires_at = next;
    // The nightly sweep may already have stamped it EXPIRED; a fresh window
    // without clearing that leaves it filtered out by status instead.
    if (post.status === Status.EXPIRED) post.status = Status.ACTIVE;
    this.logger.log(`relistIfLapsed: #${post.id} → ${next.toISOString()} (${days}d)`);
    return true;
  }

  async findByUser(userId: string, page = 1, limit = 50): Promise<Post[]> {
    const take = Math.min(Math.max(Math.floor(limit || 50) || 50, 1), 100);
    const safePage = Math.max(Math.floor(page || 1) || 1, 1);
    return this.postRepository.find({
      where: { user: { id: userId } },
      order: { date_created: 'DESC' },
      take,
      skip: (safePage - 1) * take,
    });
  }

  async findOne(id: number): Promise<Post> {
    const post = await this.postRepository.findOne({ where: { id }, relations: ['user', 'user.company'] });
    if (!post) throw new NotFoundException(`Post #${id} not found`);
    return post;
  }

  /**
   * Counts one view per user per post. The route is behind `JwtAuthGuard`, so
   * `userId` is always present — there is no anonymous path to fall back to.
   *
   * A provider opening their own listing is not audience: counting it made the
   * dashboard's headline number partly a reflection of the provider checking on
   * it, which is exactly the number they are trying to read.
   */
  async incrementViews(postId: number, userId: string): Promise<void> {
    const post = await this.postRepository.findOne({
      where: { id: postId },
      relations: ['user'],
      select: { id: true, user: { id: true } },
    });
    if (!post || post.user?.id === userId) return;

    const result = await this.viewedpostService.recordView(userId, 'post', postId);
    if (!result.already_viewed) {
      await this.postRepository.increment({ id: postId }, 'views', 1);
    }
  }

  async update(id: number, dto: UpdatePostDto, files: Express.Multer.File[], userId: string): Promise<Post> {
    const post = await this.findOne(id);

    if (!post.user || post.user.id !== userId) {
      throw new ForbiddenException('You can only update your own posts');
    }
    this.validateStatus(dto.status);
    this.assertPriceUnit(dto.price_unit);

    if (dto.attributes !== undefined) {
      const schemas = await this.categoryService.getCategories();
      const schema = schemas.find((c) => c.key === post.category);
      const missing = schema ? validateRequiredAttributes(schema, dto.attributes) : [];
      if (missing.length) {
        throw new BadRequestException({ message: 'MISSING_REQUIRED_ATTRIBUTES', fields: missing });
      }
    }

    const existingImages: string[] = dto.existingImages || post.images || [];
    const wasApproved = post.approval_status === 'APPROVED';
    const snapshot = snapshotOf(post);

    // Only content edits go back to moderation. Operational fields (rental
    // status toggle, availability dates) must not pull an approved post from
    // browse until an admin re-approves it.
    const strEq = (a: any, b: any) => `${a ?? ''}` === `${b ?? ''}`;
    const numEq = (a: any, b: any) => (a == null && b == null) || Number(a) === Number(b);
    const contentChanged =
      (['subcategory', 'title', 'details', 'province', 'district', 'address',
        'location', 'price_unit', 'contact_phone', 'contact_email', 'website'] as const)
        .some((f) => dto[f] !== undefined && !strEq(dto[f], post[f])) ||
      (dto.secondcategory !== undefined && !strEq(dto.secondcategory, post.subcategory)) ||
      (['latitude', 'longitude', 'price_amount'] as const)
        .some((f) => dto[f] !== undefined && !numEq(dto[f], post[f])) ||
      (dto.attributes !== undefined && JSON.stringify(dto.attributes) !== JSON.stringify(post.attributes ?? {})) ||
      (files?.length ?? 0) > 0 ||
      (dto.existingImages !== undefined && JSON.stringify(dto.existingImages) !== JSON.stringify(post.images ?? []));

    Object.assign(post, {
      subcategory: dto.subcategory ?? dto.secondcategory ?? post.subcategory,
      title: dto.title ?? post.title,
      details: dto.details ?? post.details,
      province: dto.province ?? post.province,
      district: dto.district ?? post.district,
      address: dto.address ?? post.address,
      latitude: dto.latitude ?? post.latitude,
      longitude: dto.longitude ?? post.longitude,
      location: dto.location ?? post.location,
      price_amount: dto.price_amount ?? post.price_amount,
      price_unit: dto.price_unit ?? post.price_unit,
      contact_phone: dto.contact_phone ?? post.contact_phone,
      contact_email: dto.contact_email ?? post.contact_email,
      // An omitted key means "unchanged"; an empty one means "clear it". Without
      // that distinction an availability window, once set, could never be removed.
      available_from: dto.available_from === undefined
        ? post.available_from
        : (dto.available_from ? new Date(dto.available_from) : null),
      available_until: dto.available_until === undefined
        ? post.available_until
        : (dto.available_until ? new Date(dto.available_until) : null),
      website: dto.website ?? post.website,
      status: dto.status ?? post.status,
      attributes: dto.attributes ?? post.attributes,
    });

    if (files?.length) {
      const removedImages = (post.images || []).filter(img => !existingImages.includes(img));
      if (removedImages.length) await deleteMultipleImages(removedImages);

      const newImages = await ImageUploadHandler.processAfterSave(files);
      post.images = [...existingImages, ...newImages];
    } else {
      post.images = existingImages;
    }

    if (contentChanged) {
      // Keep the version the admin already approved so they can review a diff.
      // First edit of a round wins: a second edit before re-approval must not
      // overwrite the baseline with an intermediate draft.
      if (wasApproved && post.previous_snapshot == null) post.previous_snapshot = snapshot;
      post.approval_status = 'PENDING';
      post.rejection_reason = null as unknown as string;
      post.rejection_field = null;
    }
    const updated = await this.postRepository.save(post);
    invalidatePostReadCaches();
    return updated;
  }

  async remove(id: number, userId: string): Promise<void> {
    const post = await this.findOne(id);

    if (!post.user || post.user.id !== userId) {
      throw new ForbiddenException('You can only delete your own posts');
    }

    // A live accepted booking is a commitment to a named customer, and the
    // post is the only place they can see what they booked. Deleting it out
    // from under them is not the provider's call to make unilaterally — they
    // decline or wait it out first.
    const [live] = await this.postRepository.manager.query(
      `SELECT COUNT(*)::int AS count FROM "booking"
        WHERE "postId" = $1 AND status = 'ACCEPTED' AND end_date >= CURRENT_DATE`,
      [id],
    );
    if (Number(live?.count ?? 0) > 0) {
      throw new BadRequestException({
        code: 'POST_HAS_LIVE_BOOKING',
        message: 'This post has an accepted booking that has not ended yet',
        bookings: Number(live.count),
      });
    }

    if (post.images?.length) {
      await deleteMultipleImages(post.images);
    }
    await this.postRepository.delete(id);
    invalidatePostReadCaches();
  }

  // ─── Scheduled jobs ────────────────────────────────────────────────────────

  /**
   * Retires lapsed featured placement.
   *
   * `is_featured` is a materialised `featured_until > NOW()`, so something has
   * to age it out. Hourly rather than daily: the flag decides paid placement,
   * and a day of over-serving a window someone paid for by the day is a
   * refundable amount of wrong. Only lapses are swept — every deliberate
   * feature/unfeature writes the flag on the spot.
   */
  @Cron('0 * * * *')
  async retireLapsedFeatures(): Promise<void> {
    try {
      const result = await this.postRepository
        .createQueryBuilder()
        .update(Post)
        .set({ is_featured: false })
        .where('is_featured = true AND (featured_until IS NULL OR featured_until <= NOW())')
        .execute();
      if (result.affected) {
        this.logger.log(`retireLapsedFeatures: cleared ${result.affected} lapsed placement(s)`);
        invalidatePostReadCaches();
      }
    } catch (err) {
      this.logger.error(`retireLapsedFeatures failed: ${err?.message}`);
    }
  }

  @Cron('0 0 * * *')
  async expireOldPosts(): Promise<void> {
    try {
      const result = await this.postRepository
        .createQueryBuilder()
        .update(Post)
        .set({ status: Status.EXPIRED })
        .where('status != :expired AND expires_at IS NOT NULL AND expires_at <= NOW()', {
          expired: Status.EXPIRED,
        })
        .execute();
      this.logger.log(`expireOldPosts: marked ${result.affected ?? 0} post(s) as EXPIRED`);
      if ((result.affected ?? 0) > 0) {
        invalidatePostReadCaches();
      }
    } catch (err) {
      this.logger.error(`expireOldPosts failed: ${err?.message}`);
    }
  }

  /**
   * Counters the public landing page renders. Cached for five minutes — this is
   * the most-hit endpoint on the site and the numbers move slowly.
   */
  async publicStats(): Promise<{
    total: number;
    provinces: number;
    by_category: { key: string; count: number }[];
  }> {
    const cached = this.cache.get<{
      total: number; provinces: number; by_category: { key: string; count: number }[];
    }>('posts:public-stats');
    if (cached) return cached;

    // Same visibility rules as the browse list. Counting bare APPROVED made the
    // landing page advertise more listings than /browse could show, because
    // expired-but-unswept posts were still in the total.
    const live = (qb: SelectQueryBuilder<Post>) => qb
      .where('post.approval_status = :status', { status: 'APPROVED' })
      .andWhere('post.status != :expired', { expired: Status.EXPIRED })
      .andWhere('(post.expires_at IS NULL OR post.expires_at > NOW())');

    const rows = await live(this.postRepository.createQueryBuilder('post'))
      .select('post.category', 'key')
      .addSelect('COUNT(*)::int', 'count')
      .groupBy('post.category')
      .getRawMany<{ key: string; count: number }>();

    const provinceRow = await live(this.postRepository.createQueryBuilder('post'))
      .select('COUNT(DISTINCT post.province)::int', 'count')
      .andWhere('post.province IS NOT NULL')
      .getRawOne<{ count: number }>();

    const stats = {
      total: rows.reduce((sum, r) => sum + Number(r.count), 0),
      provinces: Number(provinceRow?.count ?? 0),
      by_category: rows.map((r) => ({ key: r.key, count: Number(r.count) })),
    };

    this.cache.set('posts:public-stats', stats, 5 * 60 * 1000);
    return stats;
  }
}
