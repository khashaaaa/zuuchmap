import { Injectable, NotFoundException, ForbiddenException, Logger, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { Status } from '../enums/status';
import { Post } from './entities/post.entity';
import { User } from '../user/entities/user.entity';
import { CreatePostDto } from './dto/create-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { ImageUploadHandler, deleteMultipleImages } from '../utils/uploader';
import { ViewedpostService } from '../viewedpost/viewedpost.service';
import { EventsGateway } from '../events/events.gateway';
import { SimpleCache } from '../utils/cache';
import { sendPushNotification } from '../utils/pushNotification';
import { getAdminPhones } from '../admin/admin.guard';

const UPLOAD_DIR = './uploads/posts';
const POST_EXPIRY_DAYS = 30;
const ACCOUNT_DELETION_GRACE_DAYS = 14;

const TTL = {
  posts: 30_000,   // 30 s
  map: 60_000,     // 60 s
} as const;

@Injectable()
export class PostService {
  private readonly logger = new Logger(PostService.name);
  private readonly cache = new SimpleCache();

  constructor(
    @InjectRepository(Post)
    private readonly postRepository: Repository<Post>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly viewedpostService: ViewedpostService,
    @Optional() private readonly events: EventsGateway,
  ) {}

  // ─── Posts ────────────────────────────────────────────────────────────────

  async create(dto: CreatePostDto, files: Express.Multer.File[]): Promise<Post> {
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
      status: 'ACTIVE',
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

    this.cache.invalidatePrefix('posts:list:');
    this.cache.del('posts:map');
    this.events?.emitPostCreated({ id: saved.id, category: saved.category, title: saved.title });

    // Push notification to admins (fires async, doesn't block response)
    this.notifyAdmins(saved.id, saved.title).catch(() => {});

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
    const cacheKey = `posts:list:${filters.category ?? ''}:${filters.subcategory ?? ''}:${filters.province ?? ''}:${filters.district ?? ''}:${filters.approval_status ?? ''}:${filters.status ?? ''}:${filters.page ?? 1}:${filters.limit ?? 50}`;
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
        } else {
          qb.andWhere(`post.attributes->>'${key}' ILIKE :${p}`, { [p]: `%${String(val)}%` });
        }
      }
    }

    const limit = filters.limit || 50;
    const offset = ((filters.page || 1) - 1) * limit;
    qb.take(limit).skip(offset);

    const [items, total] = await qb.getManyAndCount();
    const result = { items, total };
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

    if (post.user.id !== userId) {
      throw new ForbiddenException('You can only update your own posts');
    }

    const existingImages: string[] = dto.existingImages || post.images || [];

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

    post.approval_status = 'PENDING';
    const updated = await this.postRepository.save(post);
    this.cache.invalidatePrefix('posts:list:');
    this.cache.del('posts:map');
    return updated;
  }

  async remove(id: number, userId: string): Promise<void> {
    const post = await this.findOne(id);

    if (post.user.id !== userId) {
      throw new ForbiddenException('You can only delete your own posts');
    }

    if (post.images?.length) {
      await deleteMultipleImages(post.images, UPLOAD_DIR);
    }
    await this.postRepository.delete(id);
    this.cache.invalidatePrefix('posts:list:');
    this.cache.del('posts:map');
  }

  // ─── Notification helpers ──────────────────────────────────────────────────

  async setGracePeriodForUser(userId: string): Promise<void> {
    const gracedAt = new Date(Date.now() + ACCOUNT_DELETION_GRACE_DAYS * 24 * 60 * 60 * 1000);
    await this.postRepository
      .createQueryBuilder()
      .update(Post)
      .set({ expires_at: gracedAt })
      .where('user_id = :userId AND (expires_at IS NULL OR expires_at > :gracedAt)', { userId, gracedAt })
      .execute();
  }

  private async notifyAdmins(postId: number, title: string): Promise<void> {
    const adminPhones = getAdminPhones();
    if (!adminPhones.length) return;
    const admins = await this.userRepository.find({
      where: { phone_number: In(adminPhones) },
      select: ['push_token'],
    });
    await Promise.all(
      admins
        .filter(u => u.push_token?.startsWith('ExponentPushToken'))
        .map(u => sendPushNotification(
          u.push_token,
          'Шинэ зар бүртгэгдлээ',
          `"${title}" – шинэ зар шалгана уу.`,
          { postId, notifType: 'new_post' },
        )),
    );
  }

  async notifyUsers(userIds: string[], title: string, body: string, data?: Record<string, any>): Promise<void> {
    if (!userIds.length) return;
    try {
      const users = await this.userRepository.find({
        where: { id: In(userIds) },
        select: ['push_token'],
      });
      await Promise.all(
        users
          .filter(u => u.push_token?.startsWith('ExponentPushToken'))
          .map(u => sendPushNotification(u.push_token, title, body, data)),
      );
    } catch (err) {
      this.logger.warn(`notifyUsers failed (non-fatal): ${err?.message}`);
    }
  }

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
        this.cache.invalidatePrefix('posts:list:');
        this.cache.del('posts:map');
      }
    } catch (err) {
      this.logger.error(`expireOldPosts failed: ${err?.message}`);
    }
  }
}
