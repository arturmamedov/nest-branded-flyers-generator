/* The flyer's font families: every family name lives here. Shantell Sans stands in for Canva's More Sugar (no
   licence outside Canva); if one is ever bought, swapping it is this constant plus the @font-face imports in
   src/flyer/fonts.css. Which faces a look uses, and so which the export waits for, is the look's (looks/). */
export const HEADLINE_FAMILY = 'Shantell Sans';
export const BODY_FAMILY = 'Montserrat';

export const HEADLINE_FONT = `'${HEADLINE_FAMILY}', cursive`;
export const BODY_FONT = `'${BODY_FAMILY}', sans-serif`;
