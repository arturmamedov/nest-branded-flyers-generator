/* The two flyer faces. Shantell Sans stands in for Canva's More Sugar (no
   licence outside Canva); if one is ever bought, swapping it is this constant
   plus the @font-face import in src/flyer/fonts.css. */
export const HEADLINE_FAMILY = 'Shantell Sans';
export const BODY_FAMILY = 'Montserrat';

export const HEADLINE_FONT = `'${HEADLINE_FAMILY}', cursive`;
export const BODY_FONT = `'${BODY_FAMILY}', sans-serif`;

/** Every face the flyer uses. The export waits for all of them. */
export const FLYER_FACES = [
  { family: HEADLINE_FAMILY, weight: 700 },
  { family: HEADLINE_FAMILY, weight: 800 },
  { family: BODY_FAMILY, weight: 600 },
  { family: BODY_FAMILY, weight: 700 },
] as const;
