import { ARCHIVO_BLACK_FAMILY, ARCHIVO_BLACK_FONT, BODY_FAMILY, BODY_FONT, CAVEAT_BRUSH_FAMILY, CAVEAT_BRUSH_FONT } from '../fonts.js';
import type { Geometry } from '../layout.js';
import type { ArtPlacement, Look, Palette } from '../looks.js';

/* The Sunset Vibes look: Duque Nest's sunset flyer (Sunset Merge v2), ported from Claude Design's handoff
   (design_handoff_new_look/design_handoff_sunset_vibes/README.md) by the stages of docs/prompts/sunset-vibes-look.md,
   with Artur's answers of 2026-10-30. Stage 1 (2026-10-30) is the look as data inside the seam: it prints in the app's
   shared layout, in its own type, palette and art. The design's own kinds (the photo behind everything, the staggered
   tilted headline, the streaks, the columns, the lockup on the blob, This week B) come by stage, each a token the one
   renderer reads; until then the numbers here are the design's where today's kinds can print them, and the shared
   table's where they cannot. Day is its only colour set yet. It ignores data.colors and data.doodles: those are
   hand-drawn's own. */

/** Day, the first of the design's six colour sets (README §3.2): the ground and three inks, and the roles that follow
    from them on a light ground (§3.1). This look prints the website's orange (Artur, 2026-10-30: 3:1 at headline
    scale), which hand-drawn forbids. */
const DAY = {
  ground: '#FFFFFF',
  hot: '#EA580C',
  accent: '#0D6F82',
  value: '#C2410C',
  ink: '#0D6F82',
  muted: '#35606E',
  line: '#0D6F82',
  placeholder: '#CFE7F0',
} as const;

/** The hex of an ink as the art files carry it: lower case, no '#'. */
const hexOf = (colour: string) => colour.slice(1).toLowerCase();

/** The icons, as the handoff draws them (README §5: Lucide, placeholders until Nest's own; the clock custom), each a
    PNG in the line colour made by `npm run gen:art` (scripts/art-sunset-icons.ts) from these paths: one file per ink,
    named by it (sunsetIconSlug). `drawn` is the SVG's size in the design, `scale` what the design scales it by in its
    box, `stroke` the stroke width in the view box's units. */
export const SUNSET_ICONS = {
  clock: { viewBox: '0 0 69 69', drawn: 69, scale: 1.2, stroke: 3.6, body: '<circle cx="34.5" cy="34.5" r="32.6"/><path d="M34.5 15V34.5L47.5 41"/>' },
  pin: {
    viewBox: '0 0 24 24',
    drawn: 76,
    scale: 1.2,
    stroke: 1.137,
    body: '<path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>',
  },
  euro: {
    viewBox: '0 0 24 24',
    drawn: 76,
    scale: 1.2,
    stroke: 1.137,
    body: '<path d="M4 10h12"/><path d="M4 14h9"/><path d="M19 6a7.7 7.7 0 0 0-5.2-2A7.900 7.900 0 0 0 6 12c0 4.4 3.5 8 7.8 8 2 0 3.800-.8 5.200-2"/>',
  },
  pen: {
    viewBox: '0 0 24 24',
    drawn: 72,
    scale: 1.12,
    stroke: 1.2,
    body: '<path d="M12 20h9"/><path d="M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.854z"/>',
  },
} as const;

export type SunsetIcon = keyof typeof SUNSET_ICONS;

/** The file an icon is drawn from in an ink: assets/art/<slug>.png. */
export const sunsetIconSlug = (icon: SunsetIcon, ink: string) => `sunset-icon-${icon}-${hexOf(ink)}`;

/** The Nests wordmark in an ink (the handoff ships one per ink its sets print). */
const wordmarkIn = (ink: string) => `assets/art/sunset-wordmark-${hexOf(ink)}.png`;

/** The design's boxes (the plan's geometry table: the readouts of the v4 proof, README §6.1), stage 2 (2026-10-30).
    The photo is background art behind everything (Artur's decision 1), one shape on both canvases, 1080 × 948, its
    box starting above the canvas on WhatsApp so its bottom part shows (decision 2); In a frame prints exactly as Full
    bleed and No photo the placeholder in the same box (answers 6 and 7: photoBehind). Every text box at the design's
    top and height: the headline box starts where SUNSET's ink does, 193 above the photo's bottom, and keeps 320 for a
    long Spanish line; the chips touch (the kind to come draws rules between them); the pill box is the plain line's
    slot. The week's title and rows are transitional until This week B (stage 6): the title under the taller eyebrow,
    five rows above the Activity ask. The band along the bottom keeps its size on WhatsApp (the shared 0.8 shrinks the
    corner art there). */
