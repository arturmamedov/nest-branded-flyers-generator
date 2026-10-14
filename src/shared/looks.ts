import type { ArtAnchor, Geometry } from './layout.js';
import { HAND_DRAWN } from './looks/handDrawn.js';
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
  /** The colour it prints in, and the one it sits on: the contrast its look holds it to (looks.test.ts). */
  readonly ink: PaletteRole;
  readonly on: PaletteRole;
}

/** Every line of copy a flyer prints, by its place. The WHEN chip's big line is chipBigMarked: it sits on the
    highlighter, taller. */
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
  | 'weekPrice';

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
  /** Every line of copy. */
  readonly type: { readonly [L in LineName]: LineType };
  /** What its copy is held to: a contrast every line reaches on its ground, and inks no line may print in. */
  readonly rules: { readonly minContrast: number; readonly forbiddenInks: readonly string[] };
}

/** What a flyer that names no look prints in, forever: the hand-drawn look. */
export const FIRST_LOOK = HAND_DRAWN.id;

/** The app's looks, the first look first. */
const registry: Look[] = [HAND_DRAWN];
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

/** The look a flyer's data prints in, read loosely: a backend older than the editor sends data with no look. A flyer
    that names none, or a look this release does not know (a later release's, met after going back to this one),
    prints hand-drawn: never a blank page. */
export function lookOf(data: object): Look {
  const id = (data as { look?: unknown }).look;
  return allLooks().find((l) => l.id === id) ?? HAND_DRAWN;
}
