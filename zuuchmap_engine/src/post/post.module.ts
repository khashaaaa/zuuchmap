import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PostController } from './post.controller';
import { PostService } from './post.service';
import { CategoryService } from './category.service';
import { Post } from './entities/post.entity';
import { CategorySchema } from './entities/category-schema.entity';
import { User } from '../user/entities/user.entity';
import { ViewedpostModule } from '../viewedpost/viewedpost.module';
import { EventsModule } from '../events/events.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Post, CategorySchema, User]),
    ViewedpostModule,
    EventsModule,
  ],
  controllers: [PostController],
  providers: [PostService, CategoryService],
  exports: [PostService, CategoryService, TypeOrmModule],
})
export class PostModule {}
