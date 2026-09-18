import type { FlyerData } from './schema.js';

/* Nests brand-voice rules (handoff README §12), as gentle warnings. */

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

  const bangs = fields.reduce((n, f) => n + (f.value.match(/!/g) || []).length, 0);
  if (bangs > 1) {
    lints.push({
      field: 'text',
      message: d.showPill
        ? 'One exclamation mark per flyer — the ¡TAG US! pill already spends it.'
        : 'One exclamation mark per flyer, maximum.',
    });
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