const GEOMETRY: Geometry = {
  photoBehind: true,
  story: {
    boxes: {
      eyebrow: { height: 173.2 },
      headline: { top: 755, height: 320 },
      headlineNoPhoto: { top: 755, height: 320 },
      photoBleed: { top: 0, height: 948 },
      chips: { top: 1103, height: 206.3 },
      extras: { top: 1313, height: 36 },
      ask: { top: 1353.3, height: 188 },
      pill: { top: 1572, height: 44 },
      weekTitle: { top: 593 },
    },
    chipGap: 0,
    rowsTop: 938,
    rowHeight: 64,
    rowGap: 20,
  },
  whatsapp: {
    boxes: {
      eyebrow: { height: 163.4 },
      headline: { top: 436.2, height: 320 },
      headlineNoPhoto: { top: 436.2, height: 320 },
      photoBleed: { top: -318.8, height: 948 },
      chips: { top: 784.2, height: 206.3 },
      extras: { top: 994, height: 36 },
      ask: { top: 1034.5, height: 188 },
      pill: { top: 1253, height: 44 },
      weekTitle: { top: 378.3 },
    },
    chipGap: 0,
    rowsTop: 640,
    rowHeight: 64,
    rowGap: 15,
    cornerScale: 1,
  },
};

/** Day's palette for every flyer: a flyer's stored colours are hand-drawn's. No chip fill and no highlighter, so the
    surface and the highlight are the ground. The pill's letters are the ground on the accent while today's pill kind
    prints it; the line kind (Artur's answer 4) prints ink on the ground, with the dot in the line colour. */
const PALETTE: Palette = {
  ground: DAY.ground,
  ink: DAY.ink,
  accent: DAY.accent,
  muted: DAY.muted,
  surface: DAY.ground,
  highlight: DAY.ground,
  placeholder: DAY.placeholder,
  pillText: DAY.ground,
  pillDot: DAY.line,
  hot: DAY.hot,
  value: DAY.value,
  line: DAY.line,
};

const M = BODY_FONT;

/** Every line of copy, as the handoff's type table sets it (README §4), Day's inks. The headline words are fitted
    (floor 0.6) and held to 3:1 (§7.14); the labels, the asks and the row text are never shrunk (§7.17: no floor), the
    Spanish line keeps a floor of 0.8 for its 260 characters. Until the kinds that place them arrive: the words print
    upright and stacked (their tilt comes with the staggered kind), the extras as today's fitted row (floor 0.8, the
    notes line later), the pill with today's kind. */
const TYPE: Look['type'] = {
  eyebrow: { font: M, weight: 600, size: 24.3, lineHeight: 1, spacing: '0.1em', upper: true, ink: 'ink', on: 'ground' },
  headline1: { font: ARCHIVO_BLACK_FONT, weight: 400, size: 144.64, lineHeight: 1, spacing: '-0.02em', upper: true, floor: 0.6, minContrast: 3, ink: 'hot', on: 'ground' },
  headline2: { font: CAVEAT_BRUSH_FONT, weight: 400, size: 188.17, lineHeight: 1, spacing: '-0.02em', floor: 0.6, minContrast: 3, ink: 'accent', on: 'ground' },
  spanish: { font: M, weight: 500, size: 22, lineHeight: 1.2, spacing: '0.2em', upper: true, floor: 0.8, ink: 'muted', on: 'ground' },
  chipLabel: { font: M, weight: 700, size: 22, lineHeight: 1.2045, upper: true, ink: 'ink', on: 'surface' },
  // Unused while the COST chip has its icon: the € as the design's value, should an ink ever lack the file.
  costGlyph: { font: M, weight: 700, size: 24, lineHeight: 1, ink: 'value', on: 'surface' },
  chipBig: { font: M, weight: 700, size: 24, lineHeight: 1.15, upper: true, floor: 0.6, ink: 'value', on: 'surface' },
  chipBigMarked: { font: M, weight: 700, size: 24, lineHeight: 1.15, upper: true, floor: 0.6, ink: 'value', on: 'highlight' },
  chipTime: { font: M, weight: 700, size: 44, lineHeight: 1.15, spacing: '-0.03em', floor: 0.6, ink: 'value', on: 'surface' },
  chipSmall: { font: M, weight: 500, size: 20, lineHeight: 1.2, upper: true, ink: 'muted', on: 'surface' },
  extras: { font: M, weight: 400, size: 17, lineHeight: 1.3235, floor: 0.8, gap: 16, ink: 'muted', on: 'ground' },
  askEn: { font: M, weight: 700, size: 22, lineHeight: 1.2045, spacing: '0.03em', upper: true, ink: 'ink', on: 'ground' },
  askEs: { font: M, weight: 500, size: 19.5, lineHeight: 1.205, upper: true, ink: 'muted', on: 'ground' },
  pill: { font: M, weight: 700, size: 22, lineHeight: 1, spacing: '0.03em', upper: true, floor: 0.7, ink: 'pillText', on: 'accent' },
  weekDay: { font: M, weight: 700, size: 22, lineHeight: 1.2045, spacing: '0.02em', upper: true, ink: 'value', on: 'highlight' },
  weekName: { font: M, weight: 700, size: 26, lineHeight: 1.1923, upper: true, ink: 'ink', on: 'surface' },
  weekTime: { font: M, weight: 700, size: 34, lineHeight: 1.15, spacing: '-0.03em', floor: 0.6, ink: 'ink', on: 'surface' },
  weekPrice: { font: M, weight: 700, size: 20, lineHeight: 1.2, spacing: '0.02em', upper: true, ink: 'ink', on: 'surface' },
  weekPriceSub: { font: M, weight: 500, size: 18, lineHeight: 1.2222, upper: true, ink: 'muted', on: 'surface' },
};

