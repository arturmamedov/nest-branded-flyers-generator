import { artAnchors, type ArtAnchor } from './layout.js';
import type { Colors, DoodlePlacement, FlyerData, FlyerText, Template } from './schema.js';

/* Design tokens (handoff README §3). */
export const CREAM = '#F8F4E8';
export const INK = '#141414';
export const DEEP_TEAL = '#0D6F82'; // the only teal allowed for text
export const BRIGHT_TEAL = '#53CED1'; // rules, dots, fills — never text
export const YELLOW = '#FAC213';
export const MUTED = '#3A3A34';
export const PHOTO_PLACEHOLDER = '#E7E0CE';

export const DEFAULT_COLORS: Colors = { bg: CREAM, ink: INK, accent: DEEP_TEAL, mark: YELLOW };

/* The template's art. Team design pass (2026-09-18), departing from the
   prototype: the two sparks moved from the top margin onto the photo's top
   corners (anchored, so they follow the photo slot — band/bleed at 24,657 and
   975,658), the bottom spark sits off the tag pill's end, the clock is gone.
   The blobs keep the prototype's right/bottom anchoring, converted to top-left
   with each PNG's natural aspect ratio. */
export const DEFAULT_DOODLES: DoodlePlacement[] = [
  { slug: 'spark-teal', anchor: 'photoLeft', x: -46, y: -55, w: 104, rot: -8 },
  { slug: 'spark-yellow', anchor: 'photoRight', x: -35, y: -54, w: 88, rot: 9 },
  { slug: 'blob-yellow', x: -26, y: 1704.4474, w: 250, rot: 0 },
  { slug: 'blob-teal', x: 818, y: 1673.6047, w: 290, rot: 0 },
  { slug: 'spark-teal', x: 776, y: 1601.7, w: 92, rot: -137, flipX: true },
];

/** The previous default set, as the prototype had it — kept for migrating
    flyers that still carry it untouched. */
export const PROTOTYPE_DOODLES: DoodlePlacement[] = [
  { slug: 'spark-teal', x: 52, y: 74, w: 104, rot: -8 },
  { slug: 'spark-yellow', x: 918, y: 112, w: 88, rot: 9 },
  { slug: 'blob-yellow', x: -26, y: 1704.4474, w: 250, rot: 0 },
  { slug: 'blob-teal', x: 818, y: 1673.6047, w: 290, rot: 0 },
  { slug: 'spark-teal', x: 738, y: 1667.7015, w: 92, rot: 14, flipX: true },
  { slug: 'icon-clock', x: 236, y: 1656.1728, w: 74, rot: -9, opacity: 0.9 },
];

/** Same art, same place — ignores key order and absent defaults. */
export function sameDoodles(a: DoodlePlacement[], b: DoodlePlacement[]): boolean {
  const norm = (d: DoodlePlacement) =>
    JSON.stringify([d.slug, d.anchor ?? 'canvas', d.x, d.y, d.w, d.rot ?? 0, !!d.flipX, d.opacity ?? 1]);
  return a.length === b.length && a.every((d, i) => norm(d) === norm(b[i]));
}

/** Art as the renderer places it: x/y are offsets from an anchor point of the canvas (layout.ts, artAnchors). */
export interface ArtPlacement extends Omit<DoodlePlacement, 'anchor'> {
  anchor?: ArtAnchor;
}

/* What the canvas-anchored pieces of DEFAULT_DOODLES follow from canvas to
   canvas: the blobs the bottom corners, the spark off the tag pill the stack's
   floor (the two sparks on the photo carry their anchors already). Only the
   renderer uses these anchors, so the stored data stays DEFAULT_DOODLES as
   every flyer has it (no migration, and an older release still reads it). */
const FOLLOWS: Record<string, ArtAnchor> = { 'blob-yellow': 'bottomLeft', 'blob-teal': 'bottomRight', 'spark-teal': 'floor' };

/** DEFAULT_DOODLES re-expressed from the story's anchor points. Derived, and
    exact: x − p + p is x again for these numbers (shared.test.ts checks it). */
const TEMPLATE_ART: ArtPlacement[] = DEFAULT_DOODLES.map((d) => {
  if (d.anchor) return d;
  const anchor = FOLLOWS[d.slug];
  const p = artAnchors('story', 'band')[anchor];
  return { ...d, anchor, x: d.x - p.x, y: d.y - p.y };
});

/** The art to draw. An untouched template set follows the template onto every
    canvas; art someone arranged keeps the anchors they gave it (canvas px, or
    the photo's corners, as artAnchors defines them). */
export function resolveDoodles(doodles: DoodlePlacement[]): ArtPlacement[] {
  return sameDoodles(doodles, DEFAULT_DOODLES) ? TEMPLATE_ART : doodles;
}

export const DEFAULT_TEXT: FlyerText = {
  eyebrow: 'NEXT ACTIVITY',
  headline1: '',
  headline2: '',
  headlineEs: '',
  askEn: 'Sign up at reception.',
  askEs: 'Apúntate en recepción.',
  handle: '@NESTSHOSTELS',
  tag: '¡TAG US!',
};

export function newFlyerData(template: Template = 'activity'): FlyerData {
  return {
    v: 1,
    template,
    photoMode: 'bleed',
    photoCrop: { x: 0.5, y: 0.5, zoom: 1 },
    showPill: true,
    text: { ...DEFAULT_TEXT, eyebrow: template === 'week' ? 'THIS WEEK' : 'NEXT ACTIVITY' },
    chips: [
      { key: 'when', label: 'When', value: '' },
      { key: 'where', label: 'Where', value: '' },
      { key: 'cost', label: 'Cost', value: '' },
    ],
    extras: [],
    week: [],
    colors: { ...DEFAULT_COLORS },
    overrides: {},
    doodles: DEFAULT_DOODLES.map((d) => ({ ...d })),
  };
}
