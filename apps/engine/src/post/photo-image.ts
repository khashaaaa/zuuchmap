import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import sharp, { type Sharp } from 'sharp';

/** Largest upload accepted. */
export const MAX_PHOTO_BYTES = 15 * 1024 * 1024;
/** Decompression-bomb guard: sharp refuses to decode anything with more pixels than this (~50 MP). */
export const MAX_INPUT_PIXELS = 50_000_000;
export const ORIGINAL_MAX_WIDTH = 1920;
export const ORIGINAL_MAX_HEIGHT = 1080;
export const THUMB_WIDTH = 640;
export const THUMB_SUFFIX = '_thumb';

export type PhotoExt = 'jpg' | 'png' | 'webp';
export const CONTENT_TYPE: Record<PhotoExt, string> = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

export interface ProcessedPhoto {
  ext: PhotoExt;
  original: Buffer;
  thumb: Buffer;
}

function reject(code: string, message: string): never {
  throw new BadRequestException({ message, code });
}

/** Detects the real format from the first bytes; Content-Type and filename are never consulted. */
export function sniffImage(buf: Buffer): PhotoExt | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png';
  if (buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') return 'webp';
  return null;
}

/** `posts/<owner>/<uuid>.<ext>` -> `posts/<owner>/<uuid>_thumb.<ext>` (the thumb keeps the original's extension). */
export function thumbKey(key: string): string {
  return key.replace(/(\.[a-z0-9]+)$/i, `${THUMB_SUFFIX}$1`);
}

function encode(img: Sharp, ext: PhotoExt, quality: number): Sharp {
  if (ext === 'jpg') return img.jpeg({ quality, mozjpeg: true });
  if (ext === 'png') return img.png({ compressionLevel: 9 });
  return img.webp({ quality });
}

/**
 * Validates and re-encodes one upload: original fitted inside 1920x1080 (no enlargement, auto-oriented,
 * EXIF/GPS dropped because sharp keeps no metadata unless asked) plus a 640px-wide thumb, same format.
 */
export async function processPhoto(input: Buffer): Promise<ProcessedPhoto> {
  if (input.length === 0) reject('INVALID_PHOTO', 'Empty image file');
  if (input.length > MAX_PHOTO_BYTES) {
    throw new PayloadTooLargeException({ message: 'Photo is too large', code: 'PHOTO_TOO_LARGE' });
  }
  const ext = sniffImage(input);
  if (!ext) reject('INVALID_PHOTO', 'Only JPEG, PNG, or WebP images are allowed');
  // APNG would silently flatten to its first frame; refuse rather than surprise the owner.
  if (ext === 'png' && input.includes('acTL')) reject('INVALID_PHOTO', 'Animated images are not allowed');
  if (ext === 'webp' && input.includes('ANIM')) reject('INVALID_PHOTO', 'Animated images are not allowed');
  try {
    const open = (): Sharp => sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, animated: false, failOn: 'error' });
    const meta = await open().metadata();
    if ((meta.pages ?? 1) > 1) reject('INVALID_PHOTO', 'Animated images are not allowed');
    const expected = ext === 'jpg' ? 'jpeg' : ext;
    if (meta.format !== expected) reject('INVALID_PHOTO', 'Image content does not match its format');
    if (!meta.width || !meta.height) reject('INVALID_PHOTO', 'Unreadable image');
    const original = await encode(
      open().rotate().resize(ORIGINAL_MAX_WIDTH, ORIGINAL_MAX_HEIGHT, { fit: 'inside', withoutEnlargement: true }),
      ext,
      80,
    ).toBuffer();
    const thumb = await encode(open().rotate().resize({ width: THUMB_WIDTH, withoutEnlargement: true }), ext, 70).toBuffer();
    return { ext, original, thumb };
  } catch (e) {
    if (e instanceof BadRequestException) throw e;
    // Bomb guard and corrupt data both land here; neither is a server fault.
    reject('INVALID_PHOTO', 'Image could not be processed');
  }
}
