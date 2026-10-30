import type { EyebrowMarks } from './defaults.js';
import type { ArtAnchor, Geometry } from './layout.js';
import { HAND_DRAWN } from './looks/handDrawn.js';
import { SUNSET_VIBES } from './looks/sunsetVibes.js';
import type { DoodlePlacement, FlyerData } from './schema.js';

/* The looks a flyer can print in (docs/prompts/looks-seam.md; the owner's answers, 2026-10-13 and 2026-10-14). One
   renderer draws every look: a look is an entry here, which the renderer reads through lookOf(), and never a branch
   on its id. A new look is one file in looks/ and one line in the registry below; its id is forever once a release
   accepts it, since flyers store it (data.look).

   DOM-free and zod-free, as layout.ts: the editor, the render page, both servers' schema and the scripts read it.
   The hand-drawn look's own values live in looks/handDrawn.ts. Nothing here imports a value from schema.ts,
   defaults.ts or what loads them: schema.ts reads the ids from here. */

/** Art as the renderer places it: x/y are offsets from an anchor point of the canvas (layout.ts, artAnchors). */
export interface ArtPlacement extends Omit<DoodlePlacement, 'anchor'> {
  anchor?: ArtAnchor;
}

/** A look's colours, by what each one paints. */
export interface Palette {
  /** The flyer's background. */
  readonly ground: string;
  /** Most copy, and the frames' strokes. */
  readonly ink: string;
  /** The headline's second line, the chips' labels, the week's names, the extras' dots, the pill's ground. */
  readonly accent: string;
  /** The Spanish lines under the English ones. */
  readonly muted: string;
  /** Inside the chips and the week's rows. */
  readonly surface: string;
  /** The highlighter's colour, under the WHEN chip's day and each week row's day. The highlighter is art: this is the
      colour that copy is checked against (looks.test.ts), never paint the renderer draws. */
  readonly highlight: string;
  /** An empty photo frame. */
  readonly placeholder: string;
  /** The pill's letters. */
  readonly pillText: string;
  /** The dot between the handle and the tag. */
  readonly pillDot: string;
  /** The headline's first word, where a look prints it hotter than its accent (Sunset Vibes, 2026-10-30). Hand-drawn's is
      its accent. */
  readonly hot: string;
  /** The chips' big lines and the week's days, where a look sets them apart from the ink. Hand-drawn's is its ink. */
  readonly value: string;
  /** The icons and the rules, which are art in the look's files: the colour they are held to (3:1 on the ground,
      tests/lookContract.ts), never paint the renderer mixes. */
  readonly line: string;
}

/** A colour of the palette, by its name. */
export type PaletteRole = keyof Palette;

/** One line of copy as a look sets it. A fitted line's size is also its fit's start (data-fit): one number for both. */
export interface LineType {
  /** A font stack from fonts.ts, where every family name lives. */
  readonly font: string;
  readonly weight: number;
  /** In px. */
  readonly size: number;
  /** Unitless. Absent: the browser's own. */
  readonly lineHeight?: number;
  /** letter-spacing, as '0.1em'. */
  readonly spacing?: string;
  readonly upper?: boolean;
  /** A fitted line's floor, as a share of its size (data-fit-min): fit.ts shrinks it no further. Absent: not fitted. */
  readonly floor?: number;
  /** A fitted row of parts' gap, which shrinks first (data-fit-gap): the extras. */
  readonly gap?: number;
  /** Turned in degrees, as drawn: about its own centre, or about its baseline centre for a word of a staggered
      headline. The stacked headline kind leaves it (a turned word would lie on the line under it). Absent: upright. */
  readonly rotate?: number;
  /** Its own contrast minimum on its ground, where the look's rule does not fit the line (the Sunset handoff's 3:1 at
      headline scale, README §7.14). Absent: the look's (rules.minContrast). Held by tests/lookContract.ts. */
  readonly minContrast?: number;
  /** The colour it prints in, and the one it sits on: the contrast its look holds it to (looks.test.ts). */
  readonly ink: PaletteRole;
  readonly on: PaletteRole;
}

/** Every line of copy a flyer prints, by its place. The WHEN chip's big line is chipBigMarked: it sits on the
    highlighter, taller. A week row's price with a middle dot prints on two lines: the price (weekPrice), and the part
    after the dot under it (weekPriceSub; the Sunset look's price sub-line, hand-drawn's set as the price). */
