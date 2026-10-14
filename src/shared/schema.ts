import { z } from 'zod';
import { AI_ASSUMPTIONS_MAX, AI_FEATURES, AI_INPUT_MAX } from './ai.js';
import { CHIP_LABEL_MAX, CHIP_VALUE_MAX } from './chips.js';
import { EXTRA_MAX, EXTRAS_MAX } from './extras.js';
import { LABELS_MAX, LABEL_SLUG, LABEL_SLUGS, LABEL_SLUG_MAX } from './labels.js';
import { TITLE_MAX } from './names.js';
import { DEFAULT_CROP, ZOOM_MAX, ZOOM_MIN } from './photo.js';
import { SHARE_MAX } from './share.js';
import { TEXT_LIMITS } from './text.js';
import { WEEK_ROWS_MAX, WEEK_ROW_LIMITS } from './week.js';

/* The flyer.data JSON, one shape for both templates (handoff README §7).
   Field names and the `·` convention are kept from flyer-data.js.
   The lines of copy take their limits from text.ts. */

export const CHIP_KEYS = ['when', 'where', 'cost'] as const;
export const ChipKeySchema = z.enum(CHIP_KEYS);
export type ChipKey = z.infer<typeof ChipKeySchema>;

export const ChipSchema = z.object({
  key: ChipKeySchema,
  label: z.string().max(CHIP_LABEL_MAX),
  value: z.string().max(CHIP_VALUE_MAX),
});
export type Chip = z.infer<typeof ChipSchema>;

export const PhotoModeSchema = z.enum(['bleed', 'band', 'none']);
export const TemplateSchema = z.enum(['activity', 'week']);
export type Template = z.infer<typeof TemplateSchema>;

/* Focal point may run past 0..1 when the photo is zoomed out (see photo.ts). */
export const CropSchema = z.object({
  x: z.number().min(-2).max(3),
  y: z.number().min(-2).max(3),
  zoom: z.number().min(ZOOM_MIN).max(ZOOM_MAX),
});
export type Crop = z.infer<typeof CropSchema>;

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
export const ColorsSchema = z.object({ bg: hex, ink: hex, accent: hex, mark: hex });
export type Colors = z.infer<typeof ColorsSchema>;

export const OverrideSchema = z.object({
  dx: z.number().default(0),
  dy: z.number().default(0),
  scale: z.number().min(0.6).max(1.4).default(1),
  order: z.array(ChipKeySchema).optional(),
});

/* x/y are canvas px, or offsets from a photo corner when anchored: the art
   then follows the photo slot on every canvas (on a week flyer, the first
   row's corners). The exact points, per canvas and body, are defined once in
   layout.ts (artAnchors). */
export const DoodleAnchorSchema = z.enum(['canvas', 'photoLeft', 'photoRight']);
export type DoodleAnchor = z.infer<typeof DoodleAnchorSchema>;

export const DoodlePlacementSchema = z.object({
  slug: z.string().max(80),
  anchor: DoodleAnchorSchema.optional(),
  x: z.number(),
  y: z.number(),
  w: z.number().positive().max(1080),
  rot: z.number().default(0),
  flipX: z.boolean().optional(),
  opacity: z.number().min(0).max(1).optional(),
});
export type DoodlePlacement = z.infer<typeof DoodlePlacementSchema>;

export const WeekRowSchema = z.object({
  day: z.string().max(WEEK_ROW_LIMITS.day),
  name: z.string().max(WEEK_ROW_LIMITS.name),
  time: z.string().max(WEEK_ROW_LIMITS.time),
  cost: z.string().max(WEEK_ROW_LIMITS.cost),
  shortName: z.string().max(WEEK_ROW_LIMITS.shortName).optional(),
});
export type WeekRow = z.infer<typeof WeekRowSchema>;

export const TextSchema = z.object({
  eyebrow: z.string().max(TEXT_LIMITS.eyebrow),
  headline1: z.string().max(TEXT_LIMITS.headline1),
  headline2: z.string().max(TEXT_LIMITS.headline2),
  headlineEs: z.string().max(TEXT_LIMITS.headlineEs),
  askEn: z.string().max(TEXT_LIMITS.askEn),
  askEs: z.string().max(TEXT_LIMITS.askEs),
  handle: z.string().max(TEXT_LIMITS.handle),
  tag: z.string().max(TEXT_LIMITS.tag),
});
export type FlyerText = z.infer<typeof TextSchema>;

