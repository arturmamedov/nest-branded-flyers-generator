/* The share text: the caption staff paste beside the flyer when they post or send it (the owner's ask, 2026-10-01).
   It is flyer data, saved with the flyer, but never ink: <Flyer> doesn't read it, so no canvas, fit or copy rule
   applies. No zod here, like week.ts: the editor imports it, and schema.ts takes the limit from this file. */

/** Instagram's caption limit, the strictest place it is pasted. */
export const SHARE_MAX = 2200;
