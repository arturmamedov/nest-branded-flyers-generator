import { expect } from 'vitest';
import { SHARE_SPANISH_BREAK } from '../src/shared/share.js';
import type { Brief } from '../src/shared/schema.js';

/* What a brief looks like when it follows the owner's own flyers (2026-10-06: his corrections on the live site's #4,
   #5 and #8, then asked for as rules). The AI imitates its examples, so every example is held to this, and so is
   every case of the picture reads' eval set. The rules themselves are the prompt files in ai/prompts/. */

/** The title lines of a brief: the big English title's two lines, and the Spanish line under it. */
const TITLE_LINES = ['headline1', 'headline2', 'headlineEs'] as const;

export function expectOwnersRules(brief: Brief, where: string): void {
  // No full stop ends a title line. The ask line keeps its own punctuation.
  for (const key of TITLE_LINES) {
    const line = brief.text?.[key];
    if (line) expect(line, `${where}: ${key} ends with no full stop`).not.toMatch(/\.\s*$/);
  }
  // A price nobody gave is not printed: no stand-in for it.
  expect(brief.cost ?? '', `${where}: no stand-in for a missing price`).not.toMatch(/^ask\b/i);
  // A start and an end are one range, written as on his Teide flyer: a hyphen and no spaces. With spaces round the
  // dash, or a long dash, it broke over two lines in the chip.
  expect(brief.when ?? '', `${where}: a start and an end are one range, a hyphen and no spaces`).not.toMatch(/\d\s*[–—]\s*\d|\d\s+-\s*\d|\d-\s+\d/);
  if (brief.share === undefined) return;
  // The share text: English first, then the line, then Spanish.
  const blocks = brief.share.split(`\n${SHARE_SPANISH_BREAK}\n`);
  expect(blocks, `${where}: English, the line "${SHARE_SPANISH_BREAK}", Spanish`).toHaveLength(2);
  // Spanish opens its exclamations and its questions, and English never does: enough to tell these two blocks apart.
  expect(blocks[0], `${where}: the first block is the English one`).not.toMatch(/[¡¿]/);
  expect(blocks[1], `${where}: the second block is the Spanish one`).toMatch(/[¡¿]/);
}