export const FlyerDataSchema = z.object({
  v: z.literal(1).default(1),
  template: TemplateSchema,
  photoMode: PhotoModeSchema,
  photoCrop: CropSchema.default(() => ({ ...DEFAULT_CROP })),
  showPill: z.boolean().default(true),
  text: TextSchema,
  chips: z.array(ChipSchema).max(3),
  extras: z.array(z.string().max(EXTRA_MAX)).max(EXTRAS_MAX),
  week: z.array(WeekRowSchema).max(WEEK_ROWS_MAX).default([]),
  colors: ColorsSchema,
  overrides: z.record(z.string(), OverrideSchema).default({}),
  doodles: z.array(DoodlePlacementSchema).max(40),
  /* Not printed (share.ts). Defaulted, so every flyer saved before it reads back with none, on both backends. */
  share: z.string().max(SHARE_MAX).default(''),
  /* Not printed either (labels.ts), and defaulted for the same reason. Each is held to a slug's shape, never to the
     list: a flyer is checked against this schema on every read, and a label taken off the list must not stop it
     opening. Last, as newFlyerData() writes it: PHP's stored files are compared key for key. */
  labels: z.array(z.string().regex(LABEL_SLUG).max(LABEL_SLUG_MAX)).max(LABELS_MAX).default([]),
});
export type FlyerData = z.infer<typeof FlyerDataSchema>;

/* ---- Input: POST /api/flyers and PUT /api/flyers/:id ---- */

/** zod's .trim() is invisible in JSON Schema, so the flag tells the PHP validator to trim the same way. */
const trimmedString = (min: number, max: number) => z.string().trim().min(min).max(max).meta({ 'x-nest-trim': true });

export const FlyerInputSchema = z.object({
  title: trimmedString(1, TITLE_MAX),
  hostel: z.string().max(60).nullable(),
  template: TemplateSchema,
  data: FlyerDataSchema,
  photoId: z.number().int().positive().nullable(),
});
export type FlyerInput = z.infer<typeof FlyerInputSchema>;

/* ---- A brief: a flyer described by its copy alone (brief.ts) ---- */

/** Strict, so a misspelt key in a brief file is an error, never a field silently left at its default. It carries every
    limit the flyer has, from the same constants FlyerDataSchema takes them from: a brief that passes always builds a
    flyer the API saves, which is what the AI's answer is held to on both backends (PHP has no flyerFromBrief). */
export const BriefSchema = z.strictObject({
  hostel: z.string().max(60).nullable(),
  template: TemplateSchema,
  title: z.string().max(TITLE_MAX).optional(),
  text: TextSchema.partial().strict().optional(),
  when: z.string().max(CHIP_VALUE_MAX).optional(),
  where: z.string().max(CHIP_VALUE_MAX).optional(),
  cost: z.string().max(CHIP_VALUE_MAX).optional(),
  extras: z.array(z.string().max(EXTRA_MAX)).max(EXTRAS_MAX).optional(),
  week: z.array(WeekRowSchema.strict()).max(WEEK_ROWS_MAX).optional(),
  share: z.string().max(SHARE_MAX).optional(),
  /* Of the list (labels.ts), where a flyer's own are held to a slug's shape alone (FlyerDataSchema): a brief is
     written now, by a hand or by the model, and both choose from the list as it stands. So the model cannot invent
     one, and an example file that names a label taken off the list stops `npm run gen` until it is put right. */
  labels: z.array(z.enum(LABEL_SLUGS as [string, ...string[]])).max(LABELS_MAX).optional(),
});
export type Brief = z.infer<typeof BriefSchema>;

/* ---- The AI assistant (docs/prompts/ai-assistant.md): what its routes take, and what the model fills ---- */

/** One thing the text left out, and what the model went with: `field` is the brief key, `note` the staff's check. */
export const AiAssumptionSchema = z.strictObject({ field: z.string().max(40), note: z.string().max(200) });
export type AiAssumption = z.infer<typeof AiAssumptionSchema>;

/** POST api/ai/flyer: the idea, and the hostel when the staff member chose one (else the model decides). */
export const AiFlyerRequestSchema = z.strictObject({
  text: trimmedString(1, AI_INPUT_MAX),
  hostel: z.string().max(60).optional(),
});
export type AiFlyerRequest = z.infer<typeof AiFlyerRequestSchema>;

