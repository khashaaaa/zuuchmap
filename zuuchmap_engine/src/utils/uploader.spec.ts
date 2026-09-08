import { HttpException, HttpStatus } from '@nestjs/common';
import { validateImageBytes, imageFileFilter, IMAGE_CONFIG } from './uploader';

/**
 * Upload validation.
 *
 * Two gates, and they are not redundant. `imageFileFilter` reads the
 * client-supplied Content-Type — free, but a header any caller can set to
 * anything. `validateImageBytes` reads the bytes themselves, which is the one
 * that actually decides what reaches Sharp and then public R2 storage.
 *
 * Untested until now, which is a poor place for a security boundary to sit.
 */

const jpeg = (extra: number[] = []) => Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0, ...extra]);
const png = () => Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const webp = () => Buffer.from([
  0x52, 0x49, 0x46, 0x46, // "RIFF"
  0x00, 0x00, 0x00, 0x00, // size
  0x57, 0x45, 0x42, 0x50, // "WEBP"
]);

const rejects = (buffer: Buffer) => {
  try {
    validateImageBytes(buffer);
    return null;
  } catch (err) {
    return err as HttpException;
  }
};

describe('validateImageBytes', () => {
  it('accepts the three formats the product supports', () => {
    expect(() => validateImageBytes(jpeg())).not.toThrow();
    expect(() => validateImageBytes(png())).not.toThrow();
    expect(() => validateImageBytes(webp())).not.toThrow();
  });

  it('rejects a payload whose Content-Type lies about what it is', () => {
    // The whole reason this function exists: multer already let this through
    // on the strength of a `image/jpeg` header the uploader chose themselves.
    const phpWebshell = Buffer.from('<?php system($_GET["c"]); ?>          ');
    const err = rejects(phpWebshell);
    expect(err).toBeInstanceOf(HttpException);
    expect(err!.getStatus()).toBe(HttpStatus.BAD_REQUEST);
  });

  it('rejects an SVG, which is markup a browser will execute', () => {
    expect(rejects(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg">'))).toBeInstanceOf(HttpException);
  });

  it('rejects a GIF — a real image, but not one of the three', () => {
    expect(rejects(Buffer.from('GIF89a...............'))).toBeInstanceOf(HttpException);
  });

  it('rejects an empty or truncated buffer rather than indexing past its end', () => {
    // Reading buffer[11] on a 4-byte buffer yields undefined, not a throw, so
    // without the length guard a 4-byte file would fall through to the format
    // comparison and be judged on garbage.
    expect(rejects(Buffer.alloc(0))).toBeInstanceOf(HttpException);
    expect(rejects(Buffer.from([0xff, 0xd8, 0xff]))).toBeInstanceOf(HttpException);
    expect(rejects(undefined as any)).toBeInstanceOf(HttpException);
  });

  it('does not accept a RIFF container that is not WebP', () => {
    // "RIFF" alone is also a WAV and an AVI. The format tag at byte 8 is what
    // separates them, so a check that stopped at byte 3 would accept audio.
    const wav = Buffer.from([
      0x52, 0x49, 0x46, 0x46,
      0x00, 0x00, 0x00, 0x00,
      0x57, 0x41, 0x56, 0x45, // "WAVE"
    ]);
    expect(rejects(wav)).toBeInstanceOf(HttpException);
  });
});

describe('imageFileFilter', () => {
  const run = (mimetype: string) => {
    const cb = jest.fn();
    imageFileFilter({}, { mimetype } as Express.Multer.File, cb);
    return cb.mock.calls[0];
  };

  it.each(['image/jpeg', 'image/jpg', 'image/png', 'image/webp'])('admits %s', (mime) => {
    expect(run(mime)).toEqual([null, true]);
  });

  it.each(['image/gif', 'image/svg+xml', 'application/pdf', 'text/html'])('turns away %s', (mime) => {
    const [err, accepted] = run(mime);
    expect(accepted).toBe(false);
    expect(err).toBeInstanceOf(HttpException);
  });
});

describe('IMAGE_CONFIG', () => {
  it('caps every upload class at a finite size and dimension', () => {
    // An absent cap here is an unbounded write to paid storage.
    for (const [name, cfg] of Object.entries(IMAGE_CONFIG)) {
      expect(cfg.maxSize).toBeGreaterThan(0);
      expect(cfg.maxWidth).toBeGreaterThan(0);
      expect(cfg.maxHeight).toBeGreaterThan(0);
      expect(cfg.quality).toBeGreaterThan(0);
      expect(cfg.quality).toBeLessThanOrEqual(100);
      expect(cfg.prefix).toMatch(/^[a-z]+$/);
      expect(name).toBeTruthy();
    }
  });
});
