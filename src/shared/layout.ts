import type { DoodleAnchor, FlyerData } from './schema.js';
import { WEEK_ROWS_MAX } from './week.js';

/* Canvas geometry — every box position, for every output canvas, in one
   place. A flyer is one set of data; a canvas is one way to print it (the
   editor's "Story 9:16 | WhatsApp 3:4"). Adding a canvas is one more CANVASES
   entry: the renderer, the editor, both exporters and the server read the
   registry. Tops are measured from the canvas edge; each canvas's bottom
   stack is allocated upward from its floor (the bottom of its safe box). */

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

/** A point art hangs from, and the scale the art is drawn at there (1 on the story). */
export interface ArtPoint extends Point {
  scale: number;
}

export type PhotoMode = 'bleed' | 'band' | 'none';

/** What fills a flyer between its eyebrow and its ask: the Activity template's photo mode, or the
    week's rows. A week flyer keeps a photo mode (and its photo) for switching back, never uses it. */
export type Body = PhotoMode | 'week';

export const bodyOf = (d: Pick<FlyerData, 'template' | 'photoMode'>): Body => (d.template === 'week' ? 'week' : d.photoMode);

export type GroupId = 'eyebrow' | 'headline' | 'photo' | 'chips' | 'extras' | 'ask' | 'pill' | 'title' | 'rows';

/** Where each block of the Activity template sits on one canvas. */
export interface ActivityBoxes {
  eyebrow: Rect;
  headline: Rect;
  headlineNoPhoto: Rect;
  photoBleed: Rect;
  photoBand: Rect;
  noPhotoRule: Rect;
  chips: Rect;
  chipGap: number;
  extras: Rect;
  ask: Rect;
  pill: { top: number; height: number };
}

/** Where the This week template's own blocks sit on one canvas; its eyebrow, ask and pill are the Activity ones. */
export interface WeekBoxes {
  /** What’s on / this week. / the Spanish line: the Activity headline's markup, in its own box. */
  title: Rect;
  /** The box five rows fill. Fewer rows stay at its top (the owner's call, 2026-09-29). */
  rows: Rect;
  rowHeight: number;
  rowGap: number;
  /** How far below the first row's top corners the photo-corner sparks hang (artAnchors). */
  artDrop: number;
}

/** A canvas's text column: `inner(top, height)` is a box between its side margins. */
export type Column = (top: number, height: number) => Rect;

export interface CanvasSpec {
  /** The editor's toolbar button. */
  label: string;
  width: number;
  height: number;
  /** Hard limits: text and blocks stay inside; only art (and the bleed photo, horizontally) may enter. */
  safe: { top: number; bottom: number; side: number };
  /** Appended to the download's name. The story keeps today's `<slug>.png`. */
  fileSuffix: string;
  activity: ActivityBoxes;
  week: WeekBoxes;
  /** What the canvas decides about the template art; its anchor points follow from the rest (artAnchors). */
  art: {
    /** How far the photo-corner anchors sit inside the band's corners. */
    photoInset: number;
    /** The scale of the art that hangs from the bottom corners (the blobs). */
    cornerScale: number;
  };
}

const columnOf = ({ width, safe }: Pick<CanvasSpec, 'width' | 'safe'>): Column => (top, height) => ({ left: safe.side, top, width: width - 2 * safe.side, height });

/** A canvas from what it decides: its boxes are written against its own column and width. */
function defineCanvas(
  spec: Omit<CanvasSpec, 'activity' | 'week'>,
  activity: (inner: Column, width: number) => ActivityBoxes,
  week: (inner: Column) => WeekBoxes,
): CanvasSpec {
  const inner = columnOf(spec);
  return { ...spec, activity: activity(inner, spec.width), week: week(inner) };
}

/* ---- This week: the handoff §2's rows, the same size on every canvas ----
   122 px rows, 15 apart. §3's "22px between week rows" is stale: §2 explains
   that at 138/22 the fifth row reached 1478 and crossed the ask. The title box
   is 250 tall (What’s on / this week. / the Spanish line, fitted). */
const WEEK_TITLE_HEIGHT = 250;
const WEEK_ROW_HEIGHT = 122;
const WEEK_ROW_GAP = 15;

