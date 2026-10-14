import { BODY_FONT, HEADLINE_FONT } from '../fonts.js';
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

/** The code-drawn wonky frame (handoff README §4, the team's choice over the drawn PNG frames, which wash out when
    stretched): one path, a 5 px stroke at any size. */
const WONKY_PATH =
  'M46 9 C 200 4 380 13 540 7 C 700 2 830 12 914 8 C 944 7 954 26 951 54 C 954 96 949 142 952 164 C 954 186 932 197 902 193 C 690 198 410 189 154 195 C 84 197 9 192 11 166 C 7 122 13 72 9 48 C 7 22 22 10 46 9 Z';

/** The pencil hangs from the end of the ask's copy: 14 px after it and 10 px above the block's top (it was 6 px below
    it), at the size it always had. Artur's pick of two shapes from the mock-ups (2026-10-12): "same size, higher". */
const PENCIL: ArtPlacement = { slug: 'doodle-pencil', anchor: 'askEnd', x: 14, y: -10, w: 104, rot: -4 };

/** The orange of the website's "Book Now": never flyer ink (handoff README §3). */
const BOOK_NOW_ORANGE = '#EA580C';

/** Every line of copy, as the handoff's type table (§2, §3) and the team's passes set it: Shantell Sans for the
    marker lines, Montserrat for the Spanish lines and the labels. A fitted line's size and floor are the fit's
    (handoff §5); the floors are the owner's (2026-09-30: each line stops at its own). */
const TYPE: Look['type'] = {
  eyebrow: { font: HEADLINE_FONT, weight: 700, size: 36, lineHeight: 1, spacing: '0.1em', ink: 'ink', on: 'ground' },
  headline1: { font: HEADLINE_FONT, weight: 800, size: 92, lineHeight: 1.04, floor: 0.5, ink: 'ink', on: 'ground' },
  headline2: { font: HEADLINE_FONT, weight: 800, size: 124, lineHeight: 1, floor: 0.5, ink: 'accent', on: 'ground' },
  spanish: { font: BODY_FONT, weight: 600, size: 36, lineHeight: 1.26, floor: 0.8, ink: 'muted', on: 'ground' },
  chipLabel: { font: BODY_FONT, weight: 700, size: 26, spacing: '0.13em', upper: true, ink: 'accent', on: 'surface' },
  costGlyph: { font: HEADLINE_FONT, weight: 800, size: 36, lineHeight: 1, ink: 'accent', on: 'surface' },
  chipBig: { font: HEADLINE_FONT, weight: 700, size: 46, lineHeight: 1.1, floor: 0.6, ink: 'ink', on: 'surface' },
  // Taller, to clear the highlighter's stroke (handoff §2).
  chipBigMarked: { font: HEADLINE_FONT, weight: 700, size: 46, lineHeight: 1.3, floor: 0.6, ink: 'ink', on: 'highlight' },
  chipTime: { font: HEADLINE_FONT, weight: 700, size: 40, lineHeight: 1.1, floor: 0.7, ink: 'ink', on: 'surface' },
  chipSmall: { font: BODY_FONT, weight: 600, size: 32, lineHeight: 1.22, floor: 0.7, ink: 'ink', on: 'surface' },
  extras: { font: HEADLINE_FONT, weight: 700, size: 30, spacing: '0.02em', upper: true, floor: 0.8, gap: 16, ink: 'ink', on: 'ground' },
  askEn: { font: HEADLINE_FONT, weight: 800, size: 62, lineHeight: 1.08, floor: 0.66, ink: 'ink', on: 'ground' },
  askEs: { font: BODY_FONT, weight: 600, size: 34, lineHeight: 1.2, floor: 0.8, ink: 'muted', on: 'ground' },
  pill: { font: HEADLINE_FONT, weight: 700, size: 34, lineHeight: 1, spacing: '0.04em', floor: 0.7, ink: 'pillText', on: 'accent' },
  weekDay: { font: HEADLINE_FONT, weight: 700, size: 34, lineHeight: 1.1, floor: 0.7, ink: 'ink', on: 'highlight' },
  weekName: { font: HEADLINE_FONT, weight: 800, size: 44, lineHeight: 1.06, floor: 0.6, ink: 'accent', on: 'surface' },
  weekTime: { font: HEADLINE_FONT, weight: 700, size: 34, lineHeight: 1.1, floor: 0.7, ink: 'ink', on: 'surface' },
  weekPrice: { font: BODY_FONT, weight: 600, size: 26, lineHeight: 1.2, floor: 0.7, ink: 'muted', on: 'surface' },
};

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
    highlight: YELLOW,
    placeholder: PHOTO_PLACEHOLDER,
    pillText: '#ffffff',
    pillDot: BRIGHT_TEAL,
  }),
  body: BODY_FONT,
  type: TYPE,
  // The handoff's: 4.5:1 for every line, the bright teal never copy (≈1.9:1 on cream), the orange never ink.
  rules: { minContrast: 4.5, forbiddenInks: [BRIGHT_TEAL, BOOK_NOW_ORANGE] },
  art: ({ doodles }) => [...resolveDoodles(doodles), PENCIL],
  inline: {
    eyebrowIcon: 'icon-calendar',
    eyebrowRule: 'rule-teal-wide',
    photoRule: 'rule-teal-wide',
    askRule: 'rule-teal-ask',
    whenIcon: 'icon-calendar',
    whereIcon: 'icon-pin',
    clock: 'icon-clock',
    highlighter: 'mark-yellow',
  },
  wordmark: 'assets/nest-logo-teal.png',
  // The photo in a frame has the handoff's 40 px corners (§3, Geometry).
  frame: { path: WONKY_PATH, viewBox: '0 0 960 200', stroke: 5, photoRadius: 40 },
};
