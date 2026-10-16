import { Module } from '@nestjs/common';
import { PeopleModule } from '../people/people.module';
import { PostModule } from '../post/post.module';
import { ReviewController, SellerController } from './review.controller';
import { ReviewService } from './review.service';

@Module({
  imports: [PostModule, PeopleModule],
  controllers: [ReviewController, SellerController],
  providers: [ReviewService],
  exports: [ReviewService],
})
export class ReviewModule {}
