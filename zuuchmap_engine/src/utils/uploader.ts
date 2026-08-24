import * as crypto from 'crypto';
import { memoryStorage } from 'multer';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import * as sharp from 'sharp';
import { HttpException, HttpStatus, Logger } from '@nestjs/common';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

const logger = new Logger('Uploader');

// R2 client — lazy-initialised so missing env vars only fail at call time, not import time
let _r2: S3Client | null = null;
function getR2(): S3Client {
  if (!_r2) {
    _r2 = new S3Client({
      region: 'auto',
      endpoint: process.env.R2_ENDPOINT,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
      },
    });
  }
  return _r2;
}

const BUCKET = () => process.env.R2_BUCKET ?? 'zuuchmap-images';
const PUBLIC_URL = () => (process.env.R2_PUBLIC_URL ?? '').replace(/\/$/, '');

export const IMAGE_CONFIG = {
  PROFILE: { prefix: 'profilepicture', maxSize: 5 * 1024 * 1024, quality: 80, maxWidth: 800, maxHeight: 800 },
  COMPANY_LOGO: { prefix: 'companylogo', maxSize: 10 * 1024 * 1024, quality: 85, maxWidth: 1000, maxHeight: 1000 },
  // Post uploads all resolve to the default 'posts' branch in processAfterSave;
  // the per-category entries died with the pre-R2 per-category upload dirs.
} as const;

// Magic-byte MIME validation — checks actual file bytes, not the client-supplied Content-Type
function validateImageBytes(buffer: Buffer): void {
  if (!buffer || buffer.length < 12) {
    throw new HttpException('Invalid or empty image file', HttpStatus.BAD_REQUEST);
  }
  const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const isPng  = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
  const isWebp = buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46
              && buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50;
  if (!isJpeg && !isPng && !isWebp) {
    throw new HttpException('Only JPEG, PNG, or WebP images are allowed', HttpStatus.BAD_REQUEST);
  }
}

// Multer filter — Content-Type pre-check (fast, before buffer is read)
export const imageFileFilter = (_req: any, file: Express.Multer.File, cb: Function) => {
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
  if (allowed.includes(file.mimetype)) cb(null, true);
  else cb(new HttpException('Only JPEG, PNG, or WebP images are allowed', HttpStatus.BAD_REQUEST), false);
};

// Compress a buffer in-memory and return a JPEG buffer
async function compressToBuffer(
  input: Buffer,
  opts: { quality: number; maxWidth: number; maxHeight: number }
): Promise<Buffer> {
  try {
    return await sharp(input)
      .rotate()
      .resize(opts.maxWidth, opts.maxHeight, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: opts.quality, mozjpeg: true })
      .toBuffer();
  } catch (err: any) {
    throw new HttpException(`Image compression failed: ${err.message}`, HttpStatus.INTERNAL_SERVER_ERROR);
  }
}

// Upload a buffer to R2, return the public URL
async function uploadToR2(buffer: Buffer, key: string): Promise<string> {
  await getR2().send(new PutObjectCommand({
    Bucket: BUCKET(),
    Key: key,
    Body: buffer,
    ContentType: 'image/jpeg',
    CacheControl: 'public, max-age=31536000',
  }));
  return `${PUBLIC_URL()}/${key}`;
}

// Delete an object from R2 by its key (extracted from full URL or bare key)
async function deleteFromR2(keyOrUrl: string): Promise<void> {
  if (!keyOrUrl) return;
  const key = keyOrUrl.startsWith('http') ? new URL(keyOrUrl).pathname.replace(/^\//, '') : keyOrUrl;
  await getR2().send(new DeleteObjectCommand({ Bucket: BUCKET(), Key: key })).catch((e) => {
    logger.warn(`Failed to delete R2 object ${key}: ${e.message}`);
  });
}

function makeKey(prefix: string): string {
  return `${prefix}/${crypto.randomUUID()}.jpg`;
}

// ─── Public API (same signatures as before, callers unchanged) ──────────────

export const createProfilePictureInterceptor = () =>
  FileInterceptor('profile_picture', {
    storage: memoryStorage(),
    fileFilter: imageFileFilter,
    limits: { fileSize: IMAGE_CONFIG.PROFILE.maxSize },
  });

export const createCompanyLogoInterceptor = () =>
  FileInterceptor('logo', {
    storage: memoryStorage(),
    fileFilter: imageFileFilter,
    limits: { fileSize: IMAGE_CONFIG.COMPANY_LOGO.maxSize },
  });

export const createPostImageUploadInterceptor = (maxCount = 10) =>
  FilesInterceptor('images', maxCount, {
    storage: memoryStorage(),
    fileFilter: imageFileFilter,
    limits: { fileSize: 15 * 1024 * 1024 },
  });

export class ImageUploadHandler {
  static async handleSingleUpload(
    file: Express.Multer.File,
    imageType: keyof typeof IMAGE_CONFIG,
  ): Promise<string | null> {
    if (!file?.buffer) return null;
    const config = IMAGE_CONFIG[imageType];

    validateImageBytes(file.buffer);
    const compressed = await compressToBuffer(file.buffer, config);
    return uploadToR2(compressed, makeKey(config.prefix));
  }

  static async processAfterSave(files: Express.Multer.File[]): Promise<string[]> {
    if (!files || files.length === 0) return [];

    const config = { prefix: 'posts', quality: 75, maxWidth: 1920, maxHeight: 1080 };

    const urls: string[] = [];
    for (const file of files) {
      if (!file?.buffer) continue;
      validateImageBytes(file.buffer);
      const compressed = await compressToBuffer(file.buffer, config);
      const url = await uploadToR2(compressed, makeKey(config.prefix));
      urls.push(url);
    }
    return urls;
  }
}

// These are called when posts/profiles are deleted — now delete from R2
export const deleteSingleImage = async (keyOrUrl: string) => deleteFromR2(keyOrUrl);

export const deleteMultipleImages = async (items: string[]) => {
  await Promise.allSettled(items.map(deleteFromR2));
};