export type LineName =
  | 'eyebrow'
  | 'headline1'
  | 'headline2'
  | 'spanish'
  | 'chipLabel'
  | 'costGlyph'
  | 'chipBig'
  | 'chipBigMarked'
  | 'chipTime'
  | 'chipSmall'
  | 'extras'
  | 'askEn'
  | 'askEs'
  | 'pill'
  | 'weekDay'
  | 'weekName'
  | 'weekTime'
  | 'weekPrice'
  | 'weekPriceSub';

/** One word of a staggered headline (the Sunset look, README §1.1): where its centre sits (dx, from the canvas's
    middle), where its baseline falls in the headline box (y, from the box's top, canvas px), where its baseline falls
    in its own line at line-height 1 (rise, a share of the line from its top: the face's own, as Chrome lays it out,
    measured once), and its room: it is fitted to min(cap, 2 × its distance to the nearer safe edge − margin), at its
    line's floor (layout.ts, wordSlot). It turns by its line's rotate, about its baseline centre. */
export interface StaggeredWord {
  readonly dx: number;
  readonly y: number;
  readonly rise: number;
  readonly cap: number;
  readonly margin: number;
}

/** The headline's lines placed apart: each word at its own point and turned, the Spanish line centred at its own top
    in the box (spanishTop, from the box's top), wrapping balanced. */
export interface StaggeredHeadline {
  readonly kind: 'staggered';
  readonly word1: StaggeredWord;
  readonly word2: StaggeredWord;
  readonly spanishTop: number;
}

/** A dry-brush streak knocked out of one headline word (the Sunset look, README §1.1 layers 17 and 19, §7.12): the
    handoff's generator, ported to draw at render over any word (src/flyer/streaks.ts). `cover` is the share of the
    word's ink knocked out (the lightest share along the strokes, in the ground colour); `minD` the distance from the
    ink's edge, in px, left whole, so the letters keep their outline. */
export interface Streak {
  readonly cover: number;
  readonly minD: number;
}

/** The streaks a look knocks out of its headline words, by line; a line left out is streaked nowhere. The staggered
    kind draws them, since it places each word by itself; the stacked kind draws none. Absent: none, hand-drawn's. */
export type Streaks = { readonly [L in 'headline1' | 'headline2']?: Streak };

/** One look: what it is called, and what it decides about how a flyer prints. */
export interface Look {
  /** Stored in data.look, so forever once a release accepts it. */
  readonly id: string;
  /** What staff see on the Look switch. */
  readonly name: string;
  /** What it changes of the shared boxes, canvas by canvas (layout.ts). */
  readonly geometry: Geometry;
  /** Its colours for a flyer. Hand-drawn takes three of them from the flyer itself (data.colors), which only it reads. */
  palette(data: Pick<FlyerData, 'colors'>): Palette;
  /** The flyer's own font stack, under every line (which each set their own). */
  readonly body: string;
  /** Every face its type uses: the export waits for each (ready.ts), and src/flyer/fonts.css imports each. */
  readonly faces: readonly { readonly family: string; readonly weight: number }[];
  /** Every line of copy. */
  readonly type: { readonly [L in LineName]: LineType };
  /** How the Activity headline's lines are placed in their box. Absent: stacked, hand-drawn's (each line under the
      last, the Spanish line 16 px under them). Staggered: the Sunset look's (2026-10-30). The week's title is stacked
      in every look until This week B (the plan's stage 6). */
  readonly headline?: StaggeredHeadline;
  /** The dry-brush streaks over the staggered headline's words, deterministic per word, size and face, drawn at render
      in the ground colour and awaited by both exports (the Sunset look, 2026-10-30). Absent: none. */
  readonly streaks?: Streaks;
  /** What its copy is held to: a contrast every line reaches on its ground, and inks no line may print in. */
  readonly rules: { readonly minContrast: number; readonly forbiddenInks: readonly string[] };
  /** Its art for a flyer, each piece by the point it hangs from (layout.ts, artAnchors): the canvas, the photo's
      corners, the bottom corners, the pill's end (drawn with the pill), the end of the ask's copy (drawn with the
      ask). Hand-drawn's is the flyer's own arrangement (data.doodles, which only it reads) and its pencil. */
  art(data: Pick<FlyerData, 'doodles'>): readonly ArtPlacement[];
  /** The art drawn inside the blocks, by file name (assets/art/<name>.png). A slot left null draws nothing there (the
      Sunset look prints no rules, no clock and no highlighter). */
  readonly inline: {
    readonly eyebrowIcon: string | null;
    readonly eyebrowRule: string | null;
    /** The line that stands for the photo on a flyer with none. */
    readonly photoRule: string | null;
    readonly askRule: string | null;
    readonly whenIcon: string | null;
    readonly whereIcon: string | null;
    /** Before the COST chip's label; null: the € glyph (type.costGlyph), hand-drawn's. */
    readonly costIcon: string | null;
    /** The ask's own icon, drawn by an ask kind that has a place for it (the Sunset look's pen); today's draws none. */
    readonly askIcon: string | null;
    /** Before the time, in the WHEN chip and in a week row. */
    readonly clock: string | null;
    /** Under the WHEN chip's day and each week row's day. */
    readonly highlighter: string | null;
  };
  /** The Nests wordmark's file, at the eyebrow's right. The hostels' badges beside it are every look's. */
  readonly wordmark: string;
  /** Which marks print at the eyebrow's right (the wordmark, the hostel's badge, or both: defaults.ts) and how tall, in
      px. Absent: the app's setting (EYEBROW_MARKS) at the wordmark's height (EYEBROW_MARK), hand-drawn's. Read through
      marksOf(). */
  readonly marks?: { readonly which: EyebrowMarks; readonly height: number };
  /** The frame round the chips, the week's rows and the photo in a frame: one SVG path stretched to its box, its
      stroke never scaled with it, and the photo's own corners. */
  readonly frame: {
    readonly path: string;
    readonly viewBox: string;
    /** In px, whatever the box's size. */
    readonly stroke: number;
    readonly photoRadius: number;
  };
  /** The tag pill's shape round its one fitted line: its corners, its tilt in degrees (held to the room the pill's
      column leaves it, layout.ts's PILL_TILT_ROOM), its padding, the gap around the dot, and the dot's size. */
  readonly pill: {
    readonly radius: number;
    readonly tilt: number;
    readonly padding: string;
    readonly gap: number;
    readonly dot: number;
  };
}

