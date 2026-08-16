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
      // Check if user has already viewed this post
      const existing_view = await this.viewedPostRepository.findOne({
        where: { user_id, post_type, post_id }
      });

      if (existing_view) {
        return {
          success: false,
          message: 'Post already viewed by this user',
          already_viewed: true
        };
      }

      // Record the view
      const viewed_post = this.viewedPostRepository.create({
        user_id,
        post_type,
        post_id,
        date_viewed: new Date()
      });

      const saved_view = await this.viewedPostRepository.save(viewed_post);

      return {
        success: true,
        message: 'View recorded successfully',
        already_viewed: false,
        viewed_post: saved_view
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

  async hasUserViewed(user_id: string, post_type: string, post_id: number): Promise<boolean> {
    const view = await this.viewedPostRepository.findOne({
      where: { user_id, post_type, post_id }
    });
    return !!view;
  }

}

