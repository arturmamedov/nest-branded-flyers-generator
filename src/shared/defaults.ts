import { artAnchors, type ArtAnchor, type PhotoMode } from './layout.js';
import { DEFAULT_CROP } from './photo.js';
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

/** The marks at the eyebrow's right, on a flyer whose hostel has a badge (its logo_path in seed/hostels.json):
    'nests', the Nests wordmark alone, as before the badges; 'hostel', the hostel's badge alone; 'both', the badge
    beside the wordmark. One setting for every flyer, changed here and never per flyer: the owner picked 'both' for a
    pilot, and will settle on one format after it (2026-09-30). */
export type EyebrowMarks = 'nests' | 'hostel' | 'both';
export const EYEBROW_MARKS: EyebrowMarks = 'both';

/** The marks a flyer prints, left to right. Chain-wide, or at a hostel with no badge, only the wordmark can print. */
export function marksFor(hasBadge: boolean, marks: EyebrowMarks = EYEBROW_MARKS): ('badge' | 'nests')[] {
  if (!hasBadge || marks === 'nests') return ['nests'];
  return marks === 'hostel' ? ['badge'] : ['badge', 'nests'];
}

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

/** Art as the renderer places it: x/y are offsets from an anchor point of the canvas (layout.ts, artAnchors). */
export interface ArtPlacement extends Omit<DoodlePlacement, 'anchor'> {
  anchor?: ArtAnchor;
}

/* What the canvas-anchored pieces of DEFAULT_DOODLES follow from canvas to
   canvas: the blobs the bottom corners, the spark off the tag pill the pill's
   own end, so it moves as the pill's copy grows (Artur, 2026-10-12; it hung
   from the stack's floor, and a long pill covered it). The two sparks on the
   photo carry their anchors already. Only the renderer uses these anchors, so
   the stored data stays DEFAULT_DOODLES as every flyer has it (no migration,
   and an older release still reads it). */
const FOLLOWS: Record<string, ArtAnchor> = { 'blob-yellow': 'bottomLeft', 'blob-teal': 'bottomRight', 'spark-teal': 'pillEnd' };

/** The corner blobs print in each other's ink (Artur, 2026-10-12): teal in the left corner, yellow in the right,
    where a long pill carries its spark. The spark is teal, as the pill it hangs from, and was lost on the teal blob.
    Each blob keeps its drawing and its place. The file drawn → the drawing it keeps and the blob whose ink it
    takes: scripts/art-inks.ts makes the files from this (npm run gen:art). */
export const SWAPPED_BLOBS = {
  'blob-left-teal': { drawing: 'blob-yellow', ink: 'blob-teal' },
  'blob-right-yellow': { drawing: 'blob-teal', ink: 'blob-yellow' },
} as const;

/** The file the template draws for a stored slug: the blobs' swapped inks, and every other piece its own. */
const DRAWN: Record<string, string> = Object.fromEntries(Object.entries(SWAPPED_BLOBS).map(([file, { drawing }]) => [drawing, file]));

/** DEFAULT_DOODLES re-expressed from the story's anchor points. Derived, and
    exact: x − p + p is x again for these numbers (shared.test.ts checks it). */
const TEMPLATE_ART: ArtPlacement[] = DEFAULT_DOODLES.map((d) => {
  if (d.anchor) return d;
  const anchor = FOLLOWS[d.slug];
  const p = artAnchors('story', 'band')[anchor];
  return { ...d, slug: DRAWN[d.slug] ?? d.slug, anchor, x: d.x - p.x, y: d.y - p.y };
});

/** The art to draw. An untouched template set follows the template onto every
    canvas, in the inks the template prints today; art someone arranged keeps
    the anchors they gave it (canvas px, or the photo's corners, as artAnchors
    defines them) and the drawings it names. */
export function resolveDoodles(doodles: DoodlePlacement[]): ArtPlacement[] {
  return sameDoodles(doodles, DEFAULT_DOODLES) ? TEMPLATE_ART : doodles;
}