/** What a flyer that names no look prints in, forever: the hand-drawn look. */
export const FIRST_LOOK = HAND_DRAWN.id;

/** The app's looks, the first look first, then each as it arrived. A site offers what it names of them (siteLooks). */
const registry: Look[] = [HAND_DRAWN, SUNSET_VIBES];
let read = false;

/** Adds a look before anything has read the registry, and throws after: the schema takes the ids when it loads, so a
    look added later would be printed by some parts and refused by others. Only the tests' own build adds one
    (tests/proof/), and nothing shipped calls this. */
export function registerLook(look: Look): void {
  if (read) throw new Error(`registerLook('${look.id}'): the looks were already read, so register it before anything reads them`);
  if (registry.some((l) => l.id === look.id)) throw new Error(`registerLook('${look.id}'): a look with that id exists`);
  registry.push(look);
}

/** Every look the app knows, the first look first. */
export function allLooks(): readonly Look[] {
  read = true;
  return registry;
}

/** Every look's id, the first look first. */
export const lookIds = (): string[] => allLooks().map((l) => l.id);

/** The looks a site offers, as the editor reads api/config's `looks` (server/config.ts and PHP's SiteLooks checked
    them): in the site's order, the first is what a new flyer starts in. Read loosely, as aiFor() reads the AI: an
    answer it cannot take whole (none, from a backend older than the editor; a look this release does not have, from a
    later one) is the first look alone, so no switch shows and a new flyer starts hand-drawn. `known` is the registry,
    unless a test reads against looks of its own. */
export function siteLooks(listed: unknown, known: readonly string[] = lookIds()): string[] {
  const whole =
    Array.isArray(listed) &&
    listed.length > 0 &&
    listed.every((id, i) => typeof id === 'string' && known.includes(id) && listed.indexOf(id) === i);
  return whole ? [...(listed as string[])] : known.slice(0, 1);
}

/** The looks the editor's switch offers for a flyer: the site's, in its order, and after them the flyer's own when the
    site does not name it, so a flyer in a look the site no longer offers still shows it pressed (M2: the site's list
    decides what is offered, never what a save accepts). The switch shows only when there is more than one. */
export function looksToPick(site: readonly string[], data: object): Look[] {
  const own = lookOf(data);
  const offered = site.map((id) => allLooks().find((l) => l.id === id)).filter((l): l is Look => l !== undefined);
  return offered.includes(own) ? offered : [...offered, own];
}

/** The look a flyer's data prints in, read loosely: a backend older than the editor sends data with no look. A flyer
    that names none, or a look this release does not know (a later release's, met after going back to this one),
    prints hand-drawn: never a blank page. */
export function lookOf(data: object): Look {
  const id = (data as { look?: unknown }).look;
  return allLooks().find((l) => l.id === id) ?? HAND_DRAWN;
}
