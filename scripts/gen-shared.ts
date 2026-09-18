import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import { API_ERRORS } from '../src/shared/errors.js';
import {
  ACCEPTED_PHOTO_TYPES,
  EXPORT_JPEG_QUALITY,
  HEIC,
  MAX_PHOTO_EDGE,
  MAX_UPLOAD_BYTES,
  PHOTO_JPEG_QUALITY,
} from '../src/shared/limits.js';
import { SAMPLE_FLYERS } from '../src/shared/samples.js';
import { FlyerInputSchema } from '../src/shared/schema.js';
import { SeedFileSchema } from '../src/shared/seed.js';
import {
  DoodlesFileSchema,
  FlyerIndexFileSchema,
  HostelsFileSchema,
  JSON_MIGRATIONS,
  MetaFileSchema,
  PHOTO_PATH,
  PhotosFileSchema,
  STORAGE_FILES,
  STORAGE_FORMAT_VERSION,
  StoredFlyerSchema,
  UPLOADS_DIR,
} from '../src/shared/storage.js';

/* Derived copies of the shared sources of truth, for PHP and the docs. Run
   `npm run gen` after changing src/shared; tests/unit/generated.test.ts fails
   while a committed copy is stale. */

export const ROOT = join(import.meta.dirname, '..');
export const CONTRACT_DOC = 'docs/api-contract.md';
const TABLE_START = '<!-- gen:errors:start -->';
const TABLE_END = '<!-- gen:errors:end -->';

const json = (value: unknown) => JSON.stringify(value, null, 2) + '\n';

/** A JSON Schema without its `$schema` line, to nest under `$defs`. */
function def(schema: z.ZodType, io: 'input' | 'output') {
  const { $schema: _, ...rest } = z.toJSONSchema(schema, { io }) as Record<string, unknown>;
  return rest;
}

function errorTable(): string {
  const rows = Object.entries(API_ERRORS).map(([key, e]) => {
    const fields = 'fields' in e ? ` fields \`${JSON.stringify(e.fields)}\`` : '';
    return `| \`${key}\` | ${e.status} | \`${e.code}\` | ${e.message.replace(/\|/g, '\\|')}${fields} |`;
  });
  return ['| Key | Status | Code | Message |', '|---|---|---|---|', ...rows].join('\n');
}

function contractDoc(current: string): string {
  const start = current.indexOf(TABLE_START);
  const end = current.indexOf(TABLE_END);
  if (start < 0 || end < start) throw new Error(`${CONTRACT_DOC} lost its ${TABLE_START} … ${TABLE_END} markers`);
  return current.slice(0, start + TABLE_START.length) + '\n' + errorTable() + '\n' + current.slice(end);
}

/** Every generated file, keyed by its path relative to the repo root. */
export function generate(read: (rel: string) => string = (rel) => readFileSync(join(ROOT, rel), 'utf8')): Record<string, string> {
  return {
    'schema/flyer.schema.json': json(z.toJSONSchema(FlyerInputSchema, { io: 'input' })),
    // Input mode: the seed file has extra keys (_note, islands) and relies on defaults.
    'schema/seed.schema.json': json(z.toJSONSchema(SeedFileSchema, { io: 'input' })),
    'schema/storage.schema.json': json({
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      title: 'Nest flyers JSON store (docs/json-storage.md)',
      $defs: {
        meta: def(MetaFileSchema, 'output'),
        hostels: def(HostelsFileSchema, 'output'),
        doodles: def(DoodlesFileSchema, 'output'),
        photos: def(PhotosFileSchema, 'output'),
        flyerIndex: def(FlyerIndexFileSchema, 'output'),
        flyer: def(StoredFlyerSchema, 'output'),
      },
    }),
    'schema/shared.json': json({
      limits: {
        maxUploadBytes: MAX_UPLOAD_BYTES,
        maxPhotoEdge: MAX_PHOTO_EDGE,
        photoJpegQuality: PHOTO_JPEG_QUALITY,
        exportJpegQuality: EXPORT_JPEG_QUALITY,
        acceptedPhotoTypes: ACCEPTED_PHOTO_TYPES,
      },
      heic: HEIC,
      errors: API_ERRORS,
      storage: {
        formatVersion: STORAGE_FORMAT_VERSION,
        migrations: JSON_MIGRATIONS,
        uploadsDir: UPLOADS_DIR,
        photoPath: PHOTO_PATH.source,
        files: STORAGE_FILES,
      },
    }),
    'seed/samples.json': json(
      SAMPLE_FLYERS.map((s) => ({ title: s.title, hostel: s.hostel, template: 'activity', photo: s.photo, data: s.data })),
    ),
    [CONTRACT_DOC]: contractDoc(read(CONTRACT_DOC)),
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  let changed = 0;
  for (const [rel, content] of Object.entries(generate())) {
    const file = join(ROOT, rel);
    if (existsSync(file) && readFileSync(file, 'utf8') === content) continue;
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, content);
    console.log(`wrote ${rel}`);
    changed++;
  }
  console.log(changed ? `${changed} file(s) regenerated.` : 'Generated files are up to date.');
}
