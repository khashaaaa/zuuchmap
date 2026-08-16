import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LikedpostController } from './likedpost.controller';
import { LikedpostService } from './likedpost.service';
import { Likedpost } from './entities/likedpost.entity';
import { User } from '../user/entities/user.entity';
import { Post } from '../post/entities/post.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Likedpost, User, Post])],
  controllers: [LikedpostController],
  providers: [LikedpostService],
  exports: [LikedpostService],
})
export class LikedpostModule {}
