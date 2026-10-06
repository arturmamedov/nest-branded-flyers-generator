import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import multer from 'multer';
import sharp, { type Metadata } from 'sharp';
import { ACCEPTED_PHOTO_TYPES, MAX_PHOTO_EDGE, MAX_UPLOAD_BYTES, PHOTO_JPEG_QUALITY, isHeic } from '../../src/shared/limits.js';
import { UPLOADS_DIR } from '../../src/shared/storage.js';
import { HttpError } from '../errors.js';

/* The photo intake, written once for both routes that take a picture (docs/api-contract.md, "Photos"): the upload,
   its checks, and the preparing. `POST api/photos` then stores the prepared picture in uploads/; the AI's picture
   read (`POST api/ai/photo`) prepares at its own edge and never writes there. PHP's Photos\PhotoIntake is the twin. */

/** The multipart field both routes read the picture from. */
export const PHOTO_FIELD = 'photo';

/** The upload, in memory, one file up to the limit: a larger one is multer's LIMIT_FILE_SIZE (too_large). */
export const photoUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } }).single(PHOTO_FIELD);

/** The uploaded picture's bytes, once `photoUpload` has run. */
export function uploadedPhoto(file: { buffer: Buffer } | undefined): Buffer {
  if (!file) throw new HttpError('no_photo_field');
  return file.buffer;
}

/** A picture ready to keep or to send: upright, shrunk, stripped, and encoded. */
export interface PreparedPhoto {
  bytes: Buffer;
  ext: 'jpg' | 'png';
  mediaType: 'image/jpeg' | 'image/png';
  width: number;
  height: number;
}

/** Normalise an upload: the checks, then EXIF rotation applied, downscaled to `maxEdge` on its long edge (never
    enlarged), metadata (GPS) stripped, PNG when it has an alpha channel, else JPEG. */
export async function preparePhoto(buf: Buffer, maxEdge = MAX_PHOTO_EDGE): Promise<PreparedPhoto> {
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

  let pipeline = sharp(buf).rotate().resize({ width: maxEdge, height: maxEdge, fit: 'inside', withoutEnlargement: true });
  pipeline = meta.hasAlpha ? pipeline.png() : pipeline.jpeg({ quality: PHOTO_JPEG_QUALITY, mozjpeg: true });
  const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });
  return meta.hasAlpha
    ? { bytes: data, ext: 'png', mediaType: 'image/png', width: info.width, height: info.height }
    : { bytes: data, ext: 'jpg', mediaType: 'image/jpeg', width: info.width, height: info.height };
}

/** Write a prepared photo into the uploads folder. Returns the stored path, `uploads/YYYY/MM/<16 hex>.jpg|png`,
    relative to the uploads folder's parent. */
export function storePhoto(photo: PreparedPhoto, uploadsDir: string, now = new Date()): { path: string; width: number; height: number } {
  const month = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}`;
  mkdirSync(join(uploadsDir, ...month.split('/')), { recursive: true });
  const name = `${month}/${randomBytes(8).toString('hex')}.${photo.ext}`;
  writeFileSync(join(uploadsDir, ...name.split('/')), photo.bytes);
  return { path: `${UPLOADS_DIR}/${name}`, width: photo.width, height: photo.height };
}

/** An upload, prepared and stored: what `POST api/photos` and the sample seeder do. */
export async function processPhoto(buf: Buffer, uploadsDir: string, now = new Date()): Promise<{ path: string; width: number; height: number }> {
  return storePhoto(await preparePhoto(buf), uploadsDir, now);
}
