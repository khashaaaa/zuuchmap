import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Post } from '../post/entities/post.entity';
import { User } from '../user/entities/user.entity';
import { UserType } from '../enums/usertype';
import { PostNotificationService } from '../post/post-notification.service';
import { EventsGateway } from '../events/events.gateway';
import { sharedCache, invalidatePostReadCaches } from '../utils/cache';

const STATS_TTL = 30_000; // 30 s

@Injectable()
export class AdminService {
  private readonly cache = sharedCache;

  constructor(
    @InjectRepository(Post)
    private postRepository: Repository<Post>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private readonly events: EventsGateway,
    private readonly notifications: PostNotificationService,
  ) {}

  async editPost(postId: number, updates: { title?: string; details?: string }): Promise<Post> {
    const post = await this.postRepository.findOne({ where: { id: postId } });
    if (!post) throw new BadRequestException(`Post #${postId} not found`);
    if (updates.title?.trim()) post.title = updates.title.trim();
    if (updates.details?.trim()) post.details = updates.details.trim();
    const saved = await this.postRepository.save(post);
    invalidatePostReadCaches();
    return saved;
  }

  async getPendingPosts(category?: string) {
    const qb = this.postRepository.createQueryBuilder('post')
      .leftJoinAndSelect('post.user', 'user')
      .where('post.approval_status = :s', { s: 'PENDING' })
      .orderBy('post.date_created', 'DESC')
      .take(200);

    if (category) qb.andWhere('post.category = :category', { category });

    return qb.getMany();
  }

  private async findPostWithUser(postId: number): Promise<Post> {
    const post = await this.postRepository.findOne({ where: { id: postId }, relations: ['user'] });
    if (!post) throw new BadRequestException(`Post #${postId} not found`);
    return post;
  }

  async approvePost(postId: number) {
    const post = await this.findPostWithUser(postId);

    post.approval_status = 'APPROVED';
    post.rejection_reason = null as unknown as string;
    await this.postRepository.save(post);

    const userId = post.user?.id;
    if (userId) {
      await this.notifications.notifyUsers(
        [userId],
        'Зар зөвшөөрөгдлөө',
        `"${post.title}" нийтлэгдлээ. Та одоо харагдаж байна.`,
        { postId, notifType: 'approved' },
      );
      this.events.emitPostApproved(postId, userId, post.title);
    }
    this.events.emitStatsUpdated();
    invalidatePostReadCaches();

    return { success: true, message: 'Post approved', post };
  }

  async rejectPost(postId: number, reason: string) {
    if (!reason?.trim()) throw new BadRequestException('Rejection reason is required');
    const post = await this.findPostWithUser(postId);

    post.approval_status = 'REJECTED';
    post.rejection_reason = reason.trim();
    await this.postRepository.save(post);

    const userId = post.user?.id;
    if (userId) {
      await this.notifications.notifyUsers(
        [userId],
        `"${post.title}" зөвшөөрөгдсөнгүй`,
        `Шалтгаан: ${reason.trim()}`,
        { postId, reason: reason.trim(), notifType: 'rejected' },
      );
      this.events.emitPostRejected(postId, userId, reason.trim(), post.title);
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
        .select("SUM(CASE WHEN post.approval_status = 'PENDING' THEN 1 ELSE 0 END)", 'pending')
        .addSelect("SUM(CASE WHEN post.approval_status = 'APPROVED' THEN 1 ELSE 0 END)", 'approved')
        .addSelect("SUM(CASE WHEN post.approval_status = 'REJECTED' THEN 1 ELSE 0 END)", 'rejected')
        .addSelect('COUNT(*)', 'total')
        .getRawOne(),
      this.userRepository
        .createQueryBuilder('user')
        .select('COUNT(*)', 'total')
        .addSelect(`SUM(CASE WHEN user.type = '${UserType.PROVIDER}' THEN 1 ELSE 0 END)`, 'providers')
        .addSelect(`SUM(CASE WHEN user.type = '${UserType.CUSTOMER}' THEN 1 ELSE 0 END)`, 'customers')
        .getRawOne(),
      this.postRepository
        .createQueryBuilder('post')
        .select('post.category', 'postType')
        .addSelect('COUNT(*)', 'total')
        .addSelect("SUM(CASE WHEN post.approval_status = 'PENDING' THEN 1 ELSE 0 END)", 'pending')
        .addSelect("SUM(CASE WHEN post.approval_status = 'APPROVED' THEN 1 ELSE 0 END)", 'approved')
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
      byType: byCategory.map(row => ({
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
