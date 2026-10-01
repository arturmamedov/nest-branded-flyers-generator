import { newFlyerData, weekTitle } from './defaults.js';
import { libraryName } from './names.js';
import type { Brief, ChipKey, FlyerInput } from './schema.js';

/* A brief is a flyer described by its copy alone: the hostel, the template and the words, everything else left to
   the template's defaults. It is what comes out of a staff member's own text, today written by hand (scripts/flyers,
   docs/ai-flyers), later by the editor's AI assistant. No zod here, like week.ts: the browser can build from it. */

/** The flyer a brief describes, ready to POST: no photo yet, so "No photo"; a photo dropped later lands
    "In a frame" (DEFAULT_PHOTO_MODE). A week flyer's title lines are the defaults for its hostel, as a new week
    flyer gets them, unless the brief writes its own. Untitled, it is named as the editor would on its first save. */
export function flyerFromBrief(brief: Brief, hostelName: string | null, now = new Date()): FlyerInput {
  const base = newFlyerData(brief.template);
  const titleLines = brief.template === 'week' ? weekTitle(hostelName) : {};
  const chip = (key: ChipKey) => brief[key] ?? '';
  const data = {
    ...base,
    photoMode: 'none' as const,
    text: { ...base.text, ...titleLines, ...brief.text },
    chips: base.chips.map((c) => ({ ...c, value: chip(c.key) })),
    extras: brief.extras ?? [],
    week: brief.week ?? [],
    share: brief.share ?? '',
  };
  return {
    title: brief.title?.trim() || libraryName(data, hostelName, now),
    hostel: brief.hostel,
    template: brief.template,
    data,
    photoId: null,
  };
}
