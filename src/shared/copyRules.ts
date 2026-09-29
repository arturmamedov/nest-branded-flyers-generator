import { DEFAULT_TEXT } from './defaults.js';
import type { FlyerData } from './schema.js';

/* Nests brand-voice rules (handoff README §12), as gentle warnings. */

/** Exclamation marks the copy may spend, not counting the tag pill's own (DEFAULT_TEXT.tag). The owner's number
    (2026-09-28), superseding §12's "one per flyer": the pill always spent that one, so the copy had none. */
export const MAX_EXCLAMATIONS: number = 3;

const bangs = (s: string) => (s.match(/!/g) || []).length;
// The template's sign-off carries its own marks; the pill spends those for free.
const PILL_OWN = bangs(DEFAULT_TEXT.tag);

export interface Lint {
  field: string;
  message: string;
}

function textFields(d: FlyerData): { field: string; value: string }[] {
  const t = d.text;
  const out = [
    { field: 'eyebrow', value: t.eyebrow },
    { field: 'headline1', value: t.headline1 },
    { field: 'headline2', value: t.headline2 },
    { field: 'headlineEs', value: t.headlineEs },
    { field: 'askEn', value: t.askEn },
    { field: 'askEs', value: t.askEs },
    ...d.chips.map((c) => ({ field: `chip.${c.key}`, value: c.value })),
    ...d.extras.map((e, i) => ({ field: `extras.${i}`, value: e })),
  ];
  if (d.showPill) out.push({ field: 'tag', value: t.tag }, { field: 'handle', value: t.handle });
  return out;
}

const BULLETS = /[•●▪◦‣∙]/;
// A slash is fine inside a date (19/9); anywhere else it is a separator.
const SEPARATOR_SLASH = /(?<!\d)\/|\/(?!\d)/;

export function lintFlyer(d: FlyerData): Lint[] {
  const lints: Lint[] = [];
  const fields = textFields(d);

  // Up to the template's own marks in the tag are free; any more typed into it count like the copy's.
  const pillFree = d.showPill ? Math.min(bangs(d.text.tag), PILL_OWN) : 0;
  const spent = fields.reduce((n, f) => n + bangs(f.value), 0) - pillFree;
  if (spent > MAX_EXCLAMATIONS) {
    // "On the flyer": extra marks typed into the tag count too.
    const limit = `At most ${MAX_EXCLAMATIONS} exclamation ${MAX_EXCLAMATIONS === 1 ? 'mark' : 'marks'} on the flyer`;
    lints.push({ field: 'text', message: pillFree ? `${limit}, besides the tag pill's own.` : `${limit}.` });
  }

  for (const f of fields) {
    if (/book[\s-]*now/i.test(f.value)) {
      lints.push({ field: f.field, message: '"Book now" belongs to the website\'s booking button — never on a flyer.' });
    }
    if (BULLETS.test(f.value)) {
      lints.push({ field: f.field, message: 'Use · or — as separators, never bullets.' });
    }
    if (SEPARATOR_SLASH.test(f.value)) {
      lints.push({ field: f.field, message: 'Use · or — as separators, never slashes.' });
    }
  }

  for (const field of ['headline1', 'headline2'] as const) {
    const v = d.text[field];
    const letters = v.replace(/[^\p{L}]/gu, '');
    if (letters.length > 3 && v === v.toUpperCase()) {
      lints.push({ field, message: 'Sentence case for headlines — capitals are for labels only.' });
    }
  }

  return lints;
}
