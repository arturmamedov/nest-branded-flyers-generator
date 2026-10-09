/* The flyer's lines of copy (data.text): each one's longest value. No zod here, like week.ts: the editor imports
   it for its inputs, and schema.ts takes TextSchema's limits from this file, so the form and the API never disagree.

   The unfitted, nowrap lines (eyebrow, handle, tag) are held inside the safe box by their limit. A fitted line
   shrinks, so its limit is generous, and copy too long for its box at its floor is clipped and the editor says so. */

/** Each line's longest value, in code points, as zod and the PHP validator count them. The Spanish line wraps:
    260 is a description of three or four lines (Artur, 2026-10-09). With a photo about 210 fit at its floor
    beside a two-line headline of 19 characters; without one, all 260 do. The asks are one line each in a 760 px
    column beside the pencil, already at their floor with a phone number, so their limits stay. */
export const TEXT_LIMITS = {
  eyebrow: 18,
  headline1: 40,
  headline2: 40,
  headlineEs: 260,
  askEn: 60,
  askEs: 70,
  handle: 18,
  tag: 12,
} as const;
