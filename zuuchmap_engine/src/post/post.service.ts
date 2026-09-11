import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  And,
  Between,
  EntityManager,
  IsNull,
  LessThanOrEqual,
  Not,
  Repository,
  SelectQueryBuilder,
} from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { Status } from '../enums/status';
import { Plan } from '../enums/plan';
import { Post, PostRevision, PostSnapshot } from './entities/post.entity';
import { countActivePosts } from './active-posts';
import { CategorySchema, FieldDef } from './entities/category-schema.entity';
import { isPriceUnit } from '../enums/priceunit';
import { User } from '../user/entities/user.entity';
import { CreatePostDto } from './dto/create-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { processAfterSave, deleteMultipleImages } from '../utils/uploader';
import { publicUser } from '../utils/public-user';
import { ViewedpostService, Viewer } from './viewedpost.service';
import { EventsGateway } from '../events/events.gateway';
import { sharedCache, invalidatePostReadCaches } from '../utils/cache';
import { CategoryService } from './category.service';
import { PostNotificationService } from './post-notification.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { searchTerms } from '../utils/search-terms';
import { APP_TIMEZONE } from '../utils/timezone';
import { Report } from '../report/entities/report.entity';
import { ReportStatus } from '../enums/report';

const POST_EXPIRY_DAYS = 30;

/**
 * What each plan entitles a provider to. `expiryDays: null` means "use the
 * category's own `post_expiry_days`", which is the pre-monetization behaviour.
 */
export const PLAN_LIMITS: Record<
  string,
  { posts: number; expiryDays: number | null }
> = {
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
  return schema?.post_expiry_days
    ? categoryDays
    : Math.max(categoryDays, planDays ?? 0);
};

const TTL = {
  posts: 30_000, // 30 s
  map: 60_000, // 60 s
  similar: 5 * 60_000, // 5 min
  // Longer than `posts` on purpose: a total that is a minute stale is a
  // cosmetic difference on a result header, and it saves a full pass per page.
  count: 60_000, // 60 s
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
  rows: {
    postId: number;
    start_date: Date | string;
    end_date: Date | string;
  }[],
  today: Date = new Date(),
  days: number = BUSY_DATES_DAYS,
): Map<number, string[]> {
  const from = Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate(),
  );
  const to = from + days * 86_400_000;
  const out = new Map<number, Set<string>>();
  for (const r of rows) {
    const s = new Date(r.start_date);
    const e = new Date(r.end_date);
    if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) continue;
    let cur = Math.max(
      Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate()),
      from,
    );
    const end = Math.min(
      Date.UTC(e.getUTCFullYear(), e.getUTCMonth(), e.getUTCDate()),
      to - 86_400_000,
    );
    for (; cur <= end; cur += 86_400_000) {
      if (!out.has(r.postId)) out.set(r.postId, new Set());
      out.get(r.postId)!.add(isoDay(new Date(cur)));
    }
  }
  return new Map([...out].map(([id, set]) => [id, [...set].sort()]));
}

/**
 * The scalar content fields of a post — the ones an edit merges in with
 * "omitted means unchanged", and the ones whose change sends an approved post
 * back to moderation. `str` fields compare as strings, `num` as numbers.
 * Operational fields (status, availability dates) are deliberately absent:
 * toggling them must not pull an approved post from browse. `attributes` and
 * images are content too, but need their own comparison (deep / list).
 */
export const CONTENT_FIELDS = {
  str: [
    'subcategory',
    'title',
    'details',
    'province',
    'district',
    'address',
    'location',
    'price_unit',
    'contact_phone',
    'contact_email',
    'website',
  ],
  num: ['latitude', 'longitude', 'price_amount'],
} as const;
type ContentStrField = (typeof CONTENT_FIELDS.str)[number];

/** The subset of CONTENT_FIELDS.str an admin diffs on re-approval. */
const SNAPSHOT_STR_FIELDS = [
  'title',
  'details',
  'price_unit',
  'subcategory',
  'province',
  'district',
] as const satisfies readonly ContentStrField[];

/**
 * The content fields an admin diffs when a post comes back for re-approval.
 * `price` is `price_amount` under the name the clients use.
 */
/** Every field an edit may touch — a revision, before it is timestamped. */
export type PostContent = Omit<PostRevision, 'submitted_at'>;

/** The post's current content, in the shape a revision is stored in. */
export function contentOf(post: Post | PostContent): PostContent {
  const out = {} as PostContent;
  for (const f of CONTENT_FIELDS.str) (out as any)[f] = post[f] ?? null;
  for (const f of CONTENT_FIELDS.num) (out as any)[f] = post[f] ?? null;
  out.attributes = post.attributes ?? null;
  out.images = [...(post.images ?? [])];
  return out;
}

