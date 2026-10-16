import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminModule } from './admin/admin.module';
import { AuthModule } from './auth/auth.module';
import { AccountThrottlerGuard } from './auth/guards';
import { CategoryModule } from './category/category.module';
import { AllExceptionsFilter } from './common/all-exceptions.filter';
import { env } from './config/env';
import { dataSourceOptions } from './database/data-source';
import { EventsModule } from './events/events.module';
import { HealthController } from './health/health.controller';
import { NotificationModule } from './notification/notification.module';
import { PaymentModule } from './payment/payment.module';
import { PostModule } from './post/post.module';
import { ProviderModule } from './provider/provider.module';
import { BookingModule } from './booking/booking.module';
import { ChatModule } from './chat/chat.module';
import { CompanyModule } from './company/company.module';
import { ReportModule } from './report/report.module';
import { ReviewModule } from './review/review.module';
import { RedisModule } from './redis/redis.module';
import { UserModule } from './user/user.module';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      useFactory: () => ({
        ...dataSourceOptions(),
        autoLoadEntities: true,
        migrationsRun: false,
        retryAttempts: env().NODE_ENV === 'production' ? 10 : 3,
      }),
    }),
    ThrottlerModule.forRootAsync({
      useFactory: () => {
        const url = env().REDIS_URL;
        return {
          throttlers: [{ ttl: 60_000, limit: 120 }],
          ...(url ? { storage: new ThrottlerStorageRedisService(url) } : {}),
        };
      },
    }),
    ScheduleModule.forRoot(),
    RedisModule,
    EventsModule,
    AuthModule,
    UserModule,
    CategoryModule,
    PostModule,
    CompanyModule,
    ChatModule,
    BookingModule,
    ReviewModule,
    ProviderModule,
    NotificationModule,
    PaymentModule,
    ReportModule,
    AdminModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_GUARD, useClass: AccountThrottlerGuard },
  ],
})
export class AppModule {}
