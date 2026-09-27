import { z } from 'zod';

/* The flyer.data JSON, one shape for both templates (handoff README §7).
   Field names and the `·` convention are kept from flyer-data.js.
   Max lengths keep the unfitted, nowrap lines (eyebrow, handle, tag) inside
   the safe box; fitted lines shrink, so their limits are generous. */

export const CHIP_KEYS = ['when', 'where', 'cost'] as const;
export const ChipKeySchema = z.enum(CHIP_KEYS);
export type ChipKey = z.infer<typeof ChipKeySchema>;

export const ChipSchema = z.object({
  key: ChipKeySchema,
  label: z.string().max(12),
  value: z.string().max(90),
});
export type Chip = z.infer<typeof ChipSchema>;

export const PhotoModeSchema = z.enum(['bleed', 'band', 'none']);
export const TemplateSchema = z.enum(['activity', 'week']);
export type Template = z.infer<typeof TemplateSchema>;

/* Focal point may run past 0..1 when the photo is zoomed out (see photo.ts). */
export const CropSchema = z.object({
  x: z.number().min(-2).max(3),
  y: z.number().min(-2).max(3),
  zoom: z.number().min(0.25).max(4),
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
   then follows the photo slot on every canvas. The exact points, per canvas
   and photo mode, are defined once in layout.ts (artAnchors). */
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
  day: z.string().max(30),
  name: z.string().max(80),
  time: z.string().max(20),
  cost: z.string().max(30),
  shortName: z.string().max(60).optional(),
});

export const TextSchema = z.object({
  eyebrow: z.string().max(18),
  headline1: z.string().max(40),
  headline2: z.string().max(40),
  headlineEs: z.string().max(140),
  askEn: z.string().max(60),
  askEs: z.string().max(70),
  handle: z.string().max(18),
  tag: z.string().max(12),
});
export type FlyerText = z.infer<typeof TextSchema>;

export const FlyerDataSchema = z.object({
  v: z.literal(1).default(1),
  template: TemplateSchema,
  photoMode: PhotoModeSchema,
  photoCrop: CropSchema.default({ x: 0.5, y: 0.5, zoom: 1 }),
  showPill: z.boolean().default(true),
  text: TextSchema,
  chips: z.array(ChipSchema).max(3),
  extras: z.array(z.string().max(32)).max(4),
  week: z.array(WeekRowSchema).max(5).default([]),
  colors: ColorsSchema,
  overrides: z.record(z.string(), OverrideSchema).default({}),
  doodles: z.array(DoodlePlacementSchema).max(40),
});
export type FlyerData = z.infer<typeof FlyerDataSchema>;

/* ---- Input: POST /api/flyers and PUT /api/flyers/:id ---- */

/** zod's .trim() is invisible in JSON Schema, so the flag tells the PHP validator to trim the same way. */
const trimmedString = (min: number, max: number) => z.string().trim().min(min).max(max).meta({ 'x-nest-trim': true });

export const FlyerInputSchema = z.object({
  title: trimmedString(1, 80),
  hostel: z.string().max(60).nullable(),
  template: TemplateSchema,
  data: FlyerDataSchema,
  photoId: z.number().int().positive().nullable(),
});
export type FlyerInput = z.infer<typeof FlyerInputSchema>;

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
