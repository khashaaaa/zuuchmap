import type { Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import request from 'supertest';
import { AllExceptionsFilter } from '../src/common/all-exceptions.filter';
import { HealthController } from '../src/health/health.controller';
import { RedisService } from '../src/redis/redis.service';

async function boot(dbOk: boolean, redis: { configured: boolean; ok: boolean }): Promise<INestApplication> {
  const mod = await Test.createTestingModule({
    controllers: [HealthController],
    providers: [
      {
        provide: getDataSourceToken(),
        useValue: { query: () => (dbOk ? Promise.resolve([{ '?column?': 1 }]) : Promise.reject(new Error('down'))) },
      },
      {
        provide: RedisService,
        useValue: { configured: redis.configured, ping: () => Promise.resolve(redis.ok) },
      },
    ],
  }).compile();
  const app = mod.createNestApplication();
  app.setGlobalPrefix('api');
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.init();
  return app;
}

describe('health', () => {
  let app: INestApplication;
  afterEach(async () => {
    await app.close();
  });

  it('liveness answers ok with a version', async () => {
    app = await boot(true, { configured: false, ok: true });
    const res = await request(app.getHttpServer() as Server).get('/api/health').expect(200);
    expect(res.body).toMatchObject({ ok: true });
    expect(typeof (res.body as { version: unknown }).version).toBe('string');
  });

  it('readiness is 200 when the database is up', async () => {
    app = await boot(true, { configured: true, ok: true });
    const res = await request(app.getHttpServer() as Server).get('/api/health/ready').expect(200);
    expect(res.body).toEqual({ ok: true, db: 'up', redis: 'up' });
  });

  it('readiness is 503 when the database is down', async () => {
    app = await boot(false, { configured: false, ok: true });
    const res = await request(app.getHttpServer() as Server).get('/api/health/ready').expect(503);
    expect(res.body).toEqual({ ok: false, db: 'down', redis: 'off' });
  });
});