/** What the model answers: generated into schema/ai.json, and what each provider's structured output is held to.
    The share text is required here, where a brief written by hand may go without: one generation is a whole flyer,
    and a provider that takes optional keys as they are (Anthropic) otherwise leaves it out (seen 2026-10-04). The
    labels are required for the same reason (2026-10-14): an empty list when none fits. */
export const AiFlyerAnswerSchema = z.strictObject({
  brief: BriefSchema.required({ share: true, labels: true }),
  assumptions: z.array(AiAssumptionSchema).max(AI_ASSUMPTIONS_MAX),
});
export type AiFlyerAnswer = z.infer<typeof AiFlyerAnswerSchema>;

/** The route's answer: the model's, plus how many generations of this feature the actor has left today. */
export const AiFlyerResultSchema = AiFlyerAnswerSchema.extend({ remaining: z.number().int().nonnegative() });
export type AiFlyerResult = z.infer<typeof AiFlyerResultSchema>;

/** POST api/ai/share: the flyer as the editor holds it, and the idea it came from when the AI made it. */
export const AiShareRequestSchema = z.strictObject({
  hostel: z.string().max(60).nullable(),
  template: TemplateSchema,
  data: FlyerDataSchema,
  idea: z.string().max(AI_INPUT_MAX).optional(),
});
export type AiShareRequest = z.infer<typeof AiShareRequestSchema>;

export const AiShareAnswerSchema = z.strictObject({ share: z.string().max(SHARE_MAX) });
export type AiShareAnswer = z.infer<typeof AiShareAnswerSchema>;

export const AiShareResultSchema = AiShareAnswerSchema.extend({ remaining: z.number().int().nonnegative() });
export type AiShareResult = z.infer<typeof AiShareResultSchema>;

/** What the model answers a picture read with: the words the picture shows about the event, as written. They go
    into "Your idea", so they are never longer than it takes; an empty text means the picture has none. */
export const AiPhotoAnswerSchema = z.strictObject({ text: z.string().max(AI_INPUT_MAX) });
export type AiPhotoAnswer = z.infer<typeof AiPhotoAnswerSchema>;

/** What `POST api/ai/photo` answers: the words, and what is left of the day's reads. */
export const AiPhotoResultSchema = AiPhotoAnswerSchema.extend({ remaining: z.number().int().nonnegative() });
export type AiPhotoResult = z.infer<typeof AiPhotoResultSchema>;

/** One feature in the `ai` block of GET api/config: the actor's daily limit for it, and what is left of that today. */
export const AiFeatureStatusSchema = z.strictObject({
  name: z.enum(AI_FEATURES),
  limit: z.number().int().nonnegative(),
  remaining: z.number().int().nonnegative(),
});

/** The `ai` block of GET api/config: nothing beyond `enabled: false` when AI is off (no key, switched off, no feature
    named, or a guest); when on, the features that run for the actor, in AI_FEATURES' order and each once, each with
    its own limit and what is left of it today (the owner's answer, 2026-10-06: every feature its own daily limit).
    On means some feature runs, so the list is never empty. */
export const AiConfigSchema = z.discriminatedUnion('enabled', [
  z.strictObject({ enabled: z.literal(false) }),
  z.strictObject({
    enabled: z.literal(true),
    features: z.array(AiFeatureStatusSchema).min(1),
  }),
]);
export type AiConfig = z.infer<typeof AiConfigSchema>;

/** schema/ai.json, as `npm run gen` writes it and both backends read it: the prompts (with their limits rendered in),
    the few-shot examples, and the schemas the providers are held to. Checked on load, so a stale bundle fails at
    start-up, not on a staff member's request. */
export const AiBundleSchema = z.strictObject({
  prompts: z.strictObject({ flyer: z.string().min(1), share: z.string().min(1), photo: z.string().min(1) }),
  examples: z.array(z.strictObject({ text: z.string(), answer: AiFlyerAnswerSchema })),
  schemas: z.strictObject({
    flyerAnswer: z.record(z.string(), z.unknown()),
    shareAnswer: z.record(z.string(), z.unknown()),
    photoAnswer: z.record(z.string(), z.unknown()),
    flyerRequest: z.record(z.string(), z.unknown()),
    shareRequest: z.record(z.string(), z.unknown()),
  }),
});
export type AiBundle = z.infer<typeof AiBundleSchema>;

