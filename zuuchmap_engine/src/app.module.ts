import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { envconfig } from 'config/envconfig';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { LoggerMiddleware } from 'src/utils/logger';
import { UserModule } from './user/user.module';
import { CompanyModule } from './company/company.module';
import { AuthModule } from './auth/auth.module';
import { PostModule } from './post/post.module';
import { LikedpostModule } from './likedpost/likedpost.module';
import { AdminModule } from './admin/admin.module';
import { EventsModule } from './events/events.module';
import { BookingModule } from './booking/booking.module';
import { ReviewModule } from './review/review.module';
import { AnalyticsModule } from './analytics/analytics.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (cs: ConfigService) => [{
        ttl: cs.get<number>('THROTTLER_TTL') ?? 60000,
        limit: cs.get<number>('THROTTLER_LIMIT') ?? 100,
      }],
    }),
    ConfigModule.forRoot({
      envFilePath: `${process.cwd()}/config/variables/${process.env.NODE_ENV}.env`,
      isGlobal: true,
      load: [envconfig],
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (cs: ConfigService) => ({
        type: 'postgres',
        host: cs.get('PG_HOST'),
        port: cs.get('PG_PORT'),
        username: cs.get('PG_USER'),
        password: cs.get<string>('PG_PWD'),
        database: cs.get('PG_NAME'),
        synchronize: false,
        migrationsRun: true,
        autoLoadEntities: true,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
        migrations: [__dirname + '/migrations/*{.ts,.js}'],
        // Survive transient DB outages: keep retrying instead of crashing on boot/reconnect
        retryAttempts: 30,
        retryDelay: 3000,
        extra: { max: 20, min: 5, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 10_000 },
      }),
    }),
    AuthModule,
    UserModule,
    CompanyModule,
    PostModule,
    LikedpostModule,
    AdminModule,
    EventsModule,
    BookingModule,
    ReviewModule,
    AnalyticsModule,
  ],
  controllers: [],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(LoggerMiddleware).forRoutes('*path');
  }
}