/** A canvas's week boxes: its title's top, its rows' top, and how far the sparks hang below the rows' corners. */
const weekBoxes = (inner: Column, titleTop: number, rowsTop: number, artDrop: number): WeekBoxes => ({
  title: inner(titleTop, WEEK_TITLE_HEIGHT),
  rows: inner(rowsTop, WEEK_ROWS_MAX * WEEK_ROW_HEIGHT + (WEEK_ROWS_MAX - 1) * WEEK_ROW_GAP),
  rowHeight: WEEK_ROW_HEIGHT,
  rowGap: WEEK_ROW_GAP,
  artDrop,
});

/* ---- Instagram story, 1080 × 1920 ----
   Every number from the handoff README §2. Instagram safe zones: 250 top, 300
   bottom, 70 sides. The bottom of the canvas is allocated upward from the 1620
   floor: pill, ask, extras, blocks.

   Deliberate departures from the prototype (team design pass, 2026-09-18):
   the headline block sits at 345 (was 382) to clear the sparks on the photo's
   top corners, so the eyebrow box ends at 345 (was 104 tall; its content is
   62px, so nothing moves). The blobs sit in the bottom corners and the last
   spark off the pill's end, which it follows as the pill's copy grows
   (2026-10-12); the sparks on the photo sit right on its corners. */
const STORY = defineCanvas(
  {
    label: 'Story 9:16',
    width: 1080,
    height: 1920,
    safe: { top: 250, bottom: 300, side: 70 },
    fileSuffix: '',
    art: { photoInset: 0, cornerScale: 1 },
  },
  (inner, width) => ({
    eyebrow: inner(250, 95),
    headline: inner(345, 300),
    headlineNoPhoto: inner(398, 460),
    photoBleed: { left: 0, top: 712, width, height: 380 },
    photoBand: inner(712, 380),
    noPhotoRule: { left: 240, top: 900, width: width - 480, height: 32 },
    chips: inner(1110, 206),
    chipGap: 20,
    extras: inner(1318, 40),
    ask: inner(1382, 150),
    pill: { top: 1544, height: 72 },
  }),
  // This week (handoff §2): the title at 398, where the no-photo headline starts, and five rows from 700
  // to 1370, 12 px above the ask. The sparks hang from the first row's corners (the owner's call,
  // 2026-09-29), 7 px lower than on the photo: tilted −8° and +9°, their ink reached 6.3 and 5.4 px up into
  // the title box, where the Spanish line's descenders can sit; 7 is the least that keeps it out (signed off
  // from the proof sheets, 2026-09-29).
  (inner) => weekBoxes(inner, 398, 700, 7),
);

/* ---- WhatsApp image, 1080 × 1440 (exactly 3:4) ----
   Nothing covers a WhatsApp image's edges (no profile name, no reply bar), so
   the safe zone is a plain 40 px margin (owner's call, 2026-09-23) and the
   story's stack uses the canvas: the same blocks, the same type, 60 px wider.

   One stored crop has to show the same picture on every canvas, and the crop
   maths (photo.ts) depends on the frame's aspect only: so the band keeps the
   story band's 940:380 (47:19) at the 1000 column, 1000 × 404 (404.26 exactly:
   the picture matches to within 0.1 %), and the bleed stays 1080 × 380, set on
   the band's bottom so the blocks below are shared by every photo mode, as on
   the story.

   The fitted boxes (headline, chips, extras, ask) keep the story's heights and
   are wider. That makes cut-off copy rarer here, not impossible (a wider line
   shrinks less, then needs more height), which is why the editor fits every
   canvas. The 1360 px between the margins are ~35 px short of the story's
   stack with the taller band; they come out of the gaps that carry no copy.
   From the 1400 floor up: pill (4 px above the floor, for its tilt), 10, ask,
   20, extras, 2, chips, 16, photo, 67, headline (the story's 67: the sparks on
   the photo's corners sit in it), and the eyebrow keeps the rest, 69 px for
   its 62 px of content.

   The sparks come 14 px in from the band's corners: at the 40 px margin the
   yellow one's tip would leave the canvas. The blobs hang from the corners at
   0.8: full size they reach up behind the Spanish ask line, and the
   right-hand one runs into the default pill's spark, because the 300 px
   margin they fill on the story is 40 here (the designer's 1080 × 1350
   version drew its corner blobs at 0.78 for the same reason). Scaled about
   the corner, the same share of each shows. The pill's spark keeps its size,
   and hangs from the pill's end as on the story. */
