import type { Geometry } from '../../src/shared/layout.js';
import type { ArtPlacement, Look } from '../../src/shared/looks.js';
import { PROOF_LOOK_ID } from './id.js';

/* The proof look (docs/prompts/looks-seam.md, "The throwaway look"; the owner's answer 14): a second look that never
   ships and stays in the tests as a canary. It differs from hand-drawn in every token, so a renderer that still prints
   one of hand-drawn's colours, faces, files or boxes where it should read the look is caught by its specs
   (tests/render/looks.spec.ts): a dark ground under the white wordmark, a face hand-drawn does not load, the art
   files hand-drawn never draws, and boxes of its own size on each canvas, the photo's shape among them.

   Its data lives here and nowhere under src/: only the tests' own build (vite.proof.config.ts, tests/proof/server.ts)
   and its unit tests register it (register.ts). Like a look's file in src/shared/looks/, it imports no value from
   schema.ts or what loads it. */

/** Its face: a devDependency, imported by the tests' build alone (fonts.css here). Not in src/shared/fonts.ts, whose
    families are the shipped looks'. */
export const PROOF_FAMILY = 'Space Mono';
const MONO = `'${PROOF_FAMILY}', monospace`;

/* Its boxes. On the story: the photo shorter (940 × 320, so another cut of the same crop), the headline and the fitted
   boxes below it taller, the week's rows shorter and further apart. On WhatsApp the same shapes, the stack built
   from the top: each fitted box at least the story's, each photo mode the story's shape (the band 1000 × 340, the
   bleed 1080 × 320). tests/geometry.ts holds it, as every look. */
const GEOMETRY: Geometry = {
  story: {
    boxes: {
      eyebrow: { height: 90 },
      headline: { height: 340 },
      headlineNoPhoto: { height: 440 },
      photoBleed: { top: 700, height: 320 },
      photoBand: { top: 700, height: 320 },
      noPhotoRule: { top: 860, height: 24 },
      chips: { top: 1040, height: 240 },
      extras: { top: 1290, height: 50 },
      ask: { top: 1350, height: 170 },
      pill: { top: 1530 },
      weekTitle: { top: 380, height: 270 },
    },
    chipGap: 28,
    rowsTop: 680,
    rowHeight: 110,
    rowGap: 20,
    photoInset: 20,
    cornerScale: 0.7,
    artDrop: 12,
  },
  whatsapp: {
    boxes: {
      eyebrow: { height: 64 },
      headline: { top: 104, height: 340 },
      headlineNoPhoto: { top: 120, height: 440 },
      photoBleed: { top: 464, height: 320 },
      photoBand: { top: 444, height: 340 },
      noPhotoRule: { top: 600, height: 24 },
      chips: { top: 790, height: 240 },
      extras: { top: 1032, height: 50 },
      ask: { top: 1086, height: 170 },
      pill: { top: 1262 },
      weekTitle: { top: 120, height: 270 },
    },
    chipGap: 28,
    rowsTop: 420,
    rowHeight: 110,
    rowGap: 20,
    photoInset: 30,
    cornerScale: 0.6,
    artDrop: 12,
  },
};

/** Its art, the same on every flyer (it never reads data.doodles, which are hand-drawn's): one piece at each point a
    look's art may hang from. */
const ART: ArtPlacement[] = [
  { slug: 'blob-teal', anchor: 'photoLeft', x: -30, y: -40, w: 80, rot: 12 },
  { slug: 'blob-yellow', anchor: 'photoRight', x: -50, y: -40, w: 80, rot: -12 },
  { slug: 'spark-yellow', anchor: 'bottomLeft', x: 30, y: -230, w: 140, rot: 20 },
  { slug: 'frame-box-sm', anchor: 'bottomRight', x: -260, y: -200, w: 220, rot: -6 },
  { slug: 'spark-yellow', anchor: 'pillEnd', x: 12, y: -24, w: 60, rot: 30, flipX: true },
  { slug: 'blob-teal', anchor: 'askEnd', x: 20, y: 10, w: 70, rot: 0, opacity: 0.8 },
];

