/**
 * One-off: generate the missing `_thumb` copy for every post image already in
 * R2.
 *
 * Thumbnails are written alongside the original from the upload onward, so only
 * photos uploaded before that need this. Until it has run, the clients fall
 * back to the full-size image for those posts — correct, just as heavy as it
 * ever was.
 *
 *   cd zuuchmap_engine && npx ts-node src/database/backfill-thumbs.ts [--dry]
 *
 * Safe to re-run and safe to interrupt: it skips any image whose thumbnail is
 * already there, so a second pass only picks up what the first one missed.
 * Sequential on purpose — this is a background chore competing with a live
 * server for the same Sharp and the same bandwidth, and there is nothing
 * waiting on it.
 */
import 'dotenv/config';
import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import sharp from 'sharp';
import { AppDataSource } from './data-source';
import { IMAGE_CONFIG, thumbUrl } from '../utils/uploader';

const BUCKET = process.env.R2_BUCKET ?? 'zuuchmap-images';
const dryRun = process.argv.includes('--dry');

const r2 = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID ?? '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? '',
  },
});

const keyOf = (url: string) =>
  url.startsWith('http') ? new URL(url).pathname.replace(/^\//, '') : url;

const exists = async (key: string): Promise<boolean> => {
  try {
    await r2.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
    return true;
  } catch {
    return false;
  }
};

const body = async (key: string): Promise<Buffer> => {
  const res = await r2.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
  const chunks: Buffer[] = [];
  for await (const chunk of res.Body as any) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
};

async function main() {
  await AppDataSource.initialize();

  // Pending revisions carry their own photos, and those are shown in the admin
  // queue the same way — they need thumbnails too.
  const rows: { images: string[]; revision: string[] | null }[] =
    await AppDataSource.query(
      `SELECT images, pending_revision->'images' AS revision FROM "post"
        WHERE jsonb_array_length(coalesce(images, '[]'::jsonb)) > 0`,
    );

  const urls = Array.from(
    new Set(
      rows.flatMap((r) => [...(r.images ?? []), ...(r.revision ?? [])]),
    ),
  );
  console.log(`${urls.length} distinct post image(s) to check`);

  let made = 0;
  let skipped = 0;
  let failed = 0;

  for (const [i, url] of urls.entries()) {
    const source = keyOf(url);
    const target = keyOf(thumbUrl(url));
    try {
      if (await exists(target)) {
        skipped++;
      } else if (dryRun) {
        made++;
      } else {
        const buf = await sharp(await body(source))
          .rotate()
          .resize(
            IMAGE_CONFIG.POST_THUMB.maxWidth,
            IMAGE_CONFIG.POST_THUMB.maxHeight,
            { fit: 'inside', withoutEnlargement: true },
          )
          .jpeg({ quality: IMAGE_CONFIG.POST_THUMB.quality, mozjpeg: true })
          .toBuffer();
        await r2.send(
          new PutObjectCommand({
            Bucket: BUCKET,
            Key: target,
            Body: buf,
            ContentType: 'image/jpeg',
            CacheControl: 'public, max-age=31536000',
          }),
        );
        made++;
      }
    } catch (err: any) {
      // A missing original is not worth stopping for — the post still renders,
      // it just keeps falling back to a URL that was already broken.
      failed++;
      console.warn(`  ${source}: ${err?.message}`);
    }
    if ((i + 1) % 100 === 0) console.log(`  ${i + 1}/${urls.length}`);
  }

  console.log(
    `${dryRun ? '[dry] ' : ''}created ${made}, already present ${skipped}, failed ${failed}`,
  );
  await AppDataSource.destroy();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