const WHATSAPP = defineCanvas(
  {
    label: 'WhatsApp 3:4',
    width: 1080,
    height: 1440,
    safe: { top: 40, bottom: 40, side: 40 },
    fileSuffix: '-whatsapp',
    art: { photoInset: 14, cornerScale: 0.8 },
  },
  (inner, width) => ({
    eyebrow: inner(40, 69),
    headline: inner(109, 300),
    // No photo: the story's spacing from the eyebrow (53), the rule 42 below the headline.
    headlineNoPhoto: inner(162, 460),
    photoBleed: { left: 0, top: 500, width, height: 380 },
    photoBand: inner(476, 404),
    noPhotoRule: { left: 240, top: 664, width: width - 480, height: 32 },
    chips: inner(896, 206),
    chipGap: 20,
    extras: inner(1104, 40),
    ask: inner(1164, 150),
    pill: { top: 1324, height: 72 },
  }),
  // This week, built as the story's (signed off from the proof sheets, 2026-09-29): the title at the
  // no-photo headline's 162, the rows the story's 52 px below it, 464 → 1134. The 18 px the shorter canvas
  // leaves over go above the shared ask (30, not 12). The sparks drop 7 px, as on the story.
  (inner) => weekBoxes(inner, 162, 464, 7),
);

export const CANVASES = { story: STORY, whatsapp: WHATSAPP } as const satisfies Record<string, CanvasSpec>;

export type CanvasId = keyof typeof CANVASES;

export const CANVAS_IDS = Object.keys(CANVASES) as CanvasId[];

/** The canvas on screen for a viewer who never chose one: the editor's preview (a stored choice wins there), the AI
    page's, and the library's cards. The owner's answer (2026-10-05): WhatsApp, where most flyers are sent.
    It is the screen's default alone. The export API (server/app.ts) and the render page (src/render/main.tsx) keep
    `story` for a request that names no canvas: that is the contract, and what an editor from before canvases sends. */
export const DEFAULT_CANVAS: CanvasId = 'whatsapp';

/** Own keys only: `in` would let '__proto__' or 'toString' through. */
export function isCanvasId(value: unknown): value is CanvasId {
  return typeof value === 'string' && Object.hasOwn(CANVASES, value);
}

export function safeBox(canvas: CanvasId): Rect {
  const { width, height, safe } = CANVASES[canvas];
  return { left: safe.side, top: safe.top, width: width - 2 * safe.side, height: height - safe.top - safe.bottom };
}

/** The boxes both templates share: the eyebrow, the ask and the pill. */
function sharedGroups(canvas: CanvasId): Pick<Record<GroupId, Rect>, 'eyebrow' | 'ask' | 'pill'> {
  const a = CANVASES[canvas].activity;
  return { eyebrow: a.eyebrow, ask: a.ask, pill: columnOf(CANVASES[canvas])(a.pill.top, a.pill.height) };
}

/** Where the tag pill sits on a canvas, for both templates: the safe column across, at the stack's pill row. The
    pill is copy on a ground, so it stays inside this width (Flyer.tsx fits the letters to it). */
export const pillBox = (canvas: CanvasId): Rect => sharedGroups(canvas).pill;

/** The fixed boxes of the Activity template on a canvas, for a photo mode. */
export function activityGroups(canvas: CanvasId, mode: PhotoMode): Partial<Record<GroupId, Rect>> {
  const a = CANVASES[canvas].activity;
  const { eyebrow, ask, pill } = sharedGroups(canvas);
  const groups: Partial<Record<GroupId, Rect>> = {
    eyebrow,
    headline: mode === 'none' ? a.headlineNoPhoto : a.headline,
    chips: a.chips,
    extras: a.extras,
    ask,
    pill,
  };
  if (mode === 'bleed') groups.photo = a.photoBleed;
  if (mode === 'band') groups.photo = a.photoBand;
  if (mode === 'none') groups.photo = a.noPhotoRule;
  return groups;
}

/** The fixed boxes of the This week template on a canvas: its own title and rows, the Activity eyebrow, ask and pill. */
export function weekGroups(canvas: CanvasId): Partial<Record<GroupId, Rect>> {
  const w = CANVASES[canvas].week;
  const { eyebrow, ask, pill } = sharedGroups(canvas);
  return { eyebrow, title: w.title, rows: w.rows, ask, pill };
}

/** Where the printed row in `slot` sits: rows stack from the top of the rows box, whatever their number. */
export function weekRowRect(canvas: CanvasId, slot: number): Rect {
  const { rows, rowHeight, rowGap } = CANVASES[canvas].week;
  return { left: rows.left, top: rows.top + slot * (rowHeight + rowGap), width: rows.width, height: rowHeight };
}

