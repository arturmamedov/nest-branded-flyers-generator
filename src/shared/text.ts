/* The flyer's lines of copy (data.text): each one's longest value. No zod here, like week.ts: the editor imports
   it for its inputs, and schema.ts takes TextSchema's limits from this file, so the form and the API never disagree.

   The eyebrow is one unfitted line that never wraps: its limit is what holds it inside the safe box. A fitted line
   shrinks, so its limit is generous, and copy too long for its box at its floor is clipped and the editor says so. */

/** Each line's longest value, in code points, as zod and the PHP validator count them. The Spanish line wraps:
    260 is a description of three or four lines (Artur, 2026-10-09). With a photo about 210 fit at its floor
    beside a two-line headline of 19 characters; without one, all 260 do. The asks are one line each in a 760 px
    column before the pencil, already at their floor with a phone number, so their limits stay.

    The handle and the tag are the pill's one fitted line (Flyer.tsx). The tag was 12 and is 24 (Artur, 2026-10-07:
    "24 characters", for "¡Come with us!" and a little more; signed off from the proof sheets on 2026-10-12). In
    capitals, which are what staff type there, a tag of 24 beside the default handle fits at full size, and beside a
    handle of 18 the letters shrink to about 88 % on the story and 95 % on WhatsApp. Only the widest letters at both
    limits are cut. An older release refuses a flyer saved with a tag over 12 (docs/deploy.md, "Rolling back"). */
export const TEXT_LIMITS = {
  eyebrow: 18,
  headline1: 40,
  headline2: 40,
  headlineEs: 260,
  askEn: 60,
  askEs: 70,
  handle: 18,
  tag: 24,
} as const;
