import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Report } from './entities/report.entity';
import { Post } from '../post/entities/post.entity';
import { User } from '../user/entities/user.entity';
import { ReportController } from './report.controller';
import { ReportService } from './report.service';
import { EventsModule } from '../events/events.module';
import { PostModule } from '../post/post.module';

@Module({
  imports: [TypeOrmModule.forFeature([Report, Post, User]), EventsModule, PostModule],
  controllers: [ReportController],
  providers: [ReportService],
  exports: [ReportService],
})
export class ReportModule {}
