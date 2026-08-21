import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PostController } from './post.controller';
import { PostService } from './post.service';
import { CategoryService } from './category.service';
import { Post } from './entities/post.entity';
import { CategorySchema } from './entities/category-schema.entity';
import { Viewedpost } from './entities/viewedpost.entity';
import { ViewedpostService } from './viewedpost.service';
import { PostNotificationService } from './post-notification.service';
import { User } from '../user/entities/user.entity';
import { EventsModule } from '../events/events.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Post, CategorySchema, Viewedpost, User]),
    EventsModule,
  ],
  controllers: [PostController],
  providers: [PostService, CategoryService, ViewedpostService, PostNotificationService],
  exports: [PostService, CategoryService, PostNotificationService, TypeOrmModule],
})
export class PostModule {}
