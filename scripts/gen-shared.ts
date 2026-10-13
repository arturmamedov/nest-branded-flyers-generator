import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import { AI_SHARED } from '../src/shared/ai.js';
import { API_ERRORS } from '../src/shared/errors.js';
import { LABELS_SHARED } from '../src/shared/labels.js';
import {
  ACCEPTED_PHOTO_TYPES,
  EXPORT_JPEG_QUALITY,
  HEIC,
  MAX_PHOTO_EDGE,
  MAX_UPLOAD_BYTES,
  PHOTO_JPEG_QUALITY,
} from '../src/shared/limits.js';
import { SAMPLE_FLYERS } from '../src/shared/samples.js';
import {
  AiExampleSchema,
  AiFlyerAnswerSchema,
  AiFlyerRequestSchema,
  AiPhotoAnswerSchema,
  AiShareAnswerSchema,
  AiShareRequestSchema,
  FlyerInputSchema,
} from '../src/shared/schema.js';
import { SeedFileSchema } from '../src/shared/seed.js';
import {
  AiUsageFileSchema,
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
import { WRITE_GUARD } from '../src/shared/writeGuard.js';

/* Derived copies of the shared sources of truth, for PHP and the docs. Run
   `npm run gen` after changing src/shared; tests/unit/generated.test.ts fails
   while a committed copy is stale. */

export const ROOT = join(import.meta.dirname, '..');
export const CONTRACT_DOC = 'docs/api-contract.md';
const TABLE_START = '<!-- gen:errors:start -->';
const TABLE_END = '<!-- gen:errors:end -->';

/** The AI assistant's sources: the rules, and the staff texts with the briefs written from them (the few-shot). */
export const PROMPT_FILES = { flyer: 'ai/prompts/flyer.md', share: 'ai/prompts/share.md', photo: 'ai/prompts/photo.md' } as const;
export const EXAMPLES_DIR = 'docs/ai-flyers/examples';

const json = (value: unknown) => JSON.stringify(value, null, 2) + '\n';

type JsonSchema = Record<string, unknown>;

/** A JSON Schema without its `$schema` line, to nest under `$defs`, or to hand a provider. */
function def(schema: z.ZodType, io: 'input' | 'output'): JsonSchema {
  const { $schema: _, ...rest } = z.toJSONSchema(schema, { io }) as JsonSchema;
  return rest;
}

/** A property's own schema, past the null branch of a nullable one. */
function valueOf(prop: JsonSchema): JsonSchema {
  const branches = prop.anyOf as JsonSchema[] | undefined;
  return branches?.find((b) => b.type !== 'null') ?? prop;
}

/** The limits a schema sets, one line per field, read off the JSON Schema so the prompt never repeats a number by
    hand: `- brief.text.eyebrow: at most 18 characters`, `- brief.extras: at most 4 items, each at most 32 characters`. */
function limitLines(schema: JsonSchema, path = ''): string[] {
  const lines: string[] = [];
  for (const [name, raw] of Object.entries((schema.properties ?? {}) as Record<string, JsonSchema>)) {
    const at = path ? `${path}.${name}` : name;
    const prop = valueOf(raw);
    if (typeof prop.maxLength === 'number') lines.push(`- ${at}: at most ${prop.maxLength} characters`);
    if (prop.type === 'array') {
      const items = valueOf((prop.items ?? {}) as JsonSchema);
      const parts = [
        ...(typeof prop.maxItems === 'number' ? [`at most ${prop.maxItems} items`] : []),
        ...(typeof items.maxLength === 'number' ? [`each at most ${items.maxLength} characters`] : []),
      ];
      if (parts.length) lines.push(`- ${at}: ${parts.join(', ')}`);
      lines.push(...limitLines(items, `${at}[]`));
    }
    if (prop.properties) lines.push(...limitLines(prop, at));
  }
  return lines;
}

/** A prompt file with the limits of the answer it asks for appended, so a rule and its number have one home each. */
function prompt(text: string, answer: JsonSchema): string {
  const limits = ['## Limits', 'Characters are counted one by one, an emoji included; the app refuses a longer field.', ...limitLines(answer)];
  return `${text.replace(/\r\n/g, '\n').trim()}\n\n${limits.join('\n')}\n`;
}

/** Each example file as a few-shot turn: the staff text, and the answer the model should have given, its `asked`
    questions turned into the assumptions it would list instead of asking (`field` + the answer as the note). */
function examples(read: (rel: string) => string) {
  const files = readdirSync(join(ROOT, EXAMPLES_DIR))
    .filter((f) => f.endsWith('.json'))
    .sort();
  return files.map((f) => {
    const example = AiExampleSchema.parse(JSON.parse(read(`${EXAMPLES_DIR}/${f}`)));
    const answer = { brief: example.brief, assumptions: (example.asked ?? []).map((a) => ({ field: a.field, note: a.answer })) };
    // The model is shown this as the answer to give, so it must be one the service would take: its share text included.
    const checked = AiFlyerAnswerSchema.safeParse(answer);
    if (!checked.success) {
      const issues = checked.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
      throw new Error(`${EXAMPLES_DIR}/${f} cannot be a few-shot example: ${issues}`);
    }
    return { text: example.source, answer };
  });
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
        aiUsage: def(AiUsageFileSchema, 'output'),
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
      writeGuard: WRITE_GUARD,
      errors: API_ERRORS,
      storage: {
        formatVersion: STORAGE_FORMAT_VERSION,
        migrations: JSON_MIGRATIONS,
        uploadsDir: UPLOADS_DIR,
        photoPath: PHOTO_PATH.source,
        files: STORAGE_FILES,
      },
      ai: AI_SHARED,
      labels: LABELS_SHARED,
    }),
    // The AI assistant's bundle, read by both backends at request time: the prompts (with their limits), the few-shot
    // examples, and the answer and request schemas, inline (PHP's validator takes no $ref).
    'schema/ai.json': json({
      prompts: {
        flyer: prompt(read(PROMPT_FILES.flyer), def(AiFlyerAnswerSchema, 'input')),
        share: prompt(read(PROMPT_FILES.share), def(AiShareAnswerSchema, 'input')),
        photo: prompt(read(PROMPT_FILES.photo), def(AiPhotoAnswerSchema, 'input')),
      },
      examples: examples(read),
      schemas: {
        flyerAnswer: def(AiFlyerAnswerSchema, 'input'),
        shareAnswer: def(AiShareAnswerSchema, 'input'),
        photoAnswer: def(AiPhotoAnswerSchema, 'input'),
        flyerRequest: def(AiFlyerRequestSchema, 'input'),
        shareRequest: def(AiShareRequestSchema, 'input'),
      },
    }),
    'seed/samples.json': json(
      SAMPLE_FLYERS.map((s) => ({ title: s.title, hostel: s.hostel, template: s.data.template, photo: s.photo, data: s.data })),
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
