/* The flyer's font families: every family name lives here. Shantell Sans stands in for Canva's More Sugar (no
   licence outside Canva); if one is ever bought, swapping it is this constant plus the @font-face imports in
   src/flyer/fonts.css. Which faces a look uses, and so which the export waits for, is the look's (looks/). */
export const HEADLINE_FAMILY = 'Shantell Sans';
export const BODY_FAMILY = 'Montserrat';

/** The Sunset Vibes look's display faces (2026-10-30; its handoff's README §8): its first headline word, and its
    script lines. Pinned @fontsource packages, as the others. */
export const ARCHIVO_BLACK_FAMILY = 'Archivo Black';
export const CAVEAT_BRUSH_FAMILY = 'Caveat Brush';

export const HEADLINE_FONT = `'${HEADLINE_FAMILY}', cursive`;
export const BODY_FONT = `'${BODY_FAMILY}', sans-serif`;
export const ARCHIVO_BLACK_FONT = `'${ARCHIVO_BLACK_FAMILY}', sans-serif`;
export const CAVEAT_BRUSH_FONT = `'${CAVEAT_BRUSH_FAMILY}', cursive`;
