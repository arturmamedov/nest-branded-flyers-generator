/* The share text: the caption staff paste beside the flyer when they post or send it (the owner's ask, 2026-10-01).
   It is flyer data, saved with the flyer, but never ink: <Flyer> doesn't read it, so no canvas, fit or copy rule
   applies. No zod here, like week.ts: the editor imports it, and schema.ts takes the limit from this file. */

import type { FlyerData } from './schema.js';

/** Instagram's caption limit, the strictest place it is pasted. */
export const SHARE_MAX = 2200;

/** The line between a caption's two languages: English first, then this line, then Spanish. The owner's own, from the
    flyers he corrected by hand on 2026-10-06 (the guests are mostly English speakers, so English leads; it stood
    Spanish first with a `---` line until then). The prompts in ai/prompts/ spell it out, and a test holds them and
    every example to it; the editor's placeholder shows it. */
export const SHARE_SPANISH_BREAK = '-- 🇪🇸 --';

/** The fields of a flyer a caption is written from: its printed copy. With the hostel and the template they are "the
    flyer's details". The server's prompt reads exactly these (ShareInput in server/ai/prompt.ts), and the editor
    offers "Write with AI" again once they differ from the ones a caption was written from. The photo, its crop, how
    the flyer is laid out and the caption itself are not among them. */
export const SHARE_DETAILS = ['text', 'chips', 'extras', 'week'] as const;
export type ShareDetail = (typeof SHARE_DETAILS)[number];

/** A flyer's details as one string: two flyers with the same one get the same caption written. */
export function shareDetails(hostel: string | null, data: Pick<FlyerData, 'template' | ShareDetail>): string {
  return JSON.stringify([hostel, data.template, ...SHARE_DETAILS.map((key) => data[key])]);
}
