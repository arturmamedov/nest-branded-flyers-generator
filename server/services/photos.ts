import { randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import sharp, { type Metadata } from 'sharp';

export class PhotoError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export const MAX_PHOTO_BYTES = 15 * 1024 * 1024;
// 3× the widest frame: plenty for zoom, small enough for Chromium on a small VPS.
const MAX_EDGE = 3240;

/** iPhone photos: Chromium cannot draw HEIC, so say so plainly. */
function isHeic(buf: Buffer): boolean {
  if (buf.length < 12 || buf.toString('ascii', 4, 8) !== 'ftyp') return false;
  return ['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1'].includes(buf.toString('ascii', 8, 12));
}

/** Normalise an upload: EXIF rotation applied, downscaled, metadata (GPS) stripped. */
export async function processPhoto(
  buf: Buffer,
  dataRoot: string,
  now = new Date(),
): Promise<{ path: string; width: number; height: number }> {
  if (isHeic(buf)) {
    throw new PhotoError(415, 'heic', 'iPhone HEIC photos are not supported — export it as JPG (Settings › Camera › Formats › Most Compatible) and try again.');
  }
  let meta: Metadata;
  try {
    meta = await sharp(buf).metadata();
  } catch {
    throw new PhotoError(415, 'unsupported', 'That file is not an image we can read. Use a JPG, PNG or WebP.');
  }
  if (!meta.format || !['jpeg', 'png', 'webp'].includes(meta.format)) {
    throw new PhotoError(415, 'unsupported', `${meta.format?.toUpperCase() ?? 'This'} files are not supported. Use a JPG, PNG or WebP.`);
  }

  const dir = `uploads/${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}`;
  mkdirSync(join(dataRoot, ...dir.split('/')), { recursive: true });
  const ext = meta.hasAlpha ? 'png' : 'jpg';
  const rel = `${dir}/${randomBytes(8).toString('hex')}.${ext}`;

  let pipeline = sharp(buf).rotate().resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true });
  pipeline = meta.hasAlpha ? pipeline.png() : pipeline.jpeg({ quality: 88, mozjpeg: true });
  const info = await pipeline.toFile(join(dataRoot, ...rel.split('/')));
  return { path: rel, width: info.width, height: info.height };
}
