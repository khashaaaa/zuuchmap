import {
  Injectable,
  BadRequestException,
  Logger,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Post } from '../post/entities/post.entity';
import { User } from '../user/entities/user.entity';
import { Company } from '../company/entities/company.entity';
import { UserType } from '../enums/usertype';
import { PlanService } from '../user/plan.service';
import { PostNotificationService } from '../post/post-notification.service';
import { PostService } from '../post/post.service';
import { SavedSearchService } from '../saved-search/saved-search.service';
import { EventsGateway } from '../events/events.gateway';
import { sharedCache, invalidatePostReadCaches } from '../utils/cache';

const STATS_TTL = 30_000; // 30 s

// Lives in PlanService now — both the admin grant and a settled QPay invoice
// have to agree on what "another month" means. Re-exported because callers
// (and its tests) have always imported it from here.
export { addMonths } from '../user/plan.service';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);
  private readonly cache = sharedCache;

  constructor(
    @InjectRepository(Post)
    private postRepository: Repository<Post>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Company)
    private companyRepository: Repository<Company>,
    private readonly events: EventsGateway,
    private readonly notifications: PostNotificationService,
    private readonly posts: PostService,
    @Optional() private readonly savedSearches: SavedSearchService,
    private readonly plans: PlanService,
  ) {}

  /**
   * Grants or revokes a provider plan — the manual path, used after a bank
   * transfer has been reconciled by hand. Delegates to PlanService so it
   * cannot drift from the path a QPay invoice takes.
   */
  async setUserPlan(
    userId: string,
    plan: string,
    months = 1,
  ): Promise<{ plan: string; plan_expires_at: Date | null }> {
    return this.plans.setPlan(userId, plan, months);
  }

  /**
   * Marks a company verified.
   *
   * Granted only after an admin has checked `registration_number` against the
   * state register — the badge tells customers a human confirmed the company
   * exists, so it must never be granted as a side effect of payment.
   */
  async setCompanyVerified(
    companyId: string,
    isVerified: boolean,
  ): Promise<{ is_verified: boolean }> {
    const company = await this.companyRepository.findOne({
      where: { id: companyId },
    });
    if (!company)
      throw new BadRequestException(`Company ${companyId} not found`);
    company.is_verified = !!isVerified;
    await this.companyRepository.save(company);
    this.logger.log(
      `setCompanyVerified: ${companyId} -> ${company.is_verified}`,
    );
    return { is_verified: company.is_verified };
  }

  /** Opens a paid placement window on one post. `days` of 0 clears it. */
  async featurePost(
    postId: number,
    days: number,
  ): Promise<{ featured_until: Date | null }> {
    const clamped = Math.min(Math.max(Math.floor(days) || 0, 0), 90);
    const post = await this.postRepository.findOne({ where: { id: postId } });
    if (!post) throw new BadRequestException(`Post #${postId} not found`);
    if (clamped === 0) {
      post.featured_until = null;
    } else {
      const base =
        post.featured_until && new Date(post.featured_until) > new Date()
          ? new Date(post.featured_until)
          : new Date();
      base.setDate(base.getDate() + clamped);
      post.featured_until = base;
    }
    // Kept in step with the window it mirrors. The hourly sweep only has to
    // catch windows that *lapse*; every deliberate change lands here first, so
    // an admin never sees their own action take an hour to show.
    post.is_featured =
      !!post.featured_until && new Date(post.featured_until) > new Date();
    await this.postRepository.save(post);
    invalidatePostReadCaches();
    this.logger.log(
      `featurePost: #${postId} featured_until=${post.featured_until?.toISOString() ?? 'cleared'}`,
    );
    return { featured_until: post.featured_until };
  }

  async editPost(
    postId: number,
    updates: { title?: string; details?: string },
  ): Promise<Post> {
    const post = await this.postRepository.findOne({ where: { id: postId } });
    if (!post) throw new BadRequestException(`Post #${postId} not found`);
    if (updates.title?.trim()) post.title = updates.title.trim();
    if (updates.details?.trim()) post.details = updates.details.trim();
    const saved = await this.postRepository.save(post);
    invalidatePostReadCaches();
    return saved;
  }

  /**
   * Moderation queue, oldest first. Paged rather than a flat `take(200)`: the
   * old cap silently dropped everything past the 200th with nothing on the
   * client to say the queue had been truncated.
   *
   * The order is FIFO on purpose. Newest-first was survivable while the whole
   * queue came back in one response; with paging it starves the tail — the
   * posts that have waited longest get pushed onto a last page nobody opens,
   * and a provider's first post is the one left sitting there.
   */
  async getPendingPosts(category?: string, page = 1, limit = 50) {
    const take = Math.min(Math.max(Math.floor(limit || 50) || 50, 1), 200);
    const safePage = Math.max(Math.floor(page || 1) || 1, 1);
    const qb = this.postRepository
      .createQueryBuilder('post')
      .leftJoinAndSelect('post.user', 'user')
      .where('post.approval_status = :s', { s: 'PENDING' })
      .orderBy('post.date_created', 'ASC')
      .take(take)
      .skip((safePage - 1) * take);

    if (category) qb.andWhere('post.category = :category', { category });

    // `{ items, total }`, matching `GET /posts`. A bare array left the client
    // inferring depth from whether a page came back full, which reported 51
    // pending when there were 318 — the admin could never see how far back the
    // queue went, only that there was one more page than the one they were on.
    const [items, total] = await qb.getManyAndCount();
    return { items, total };
  }

  private async findPostWithUser(postId: number): Promise<Post> {
    const post = await this.postRepository.findOne({
      where: { id: postId },
      relations: ['user'],
    });
    if (!post) throw new BadRequestException(`Post #${postId} not found`);
    return post;
  }

  async approvePost(postId: number) {
    const post = await this.findPostWithUser(postId);

    post.approval_status = 'APPROVED';
    post.rejection_reason = null as unknown as string;
    post.rejection_field = null;
    post.previous_snapshot = null;
    // An edited-and-resubmitted post can be past its window by the time it
    // reaches the front of the queue. Approving it without reopening that
    // window publishes something `findAll` will never return.
    await this.posts.relistIfLapsed(post);
    await this.postRepository.save(post);

    const userId = post.user?.id;
    if (userId) {
      await this.notifications.notifyUsers(
        [userId],
        'Зар зөвшөөрөгдлөө',
        `"${post.title}" нийтлэгдлээ. Та одоо харагдаж байна.`,
        { postId, post_type: post.category, notifType: 'approved' },
      );
      this.events.emitPostApproved(postId, userId, post.title, post.category);
    }
    // Fire-and-forget: the service swallows its own errors, and the admin
    // should not wait on a push fan-out to see the approval land.
    void this.savedSearches?.notifyForApprovedPost(post);
    this.events.emitStatsUpdated();
    invalidatePostReadCaches();

    return { success: true, message: 'Post approved', post };
  }

  /**
   * Approve many posts in one request. The web client used to fan out one PUT
   * per post from `Promise.all`, which burned the admin's whole rate-limit
   * budget on a single "select all" and then reported total failure the moment
   * one of them 429'd — even though the rest had been approved.
   *
   * Never all-or-nothing: each post is independent, so the response says what
   * happened to each one and the caller can show a partial result honestly.
   */
  async approvePosts(postIds: number[]): Promise<{
    approved: number[];
    failed: { id: number; reason: string }[];
  }> {
    const approved: number[] = [];
    const failed: { id: number; reason: string }[] = [];

    for (const id of postIds) {
      try {
        await this.approvePost(id);
        approved.push(id);
      } catch (err: any) {
        this.logger.warn(`bulk approve: post ${id} failed — ${err?.message}`);
        failed.push({ id, reason: err?.message ?? 'unknown' });
      }
    }

    return { approved, failed };
  }

  /**
   * `fieldKey` names the form field the reason is about — a schema
   * `FieldDef.key` or a base field (title, details, price, images, location).
   * Validated by shape only: schemas are admin-editable, so a key that is not
   * on today's schema is a stale choice, not an attack.
   */
  async rejectPost(postId: number, reason: string, fieldKey?: string | null) {
    if (!reason?.trim())
      throw new BadRequestException('Rejection reason is required');
    const field = fieldKey?.trim() || null;
    if (field && !/^[a-z0-9_]{1,64}$/i.test(field))
      throw new BadRequestException('INVALID_FIELD_KEY');
    const post = await this.findPostWithUser(postId);

    post.approval_status = 'REJECTED';
    post.rejection_reason = reason.trim();
    post.rejection_field = field;
    post.previous_snapshot = null;
    await this.postRepository.save(post);

    const userId = post.user?.id;
    if (userId) {
      await this.notifications.notifyUsers(
        [userId],
        `"${post.title}" зөвшөөрөгдсөнгүй`,
        `Шалтгаан: ${reason.trim()}`,
        {
          postId,
          post_type: post.category,
          reason: reason.trim(),
          field_key: field ?? undefined,
          notifType: 'rejected',
        },
      );
      this.events.emitPostRejected(
        postId,
        userId,
        reason.trim(),
        post.title,
        post.category,
      );
    }
    this.events.emitStatsUpdated();
    invalidatePostReadCaches();

    return { success: true, message: 'Post rejected', post };
  }

  async getStats() {
    const cached = this.cache.get<object>('admin:stats');
    if (cached) return cached;

    const [postCounts, userCounts, byCategory] = await Promise.all([
      this.postRepository
        .createQueryBuilder('post')
        .select(
          "SUM(CASE WHEN post.approval_status = 'PENDING' THEN 1 ELSE 0 END)",
          'pending',
        )
        .addSelect(
          "SUM(CASE WHEN post.approval_status = 'APPROVED' THEN 1 ELSE 0 END)",
          'approved',
        )
        .addSelect(
          "SUM(CASE WHEN post.approval_status = 'REJECTED' THEN 1 ELSE 0 END)",
          'rejected',
        )
        .addSelect('COUNT(*)', 'total')
        .getRawOne(),
      this.userRepository
        .createQueryBuilder('user')
        .select('COUNT(*)', 'total')
        .addSelect(
          `SUM(CASE WHEN user.type = '${UserType.PROVIDER}' THEN 1 ELSE 0 END)`,
          'providers',
        )
        .addSelect(
          `SUM(CASE WHEN user.type = '${UserType.CUSTOMER}' THEN 1 ELSE 0 END)`,
          'customers',
        )
        .getRawOne(),
      this.postRepository
        .createQueryBuilder('post')
        .select('post.category', 'postType')
        .addSelect('COUNT(*)', 'total')
        .addSelect(
          "SUM(CASE WHEN post.approval_status = 'PENDING' THEN 1 ELSE 0 END)",
          'pending',
        )
        .addSelect(
          "SUM(CASE WHEN post.approval_status = 'APPROVED' THEN 1 ELSE 0 END)",
          'approved',
        )
        .groupBy('post.category')
        .getRawMany(),
    ]);

    const stats = {
      totals: {
        pending: Number(postCounts.pending),
        approved: Number(postCounts.approved),
        rejected: Number(postCounts.rejected),
        total: Number(postCounts.total),
      },
      totalUsers: Number(userCounts.total),
      totalProviders: Number(userCounts.providers),
      totalCustomers: Number(userCounts.customers),
      byType: byCategory.map((row) => ({
        postType: row.postType,
        total: Number(row.total),
        pending: Number(row.pending),
        approved: Number(row.approved),
      })),
    };
    this.cache.set('admin:stats', stats, STATS_TTL);
    return stats;
  }
}
