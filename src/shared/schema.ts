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
   then follows the photo slot (band/bleed frame corner, or the brush rule's
   ends in no-photo mode). */
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

export const HostelSchema = z.object({
  id: z.number(),
  slug: z.string(),
  name: z.string(),
  island: z.string(),
  logoPath: z.string().nullable(),
  sortOrder: z.number(),
});
export type Hostel = z.infer<typeof HostelSchema>;

export interface PhotoInfo {
  id: number;
  url: string;
  width: number;
  height: number;
}

export interface FlyerRecord {
  id: number;
  hostel: string | null;
  template: Template;
  title: string;
  data: FlyerData;
  photoId: number | null;
  createdAt: string;
  updatedAt: string;
}

/** GET /api/flyers/:id — everything the renderer needs, resolved. */
export interface FlyerPayload {
  flyer: FlyerRecord;
  hostel: Hostel | null;
  photo: PhotoInfo | null;
}

export const FlyerInputSchema = z.object({
  title: z.string().trim().min(1).max(80),
  hostel: z.string().max(60).nullable(),
  template: TemplateSchema,
  data: FlyerDataSchema,
  photoId: z.number().int().positive().nullable(),
});
export type FlyerInput = z.infer<typeof FlyerInputSchema>;

export interface FlyerListItem {
  id: number;
  title: string;
  template: Template;
  hostel: string | null;
  hostelName: string | null;
  updatedAt: string;
}
