import { Module } from '@nestjs/common';
import { PeopleModule } from '../people/people.module';
import { PostModule } from '../post/post.module';
import { ReviewModule } from '../review/review.module';
import { ReportAdminController, ReportController } from './report.controller';
import { ReportService } from './report.service';

@Module({
  imports: [PostModule, ReviewModule, PeopleModule],
  controllers: [ReportController, ReportAdminController],
  providers: [ReportService],
  exports: [ReportService],
})
export class ReportModule {}
