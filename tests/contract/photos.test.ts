import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { formatMb } from '../../src/shared/errors.js';
import { PHOTO_PATH } from '../../src/shared/storage.js';
import { PhotoInfoSchema, type PhotoInfo } from '../../src/shared/schema.js';
import { config, fails, ok, send, upload, url } from './client.js';

/* The upload rules every backend applies (docs/api-contract.md, "Photos"):
   sniffed from the bytes, EXIF rotation applied, long edge ≤ 3240, metadata
   stripped, JPEG unless the image has an alpha channel. Pixels and bytes
   differ between sharp and GD, so only sizes, formats and rules are checked. */

const stored = (res: Promise<Response>) => ok(res, PhotoInfoSchema, 201);

/** Fetches the stored file the way the browser will: relative to the app root. */
async function served(photo: PhotoInfo) {
  expect(photo.url).toMatch(PHOTO_PATH);
  const res = await fetch(url(photo.url));
  expect(res.status).toBe(200);
  const meta = await sharp(Buffer.from(await res.arrayBuffer())).metadata();
  expect([meta.width, meta.height]).toEqual([photo.width, photo.height]);
  return meta;
}

/** A 4-quadrant marker (red, green / blue, white) so orientation is visible in the pixels. */
async function marker(width: number, height: number) {
  const q = (color: string) => sharp({ create: { width: width / 2, height: height / 2, channels: 3, background: color } }).png().toBuffer();
  return sharp({ create: { width, height, channels: 3, background: '#000' } })
    .composite([
      { input: await q('#ff0000'), left: 0, top: 0 },
      { input: await q('#00ff00'), left: width / 2, top: 0 },
      { input: await q('#0000ff'), left: 0, top: height / 2 },
      { input: await q('#ffffff'), left: width / 2, top: height / 2 },
    ])
    .png()
    .toBuffer();
}

describe('photos', () => {
  it('downscales to a 3240 long edge and stores a JPEG without metadata', async () => {
    const big = await sharp({ create: { width: 4000, height: 2000, channels: 3, background: '#88aacc' } })
      .withMetadata({ exif: { IFD0: { Copyright: 'someone' } } })
      .jpeg()
      .toBuffer();
    const photo = await stored(upload(big, 'big.jpg'));
    expect([photo.width, photo.height]).toEqual([3240, 1620]);
    expect(photo.url).toMatch(/\.jpg$/);
    const meta = await served(photo);
    expect(meta.format).toBe('jpeg');
    expect(meta.exif).toBeUndefined();
  });

  it('never enlarges', async () => {
    const small = await sharp({ create: { width: 800, height: 600, channels: 3, background: '#123456' } }).jpeg().toBuffer();
    expect(await stored(upload(small))).toMatchObject({ width: 800, height: 600 });
  });

  it('applies the EXIF orientation', async () => {
    const turned = await sharp(await marker(40, 20)).jpeg({ quality: 95 }).withMetadata({ orientation: 6 }).toBuffer();
    const photo = await stored(upload(turned, 'turned.jpg'));
    expect([photo.width, photo.height]).toEqual([20, 40]);
    const res = await fetch(url(photo.url));
    const { data } = await sharp(Buffer.from(await res.arrayBuffer())).raw().toBuffer({ resolveWithObject: true });
    // Orientation 6 turns the image 90° clockwise: the red top-left quadrant ends up top-right.
    const at = (x: number, y: number) => [...data.subarray((y * 20 + x) * 3, (y * 20 + x) * 3 + 3)];
    const red = at(15, 5);
    expect(red[0]).toBeGreaterThan(200);
    expect(red[1]).toBeLessThan(60);
    expect(red[2]).toBeLessThan(60);
    expect((await served(photo)).orientation ?? 1).toBe(1);
  });

  it('keeps PNG for images with an alpha channel, JPEG otherwise', async () => {
    const rgba = { width: 64, height: 32, channels: 4 as const };
    const cases: [string, Promise<Buffer>, 'png' | 'jpg'][] = [
      ['transparent PNG', sharp({ create: { ...rgba, background: { r: 10, g: 20, b: 30, alpha: 0.5 } } }).png().toBuffer(), 'png'],
      ['opaque RGB PNG', sharp({ create: { width: 64, height: 32, channels: 3, background: '#abcdef' } }).png().toBuffer(), 'jpg'],
      ['lossy WebP', sharp({ create: { width: 64, height: 32, channels: 3, background: '#abcdef' } }).webp().toBuffer(), 'jpg'],
      ['WebP with alpha', sharp({ create: { ...rgba, background: { r: 10, g: 20, b: 30, alpha: 0.5 } } }).webp({ lossless: true }).toBuffer(), 'png'],
    ];
    for (const [label, bytes, ext] of cases) {
      const photo = await stored(upload(await bytes, `${label}.bin`));
      expect(photo.url, label).toMatch(new RegExp(`\\.${ext}$`));
      expect((await served(photo)).format, label).toBe(ext === 'png' ? 'png' : 'jpeg');
    }
  });

  it('refuses iPhone HEIC photos with the friendly message', async () => {
    const heic = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypheic'), Buffer.alloc(64)]);
    await fails(upload(heic, 'IMG_0001.HEIC'), 'heic');
  });

  it('names other image formats it cannot keep, and says when a file is not an image', async () => {
    const gif = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#f00' } }).gif().toBuffer();
    await fails(upload(gif, 'x.gif'), 'unsupported_format', { format: 'GIF' });
    await fails(upload(Buffer.from('definitely not an image, just some text in a file'), 'x.jpg'), 'unreadable');
  });

  it('needs the file in the "photo" field', async () => {
    await fails(send('POST', 'api/photos', new FormData()), 'no_photo_field');
  });

  it('refuses a file over the limit /api/config reports', async () => {
    const { limits } = await config();
    await fails(upload(Buffer.alloc(limits.maxUploadBytes + 1, 1), 'huge.jpg'), 'too_large', { mb: formatMb(limits.maxUploadBytes) });
  });
});
