import { randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import sharp, { type Metadata } from 'sharp';
import { ACCEPTED_PHOTO_TYPES, MAX_PHOTO_EDGE, PHOTO_JPEG_QUALITY, isHeic } from '../../src/shared/limits.js';
import { UPLOADS_DIR } from '../../src/shared/storage.js';
import { HttpError } from '../errors.js';

/** Normalise an upload: EXIF rotation applied, downscaled, metadata (GPS) stripped.
    Returns the stored path, `uploads/YYYY/MM/<16 hex>.jpg|png`, relative to the uploads folder's parent. */
export async function processPhoto(
  buf: Buffer,
  uploadsDir: string,
  now = new Date(),
): Promise<{ path: string; width: number; height: number }> {
  if (isHeic(buf)) throw new HttpError('heic');
  let meta: Metadata;
  try {
    meta = await sharp(buf).metadata();
  } catch {
    throw new HttpError('unreadable');
  }
  // sharp's format names are the MIME subtypes for the accepted three (not for every format: AVIF reads as 'heif').
  if (!meta.format || !(ACCEPTED_PHOTO_TYPES as readonly string[]).includes(`image/${meta.format}`)) {
    throw new HttpError('unsupported_format', { format: meta.format?.toUpperCase() ?? 'This' });
  }

  const month = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}`;
  mkdirSync(join(uploadsDir, ...month.split('/')), { recursive: true });
  const ext = meta.hasAlpha ? 'png' : 'jpg';
  const name = `${month}/${randomBytes(8).toString('hex')}.${ext}`;

  let pipeline = sharp(buf).rotate().resize({ width: MAX_PHOTO_EDGE, height: MAX_PHOTO_EDGE, fit: 'inside', withoutEnlargement: true });
  pipeline = meta.hasAlpha ? pipeline.png() : pipeline.jpeg({ quality: PHOTO_JPEG_QUALITY, mozjpeg: true });
  const info = await pipeline.toFile(join(uploadsDir, ...name.split('/')));
  return { path: `${UPLOADS_DIR}/${name}`, width: info.width, height: info.height };
}
