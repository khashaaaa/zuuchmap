import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Viewedpost } from './entities/viewedpost.entity';

/** Who is looking: a signed-in user, or an anonymous visitor key. Never both. */
export interface Viewer {
  userId?: string | null;
  visitorKey?: string | null;
}

@Injectable()
export class ViewedpostService {
  constructor(
    @InjectRepository(Viewedpost)
    private viewedPostRepository: Repository<Viewedpost>,
  ) {}

  /**
   * Record one view, deduped per viewer.
   *
   * Signed-in views dedupe on the (user_id, post_type, post_id) unique
   * constraint; anonymous ones on a partial unique index over visitor_key.
   * Both are ON CONFLICT DO NOTHING, so a repeat view is one round trip that
   * changes nothing rather than a read followed by a write.
   */
  async recordView(
    viewer: Viewer,
    post_type: string,
    post_id: number,
  ): Promise<{
    success: boolean;
    message: string;
    already_viewed: boolean;
  }> {
    const user_id = viewer.userId ?? null;
    const visitor_key = user_id ? null : (viewer.visitorKey ?? null);

    // Neither identifies the viewer, so a view here could not be deduped at
    // all — counting it would let one reloading browser inflate the number.
    if (!user_id && !visitor_key) {
      return { success: false, message: 'No viewer key', already_viewed: true };
    }

    try {
      const result = await this.viewedPostRepository
        .createQueryBuilder()
        .insert()
        .into(Viewedpost)
        .values({
          user_id,
          visitor_key,
          post_type,
          post_id,
          date_viewed: new Date(),
        })
        .orIgnore()
        .execute();
      const inserted = (result.raw?.length ?? 0) > 0;

      return {
        success: inserted,
        message: inserted
          ? 'View recorded successfully'
          : 'Post already viewed by this viewer',
        already_viewed: !inserted,
      };
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY' || error.code === '23505') {
        return {
          success: false,
          message: 'Post already viewed by this viewer',
          already_viewed: true,
        };
      }
      throw error;
    }
  }
}
