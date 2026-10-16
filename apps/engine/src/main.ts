import './config/load-env'; // must stay first
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import * as Sentry from '@sentry/node';
import compression from 'compression';
import helmet from 'helmet';
import { RedisIoAdapter } from './events/redis-io.adapter';
import { AppModule } from './app.module';
import { env } from './config/env';

async function bootstrap(): Promise<void> {
  const e = env(); // fail fast, naming the missing variable
  if (e.SENTRY_DSN) Sentry.init({ dsn: e.SENTRY_DSN, environment: e.NODE_ENV });

  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // nginx is the one hop in front: req.ip is the visitor's address (rate limits, view caps), not 127.0.0.1.
  app.set('trust proxy', 1);
  app.setGlobalPrefix('api');
  app.use(helmet());
  app.use(compression());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableCors({ origin: e.ALLOWED_ORIGIN, credentials: true });
  if (e.REDIS_URL) {
    const adapter = new RedisIoAdapter(app);
    adapter.connect(e.REDIS_URL);
    app.useWebSocketAdapter(adapter);
  }
  app.enableShutdownHooks();
  await (e.HOST ? app.listen(e.PORT, e.HOST) : app.listen(e.PORT));
}

bootstrap().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
