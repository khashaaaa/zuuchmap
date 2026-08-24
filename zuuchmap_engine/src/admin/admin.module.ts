import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { Post } from '../post/entities/post.entity';
import { User } from '../user/entities/user.entity';
import { Company } from '../company/entities/company.entity';
import { EventsModule } from '../events/events.module';
import { PostModule } from '../post/post.module';
import { SavedSearchModule } from '../saved-search/saved-search.module';

@Module({
  imports: [TypeOrmModule.forFeature([Post, User, Company]), EventsModule, PostModule, SavedSearchModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
