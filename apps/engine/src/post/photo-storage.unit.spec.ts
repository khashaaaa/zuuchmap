import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import sharp from 'sharp';
import { MAX_PHOTO_BYTES, processPhoto, thumbKey } from './photo-image';
import { InMemoryPhotoStorage, R2PhotoStorage, type S3Like } from './photo-storage';
import { PHOTO_KEY_RE } from './dto/post.dto';

const OWNER = '11111111-2222-4333-8444-555555555555';
const CFG = { endpoint: 'https://x.r2.cloudflarestorage.com', accessKeyId: 'a', secretAccessKey: 'b', bucket: 'bk', publicUrl: 'https://cdn.test' };

const solid = (w: number, h: number, fmt: 'jpeg' | 'png' | 'webp' = 'jpeg'): Promise<Buffer> =>
  sharp({ create: { width: w, height: h, channels: 3, background: { r: 200, g: 80, b: 20 } } })
    .toFormat(fmt)
    .toBuffer();

class FakeS3 implements S3Like {
  readonly sent: Array<{ name: string; input: Record<string, unknown> }> = [];
  fail = false;
  send(cmd: unknown): Promise<unknown> {
    const c = cmd as { constructor: { name: string }; input: Record<string, unknown> };
    this.sent.push({ name: c.constructor.name, input: c.input });
    if (this.fail && c instanceof PutObjectCommand) return Promise.reject(new Error('boom'));
    return Promise.resolve({});
  }
}

describe('processPhoto', () => {
  it('rejects a renamed text file by magic bytes', async () => {
    await expect(processPhoto(Buffer.from('this is definitely not an image, just text'))).rejects.toBeInstanceOf(BadRequestException);
  });

  it('downscales oversize to fit 1920x1080 and makes a 640px thumb', async () => {
    const p = await processPhoto(await solid(4000, 3000));
    const m = await sharp(p.original).metadata();
    expect(m.width).toBeLessThanOrEqual(1920);
    expect(m.height).toBeLessThanOrEqual(1080);
    expect(m.format).toBe('jpeg');
    expect((await sharp(p.thumb).metadata()).width).toBe(640);
  });

  it('does not enlarge small images', async () => {
    const p = await processPhoto(await solid(300, 200, 'png'));
    expect(p.ext).toBe('png');
    const m = await sharp(p.original).metadata();
    expect([m.width, m.height]).toEqual([300, 200]);
    expect((await sharp(p.thumb).metadata()).width).toBe(300);
  });

  it('strips EXIF/GPS and auto-orients', async () => {
    const src = await sharp({ create: { width: 200, height: 100, channels: 3, background: '#fff' } })
      .jpeg()
      .withMetadata({ orientation: 6, exif: { IFD0: { Copyright: 'secret' } } })
      .toBuffer();
    expect((await sharp(src).metadata()).exif).toBeDefined();
    const p = await processPhoto(src);
    const m = await sharp(p.original).metadata();
    expect(m.exif).toBeUndefined();
    expect([m.width, m.height]).toEqual([100, 200]); // orientation 6 applied
    expect((await sharp(p.thumb).metadata()).exif).toBeUndefined();
  });

  it('guards against decompression bombs', async () => {
    const bomb = await sharp({ create: { width: 9000, height: 9000, channels: 3, background: '#000' } }).png({ compressionLevel: 9 }).toBuffer();
    expect(bomb.length).toBeLessThan(MAX_PHOTO_BYTES);
    await expect(processPhoto(bomb)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects animated webp and oversized files', async () => {
    const frame = (c: string): Promise<Buffer> =>
      sharp({ create: { width: 20, height: 20, channels: 3, background: c } }).raw().toBuffer();
    const frames = await sharp(Buffer.concat([await frame('#f00'), await frame('#00f')]), {
      raw: { width: 20, height: 40, channels: 3, pageHeight: 20 },
    })
      .toFormat('webp', {})
      .toBuffer();
    expect(frames.includes('ANIM')).toBe(true);
    await expect(processPhoto(frames)).rejects.toBeInstanceOf(BadRequestException);
    await expect(processPhoto(Buffer.alloc(MAX_PHOTO_BYTES + 1, 0xff))).rejects.toBeInstanceOf(PayloadTooLargeException);
  });
});

describe('R2PhotoStorage', () => {
  it('stores original + thumb under a PHOTO_KEY_RE key and builds public urls', async () => {
    const s3 = new FakeS3();
    const r2 = new R2PhotoStorage(CFG, s3);
    const out = await r2.putImage(OWNER, await solid(2000, 1200));
    expect(out.key).toMatch(PHOTO_KEY_RE);
    expect(out.key.startsWith(`posts/${OWNER}/`)).toBe(true);
    expect(out.thumb_key).toBe(thumbKey(out.key));
    expect(out.url).toBe(`https://cdn.test/${out.key}`);
    const puts = s3.sent.filter((c) => c.name === 'PutObjectCommand');
    expect(puts.map((p) => p.input.Key).sort()).toEqual([out.key, out.thumb_key].sort());
    expect(puts[0].input.ContentType).toBe('image/jpeg');
  });

  it('does not store a rejected file', async () => {
    const s3 = new FakeS3();
    await expect(new R2PhotoStorage(CFG, s3).putImage(OWNER, Buffer.from('not an image at all, plain text'))).rejects.toBeInstanceOf(BadRequestException);
    expect(s3.sent).toHaveLength(0);
  });

  it('cleans up and answers 503 when R2 fails', async () => {
    const s3 = new FakeS3();
    s3.fail = true;
    await expect(new R2PhotoStorage(CFG, s3).putImage(OWNER, await solid(100, 100))).rejects.toMatchObject({ status: 503 });
    expect(s3.sent.some((c) => c.name === 'DeleteObjectsCommand')).toBe(true);
  });

  it('delete removes original and thumb', async () => {
    const s3 = new FakeS3();
    await new R2PhotoStorage(CFG, s3).delete(['posts/o/a.jpg']);
    const del = s3.sent.find((c) => c.name === 'DeleteObjectsCommand');
    expect((del?.input.Delete as { Objects: Array<{ Key: string }> }).Objects.map((o) => o.Key)).toEqual(['posts/o/a.jpg', 'posts/o/a_thumb.jpg']);
  });
});

describe('InMemoryPhotoStorage.putImage', () => {
  it('registers both keys', async () => {
    const m = new InMemoryPhotoStorage();
    const out = await m.putImage(OWNER, await solid(50, 50, 'webp'));
    expect(out.key.endsWith('.webp')).toBe(true);
    expect(await m.exists(out.thumb_key)).toBe(true);
  });
});
