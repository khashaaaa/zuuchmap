import { Module } from '@nestjs/common';
import { PaymentModule } from '../payment/payment.module';
import { PostModule } from '../post/post.module';
import { ReportModule } from '../report/report.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [PostModule, PaymentModule, ReportModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
