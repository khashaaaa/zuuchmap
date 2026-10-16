import { randomUUID } from 'node:crypto';
import { BadRequestException, Logger, ServiceUnavailableException } from '@nestjs/common';
import {
  DeleteObjectsCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import type { PhotoIntent, PhotoUploaded } from '@zuuchmap/core';
import { CONTENT_TYPE, processPhoto, thumbKey } from './photo-image';

export const PHOTO_STORAGE = Symbol('PHOTO_STORAGE');

/**
 * Where listing photos live. The engine stores only keys (`posts/<ownerId>/<uuid>.<ext>`, PHOTO_KEY_RE).
 * Real flow: the client posts the file to `POST /posts/photos` (multipart); `putImage` validates,
 * re-encodes and stores original + `_thumb`, and the returned keys go back on create/edit.
 * `createUploadIntent` is the presigned-PUT variant; R2Photostorage does not support it.
 */
export interface PhotoStorage {
  createUploadIntent(ownerId: string, contentType: string): Promise<PhotoIntent>;
  /** Validate, process and store one image for the owner; returns its keys. */
  putImage(ownerId: string, bytes: Buffer): Promise<PhotoUploaded>;
  /** Whether an object was actually uploaded under this key. */
  exists(key: string): Promise<boolean>;
  /** Best effort; a missing key is not an error. */
  delete(keys: string[]): Promise<void>;
}

const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

/** Default until the adapter exists: photos are simply unavailable (503), nothing else breaks. */
export class UnconfiguredPhotoStorage implements PhotoStorage {
  createUploadIntent(): Promise<PhotoIntent> {
    return Promise.reject(
      new ServiceUnavailableException({ message: 'Photo storage is not configured', code: 'PHOTO_STORAGE_UNAVAILABLE' }),
    );
  }
  putImage(): Promise<PhotoUploaded> {
    return this.createUploadIntent() as never;
  }
  exists(): Promise<boolean> {
    return Promise.resolve(false);
  }
  delete(): Promise<void> {
    return Promise.resolve();
  }
}

/** In-memory fake for tests: `upload(key)` plays the client's PUT. */
export class InMemoryPhotoStorage implements PhotoStorage {
  readonly objects = new Set<string>();
  readonly deleted: string[] = [];

  createUploadIntent(ownerId: string, contentType: string): Promise<PhotoIntent> {
    const ext = EXT[contentType];
    if (!ext) return Promise.reject(new Error('unsupported content type'));
    const key = `posts/${ownerId}/${randomUUID()}.${ext}`;
    return Promise.resolve({
      key,
      upload_url: `memory://${key}`,
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      expires_in: 600,
    });
  }

  upload(key: string): void {
    this.objects.add(key);
  }

  async putImage(ownerId: string, bytes: Buffer): Promise<PhotoUploaded> {
    const p = await processPhoto(bytes);
    const key = `posts/${ownerId}/${randomUUID()}.${p.ext}`;
    this.objects.add(key);
    this.objects.add(thumbKey(key));
    return { key, thumb_key: thumbKey(key), url: `memory://${key}`, thumb_url: `memory://${thumbKey(key)}` };
  }

  exists(key: string): Promise<boolean> {
    return Promise.resolve(this.objects.has(key));
  }

  delete(keys: string[]): Promise<void> {
    for (const k of keys) {
      this.objects.delete(k);
      this.deleted.push(k);
    }
    return Promise.resolve();
  }
}

export interface R2Config {
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  /** Public base URL (custom domain or r2.dev), no trailing slash. */
  publicUrl: string;
}

/** Minimal client surface so tests can inject a fake `send`. */
export interface S3Like {
  send(command: unknown): Promise<unknown>;
}

/** Cloudflare R2 (S3 API). Keys in the bucket are the keys in the database. */
export class R2PhotoStorage implements PhotoStorage {
  private readonly log = new Logger('R2PhotoStorage');
  private readonly client: S3Like;

  constructor(
    private readonly cfg: R2Config,
    client?: S3Like,
  ) {
    this.client =
      client ??
      new S3Client({
        region: 'auto',
        endpoint: cfg.endpoint,
        credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
      });
  }

  /** Public URL for a key (also for `thumbKey(key)`). */
  publicUrl(key: string): string {
    return `${this.cfg.publicUrl}/${key}`;
  }

  createUploadIntent(): Promise<PhotoIntent> {
    return Promise.reject(
      new BadRequestException({ message: 'Upload photos with POST /posts/photos', code: 'PHOTO_USE_DIRECT_UPLOAD' }),
    );
  }

  async putImage(ownerId: string, bytes: Buffer): Promise<PhotoUploaded> {
    const p = await processPhoto(bytes);
    const key = `posts/${ownerId}/${randomUUID()}.${p.ext}`;
    const tk = thumbKey(key);
    const put = (k: string, body: Buffer): Promise<unknown> =>
      this.client.send(
        new PutObjectCommand({
          Bucket: this.cfg.bucket,
          Key: k,
          Body: body,
          ContentType: CONTENT_TYPE[p.ext],
          CacheControl: 'public, max-age=31536000, immutable',
        }),
      );
    try {
      await Promise.all([put(key, p.original), put(tk, p.thumb)]);
    } catch (e) {
      await this.delete([key, tk]);
      this.log.error(`R2 put failed: ${(e as Error).message}`);
      throw new ServiceUnavailableException({ message: 'Photo storage failed', code: 'PHOTO_STORAGE_UNAVAILABLE' });
    }
    return { key, thumb_key: tk, url: this.publicUrl(key), thumb_url: this.publicUrl(tk) };
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.cfg.bucket, Key: key }));
      return true;
    } catch (e) {
      const err = e as { name?: string; $metadata?: { httpStatusCode?: number } };
      if (err.name === 'NotFound' || err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) return false;
      throw e;
    }
  }

  /** Removes each original and its thumb; best effort. */
  async delete(keys: string[]): Promise<void> {
    const all = [...new Set(keys.flatMap((k) => [k, thumbKey(k)]))];
    for (let i = 0; i < all.length; i += 1000) {
      try {
        await this.client.send(
          new DeleteObjectsCommand({
            Bucket: this.cfg.bucket,
            Delete: { Objects: all.slice(i, i + 1000).map((Key) => ({ Key })), Quiet: true },
          }),
        );
      } catch (e) {
        this.log.warn(`R2 delete failed: ${(e as Error).message}`);
      }
    }
  }
}