export const PROOF_LOOK: Look = {
  id: PROOF_LOOK_ID,
  name: 'Proof',
  geometry: GEOMETRY,
  // Its own colours on every flyer: data.colors are hand-drawn's.
  palette: () => ({
    ground: '#1B2A41',
    ink: '#F4EFE6',
    accent: '#FFC27A',
    muted: '#C3CEDB',
    surface: '#24364F',
    highlight: '#5B2A86',
    placeholder: '#33445C',
    pillText: '#1B2A41',
    pillDot: '#8FE3C0',
  }),
  body: MONO,
  faces: [
    { family: PROOF_FAMILY, weight: 400 },
    { family: PROOF_FAMILY, weight: 700 },
  ],
  type: {
    eyebrow: { font: MONO, weight: 700, size: 32, lineHeight: 1.1, spacing: '0.06em', upper: true, ink: 'ink', on: 'ground' },
    headline1: { font: MONO, weight: 700, size: 84, lineHeight: 1.1, floor: 0.45, ink: 'ink', on: 'ground' },
    headline2: { font: MONO, weight: 700, size: 108, lineHeight: 1.05, floor: 0.45, ink: 'accent', on: 'ground' },
    spanish: { font: MONO, weight: 400, size: 32, lineHeight: 1.3, floor: 0.75, ink: 'muted', on: 'ground' },
    chipLabel: { font: MONO, weight: 400, size: 24, spacing: '0.2em', upper: true, ink: 'accent', on: 'surface' },
    costGlyph: { font: MONO, weight: 700, size: 34, lineHeight: 1.1, ink: 'accent', on: 'surface' },
    chipBig: { font: MONO, weight: 700, size: 38, lineHeight: 1.15, floor: 0.5, ink: 'ink', on: 'surface' },
    chipBigMarked: { font: MONO, weight: 700, size: 38, lineHeight: 1.25, floor: 0.5, ink: 'ink', on: 'highlight' },
    chipTime: { font: MONO, weight: 700, size: 36, lineHeight: 1.15, floor: 0.65, ink: 'ink', on: 'surface' },
    chipSmall: { font: MONO, weight: 400, size: 28, lineHeight: 1.25, floor: 0.65, ink: 'ink', on: 'surface' },
    extras: { font: MONO, weight: 700, size: 26, spacing: '0.04em', floor: 0.75, gap: 20, ink: 'ink', on: 'ground' },
    askEn: { font: MONO, weight: 700, size: 54, lineHeight: 1.12, floor: 0.6, ink: 'ink', on: 'ground' },
    askEs: { font: MONO, weight: 400, size: 30, lineHeight: 1.25, floor: 0.75, ink: 'muted', on: 'ground' },
    pill: { font: MONO, weight: 700, size: 30, lineHeight: 1.1, spacing: '0.08em', floor: 0.65, ink: 'pillText', on: 'accent' },
    weekDay: { font: MONO, weight: 700, size: 30, lineHeight: 1.15, floor: 0.65, ink: 'ink', on: 'highlight' },
    weekName: { font: MONO, weight: 700, size: 38, lineHeight: 1.1, floor: 0.55, ink: 'accent', on: 'surface' },
    weekTime: { font: MONO, weight: 700, size: 30, lineHeight: 1.15, floor: 0.65, ink: 'ink', on: 'surface' },
    weekPrice: { font: MONO, weight: 400, size: 24, lineHeight: 1.25, floor: 0.65, ink: 'muted', on: 'surface' },
  },
  // Its own numbers, stricter than hand-drawn's, and an ink of its own forbidden: its rules are its own.
  rules: { minContrast: 7, forbiddenInks: ['#FF0000'] },
  art: () => ART,
  inline: {
    eyebrowIcon: 'spark-yellow',
    eyebrowRule: 'frame-box-wide',
    photoRule: 'frame-box-wide',
    askRule: 'frame-box',
    whenIcon: 'blob-teal',
    whereIcon: 'blob-yellow',
    clock: 'spark-yellow',
    highlighter: 'frame-box-sm',
  },
  wordmark: 'assets/nest-logo-white.png',
  // A plain box, a thin stroke, square corners on the photo.
  frame: { path: 'M6 6 H 954 V 194 H 6 Z', viewBox: '0 0 960 200', stroke: 3, photoRadius: 0 },
  pill: { radius: 0, tilt: 0.4, padding: '12px 30px 14px', gap: 12, dot: 10 },
};
