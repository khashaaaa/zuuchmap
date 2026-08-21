import { Injectable, NotFoundException, ForbiddenException, BadRequestException, Logger, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { Status } from '../enums/status';
import { Post } from './entities/post.entity';
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

const UPLOAD_DIR = './uploads/posts';
const POST_EXPIRY_DAYS = 30;

const TTL = {
  posts: 30_000,   // 30 s
  map: 60_000,     // 60 s
} as const;

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

  // ─── Posts ────────────────────────────────────────────────────────────────

  /** Rejects categories/subcategories that no schema defines, and bad statuses. */
  private async validateCategoryAndStatus(
    category: string, subcategory?: string, status?: string,
  ): Promise<void> {
    const schema = await this.categoryService.getCategory(category).catch(() => null);
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
  }

  private validateStatus(status?: string): void {
    if (status && !Object.values(Status).includes(status as Status)) {
      throw new BadRequestException(`Invalid status '${status}'`);
    }
  }

  async create(dto: CreatePostDto, files: Express.Multer.File[]): Promise<Post> {
    await this.validateCategoryAndStatus(dto.category, dto.subcategory ?? dto.secondcategory, dto.status);
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
      expires_at: new Date(Date.now() + POST_EXPIRY_DAYS * 24 * 60 * 60 * 1000),
    };
    const post = this.postRepository.create(postData as Post);

    if (dto.user) {
      const user = await this.userRepository.findOne({ where: { id: dto.user } });
      if (user) post.user = user;
    }

    const saved = await this.postRepository.save(post);

    if (files?.length) {
      const processedImages = await ImageUploadHandler.processAfterSave(files, UPLOAD_DIR);
      saved.images = processedImages;
      await this.postRepository.save(saved);
    }

    invalidatePostReadCaches();
    this.events?.emitPostCreated({ id: saved.id, category: saved.category, title: saved.title });

    // Push notification to admins (fires async, doesn't block response)
    this.notifications.notifyAdmins(saved.id, saved.title)
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
  } = {}): Promise<{ items: Post[]; total: number }> {
    const hasAttrs = filters.attrs && Object.keys(filters.attrs).length > 0;
    const useCache = !filters.q && !hasAttrs;
    // encodeURIComponent each part so a ':' inside a query param can't
    // collide with the key separator.
    const k = (v: unknown) => encodeURIComponent(String(v ?? ''));
    const cacheKey = `posts:list:${k(filters.category)}:${k(filters.subcategory)}:${k(filters.province)}:${k(filters.district)}:${k(filters.approval_status)}:${k(filters.status)}:${filters.page ?? 1}:${filters.limit ?? 50}`;
    if (useCache) {
      const cached = this.cache.get<{ items: Post[]; total: number }>(cacheKey);
      if (cached) return cached;
    }

    const qb = this.postRepository.createQueryBuilder('post')
      .leftJoinAndSelect('post.user', 'user')
      .leftJoinAndSelect('user.company', 'company')
      .orderBy('post.date_created', 'DESC');

    if (filters.category) qb.andWhere('post.category = :category', { category: filters.category });
    if (filters.subcategory) qb.andWhere('post.subcategory = :subcategory', { subcategory: filters.subcategory });
    if (filters.province) qb.andWhere('post.province = :province', { province: filters.province });
    if (filters.district) qb.andWhere('post.district = :district', { district: filters.district });
    if (filters.approval_status) qb.andWhere('post.approval_status = :approval_status', { approval_status: filters.approval_status });
    if (filters.status) qb.andWhere('post.status = :status', { status: filters.status });

    // Exclude expired posts from public queries
    if (filters.approval_status === 'APPROVED' && !filters.status) {
      qb.andWhere('post.status != :expired', { expired: Status.EXPIRED })
        .andWhere('(post.expires_at IS NULL OR post.expires_at > NOW())');
    }

    if (filters.q) {
      // Prefix-matching full-text search on the generated search_vector column
      const terms = filters.q.trim().substring(0, 100).split(/\s+/)
        .map((t) => t.replace(/[^\p{L}\p{N}]/gu, ''))
        .filter(Boolean)
        .slice(0, 8);
      if (terms.length) {
        const tsq = terms.map((t) => `${t}:*`).join(' & ');
        qb.andWhere(`post.search_vector @@ to_tsquery('simple', :tsq)`, { tsq });
      }
    }

    if (hasAttrs) {
      // Enumerated fields are matched by containment so the GIN index on
      // `attributes` can serve them; free-text stays a substring scan.
      const fieldTypes = await this.attributeFieldTypes(filters.category);

      let i = 0;
      for (const [rawKey, val] of Object.entries(filters.attrs ?? {})) {
        if (val === undefined || val === '') continue;
        const m = rawKey.match(/^([a-z0-9_]+?)(_min|_max)?$/);
        if (!m) continue;
        const [, key, range] = m;
        const p = `attr${i++}`;

        if (range) {
          const num = Number(val);
          if (Number.isNaN(num)) continue;
          const op = range === '_min' ? '>=' : '<=';
          qb.andWhere(
            `post.attributes->>'${key}' ~ '^[0-9]+\\.?[0-9]*$' AND (post.attributes->>'${key}')::numeric ${op} :${p}`,
            { [p]: num },
          );
        } else if (fieldTypes.get(key) === 'select') {
          qb.andWhere(`post.attributes @> :${p}::jsonb`, {
            [p]: JSON.stringify({ [key]: String(val) }),
          });
        } else {
          qb.andWhere(`post.attributes->>'${key}' ILIKE :${p}`, { [p]: `%${String(val)}%` });
        }
      }
    }

    const limit = filters.limit || 50;
    const offset = ((filters.page || 1) - 1) * limit;
    qb.take(limit).skip(offset);

    const [items, total] = await qb.getManyAndCount();
    // Never let raw User entities (push_token, device_info, …) reach clients.
    const result = {
      items: items.map((p) => ({ ...p, user: publicUser(p.user) }) as Post),
      total,
    };
    if (useCache) this.cache.set(cacheKey, result, TTL.posts);
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
        'post.price_amount', 'post.price_unit', 'post.images', 'post.attributes',
        'post.status', 'post.date_created',
      ])
      .where('post.latitude IS NOT NULL AND post.longitude IS NOT NULL')
      .andWhere('post.latitude BETWEEN -90 AND 90')
      .andWhere('post.longitude BETWEEN -180 AND 180')
      .andWhere('post.approval_status = :s', { s: 'APPROVED' })
      .andWhere('post.status != :expired', { expired: Status.EXPIRED })
      .andWhere('(post.expires_at IS NULL OR post.expires_at > NOW())')
      .orderBy('post.date_created', 'DESC')
      // Safety cap — the map can't usefully render more pins than this anyway,
      // and an uncapped getMany() scales the payload with the whole table.
      .take(2000)
      .getMany();

    this.cache.set('posts:map', result, TTL.map);
    return result;
  }

  async findByUser(userId: string, page = 1, limit = 50): Promise<Post[]> {
    return this.postRepository.find({
      where: { user: { id: userId } },
      order: { date_created: 'DESC' },
      take: limit,
      skip: (page - 1) * limit,
    });
  }

  async findOne(id: number): Promise<Post> {
    const post = await this.postRepository.findOne({ where: { id }, relations: ['user', 'user.company'] });
    if (!post) throw new NotFoundException(`Post #${id} not found`);
    return post;
  }

  async incrementViews(postId: number, userId?: string): Promise<void> {
    if (userId) {
      const result = await this.viewedpostService.recordView(userId, 'post', postId);
      if (!result.already_viewed) {
        await this.postRepository.increment({ id: postId }, 'views', 1);
      }
    } else {
      await this.postRepository.increment({ id: postId }, 'views', 1);
    }
  }

  async update(id: number, dto: UpdatePostDto, files: Express.Multer.File[], userId: string): Promise<Post> {
    const post = await this.findOne(id);

    if (!post.user || post.user.id !== userId) {
      throw new ForbiddenException('You can only update your own posts');
    }
    this.validateStatus(dto.status);

    const existingImages: string[] = dto.existingImages || post.images || [];

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
      available_from: dto.available_from ? new Date(dto.available_from) : post.available_from,
      available_until: dto.available_until ? new Date(dto.available_until) : post.available_until,
      website: dto.website ?? post.website,
      status: dto.status ?? post.status,
      attributes: dto.attributes ?? post.attributes,
    });

    if (files?.length) {
      const removedImages = (post.images || []).filter(img => !existingImages.includes(img));
      if (removedImages.length) await deleteMultipleImages(removedImages, UPLOAD_DIR);

      const newImages = await ImageUploadHandler.processAfterSave(files, UPLOAD_DIR);
      post.images = [...existingImages, ...newImages];
    } else {
      post.images = existingImages;
    }

    if (contentChanged) post.approval_status = 'PENDING';
    const updated = await this.postRepository.save(post);
    invalidatePostReadCaches();
    return updated;
  }

  async remove(id: number, userId: string): Promise<void> {
    const post = await this.findOne(id);

    if (!post.user || post.user.id !== userId) {
      throw new ForbiddenException('You can only delete your own posts');
    }

    if (post.images?.length) {
      await deleteMultipleImages(post.images, UPLOAD_DIR);
    }
    await this.postRepository.delete(id);
    invalidatePostReadCaches();
  }

  // ─── Notification helpers ──────────────────────────────────────────────────

  // ─── Scheduled jobs ────────────────────────────────────────────────────────

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

    const rows = await this.postRepository
      .createQueryBuilder('post')
      .select('post.category', 'key')
      .addSelect('COUNT(*)::int', 'count')
      .where('post.approval_status = :status', { status: 'APPROVED' })
      .groupBy('post.category')
      .getRawMany<{ key: string; count: number }>();

    const provinceRow = await this.postRepository
      .createQueryBuilder('post')
      .select('COUNT(DISTINCT post.province)::int', 'count')
      .where('post.approval_status = :status', { status: 'APPROVED' })
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
