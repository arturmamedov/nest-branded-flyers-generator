import type { PhotoMode } from './layout.js';
import { FIRST_LOOK } from './looks.js';
import { DEFAULT_COLORS, DEFAULT_DOODLES } from './looks/handDrawn.js';
import { DEFAULT_CROP } from './photo.js';
import type { FlyerData, FlyerText, Template } from './schema.js';

/* A new flyer, and what changes it as staff work. The hand-drawn look's own values (its colours and art, which every
   flyer stores whatever its look) live in looks/handDrawn.ts; server/db/migrations.ts, which is never edited, reads
   these three here. */
export { DEFAULT_DOODLES, PROTOTYPE_DOODLES, sameDoodles } from './looks/handDrawn.js';

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

/** A blank flyer in a look. Its colours and art are the hand-drawn look's whatever the look, since only that look reads
    them (looks/handDrawn.ts): a switch is the look alone, and an older release prints any flyer hand-drawn. Samples,
    briefs and test payloads take the first look; the editor and the AI page pass the site's first (api/config). */
export function newFlyerData(template: Template = 'activity', look: string = FIRST_LOOK): FlyerData {
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
    labels: [],
    look,
  };
}
