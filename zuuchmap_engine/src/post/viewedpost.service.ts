import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Viewedpost } from './entities/viewedpost.entity';

@Injectable()
export class ViewedpostService {
  constructor(
    @InjectRepository(Viewedpost)
    private viewedPostRepository: Repository<Viewedpost>,
  ) { }

  async recordView(user_id: string, post_type: string, post_id: number): Promise<{
    success: boolean;
    message: string;
    already_viewed: boolean;
    viewed_post?: Viewedpost
  }> {
    try {
      // Single round-trip: the unique constraint already guards duplicates, so
      // ON CONFLICT DO NOTHING replaces the old SELECT-then-INSERT pair.
      const result = await this.viewedPostRepository.createQueryBuilder()
        .insert()
        .into(Viewedpost)
        .values({ user_id, post_type, post_id, date_viewed: new Date() })
        .orIgnore()
        .execute();
      const inserted = (result.raw?.length ?? 0) > 0;

      return {
        success: inserted,
        message: inserted ? 'View recorded successfully' : 'Post already viewed by this user',
        already_viewed: !inserted,
      };

    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY' || error.code === '23505') {
        return {
          success: false,
          message: 'Post already viewed by this user',
          already_viewed: true
        };
      }
      throw error;
    }
  }

}

