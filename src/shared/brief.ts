import { newFlyerData, weekTitle } from './defaults.js';
import { printedExtras } from './extras.js';
import { tidyLabels } from './labels.js';
import { libraryName } from './names.js';
import type { Brief, ChipKey, FlyerInput, FlyerText } from './schema.js';
import { isPrintable } from './week.js';

/* A brief is a flyer described by its copy alone: the hostel, the template and the words, everything else left to
   the template's defaults. It is what comes out of a staff member's own text, today written by hand (scripts/flyers,
   docs/ai-flyers), later by the editor's AI assistant. No zod here, like week.ts: the browser can build from it. */

/** The flyer a brief describes, ready to POST: no photo yet, so "No photo"; a photo dropped later lands
    "In a frame" (DEFAULT_PHOTO_MODE). A week flyer's title lines are the defaults for its hostel, as a new week
    flyer gets them, unless the brief writes its own. Untitled, it is named as the editor would on its first save.
    A blank says nothing: a field of spaces is an empty one (which prints nothing, as a hand-written "" does), and
    an extra or a week row with nothing in it is left out, so the editor opens with no empty field or row. */
export function flyerFromBrief(brief: Brief, hostelName: string | null, now = new Date()): FlyerInput {
  const base = newFlyerData(brief.template);
  const titleLines = brief.template === 'week' ? weekTitle(hostelName) : {};
  const chip = (key: ChipKey) => said(brief[key]);
  const lines = Object.fromEntries(Object.entries(brief.text ?? {}).map(([key, line]) => [key, said(line)])) as Partial<FlyerText>;
  const data = {
    ...base,
    photoMode: 'none' as const,
    text: { ...base.text, ...titleLines, ...lines },
    chips: base.chips.map((c) => ({ ...c, value: chip(c.key) })),
    extras: printedExtras(brief.extras ?? []),
    week: (brief.week ?? []).filter(isPrintable),
    share: said(brief.share),
    // As a save would store them: in the list's order, once each.
    labels: tidyLabels(brief.labels ?? []),
  };
  return {
    title: brief.title?.trim() || libraryName(data, hostelName, now),
    hostel: brief.hostel,
    template: brief.template,
    data,
    photoId: null,
  };
}

/** What a field says: itself as it was written, or nothing when it holds only spaces. */
const said = (value: string | undefined): string => (value?.trim() ? value : '');
