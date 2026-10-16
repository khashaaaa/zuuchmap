import { Injectable, Logger, Module } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PostModule } from '../post/post.module';
import { RedisService } from '../redis/redis.service';
import { PAYMENT_GATEWAY, QPayGateway } from './gateway';
import { PaymentAdminController, PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';

@Injectable()
class PaymentCronService {
  private readonly log = new Logger('PaymentCron');

  constructor(
    private readonly payments: PaymentService,
    private readonly redis: RedisService,
  ) {}

  /** One worker per window settles and retires invoices, and ends lapsed placements. */
  @Cron(CronExpression.EVERY_MINUTE)
  async tick(): Promise<void> {
    if (!(await this.redis.claimCron(`payments:sweep:${new Date().toISOString().slice(0, 16)}`, 55_000))) return;
    try {
      await this.payments.sweepPending();
      await this.payments.expireFeatured();
    } catch (err) {
      this.log.error(err instanceof Error ? err.message : String(err));
    }
  }
}

@Module({
  imports: [PostModule],
  controllers: [PaymentController, PaymentAdminController],
  providers: [PaymentService, PaymentCronService, { provide: PAYMENT_GATEWAY, useClass: QPayGateway }],
  exports: [PaymentService],
})
export class PaymentModule {}