/** Writes a revision's content onto the row. Touches nothing operational. */
export function applyContent(post: Post, content: PostContent): void {
  for (const f of CONTENT_FIELDS.str) (post as any)[f] = content[f] ?? null;
  for (const f of CONTENT_FIELDS.num) (post as any)[f] = content[f] ?? null;
  post.attributes = content.attributes ?? {};
  post.images = [...(content.images ?? [])];
}

/**
 * Do two contents differ in anything a reader would see?
 *
 * String-compared through `${}` because `price_amount` arrives as a string from
 * a decimal column and as a number from a multipart form, and a bare `!==`
 * between the two reported an edit on every save.
 */
export function contentDiffers(a: PostContent, b: PostContent): boolean {
  const same = (x: any, y: any) =>
    x == null && y == null ? true : `${x ?? ''}` === `${y ?? ''}`;
  for (const f of CONTENT_FIELDS.str) if (!same(a[f], b[f])) return true;
  for (const f of CONTENT_FIELDS.num)
    if (!((a[f] == null && b[f] == null) || Number(a[f]) === Number(b[f])))
      return true;
  if (JSON.stringify(a.attributes ?? {}) !== JSON.stringify(b.attributes ?? {}))
    return true;
  return JSON.stringify(a.images ?? []) !== JSON.stringify(b.images ?? []);
}

export function snapshotOf(post: Post): PostSnapshot {
  const snap = {
    price: post.price_amount == null ? null : Number(post.price_amount),
    attributes: post.attributes ?? null,
    images: [...(post.images ?? [])],
  } as PostSnapshot;
  for (const f of SNAPSHOT_STR_FIELDS) snap[f] = post[f] ?? null;
  return snap;
}

export interface PostFilters {
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

/**
 * `attributes` is free-form jsonb: the DTO JSON-parses whatever the client sent
 * and `validateRequiredAttributes` only checks that the schema's *required*
 * fields are non-empty. Nothing bounded the rest, so a client could store an
 * arbitrary object of arbitrary size in the column. Both limits sit ~30x above
 * the largest real row (10 keys, 234 bytes).
 *
 * Exported for unit testing, like the two functions around it.
 */
export const ATTR_MAX_KEYS = 60;
export const ATTR_MAX_BYTES = 8 * 1024;

export function attributesOutOfBounds(
  attributes: Record<string, any> | undefined | null,
): string | null {
  if (!attributes || typeof attributes !== 'object') return null;
  if (Object.keys(attributes).length > ATTR_MAX_KEYS)
    return 'ATTRIBUTES_TOO_MANY_KEYS';
  let size: number;
  try {
    size = Buffer.byteLength(JSON.stringify(attributes));
  } catch {
    return 'ATTRIBUTES_UNSERIALISABLE'; // cyclic or otherwise unstorable
  }
  return size > ATTR_MAX_BYTES ? 'ATTRIBUTES_TOO_LARGE' : null;
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
      qb.andWhere(`post.attributes->:${p}_k ? :${p}`, {
        [`${p}_k`]: key,
        [p]: String(val),
      });
    } else if (type === 'select') {
      // Enumerated fields match by containment so the GIN index can serve them.
      qb.andWhere(`post.attributes @> :${p}::jsonb`, {
        [p]: JSON.stringify({ [key]: String(val) }),
      });
    } else {
      // Free text stays a substring scan.
      qb.andWhere(`post.attributes->>'${key}' ILIKE :${p}`, {
        [p]: `%${String(val)}%`,
      });
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
  private async attributeFieldTypes(
    category?: string,
  ): Promise<Map<string, string>> {
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
      this.logger.warn(
        `Could not resolve field types for ${category}: ${err?.message}`,
      );
    }
    return types;
  }

