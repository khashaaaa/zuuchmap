import { Global, Module } from '@nestjs/common';
import { env } from '../config/env';
import { REDIS_URL, RedisService } from './redis.service';

@Global()
@Module({
  providers: [{ provide: REDIS_URL, useFactory: () => env().REDIS_URL }, RedisService],
  exports: [RedisService],
})
export class RedisModule {}
