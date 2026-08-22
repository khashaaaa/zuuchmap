import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import * as fs from 'fs/promises';
import * as path from 'path';
import helmet from 'helmet';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CategoryService } from './post/category.service';
import * as express from 'express';
import { AllExceptionsFilter } from './filters/all-exceptions.filter';
import { redisEnabled } from './utils/redis';
import { RedisIoAdapter } from './utils/redis-io.adapter';

async function ensureUploadDirs() {
  const uploadDirs = [
    'temp',
    'profilepicture',
    'companylogo',
    'posts',
  ].map(dir => path.join(__dirname, '..', 'uploads', dir));

  for (const dir of uploadDirs) {
    await fs.mkdir(dir, { recursive: true }).catch(err => {
      Logger.error(`Failed to create directory ${dir}: ${err.message}`, 'Bootstrap');
    });
  }
}

process.on('uncaughtException', (err) => {
  Logger.error(`Uncaught exception: ${err.message}`, err.stack, 'Process');
  // Node makes no promise about process state after this point — continuing
  // risks serving corrupt data. In production pm2 brings back a clean process
  // (min_uptime/max_restarts in ecosystem.config.js stop a crash loop); in dev
  // we stay up so watch-mode keeps the feedback loop alive.
  if (process.env.NODE_ENV === 'production') process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  Logger.error(`Unhandled rejection: ${reason}`, undefined, 'Process');
});

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const isProd = process.env.NODE_ENV === 'production';
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: isProd ? ['error', 'warn', 'fatal'] : ['error', 'warn', 'log'],
  });

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PROG_PORT', 8282);

  await ensureUploadDirs();

  // Behind nginx: without this the throttler keys every request on the
  // proxy's IP, giving the whole site one shared rate-limit bucket.
  app.set('trust proxy', 1);

  app.enableCors({
    origin: '*',
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Accept', 'Authorization'],
    credentials: true,
  });

  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  const categoryService = app.get(CategoryService);
  await categoryService.seedCategories().catch((err) => {
    logger.warn(`seedCategories failed (non-fatal): ${err.message}`);
  });

  app.setGlobalPrefix('/engine');

  app.use(helmet({
    contentSecurityPolicy: isProd ? undefined : false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }));

  const uploadsPath = path.join(process.cwd(), 'uploads');

  app.useStaticAssets(uploadsPath, {
    prefix: '/engine/uploads/',
  });

  app.useGlobalFilters(new AllExceptionsFilter());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Route Socket.io broadcasts through Redis so events reach clients on any
  // pm2 instance. No-op without Redis (single-node dev keeps the default).
  if (redisEnabled()) {
    const redisIoAdapter = new RedisIoAdapter(app);
    redisIoAdapter.connectToRedis();
    app.useWebSocketAdapter(redisIoAdapter);
    logger.log('Socket.io Redis adapter enabled');
  }

  try {
    // Production sits behind nginx on the same host — bind loopback so the
    // engine can't be reached on :8282 directly (where a spoofed X-Real-IP
    // would bypass per-IP rate buckets). Dev binds all interfaces so the
    // Expo app can reach it over LAN.
    await app.listen(port, isProd ? '127.0.0.1' : '0.0.0.0');
    logger.log(`Running on port ${port} [${isProd ? 'production' : 'development'}]`);
  } catch (err) {
    logger.error(`Failed to start server: ${err.message}`);
    process.exit(1);
  }

  const shutdown = async (signal: string) => {
    logger.log(`${signal} received — shutting down`);
    await app.close();
    process.exit(0);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

bootstrap().catch(err => {
  Logger.error(`Bootstrap failed: ${err.message}`, err.stack, 'Bootstrap');
  process.exit(1);
});