/** A file of docs/ai-flyers/examples: a staff text and the brief written from it (the few-shot and eval set). */
export const AiExampleSchema = z.strictObject({
  /** The staff member's text, exactly as it came. */
  source: z.string(),
  brief: BriefSchema,
  /** What the text left out and had to be asked, with the answer and the brief key it settled: the assistant,
      which cannot ask, learns from these what to assume and to say so. */
  asked: z.array(z.strictObject({ question: z.string(), answer: z.string().max(200), field: z.string().max(40) })).optional(),
  /** What was decided while writing the brief, and the owner's corrections: the lessons for the AI assistant. */
  notes: z.string().optional(),
  /** Where it was saved: written back after each save to a deployment (never to a local proof server). */
  posted: z.array(z.strictObject({ site: z.string(), id: z.number().int().positive(), at: z.string() })).optional(),
});
export type AiExample = z.infer<typeof AiExampleSchema>;

/* ---- API responses: the contract suite parses every answer with these, on every backend ---- */

/** toISOString(): UTC, milliseconds, Z. */
export const TimestampSchema = z.iso.datetime({ precision: 3 });

export const HostelSchema = z.strictObject({
  id: z.number().int().positive(),
  slug: z.string(),
  name: z.string(),
  island: z.string(),
  logoPath: z.string().nullable(),
  sortOrder: z.number(),
});
export type Hostel = z.infer<typeof HostelSchema>;

export const DoodleSchema = z.strictObject({
  id: z.number().int().positive(),
  slug: z.string(),
  label: z.string(),
  url: z.string().regex(/^assets\//),
  kind: z.string(),
  builtin: z.boolean(),
});
export type Doodle = z.infer<typeof DoodleSchema>;

/** A stored photo as the API returns it. `url` is relative to the app root. */
export const PhotoInfoSchema = z.strictObject({
  id: z.number().int().positive(),
  url: z.string().regex(/^uploads\//),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});
export type PhotoInfo = z.infer<typeof PhotoInfoSchema>;

export const FlyerRecordSchema = z.strictObject({
  id: z.number().int().positive(),
  hostel: z.string().nullable(),
  template: TemplateSchema,
  title: z.string(),
  data: FlyerDataSchema,
  photoId: z.number().int().positive().nullable(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
});
export type FlyerRecord = z.infer<typeof FlyerRecordSchema>;

/** GET /api/flyers/:id — everything the renderer needs, resolved. */
export const FlyerPayloadSchema = z.strictObject({
  flyer: FlyerRecordSchema,
  hostel: HostelSchema.nullable(),
  photo: PhotoInfoSchema.nullable(),
});
export type FlyerPayload = z.infer<typeof FlyerPayloadSchema>;

/** POST /api/flyers (201) and PUT /api/flyers/:id (200). */
export const FlyerSavedSchema = z.strictObject({ id: z.number().int().positive(), flyer: FlyerRecordSchema });
export type FlyerSaved = z.infer<typeof FlyerSavedSchema>;

export const FlyerListItemSchema = z.strictObject({
  id: z.number().int().positive(),
  title: z.string(),
  template: TemplateSchema,
  hostel: z.string().nullable(),
  hostelName: z.string().nullable(),
  updatedAt: TimestampSchema,
  /* The flyer's labels as stored (labels.ts): the one thing of a flyer's data the list carries, so a card shows them
     with its name and the library can ask for one label's flyers. A release from before them sends none. */
  labels: z.array(z.string()),
});
export type FlyerListItem = z.infer<typeof FlyerListItemSchema>;

/** GET /api/config — what this backend can do. The editor picks its exporter and photo limits from it. */
export const ApiConfigSchema = z.strictObject({
  backend: z.enum(['node', 'php']),
  storage: z.enum(['sqlite', 'json']),
  exporters: z.array(z.enum(['client', 'server'])).min(1),
  limits: z.strictObject({
    maxUploadBytes: z.number().int().positive(),
    maxPhotoEdge: z.number().int().positive(),
  }),
  server: z.record(z.string(), z.unknown()),
  ai: AiConfigSchema,
});
export type ApiConfig = z.infer<typeof ApiConfigSchema>;

/** Every non-2xx API answer: {error:{code,message,fields?}}. */
export const ErrorEnvelopeSchema = z.strictObject({
  error: z.strictObject({
    code: z.string(),
    message: z.string(),
    fields: z.record(z.string(), z.string()).optional(),
  }),
});
export type ErrorEnvelope = z.infer<typeof ErrorEnvelopeSchema>;
