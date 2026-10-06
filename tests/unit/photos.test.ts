import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterAll, describe, expect, it } from 'vitest';
import { HttpError } from '../../server/errors.js';
import { preparePhoto, storePhoto, uploadedPhoto } from '../../server/services/photos.js';
import { apiError, type ApiErrorKey } from '../../src/shared/errors.js';
import { MAX_PHOTO_EDGE } from '../../src/shared/limits.js';
import { PHOTO_PATH } from '../../src/shared/storage.js';

/* The photo intake in two steps (docs/api-contract.md, "Photos"): preparing a picture (the checks, upright, shrunk,
   stripped, PNG with alpha else JPEG) and storing a prepared one. `POST api/photos` does both, and the AI's picture
   read prepares at its own edge and stores nothing in uploads/. What the route answers over HTTP is the contract
   suite's (tests/contract/photos.test.ts). */

const solid = (width: number, height: number, channels: 3 | 4 = 3) => sharp({ create: { width, height, channels, background: channels === 4 ? { r: 1, g: 2, b: 3, alpha: 0.5 } : '#88aacc' } });

async function refused(p: Promise<unknown> | (() => unknown), key: ApiErrorKey, vars?: Record<string, string | number>) {
  const e = await Promise.resolve()
    .then(() => (typeof p === 'function' ? p() : p))
    .then(() => null, (e: unknown) => e as HttpError);
  expect(e, `expected ${key}`).toBeInstanceOf(HttpError);
  expect(e!.message).toBe(apiError(key, vars).message);
}

describe('preparing a photo', () => {
  it('shrinks to the edge it is given, and to the photo’s own unless told', async () => {
    const big = await solid(4000, 2000).jpeg().toBuffer();
    expect(await preparePhoto(big, 2048)).toMatchObject({ width: 2048, height: 1024, ext: 'jpg', mediaType: 'image/jpeg' });
    expect(await preparePhoto(big)).toMatchObject({ width: MAX_PHOTO_EDGE, height: MAX_PHOTO_EDGE / 2 });
  });

  it('never enlarges: a tiny picture keeps its size', async () => {
    expect(await preparePhoto(await solid(12, 8).png().toBuffer(), 2048)).toMatchObject({ width: 12, height: 8 });
  });

  it('hands back the bytes it says: the size, the type, upright and without metadata', async () => {
    const turned = await solid(40, 20).jpeg().withMetadata({ orientation: 6, exif: { IFD0: { Copyright: 'someone' } } }).toBuffer();
    const photo = await preparePhoto(turned, 2048);
    expect([photo.width, photo.height]).toEqual([20, 40]);
    const meta = await sharp(photo.bytes).metadata();
    expect([meta.format, meta.width, meta.height, meta.orientation, meta.exif]).toEqual(['jpeg', 20, 40, undefined, undefined]);
  });

  it('is a PNG when the picture has an alpha channel, else a JPEG', async () => {
    const alpha = await preparePhoto(await solid(16, 16, 4).webp().toBuffer(), 2048);
    expect([alpha.ext, alpha.mediaType, (await sharp(alpha.bytes).metadata()).format]).toEqual(['png', 'image/png', 'png']);
    const opaque = await preparePhoto(await solid(16, 16).png().toBuffer(), 2048);
    expect([opaque.ext, opaque.mediaType, (await sharp(opaque.bytes).metadata()).format]).toEqual(['jpg', 'image/jpeg', 'jpeg']);
  });

  it('makes the photo route’s checks, with its messages', async () => {
    await refused(preparePhoto(Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypheic'), Buffer.alloc(64)]), 2048), 'heic');
    await refused(preparePhoto(Buffer.from('not an image'), 2048), 'unreadable');
    await refused(preparePhoto(await solid(8, 8).gif().toBuffer(), 2048), 'unsupported_format', { format: 'GIF' });
  });
});

describe('the uploaded file', () => {
  it('is its bytes, and no_photo_field when the field is missing', async () => {
    expect(uploadedPhoto({ buffer: Buffer.from('x') })).toEqual(Buffer.from('x'));
    await refused(() => uploadedPhoto(undefined), 'no_photo_field');
  });
});

describe('storing a prepared photo', () => {
  const dir = mkdtempSync(join(tmpdir(), 'nest-flyers-photos-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('writes those bytes under uploads/YYYY/MM and answers the path and the size', async () => {
    const photo = await preparePhoto(await solid(30, 20).jpeg().toBuffer());
    const stored = storePhoto(photo, join(dir, 'uploads'), new Date(2026, 9, 7));
    expect(stored).toMatchObject({ width: 30, height: 20 });
    expect(stored.path).toMatch(PHOTO_PATH);
    expect(stored.path).toMatch(/^uploads\/2026\/10\/[0-9a-f]{16}\.jpg$/);
    expect(readFileSync(join(dir, stored.path)).equals(photo.bytes)).toBe(true);
  });
});