/** Each template's eyebrow on a new flyer. Switching template swaps it while it is still this. */
export const DEFAULT_EYEBROW: Record<Template, string> = { activity: 'NEXT ACTIVITY', week: 'THIS WEEK' };

export const DEFAULT_TEXT: FlyerText = {
  eyebrow: DEFAULT_EYEBROW.activity,
  headline1: '',
  headline2: '',
  headlineEs: '',
  askEn: 'Sign up at reception.',
  askEs: 'Apúntate en recepción.',
  handle: '@NESTSHOSTELS',
  tag: '¡TAG US!',
};

/** A new flyer's photo sits in the drawn frame, and so does a photo dropped while "No photo" is on (Editor.tsx) —
    hence never 'none'. The owner's choice (2026-09-28), superseding handoff §1 item 4 ("full bleed (default)"). */
export const DEFAULT_PHOTO_MODE: Exclude<PhotoMode, 'none'> = 'band';

/** A flyer once a photo lands on it: on "No photo" it shows in the default mode, a mode already chosen stays, and the
    crop starts over, since the one stored was another photo's. One function for every way a photo arrives: chosen or
    dropped in the editor, and the picture an idea was read from, taken along from the AI page. */
export function withPhoto(d: FlyerData): FlyerData {
  return { ...d, photoCrop: { ...DEFAULT_CROP }, photoMode: d.photoMode === 'none' ? DEFAULT_PHOTO_MODE : d.photoMode };
}

/** The week's title lines, prefilled and editable (the owner's call, 2026-09-29; the prototype fixed them).
    They are the headline's fields: a week flyer has no headline of its own. The Spanish line names the
    hostel, or the whole chain on a chain-wide flyer, as the prototype did. */
export function weekTitle(hostelName: string | null): Pick<FlyerText, 'headline1' | 'headline2' | 'headlineEs'> {
  return { headline1: 'What’s on', headline2: 'this week.', headlineEs: `El plan de la semana en ${hostelName || 'Nests Hostels'}.` };
}

const TITLE_LINES = ['headline1', 'headline2', 'headlineEs'] as const;

/** A flyer shown with the other template. Nothing is dropped: the photo, chips and extras wait on a week
    flyer, the rows on an Activity one, for switching back. Only defaults nobody touched follow: the
    eyebrow, the week's title lines (filled when the headline is empty, cleared when untouched). So an
    untouched flyer switched and back is exactly what it was, and nothing reads as unsaved. */
export function switchTemplate(d: FlyerData, to: Template, hostelName: string | null): FlyerData {
  if (d.template === to) return d;
  const title = weekTitle(hostelName);
  const text = { ...d.text, eyebrow: d.text.eyebrow === DEFAULT_EYEBROW[d.template] ? DEFAULT_EYEBROW[to] : d.text.eyebrow };
  if (to === 'week' && TITLE_LINES.every((k) => !text[k])) Object.assign(text, title);
  if (to === 'activity' && TITLE_LINES.every((k) => text[k] === title[k])) Object.assign(text, { headline1: '', headline2: '', headlineEs: '' });
  return { ...d, template: to, text };
}

/** A week flyer's Spanish line follows the hostel while it still reads as the default for the one before. */
export function followHostel(d: FlyerData, prevName: string | null, nextName: string | null): FlyerData {
  if (d.template !== 'week' || d.text.headlineEs !== weekTitle(prevName).headlineEs) return d;
  return { ...d, text: { ...d.text, headlineEs: weekTitle(nextName).headlineEs } };
}

export function newFlyerData(template: Template = 'activity'): FlyerData {
  return {
    v: 1,
    template,
    photoMode: DEFAULT_PHOTO_MODE,
    photoCrop: { ...DEFAULT_CROP },
    showPill: true,
    text: { ...DEFAULT_TEXT, eyebrow: DEFAULT_EYEBROW[template], ...(template === 'week' ? weekTitle(null) : {}) },
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
    share: '',
  };
}
