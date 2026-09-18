import { z } from 'zod';
import { FlyerRecordSchema, HostelSchema, TemplateSchema, TimestampSchema } from './schema.js';

/* The JSON-file store, one format for the PHP backend and the Node JSON driver
   (docs/json-storage.md). These zod schemas are the source of truth; gen-shared
   writes them to schema/storage.schema.json for PHP. */

export const STORAGE_FORMAT_VERSION = 1;

/** Applied, append-only data migrations for JSON stores (the SQLite ones live in server/db). None yet. */
export const JSON_MIGRATIONS: readonly string[] = [];

/** Photos are stored as `uploads/YYYY/MM/<16 hex>.jpg|png`, resolved against the uploads folder's parent. */
export const UPLOADS_DIR = 'uploads';
export const PHOTO_PATH = /^uploads\/\d{4}\/\d{2}\/[0-9a-f]{16}\.(jpg|png)$/;

/** File names inside the data folder. A flyer lives in `flyers/<id>.json`. */
export const STORAGE_FILES = {
  meta: 'meta.json',
  hostels: 'hostels.json',
  doodles: 'doodles.json',
  photos: 'photos.json',
  flyerIndex: 'flyers/index.json',
  flyerDir: 'flyers',
  lock: '.lock',
} as const;

const Id = z.number().int().positive();

export const StoredHostelSchema = HostelSchema;
export type StoredHostel = z.infer<typeof StoredHostelSchema>;

export const StoredDoodleSchema = z.strictObject({
  id: Id,
  slug: z.string(),
  label: z.string(),
  path: z.string(),
  kind: z.string(),
  builtin: z.boolean(),
});
export type StoredDoodle = z.infer<typeof StoredDoodleSchema>;

export const StoredPhotoSchema = z.strictObject({
  id: Id,
  path: z.string().regex(PHOTO_PATH),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  createdAt: TimestampSchema,
});
export type StoredPhoto = z.infer<typeof StoredPhotoSchema>;

/** A flyer with its soft-delete flag: `flyers/<id>.json`, and the copy tool's unit. */
export const StoredFlyerSchema = FlyerRecordSchema.extend({ archived: z.boolean() });
export type StoredFlyer = z.infer<typeof StoredFlyerSchema>;

/** One row of `flyers/index.json`: what the library lists without opening every flyer. No hostel name: it is joined at read time. */
export const FlyerIndexEntrySchema = z.strictObject({
  id: Id,
  title: z.string(),
  template: TemplateSchema,
  hostel: z.string().nullable(),
  updatedAt: TimestampSchema,
  archived: z.boolean(),
});
export type FlyerIndexEntry = z.infer<typeof FlyerIndexEntrySchema>;

const Counter = z.number().int().nonnegative();

export const MetaFileSchema = z.strictObject({
  formatVersion: z.number().int().positive(),
  migrations: z.array(z.string()),
  /** The highest id handed out per record type; the next is +1. */
  counters: z.strictObject({ hostel: Counter, doodle: Counter, photo: Counter, flyer: Counter }),
  /** sha256 of seed/hostels.json when it was last applied (PHP seeds inside a request). */
  seedHash: z.string().nullable(),
});
export type MetaFile = z.infer<typeof MetaFileSchema>;

export const HostelsFileSchema = z.array(StoredHostelSchema);
export const DoodlesFileSchema = z.array(StoredDoodleSchema);
export const PhotosFileSchema = z.array(StoredPhotoSchema);
export const FlyerIndexFileSchema = z.array(FlyerIndexEntrySchema);

export function emptyMeta(): MetaFile {
  return {
    formatVersion: STORAGE_FORMAT_VERSION,
    migrations: [...JSON_MIGRATIONS],
    counters: { hostel: 0, doodle: 0, photo: 0, flyer: 0 },
    seedHash: null,
  };
}
