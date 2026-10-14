import { SHARED_GEOMETRY, artAnchors, type ArtAnchor } from '../layout.js';
import type { ArtPlacement, Look } from '../looks.js';
import type { Colors, DoodlePlacement } from '../schema.js';

/* The hand-drawn look: the handoff's design, as the team's passes left it. It is the first look, what a flyer that
   names none prints in, and the one a flyer's stored colours and art belong to (data.colors, data.doodles). Every
   number here was the renderer's or defaults.ts's before looks; none of them changed when it moved. */

/* Design tokens (handoff README §3). */
export const CREAM = '#F8F4E8';
export const INK = '#141414';
export const DEEP_TEAL = '#0D6F82'; // the only teal allowed for text
export const BRIGHT_TEAL = '#53CED1'; // rules, dots, fills — never text
export const YELLOW = '#FAC213';
export const MUTED = '#3A3A34';
export const PHOTO_PLACEHOLDER = '#E7E0CE';

/** What a new flyer stores in data.colors, whatever its look: the hand-drawn look's own. */
export const DEFAULT_COLORS: Colors = { bg: CREAM, ink: INK, accent: DEEP_TEAL, mark: YELLOW };

/* The template's art. Team design pass (2026-09-18), departing from the
   prototype: the two sparks moved from the top margin onto the photo's top
   corners (anchored, so they follow the photo slot — band/bleed at 24,657 and
   975,658; on a week flyer the first row's corners, artAnchors), the bottom
   spark sits off the tag pill's end, the clock is gone. The blobs keep the
   prototype's right/bottom anchoring, converted to top-left with each PNG's
   natural aspect ratio.

   These numbers and slugs are what every stored flyer carries: never change
   them (sameDoodles is how an untouched set is known). What the template
   prints from them today is decided below, in the renderer's own terms. */
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

/* What the canvas-anchored pieces of DEFAULT_DOODLES follow from canvas to
   canvas: the blobs the bottom corners, the spark off the tag pill the pill's
   own end, so it moves as the pill's copy grows (Artur, 2026-10-12; it hung
   from the stack's floor, and a long pill covered it). The two sparks on the
   photo carry their anchors already (and trade inks, below). Only the renderer uses these anchors, so
   the stored data stays DEFAULT_DOODLES as every flyer has it (no migration,
   and an older release still reads it). */
const FOLLOWS: Record<string, ArtAnchor> = { 'blob-yellow': 'bottomLeft', 'blob-teal': 'bottomRight', 'spark-teal': 'pillEnd' };

/** The template's two pairs print in each other's ink. Each piece keeps its drawing and its place.
    - The corner blobs (Artur, 2026-10-12): teal in the left corner, yellow in the right, where a long pill carries
      its spark. The spark is teal, as the pill it hangs from, and was lost on the teal blob.
    - The sparks on the photo's corners (Artur, 2026-10-13: "Invert also the image sparks on the top"): yellow on the
      left, teal on the right, so the two inks cross again from the flyer's top to its bottom.
    The file drawn → the drawing it keeps, the piece whose ink it takes, and where the template hangs it: the left
    spark's drawing is the pill's spark too, which keeps its teal. Both inks are read off the blobs: their scans
    are flat, the sparks' are speckled. scripts/art-inks.ts makes the files from this (npm run gen:art). */
export const SWAPPED_INKS = {
  'spark-left-yellow': { drawing: 'spark-teal', ink: 'blob-yellow', at: 'photoLeft' },
  'spark-right-teal': { drawing: 'spark-yellow', ink: 'blob-teal', at: 'photoRight' },
  'blob-left-teal': { drawing: 'blob-yellow', ink: 'blob-teal', at: 'bottomLeft' },
  'blob-right-yellow': { drawing: 'blob-teal', ink: 'blob-yellow', at: 'bottomRight' },
} as const;

/** The file the template draws for a piece where it hangs: its drawing in the ink it trades for, or its own. */
const drawn = (slug: string, at: ArtAnchor): string => Object.entries(SWAPPED_INKS).find(([, swap]) => swap.drawing === slug && swap.at === at)?.[0] ?? slug;

/** DEFAULT_DOODLES re-expressed from the story's anchor points. Derived, and
    exact: x − p + p is x again for these numbers (shared.test.ts checks it). */
const TEMPLATE_ART: ArtPlacement[] = DEFAULT_DOODLES.map((d) => {
  if (d.anchor) return { ...d, slug: drawn(d.slug, d.anchor) };
  const anchor = FOLLOWS[d.slug];
  const p = artAnchors('story', 'band', SHARED_GEOMETRY)[anchor];
  return { ...d, slug: drawn(d.slug, anchor), anchor, x: d.x - p.x, y: d.y - p.y };
});

/** The art to draw. An untouched template set follows the template onto every
    canvas, in the inks the template prints today; art someone arranged keeps
    the anchors they gave it (canvas px, or the photo's corners, as artAnchors
    defines them) and the drawings it names. */
export function resolveDoodles(doodles: DoodlePlacement[]): ArtPlacement[] {
  return sameDoodles(doodles, DEFAULT_DOODLES) ? TEMPLATE_ART : doodles;
}

export const HAND_DRAWN: Look = {
  id: 'hand-drawn',
  name: 'Hand-drawn',
  geometry: SHARED_GEOMETRY,
  // The flyer's own ink, accent and ground, as stored (data.colors, which only this look reads); the rest are fixed.
  palette: ({ colors }) => ({
    ground: colors.bg,
    ink: colors.ink,
    accent: colors.accent,
    muted: MUTED,
    surface: '#ffffff',
    placeholder: PHOTO_PLACEHOLDER,
    pillText: '#ffffff',
    pillDot: BRIGHT_TEAL,
  }),
};