/** The art, in the handoff's draw order (README §1.1, §5), over the photo behind everything: the splash in the ground
    colour over the photo's bottom 448.81 px (the Day pre-fill of the mask), the confetti over the photo's place and
    the top-right botanical in canvas px, the three botanicals along the splash's edge from the photo's bottom (fixed
    there: the design moves them to clear text, the app does not), and the band along the bottom, from the bottom-left
    corner at full size on both canvases. The band's y is the file's drawn height at 1080 wide (1131 × 287), so its
    bottom edge is the canvas's (§5 says −273.21, from the design board's floor). With no photo box to hang from (a
    week flyer, until stage 6) the pieces at the photo's bottom are not drawn. The blob and the lower ferns hang from
    the canvas's top and the blocks' bottom: anchors their stages add. */
const ART: ArtPlacement[] = [
  { slug: 'sunset-splash-day', anchor: 'photoBottom', x: 0, y: -448.81, w: 1080, rot: 0 },
  { slug: 'sunset-confetti-day', x: 182.39, y: 3.82, w: 804.03, rot: 0 },
  { slug: 'sunset-bot-fern-w', anchor: 'photoBottom', x: 0, y: -484.14, w: 150.88, rot: 0 },
  { slug: 'sunset-bot-tr', x: 806.9, y: 0, w: 269.28, rot: 0 },
  { slug: 'sunset-bot-fern-r', anchor: 'photoBottom', x: 997.88, y: -394.38, w: 82.12, rot: 0 },
  { slug: 'sunset-bot-monstera', anchor: 'photoBottom', x: 94.54, y: -401.07, w: 219.63, rot: 0 },
  { slug: 'sunset-bot-band', anchor: 'bottomLeft', x: 0, y: -274.06, w: 1080, rot: 0 },
];

export const SUNSET_VIBES: Look = {
  id: 'sunset-vibes',
  name: 'Sunset Vibes',
  geometry: GEOMETRY,
  palette: () => PALETTE,
  body: M,
  faces: [
    { family: ARCHIVO_BLACK_FAMILY, weight: 400 },
    { family: CAVEAT_BRUSH_FAMILY, weight: 400 },
    { family: BODY_FAMILY, weight: 400 },
    { family: BODY_FAMILY, weight: 500 },
    { family: BODY_FAMILY, weight: 600 },
    { family: BODY_FAMILY, weight: 700 },
  ],
  type: TYPE,
  // 4.5:1 for the copy, 3:1 where a line says so (the headline words); no ink forbidden: the orange is its own.
  rules: { minContrast: 4.5, forbiddenInks: [] },
  art: () => ART,
  // No rules, no clock before the time, no highlighter (README §5): the icons alone, in the line colour.
  inline: {
    eyebrowIcon: null,
    eyebrowRule: null,
    photoRule: null,
    askRule: null,
    whenIcon: sunsetIconSlug('clock', DAY.line),
    whereIcon: sunsetIconSlug('pin', DAY.line),
    costIcon: sunsetIconSlug('euro', DAY.line),
    askIcon: sunsetIconSlug('pen', DAY.line),
    clock: null,
    highlighter: null,
  },
  wordmark: wordmarkIn(DAY.ink),
  // No frames (README §7.7): a plain box with no stroke, filled with the ground, and square photo corners.
  frame: { path: 'M0 0 H 960 V 200 H 0 Z', viewBox: '0 0 960 200', stroke: 0, photoRadius: 0 },
  // A plain line in the footer's slot (Artur's answer 4): until its kind exists, today's box with no corners and no tilt.
  pill: { radius: 0, tilt: 0, padding: '10px 24px 12px', gap: 18, dot: 8 },
  // The badge beside the wordmark, as hand-drawn (Artur's answer 2), at today's height until the lockup's own box.
  marks: { which: 'both', height: 56 },
};