export function overlaps(a: Rect, b: Rect): boolean {
  return (
    a.left < b.left + b.width &&
    b.left < a.left + a.width &&
    a.top < b.top + b.height &&
    b.top < a.top + a.height
  );
}

export function inside(inner: Rect, outer: Rect, tolerance = 0): boolean {
  return (
    inner.left >= outer.left - tolerance &&
    inner.top >= outer.top - tolerance &&
    inner.left + inner.width <= outer.left + outer.width + tolerance &&
    inner.top + inner.height <= outer.top + outer.height + tolerance
  );
}

/** How wide the tag pill is with the copy every flyer starts with (@NESTSHOSTELS · ¡TAG US!), measured in the
    browser (pill.spec.ts holds it). The design pass set the spark off the pill's end against this pill. */
export const DEFAULT_PILL_WIDTH = 585;

/** Stored anchors, plus the ones only the template's own art uses (defaults.ts). */
export type ArtAnchor = DoodleAnchor | 'bottomLeft' | 'bottomRight' | 'pillEnd';

/** Where art hangs from on a canvas, for a flyer's body. The one statement of
    the rule (schema.ts and defaults.ts point here):
    - canvas: the canvas's top-left, so x/y are canvas px on every canvas;
    - photoLeft / photoRight: the band's top corners, moved in by the canvas's
      photoInset (the band's, even in bleed, so the art stays on canvas), at the
      top of the photo on screen (the bleed's top in bleed mode); with no photo,
      the ends of the brush rule; on a week flyer, the first row's top corners,
      moved in the same way and down by the week's artDrop (the owner's call,
      2026-09-29: the rows take the photo's place);
    - bottomLeft / bottomRight: the canvas's bottom corners, at its cornerScale;
    - pillEnd: the right end of the tag pill, at the top of its row. The pill is as wide as its copy, which is
      known only once its letters are fitted, so this point is where the default pill ends (it is centred): the
      renderer hangs the art from the end of the pill it draws, at the same offsets (Flyer.tsx), and a flyer that
      prints no pill keeps the art here.
    placeArt() puts a piece there. */
export function artAnchors(canvas: CanvasId, body: Body): Record<ArtAnchor, ArtPoint> {
  const { width, height, activity: a, week: w, art } = CANVASES[canvas];
  let photoLeft: ArtPoint;
  let photoRight: ArtPoint;
  if (body === 'none') {
    const r = a.noPhotoRule;
    photoLeft = { x: r.left, y: r.top, scale: 1 };
    photoRight = { x: r.left + r.width, y: r.top, scale: 1 };
  } else if (body === 'week') {
    const y = w.rows.top + w.artDrop;
    photoLeft = { x: w.rows.left + art.photoInset, y, scale: 1 };
    photoRight = { x: w.rows.left + w.rows.width - art.photoInset, y, scale: 1 };
  } else {
    const b = a.photoBand;
    const top = body === 'bleed' ? a.photoBleed.top : b.top;
    photoLeft = { x: b.left + art.photoInset, y: top, scale: 1 };
    photoRight = { x: b.left + b.width - art.photoInset, y: top, scale: 1 };
  }
  return {
    canvas: { x: 0, y: 0, scale: 1 },
    photoLeft,
    photoRight,
    bottomLeft: { x: 0, y: height, scale: art.cornerScale },
    bottomRight: { x: width, y: height, scale: art.cornerScale },
    pillEnd: { x: (width + DEFAULT_PILL_WIDTH) / 2, y: a.pill.top, scale: 1 },
  };
}

/** Where a piece of art lands: its anchor point plus its offset, both at the
    anchor's scale, and drawn w × scale wide. The renderer's only placement rule. */
export function placeArt(d: { anchor?: ArtAnchor; x: number; y: number; w: number }, anchors: Record<ArtAnchor, ArtPoint>) {
  const o = anchors[d.anchor ?? 'canvas'];
  return { left: o.x + d.x * o.scale, top: o.y + d.y * o.scale, width: d.w * o.scale };
}

/** Photo frame size per canvas and body, for crop maths. No photo, and a week flyer, have none. */
export function photoFrame(canvas: CanvasId, body: Body): { width: number; height: number } | null {
  const a = CANVASES[canvas].activity;
  if (body === 'bleed') return { width: a.photoBleed.width, height: a.photoBleed.height };
  if (body === 'band') return { width: a.photoBand.width, height: a.photoBand.height };
  return null;
}
