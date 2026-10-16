import '../src/config/load-env';
import { randomInt, randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getDataSourceToken, TypeOrmModule } from '@nestjs/typeorm';
import sharp from 'sharp';
import request from 'supertest';
import type { DataSource } from 'typeorm';
import type { PhotoUploadResponse } from '@zuuchmap/core';
import { AUTH_CONFIG, authConfigFromEnv, type AuthConfig } from '../src/auth/auth.config';
import { AuthModule } from '../src/auth/auth.module';
import { openSession } from '../src/auth/request-user';
import { CategoryModule } from '../src/category/category.module';
import { CategoryService } from '../src/category/category.service';
import { AllExceptionsFilter } from '../src/common/all-exceptions.filter';
import { dataSourceOptions } from '../src/database/data-source';
import { InMemoryPhotoStorage, PHOTO_STORAGE } from '../src/post/photo-storage';
import { PostModule } from '../src/post/post.module';
import { RedisModule } from '../src/redis/redis.module';
import { UserModule } from '../src/user/user.module';

const CAT = 'photo_upload_cat';
const phones: string[] = [];
let app: INestApplication;
let ds: DataSource;
let cfg: AuthConfig;
let storage: InMemoryPhotoStorage;
const http = (): ReturnType<typeof request> => request(app.getHttpServer() as Server);

async function account(): Promise<{ id: string; auth: { Authorization: string } }> {
  const phone = `7${String(randomInt(1_000_000, 10_000_000))}`;
  phones.push(phone);
  const rows = await ds.query<Array<{ id: string }>>(
    'INSERT INTO users (phone_number, is_verified, plan) VALUES ($1, true, $2) RETURNING id',
    [phone, 'FREE'],
  );
  const id = rows[0].id;
  return { id, auth: { Authorization: `Bearer ${await openSession(ds, id, cfg)}` } };
}

const jpeg = (w: number, h: number): Promise<Buffer> =>
  sharp({ create: { width: w, height: h, channels: 3, background: '#336699' } }).jpeg().toBuffer();

beforeAll(async () => {
  cfg = { ...authConfigFromEnv(), devMode: true, adminPhones: [] };
  storage = new InMemoryPhotoStorage();
  const mod = await Test.createTestingModule({
    imports: [TypeOrmModule.forRoot({ ...dataSourceOptions(), autoLoadEntities: true }), RedisModule, AuthModule, UserModule, CategoryModule, PostModule],
  })
    .overrideProvider(AUTH_CONFIG)
    .useValue(cfg)
    .overrideProvider(PHOTO_STORAGE)
    .useValue(storage)
    .compile();
  app = mod.createNestApplication();
  app.setGlobalPrefix('api');
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.init();
  ds = app.get<DataSource>(getDataSourceToken());
  await app.get(CategoryService).upsert(CAT, {
    family: 'EQUIPMENT_VEHICLES',
    label: 'Тест',
    labels: { mn: 'Тест', en: 'Test', zh: 'Test', ru: 'Тест' },
    fields: [],
  });
});

afterAll(async () => {
  await ds.query('DELETE FROM posts WHERE category = $1', [CAT]);
  await ds.query('DELETE FROM users WHERE phone_number = ANY($1)', [phones]);
  await ds.query('DELETE FROM category_schema WHERE key = $1', [CAT]);
  await app.close();
});

describe('POST /api/posts/photos', () => {
  it('requires a JWT', async () => {
    await http().post('/api/posts/photos').attach('files', await jpeg(10, 10), 'a.jpg').expect(401);
  });

  it('stores processed photos and the keys attach to a listing', async () => {
    const u = await account();
    const res = await http()
      .post('/api/posts/photos')
      .set(u.auth)
      .attach('files', await jpeg(3000, 2000), 'a.jpg')
      .attach('files', await jpeg(100, 100), 'b.jpg')
      .expect(201);
    const { photos } = res.body as PhotoUploadResponse;
    expect(photos).toHaveLength(2);
    for (const p of photos) {
      expect(p.key.startsWith(`posts/${u.id}/`)).toBe(true);
      expect(await storage.exists(p.key)).toBe(true);
      expect(await storage.exists(p.thumb_key)).toBe(true);
    }
    const created = await http()
      .post('/api/posts')
      .set(u.auth)
      .send({ category: CAT, title: `Photo test ${randomUUID().slice(0, 6)}`, images: photos.map((p) => p.key) })
      .expect(201);
    expect((created.body as { images: string[] }).images).toEqual(photos.map((p) => p.key));
  });

  it('rejects a renamed text file, no files, and too many files', async () => {
    const u = await account();
    const bad = await http().post('/api/posts/photos').set(u.auth).attach('files', Buffer.from('hello, I am not an image at all'), 'x.jpg').expect(400);
    expect((bad.body as { code: string }).code).toBe('INVALID_PHOTO');
    await http().post('/api/posts/photos').set(u.auth).expect(400);
    let req = http().post('/api/posts/photos').set(u.auth);
    const one = await jpeg(10, 10);
    for (let i = 0; i < 11; i++) req = req.attach('files', one, `p${String(i)}.jpg`);
    await req.expect(400);
  });

  it('another user cannot attach my key', async () => {
    const me = await account();
    const other = await account();
    const up = await http().post('/api/posts/photos').set(me.auth).attach('files', await jpeg(50, 50), 'a.jpg').expect(201);
    const key = (up.body as PhotoUploadResponse).photos[0].key;
    await http().post('/api/posts').set(other.auth).send({ category: CAT, title: 'Steal', images: [key] }).expect(400);
  });
});
