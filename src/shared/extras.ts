/* The extras: the short facts under the chips ("Bring a towel", "Comfy clothes"), each printed with its own dot.
   No zod here, like share.ts: schema.ts takes the limits from this file for the flyer and for a brief alike, and the
   AI's prompt lists them, so a number is written once. */

/** How many extras a flyer prints (handoff §6: 0–4). */
export const EXTRAS_MAX = 4;

/** The longest extra, in code points: two or three words. */
export const EXTRA_MAX = 32;
