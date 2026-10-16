import { Module } from '@nestjs/common';
import { CategoryModule } from '../category/category.module';
import { ChatModule } from '../chat/chat.module';
import { PeopleModule } from '../people/people.module';
import { PostModule } from '../post/post.module';
import { BookingCronService } from './booking-cron.service';
import { BookingController } from './booking.controller';
import { BookingService } from './booking.service';

@Module({
  imports: [PostModule, CategoryModule, ChatModule, PeopleModule],
  controllers: [BookingController],
  providers: [BookingService, BookingCronService],
  exports: [BookingService],
})
export class BookingModule {}