  /** `price_unit` is a plain varchar column, so the enum is only enforced here. */
  private assertPriceUnit(unit?: string | null): void {
    if (
      unit !== undefined &&
      unit !== null &&
      unit !== '' &&
      !isPriceUnit(unit)
    ) {
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
    category: string,
    subcategory?: string,
    status?: string,
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
      throw new BadRequestException(
        `Unknown subcategory '${subcategory}' for category '${category}'`,
      );
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
  private effectivePlan(
    user?: { plan?: string; plan_expires_at?: Date | null } | null,
  ): string {
    if (!user?.plan || user.plan === Plan.FREE) return Plan.FREE;
    if (
      user.plan_expires_at &&
      new Date(user.plan_expires_at).getTime() <= Date.now()
    )
      return Plan.FREE;
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
  private activePostCount(
    ownerId: string,
    em?: EntityManager,
  ): Promise<number> {
    return countActivePosts(this.postRepository, ownerId, em);
  }

  private async assertQuota(
    ownerId: string,
    plan: string,
    em?: EntityManager,
  ): Promise<void> {
    const limit = (PLAN_LIMITS[plan] ?? PLAN_LIMITS[Plan.FREE]).posts;
    const active = await this.activePostCount(ownerId, em);
    if (active >= limit) {
      throw new BadRequestException({
        message: 'POST_QUOTA_EXCEEDED',
        limit,
        plan,
      });
    }
  }

  async create(
    dto: CreatePostDto,
    files: Express.Multer.File[],
    ownerId: string,
  ): Promise<Post> {
    const schema = await this.validateCategoryAndStatus(
      dto.category,
      dto.subcategory ?? dto.secondcategory,
      dto.status,
    );
    this.assertPriceUnit(dto.price_unit);
    const owner = ownerId
      ? await this.userRepository.findOne({ where: { id: ownerId } })
      : null;
    const plan = this.effectivePlan(owner);
    if (ownerId) await this.assertQuota(ownerId, plan);
    const oversized = attributesOutOfBounds(dto.attributes);
    if (oversized) throw new BadRequestException({ message: oversized });

    const missing = validateRequiredAttributes(schema, dto.attributes ?? {});
    if (missing.length) {
      throw new BadRequestException({
        message: 'MISSING_REQUIRED_ATTRIBUTES',
        fields: missing,
      });
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
      available_from: dto.available_from
        ? new Date(dto.available_from)
        : undefined,
      available_until: dto.available_until
        ? new Date(dto.available_until)
        : undefined,
      website: dto.website,
      attributes: dto.attributes || {},
      images: [],
      status: dto.status ?? Status.ACTIVE,
      approval_status: 'PENDING',
      expires_at: new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000),
    };
    const post = this.postRepository.create(postData as Post);

    if (owner) post.user = owner;

    // Count and insert in one transaction, behind a lock on the owner's row.
    // The pre-flight check above answers the common case without a failed
    // write; it cannot see a second create that has counted but not yet
    // inserted, so two requests landing together each saw room for one more and
    // the limit could be overshot. Same shape as the booking conflict handling:
    // an advisory check in front, an authoritative one at the write.
    //
    // Only the row insert is inside — image processing runs afterwards, so an
    // upload never holds the lock.
    const saved = await this.postRepository.manager.transaction(async (em) => {
      if (ownerId) {
        await em.query('SELECT 1 FROM "user" WHERE id = $1 FOR UPDATE', [
          ownerId,
        ]);
        await this.assertQuota(ownerId, plan, em);
      }
      return em.getRepository(Post).save(post);
    });

    if (files?.length) {
      const processedImages = await processAfterSave(files);
      saved.images = processedImages;
      await this.postRepository.save(saved);
    }

    invalidatePostReadCaches();
    this.events?.emitPostCreated({
      id: saved.id,
      category: saved.category,
      title: saved.title,
    });

    // Push notification to admins (fires async, doesn't block response)
    this.notifications
      .notifyAdmins(saved.id, saved.title, saved.category)
      .catch((err) =>
        this.logger.warn(`notifyAdmins backstop: ${err?.message}`),
      );

    return saved;
  }

  async findAll(
    filters: PostFilters = {},
  ): Promise<{ items: Post[]; total: number }> {
    const hasAttrs = filters.attrs && Object.keys(filters.attrs).length > 0;
    const useCache = !filters.q && !hasAttrs;
    // Clamp pagination before anything touches SQL: Postgres rejects negative
    // LIMIT/OFFSET outright, and an uncapped limit lets one request drag the
    // whole table (with user+company joins) into memory.
    const limit = Math.min(
      Math.max(Math.floor(filters.limit || 50) || 50, 1),
      100,
    );
    const page = Math.max(Math.floor(filters.page || 1) || 1, 1);
    // JSON-encoded so a ':' inside a query param cannot collide with the key
    // separator. The count key deliberately omits page, limit and sort, so
    // paging and re-sorting reuse one count — and so a search, which the item
    // cache skips, still only counts once per window.
    const baseKey = JSON.stringify({
      category: filters.category ?? '',
      subcategory: filters.subcategory ?? '',
      province: filters.province ?? '',
      district: filters.district ?? '',
      approval_status: filters.approval_status ?? '',
      status: filters.status ?? '',
      price_min: filters.price_min ?? '',
      price_max: filters.price_max ?? '',
    });
    const cacheKey = `posts:list:${baseKey}:${JSON.stringify({ page, limit, sort: filters.sort ?? '' })}`;
    const countKey = `posts:count:${baseKey}:${JSON.stringify({ q: filters.q ?? '', attrs: hasAttrs ? filters.attrs : '' })}`;
    if (useCache) {
      const cached = this.cache.get<{ items: Post[]; total: number }>(cacheKey);
      if (cached) return cached;
    }

    const qb = this.postRepository
      .createQueryBuilder('post')
      .leftJoinAndSelect('post.user', 'user')
      .leftJoinAndSelect('user.company', 'company');

    // Whitelisted sort orders — anything else falls back to newest-first.
    // Price sorts push unpriced posts last so "cheapest" never means "no price".
    switch (filters.sort) {
      case 'price_asc':
        qb.orderBy('post.price_amount', 'ASC', 'NULLS LAST').addOrderBy(
          'post.date_created',
          'DESC',
        );
        break;
      case 'price_desc':
        qb.orderBy('post.price_amount', 'DESC', 'NULLS LAST').addOrderBy(
          'post.date_created',
          'DESC',
        );
        break;
      case 'views':
        qb.orderBy('post.views', 'DESC').addOrderBy(
          'post.date_created',
          'DESC',
        );
        break;
      default:
        // Paid placement applies only to the default (newest-first) browse.
        // Featured never hides or filters anything — it lifts within the same
        // result set, so an unpaid post is always still reachable.
        // Ordered by the stored `is_featured`, not by `featured_until > NOW()`.
        // The predicate form could not be indexed — NOW() is not immutable — so
        // every browse read and sorted the whole matching set to return one
        // page. IDX_post_browse_order serves this ordering directly.
        qb.orderBy('post.is_featured', 'DESC').addOrderBy(
          'post.date_created',
          'DESC',
        );
    }

    await this.applyFilters(qb, filters);

    qb.take(limit).skip((page - 1) * limit);

    // The count is the same for every page of a filter set, and it costs a
    // second full pass (20 ms / 12k buffers at 62k posts) that getManyAndCount
    // paid on every request — see countKey above.
    const cachedTotal = this.cache.get<number>(countKey);
    // getCount() ignores take/skip, so it counts the filter set, not the page.
    const [items, total] = await Promise.all([
      qb.getMany(),
      cachedTotal !== undefined && cachedTotal !== null
        ? Promise.resolve(cachedTotal)
        : qb.getCount().then((n) => {
            this.cache.set(countKey, n, TTL.count);
            return n;
          }),
    ]);

    // Demand-gap signal: record public searches (text/attribute queries) and any
    // filtered browse that came back empty. Cached repeats within the TTL are not
    // re-recorded — aggregates need the shape of demand, not every request.
    const isSearch = !!(filters.q || hasAttrs);
    const isFilteredBrowse = !!(
      filters.category ||
      filters.subcategory ||
      filters.province ||
      filters.district
    );
    if (
      filters.approval_status === 'APPROVED' &&
      page === 1 &&
      (isSearch || (isFilteredBrowse && total === 0))
    ) {
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
      items: await this.attachBusyDates(
        items.map((p) => ({ ...p, user: publicUser(p.user) })),
      ),
      total,
    };
    if (useCache) this.cache.set(cacheKey, result, TTL.posts);
    return result;
  }

  /** Every WHERE clause of a browse query — shared by the page and its count. */
  private async applyFilters(
    qb: SelectQueryBuilder<Post>,
    filters: PostFilters,
  ): Promise<void> {
    const priceMin = Number(filters.price_min);
    if (
      filters.price_min !== undefined &&
      filters.price_min !== '' &&
      !Number.isNaN(priceMin)
    ) {
      qb.andWhere('post.price_amount >= :priceMin', { priceMin });
    }
    const priceMax = Number(filters.price_max);
    if (
      filters.price_max !== undefined &&
      filters.price_max !== '' &&
      !Number.isNaN(priceMax)
    ) {
      qb.andWhere('post.price_amount <= :priceMax', { priceMax });
    }

    if (filters.category)
      qb.andWhere('post.category = :category', { category: filters.category });
    if (filters.subcategory)
      qb.andWhere('post.subcategory = :subcategory', {
        subcategory: filters.subcategory,
      });
    if (filters.province)
      qb.andWhere('post.province = :province', { province: filters.province });
    if (filters.district)
      qb.andWhere('post.district = :district', { district: filters.district });
    if (filters.approval_status)
      qb.andWhere('post.approval_status = :approval_status', {
        approval_status: filters.approval_status,
      });
    if (filters.status)
      qb.andWhere('post.status = :status', { status: filters.status });

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
      // Prefix-matching full-text search on the generated search_vector column.
      // Tokenised by the shared helper so the saved-search matcher, which has to
      // answer the same question in JS, cannot drift away from it.
      const terms = searchTerms(filters.q);
      if (terms.length) {
        const tsq = terms.map((t) => `${t}:*`).join(' & ');
        qb.andWhere(`post.search_vector @@ to_tsquery('simple', :tsq)`, {
          tsq,
        });
      }
    }

    if (filters.attrs && Object.keys(filters.attrs).length > 0) {
      const fieldTypes = await this.attributeFieldTypes(filters.category);
      buildAttrFilter(qb, filters.attrs ?? {}, fieldTypes);
    }
  }

  /**
   * Adds `busy_dates` to every post whose category is bookable. One query over
   * the ACCEPTED bookings of the whole page, never per post. Bookings live in
   * their own module, which imports this one — so this reads the table directly
   * rather than closing a module cycle for one SELECT.
   */
  async attachBusyDates<T extends Pick<Post, 'id' | 'category'>>(
    posts: T[],
    days = BUSY_DATES_DAYS,
  ): Promise<T[]> {
    if (!posts.length) return posts;
    let rentalKeys: Set<string>;
    try {
      const schemas = await this.categoryService.getCategories();
      rentalKeys = new Set(
        schemas.filter((c) => c.has_rental_status).map((c) => c.key),
      );
    } catch (err) {
      this.logger.warn(
        `attachBusyDates: schema lookup failed — ${err?.message}`,
      );
      return posts;
    }
    const ids = posts
      .filter((p) => rentalKeys.has(p.category))
      .map((p) => p.id);
    if (!ids.length) return posts;

    const rows: { postId: number; start_date: Date; end_date: Date }[] =
      await this.postRepository.manager.query(
        `SELECT "postId", start_date, end_date FROM "booking"
        WHERE "postId" = ANY($1) AND status = 'ACCEPTED'
          AND end_date >= CURRENT_DATE AND start_date < CURRENT_DATE + ($2 || ' days')::interval`,
        [ids, String(days)],
      );
    const busy = expandBusyDates(rows, new Date(), days);
    for (const p of posts) {
      if (rentalKeys.has(p.category))
        (p as any).busy_dates = busy.get(p.id) ?? [];
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

    const items = await this.postRepository
      .createQueryBuilder('post')
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
      .setParameters({
        district: post.district ?? '',
        province: post.province ?? '',
        price,
      })
      .orderBy('loc_rank', 'ASC')
      .addOrderBy('price_dist', 'ASC', 'NULLS LAST')
      .addOrderBy('post.date_created', 'DESC')
      .take(take)
      .getMany();

    const result = items.map((p) => ({ ...p, user: publicUser(p.user) }));
    await this.attachBusyDates(result);
    this.cache.set(cacheKey, result, TTL.similar);
    return result;
  }

  async findForMap(): Promise<Post[]> {
    const cached = this.cache.get<Post[]>('posts:map');
    if (cached) return cached;

    // Slim payload: map pins only need display fields — no user join (privacy + size)
    const result = await this.postRepository
      .createQueryBuilder('post')
      .select([
        'post.id',
        'post.category',
        'post.subcategory',
        'post.title',
        'post.latitude',
        'post.longitude',
        'post.province',
        'post.district',
        'post.price_amount',
        'post.price_unit',
        'post.images',
        'post.status',
        'post.date_created',
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
      this.logger.warn(
        `Map pin cap reached (${MAP_PIN_LIMIT}) — some approved posts are not on the map`,
      );
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
   * The like count keys on `post_id` alone. `likedpost.post_type` is a
   * denormalised copy of `post.category`; joining on both meant any row whose
   * copy had drifted was simply missing from the provider's saves number, with
   * nothing to notice it.
   *
   * The like/booking counts are correlated subqueries rather than grouped
   * derived tables: a derived table has no reference to the caller, so Postgres
   * aggregated the whole of `likedpost` and `booking` to answer for one
   * provider's handful of posts — cost that grew with the marketplace instead
   * of with the dashboard being rendered.
   */
  async providerStats(userId: string): Promise<{
    totals: {
      posts: number;
      views: number;
      likes: number;
      bookings_pending: number;
      bookings_accepted: number;
    };
    posts: Array<Record<string, unknown>>;
    plan: {
      name: string;
      expires_at: Date | null;
      post_limit: number;
      posts_active: number;
    };
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
            WHERE lp.post_id = p.id
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
      {
        posts: 0,
        views: 0,
        likes: 0,
        bookings_pending: 0,
        bookings_accepted: 0,
      },
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
    if (!post.expires_at || new Date(post.expires_at).getTime() > Date.now())
      return false;

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
    this.logger.log(
      `relistIfLapsed: #${post.id} → ${next.toISOString()} (${days}d)`,
    );
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
    const post = await this.postRepository.findOne({
      where: { id },
      relations: ['user', 'user.company'],
    });
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
  async incrementViews(postId: number, viewer: Viewer): Promise<void> {
    const post = await this.postRepository.findOne({
      where: { id: postId },
      relations: ['user'],
      select: { id: true, user: { id: true } },
    });
    if (!post) return;
    // A provider opening their own listing is still not audience — that rule
    // predates anonymous views and is the reason the number is readable.
    if (viewer.userId && post.user?.id === viewer.userId) return;

    const result = await this.viewedpostService.recordView(
      viewer,
      'post',
      postId,
    );
    if (!result.already_viewed) {
      await this.postRepository.increment({ id: postId }, 'views', 1);
    }
  }

  /**
   * How many posts a provider must have had approved before their *edits* stop
   * queueing. Deliberately not applied to new listings: a first post from an
   * unknown account is the one thing manual review exists for.
   */
  private static readonly PROVEN_APPROVED_POSTS = 3;

  /**
   * Whether this owner's edits can skip the queue.
   *
   * A track record, not a setting: several posts an admin has already approved,
   * nothing ever rejected, and no report an admin agreed with. Any one
   * rejection or upheld report drops them back to manual review permanently —
   * the point is that the shortcut is only for accounts that have never given
   * anyone a reason to look twice.
   */
  async isProvenProvider(userId: string): Promise<boolean> {
    if (!userId) return false;
    const [approved, rejected] = await Promise.all([
      this.postRepository.count({
        where: { user: { id: userId }, approval_status: 'APPROVED' },
      }),
      this.postRepository.count({
        where: { user: { id: userId }, approval_status: 'REJECTED' },
      }),
    ]);
    if (rejected > 0 || approved < PostService.PROVEN_APPROVED_POSTS)
      return false;

    // Read through the manager rather than injecting the repository: this is
    // one COUNT, and the post module has no other reason to know about reports.
    const upheld = await this.postRepository.manager
      .getRepository(Report)
      .createQueryBuilder('report')
      .innerJoin('report.post', 'post')
      .where('post.userId = :userId', { userId })
      .andWhere('report.status = :status', { status: ReportStatus.RESOLVED })
      .getCount();
    return upheld === 0;
  }

  /**
   * The content an owner is editing from: their pending proposal if they have
   * one, otherwise the live row.
   *
   * Without this, a second edit made while a revision waits would be compared
   * against the live version, and every field the owner had already changed
   * would read as changed again — or, if they saved the form untouched, as not
   * changed at all, silently discarding the revision.
   */
  private editBase(post: Post): PostContent {
    return post.pending_revision ?? contentOf(post);
  }

  async update(
    id: number,
    dto: UpdatePostDto,
    files: Express.Multer.File[],
    userId: string,
  ): Promise<Post> {
    const post = await this.findOne(id);

    if (!post.user || post.user.id !== userId) {
      throw new ForbiddenException('You can only update your own posts');
    }
    this.validateStatus(dto.status);
    this.assertPriceUnit(dto.price_unit);

    if (dto.attributes !== undefined) {
      const schemas = await this.categoryService.getCategories();
      const schema = schemas.find((c) => c.key === post.category);
      const oversized = attributesOutOfBounds(dto.attributes);
      if (oversized) throw new BadRequestException({ message: oversized });

      const missing = schema
        ? validateRequiredAttributes(schema, dto.attributes)
        : [];
      if (missing.length) {
        throw new BadRequestException({
          message: 'MISSING_REQUIRED_ATTRIBUTES',
          fields: missing,
        });
      }
    }

    const wasApproved = post.approval_status === 'APPROVED';
    const base = this.editBase(post);
    const live = contentOf(post);

    // Omitted content fields stay as they are. `secondcategory` is the legacy
    // alias older mobile builds still send for `subcategory`.
    const proposed: PostContent = { ...base };
    for (const f of CONTENT_FIELDS.str)
      (proposed as any)[f] = dto[f] ?? base[f] ?? null;
    for (const f of CONTENT_FIELDS.num)
      (proposed as any)[f] = dto[f] ?? base[f] ?? null;
    proposed.subcategory =
      dto.subcategory ?? dto.secondcategory ?? base.subcategory ?? null;
    proposed.attributes = dto.attributes ?? base.attributes ?? null;

    // Photos the owner kept, plus whatever this request uploaded. While a
    // revision is pending the live set is off limits to the reclaim — those
    // objects are still being served to everyone browsing.
    proposed.images = await this.resolveImages(
      dto.existingImages ?? base.images ?? [],
      files,
      base.images ?? [],
      wasApproved ? (post.images ?? []) : [],
    );

    const changed = contentDiffers(proposed, base);
    // Operational fields never gate visibility: a rental status toggle or an
    // availability window must not pull an approved post out of browse.
    Object.assign(post, {
      available_from:
        dto.available_from === undefined
          ? post.available_from
          : dto.available_from
            ? new Date(dto.available_from)
            : null,
      available_until:
        dto.available_until === undefined
          ? post.available_until
          : dto.available_until
            ? new Date(dto.available_until)
            : null,
      status: dto.status ?? post.status,
    });

    if (!wasApproved) {
      // Nothing live to protect. Write the edit straight onto the row; a
      // content change puts it back at the front of its own moderation round.
      applyContent(post, proposed);
      if (changed) {
        post.approval_status = 'PENDING';
        post.rejection_reason = null as unknown as string;
        post.rejection_field = null;
      }
      const saved = await this.postRepository.save(post);
      invalidatePostReadCaches();
      return saved;
    }

    if (!contentDiffers(proposed, live)) {
      // The owner edited their way back to what is already published — there is
      // nothing left to review, so drop the revision rather than queue a no-op.
      post.pending_revision = null;
      const saved = await this.postRepository.save(post);
      invalidatePostReadCaches();
      return saved;
    }

    if (await this.isProvenProvider(userId)) {
      // Earned the shortcut: publish the edit now and reclaim what it dropped.
      const orphaned = (post.images ?? []).filter(
        (u) => !proposed.images.includes(u),
      );
      if (orphaned.length) await deleteMultipleImages(orphaned);
      applyContent(post, proposed);
      post.pending_revision = null;
      post.rejection_reason = null as unknown as string;
      post.rejection_field = null;
      const saved = await this.postRepository.save(post);
      invalidatePostReadCaches();
      this.logger.log(`update: #${id} auto-approved (proven provider)`);
      return saved;
    }

    // Park the proposal. The row keeps serving the approved version, so the
    // listing stays in browse for however long the queue is.
    //
    // A reason left over from a previously refused edit goes with it: the owner
    // has answered it by submitting again, and leaving it would put "your edit
    // was refused" beside "your edit is in review" on the same listing.
    post.rejection_reason = null as unknown as string;
    post.rejection_field = null;
    post.pending_revision = {
      ...proposed,
      // A resubmit of the same proposal — a form saved twice, an upload
      // retried — keeps its place in the queue. Re-stamping it would send an
      // owner to the back of the line for pressing save again.
      submitted_at:
        changed || !post.pending_revision
          ? new Date().toISOString()
          : post.pending_revision.submitted_at,
    };
    const saved = await this.postRepository.save(post);
    invalidatePostReadCaches();
    return saved;
  }

  /**
   * The photo set an edit proposes: the ones the owner kept, plus whatever this
   * request uploaded — reclaiming from R2 everything the edit dropped.
   *
   * `protect` is the set that must survive regardless, and it is what makes a
   * pending revision safe: while the live post is still serving its approved
   * photos, an edit that removes one must not delete the object out from under
   * every reader. Those become reclaimable only when the revision is approved.
   *
   * Reclaims whether or not the edit also adds photos: this used to sit inside
   * a `files?.length` branch, so removing photos without adding any left them in
   * R2 forever — reachable as soon as the app started sending
   * `existingImages: []` for "delete every photo".
   */
  private async resolveImages(
    keep: string[],
    files: Express.Multer.File[],
    previous: string[],
    protect: string[],
  ): Promise<string[]> {
    const next = files?.length
      ? [...keep, ...(await processAfterSave(files))]
      : [...keep];
    const dropped = previous.filter(
      (url) => !next.includes(url) && !protect.includes(url),
    );
    if (dropped.length) await deleteMultipleImages(dropped);
    return next;
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

    // Photos uploaded for a revision that was never approved are referenced by
    // nothing else, so they have to go with the post or they stay in R2 forever.
    const orphans = Array.from(
      new Set([...(post.images ?? []), ...(post.pending_revision?.images ?? [])]),
    );
    if (orphans.length) {
      await deleteMultipleImages(orphans);
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
  @Cron('0 * * * *', { timeZone: APP_TIMEZONE })
  async retireLapsedFeatures(): Promise<void> {
    try {
      const result = await this.postRepository
        .createQueryBuilder()
        .update(Post)
        .set({ is_featured: false })
        .where(
          'is_featured = true AND (featured_until IS NULL OR featured_until <= NOW())',
        )
        .execute();
      if (result.affected) {
        this.logger.log(
          `retireLapsedFeatures: cleared ${result.affected} lapsed placement(s)`,
        );
        invalidatePostReadCaches();
      }
    } catch (err) {
      this.logger.error(`retireLapsedFeatures failed: ${err?.message}`);
    }
  }

  @Cron('0 0 * * *', { timeZone: APP_TIMEZONE })
  async expireOldPosts(): Promise<void> {
    try {
      // Read the rows before flipping them: once the UPDATE has run there is no
      // way to tell which posts it was, and an expiry nobody is told about is
      // indistinguishable from a listing that vanished for no reason. That is
      // how a provider's entire catalogue could quietly leave the marketplace.
      const due = await this.postRepository.find({
        where: {
          status: Not(Status.EXPIRED),
          expires_at: And(Not(IsNull()), LessThanOrEqual(new Date())),
        },
        relations: ['user'],
        select: { id: true, title: true, category: true, user: { id: true } },
      });
      if (!due.length) return;

      await this.postRepository
        .createQueryBuilder()
        .update(Post)
        .set({ status: Status.EXPIRED })
        .whereInIds(due.map((p) => p.id))
        .execute();
      this.logger.log(`expireOldPosts: marked ${due.length} post(s) as EXPIRED`);
      invalidatePostReadCaches();

      await this.notifyExpiry(
        due,
        'Таны зарын хугацаа дууслаа',
        (post) => `"${post.title}" зар хугацаа дуусаж, жагсаалтаас хасагдлаа. Сунгах товч дарж эргүүлэн нийтэлнэ үү.`,
        'post_expired',
      );
    } catch (err) {
      this.logger.error(`expireOldPosts failed: ${err?.message}`);
    }
  }

  /** How many days before a post lapses its owner is told. */
  private static readonly EXPIRY_WARNING_DAYS = 3;

  /**
   * Warn owners whose posts lapse in three days.
   *
   * Runs an hour after the expiry sweep so the two can never race over the same
   * post — anything the sweep took is already EXPIRED and out of this window.
   */
  @Cron('0 1 * * *', { timeZone: APP_TIMEZONE })
  async warnExpiringPosts(): Promise<void> {
    try {
      const from = new Date();
      const to = new Date();
      to.setDate(to.getDate() + PostService.EXPIRY_WARNING_DAYS);
      const due = await this.postRepository.find({
        where: {
          status: Not(Status.EXPIRED),
          approval_status: 'APPROVED',
          expires_at: Between(from, to),
        },
        relations: ['user'],
        select: {
          id: true,
          title: true,
          category: true,
          expires_at: true,
          user: { id: true },
        },
      });
      if (!due.length) return;
      this.logger.log(`warnExpiringPosts: ${due.length} post(s) lapse soon`);
      await this.notifyExpiry(
        due,
        'Таны зарын хугацаа дуусах гэж байна',
        (post) => {
          const days = Math.max(
            1,
            Math.ceil(
              (new Date(post.expires_at).getTime() - Date.now()) / 86400000,
            ),
          );
          return `"${post.title}" зар ${days} хоногийн дараа жагсаалтаас хасагдана. Сунгах товч дарж хугацааг нь сунгаарай.`;
        },
        'post_expiring',
      );
    } catch (err) {
      this.logger.error(`warnExpiringPosts failed: ${err?.message}`);
    }
  }

  /** One push per lapsing post, batched into a single fan-out. */
  private async notifyExpiry(
    posts: Post[],
    title: string,
    body: (post: Post) => string,
    notifType: string,
  ): Promise<void> {
    const items = posts
      .filter((post) => post.user?.id)
      .map((post) => ({
        userId: post.user.id,
        title,
        body: body(post),
        data: {
          postId: post.id,
          post_type: post.category,
          notifType,
          url: `/provider/posts/${post.id}`,
        },
      }));
    if (!items.length) return;
    await this.notifications
      .notifyEach(items)
      .catch((err) =>
        this.logger.warn(`Expiry push failed (non-fatal): ${err?.message}`),
      );
  }

  /**
   * Give a lapsed or lapsing post a fresh window, on the owner's say-so.
   *
   * No moderation: the content is byte-for-byte what an admin already approved,
   * so sending it back through the queue asks them to re-read something they
   * have read. Before this the only way back from an expiry was to edit the
   * post — which pulled it into the queue for a change the owner never wanted
   * to make — so a lapsed listing needed an admin to exist again.
   *
   * A post that was never approved has nothing to renew: it is either still
   * waiting or was refused, and both are answered by the queue, not by a date.
   */
  async renew(id: number, userId: string): Promise<Post> {
    const post = await this.findOne(id);
    if (!post.user || post.user.id !== userId) {
      throw new ForbiddenException('You can only renew your own posts');
    }
    if (post.approval_status !== 'APPROVED') {
      throw new BadRequestException({ message: 'POST_NOT_APPROVED' });
    }

    // Renewing brings a post back into browse, so it has to pass the same
    // quota the create path enforces — otherwise letting three posts lapse and
    // renewing them all is a way around the plan.
    const owner = await this.userRepository.findOne({ where: { id: userId } });
    const plan = this.effectivePlan(owner);
    const lapsed =
      post.status === Status.EXPIRED ||
      (post.expires_at && new Date(post.expires_at).getTime() <= Date.now());
    if (lapsed) await this.assertQuota(userId, plan);

    const schema = await this.findCategory(post.category);
    const days = expiryDaysFor(schema, plan);
    const next = new Date();
    next.setDate(next.getDate() + days);
    post.expires_at = next;
    if (post.status === Status.EXPIRED) post.status = Status.ACTIVE;

    const saved = await this.postRepository.save(post);
    invalidatePostReadCaches();
    this.logger.log(`renew: #${id} → ${next.toISOString()} (${days}d)`);
    return saved;
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
      total: number;
      provinces: number;
      by_category: { key: string; count: number }[];
    }>('posts:public-stats');
    if (cached) return cached;

    // Same visibility rules as the browse list. Counting bare APPROVED made the
    // landing page advertise more listings than /browse could show, because
    // expired-but-unswept posts were still in the total.
    const live = (qb: SelectQueryBuilder<Post>) =>
      qb
        .where('post.approval_status = :status', { status: 'APPROVED' })
        .andWhere('post.status != :expired', { expired: Status.EXPIRED })
        .andWhere('(post.expires_at IS NULL OR post.expires_at > NOW())');

    const rows = await live(this.postRepository.createQueryBuilder('post'))
      .select('post.category', 'key')
      .addSelect('COUNT(*)::int', 'count')
      .groupBy('post.category')
      .getRawMany<{ key: string; count: number }>();

    const provinceRow = await live(
      this.postRepository.createQueryBuilder('post'),
    )
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
