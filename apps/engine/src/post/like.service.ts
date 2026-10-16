import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { LikeResponse, ListingListItem, Paginated } from '@zuuchmap/core';
import type { RequestUser } from '../auth/request-user';
import { Post } from './entities/post.entity';
import { PostService } from './post.service';

/**
 * Saved listings ("Хадгалсан"). Keyed on the listing alone, idempotent both ways: saving twice
 * or removing what was never saved is a 2xx, so an optimistic client never has to reconcile.
 */
@Injectable()
export class LikeService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly posts: PostService,
  ) {}

  private async count(postId: number): Promise<number> {
    const rows = await this.ds.query<Array<{ n: number }>>('SELECT COUNT(*)::int AS n FROM post_likes WHERE post_id = $1', [postId]);
    return rows[0]?.n ?? 0;
  }

  /** 404 for a listing browse would not show; 400 CANNOT_LIKE_OWN_POST for the owner. */
  async like(me: RequestUser, postId: number): Promise<LikeResponse> {
    const post = await this.posts.loadPost(postId);
    if (!this.posts.isLive(post)) throw new NotFoundException({ message: 'Listing is no longer available', code: 'POST_NOT_AVAILABLE' });
    if (post.user_id === me.id) throw new BadRequestException({ message: 'You cannot save your own listing', code: 'CANNOT_LIKE_OWN_POST' });
    await this.ds.query('INSERT INTO post_likes (user_id, post_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [me.id, postId]);
    return { liked: true, like_count: await this.count(postId) };
  }

  async unlike(me: RequestUser, postId: number): Promise<LikeResponse> {
    await this.ds.query('DELETE FROM post_likes WHERE user_id = $1 AND post_id = $2', [me.id, postId]);
    return { liked: false, like_count: await this.count(postId) };
  }

  /** Every saved listing id, lapsed ones included, so a client can mark its cards. */
  async ids(me: RequestUser): Promise<number[]> {
    const rows = await this.ds.query<Array<{ post_id: number }>>('SELECT post_id FROM post_likes WHERE user_id = $1 ORDER BY created_at DESC', [me.id]);
    return rows.map((r) => r.post_id);
  }

  /** A guest's on-device saves at sign-in: live listings that are not the caller's own; the rest are dropped silently. */
  async merge(me: RequestUser, postIds: number[]): Promise<number[]> {
    const ids = [...new Set(postIds)];
    if (ids.length > 0) {
      await this.ds.query(
        `INSERT INTO post_likes (user_id, post_id)
         SELECT $1::uuid, p.id FROM posts p
          WHERE p.id = ANY($2::int[]) AND p.user_id IS DISTINCT FROM $1::uuid
            AND p.approval_status = 'APPROVED' AND p.is_draft = false AND p.deleted_at IS NULL
            AND p.status <> 'EXPIRED' AND (p.expires_at IS NULL OR p.expires_at > NOW())
         ON CONFLICT DO NOTHING`,
        [me.id, ids],
      );
    }
    return this.ids(me);
  }

  /** Newest save first; a lapsed or rejected listing stays (the client greys it), a deleted one is gone. */
  async list(me: RequestUser, page = 1, limit = 20): Promise<Paginated<ListingListItem>> {
    const qb = this.ds
      .getRepository(Post)
      .createQueryBuilder('post')
      .innerJoin('post_likes', 'l', 'l.post_id = post.id AND l.user_id = :me', { me: me.id })
      .where('post.deleted_at IS NULL')
      .orderBy('l.created_at', 'DESC')
      .addOrderBy('post.id', 'DESC')
      .offset((page - 1) * limit)
      .limit(limit);
    const [entities, total] = await qb.getManyAndCount();
    return { items: await this.posts.items(entities), total };
  }
}
