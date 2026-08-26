import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Post } from '../post/entities/post.entity';
import { SeoController } from './seo.controller';
import { SeoService } from './seo.service';
import { PostModule } from '../post/post.module';

@Module({
  imports: [TypeOrmModule.forFeature([Post]), PostModule],
  controllers: [SeoController],
  providers: [SeoService],
})
export class SeoModule {}
