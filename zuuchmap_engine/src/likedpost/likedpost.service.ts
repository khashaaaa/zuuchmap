import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { Likedpost } from './entities/likedpost.entity';
import { User } from '../user/entities/user.entity';
import { Post } from '../post/entities/post.entity';

@Injectable()
export class LikedpostService {
  constructor(
    @InjectRepository(Likedpost)
    private likedPostRepository: Repository<Likedpost>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Post)
    private postRepository: Repository<Post>,
  ) {}

  async likePost(user_id: string, post_type: string, post_id: number): Promise<{
    success: boolean;
    message: string;
    liked_post?: Likedpost;
  }> {
    const [user, post] = await Promise.all([
      this.userRepository.findOne({ where: { id: user_id } }),
      this.postRepository.findOne({ where: { id: post_id }, relations: ['user'] }),
    ]);
    if (!user) throw new BadRequestException('User not found');
    if (post?.user?.id === user_id) {
      throw new BadRequestException('Өөрийн зарт таалагдсан болгох боломжгүй');
    }

    const existing = await this.likedPostRepository.findOne({
      where: { user_id, post_type, post_id },
    });
    if (existing) return { success: false, message: 'Post already liked' };

    try {
      const liked_post = await this.likedPostRepository.save(
        this.likedPostRepository.create({ user_id, post_type, post_id, date_liked: new Date() })
      );
      return { success: true, message: 'Post liked successfully', liked_post };
    } catch (error) {
      if (error.code === '23505') return { success: false, message: 'Post already liked' };
      throw error;
    }
  }

  async unlikePost(user_id: string, post_type: string, post_id: number): Promise<{
    success: boolean;
    message: string;
  }> {
    const result = await this.likedPostRepository.delete({ user_id, post_type, post_id });
    return (result?.affected ?? 0) > 0
      ? { success: true, message: 'Post unliked successfully' }
      : { success: false, message: 'Post was not liked' };
  }

  async checkPostLiked(user_id: string, post_type: string, post_id: number): Promise<boolean> {
    const like = await this.likedPostRepository.findOne({ where: { user_id, post_type, post_id } });
    return !!like;
  }

  async getUserLikedPosts(user_id: string, page = 1, limit = 20) {
    const offset = (page - 1) * limit;

    const [liked_posts, total] = await this.likedPostRepository
      .createQueryBuilder('lp')
      .leftJoinAndMapOne('lp.post', Post, 'post', 'post.id = lp.post_id')
      .leftJoinAndSelect('post.user', 'user')
      .where('lp.user_id = :user_id', { user_id })
      .orderBy('lp.date_liked', 'DESC')
      .skip(offset)
      .take(limit)
      .getManyAndCount();

    const enriched = liked_posts
      .map((lp) => {
        const post = (lp as any).post;
        if (!post) return null;
        return {
          ...post,
          post_type: lp.post_type,
          date_liked: lp.date_liked,
          image_url: post.images?.[0]
            ? post.images[0].startsWith('http')
              ? post.images[0]
              : `${process.env.API_URL || 'https://zuuchmap.com'}/engine/uploads/posts/${post.images[0]}`
            : null,
          price: post.price_amount
            ? `${Number(post.price_amount).toLocaleString()} ₮${post.price_unit ? `/${post.price_unit}` : ''}`
            : null,
          location:
            post.location ||
            post.address ||
            (post.province && post.district ? `${post.province}, ${post.district}` : null),
        };
      })
      .filter(Boolean);

    return { posts: enriched, total, page, total_pages: Math.ceil(total / limit) };
  }

  async getLikeStatistics(post_type: string, post_id: number) {
    const seven_days_ago = new Date();
    seven_days_ago.setDate(seven_days_ago.getDate() - 7);
    const [total_likes, recent_likes] = await Promise.all([
      this.likedPostRepository.count({ where: { post_type, post_id } }),
      this.likedPostRepository.count({ where: { post_type, post_id, date_liked: MoreThan(seven_days_ago) } }),
    ]);
    return { total_likes, recent_likes };
  }

  async getUserLikedPostIds(user_id: string, post_type?: string): Promise<number[]> {
    const where: any = { user_id };
    if (post_type) where.post_type = post_type;
    const liked = await this.likedPostRepository.find({ where, select: ['post_id'] });
    return liked.map(lp => lp.post_id);
  }

  /**
   * Every liked id, keyed by post_type. A browse list spans all categories, so
   * asking per type meant one request per category on screen — and the answer
   * never depended on which posts were visible.
   */
  async getUserLikedPostIdsByType(user_id: string): Promise<Record<string, number[]>> {
    const liked = await this.likedPostRepository.find({
      where: { user_id }, select: ['post_type', 'post_id'],
    });
    return liked.reduce<Record<string, number[]>>((acc, lp) => {
      (acc[lp.post_type] ??= []).push(lp.post_id);
      return acc;
    }, {});
  }
}
