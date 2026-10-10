import { DEFAULT_TEXT } from './defaults.js';
import type { FlyerData } from './schema.js';
import { printedName, usesShortName } from './week.js';

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

/** A line of copy; `row` names the week row it belongs to, so a warning can say which of five. */
interface TextField {
  field: string;
  value: string;
  row?: number;
}

/** A row's printed event name: the short name when it has one, since that is what prints. */
const rowName = (d: FlyerData, i: number): TextField => {
  const row = d.week[i];
  return { field: `week.${i}.${usesShortName(row) ? 'shortName' : 'name'}`, value: printedName(row), row: i };
};

/** Only what prints: a week flyer keeps its chips and extras for switching back, an Activity flyer its rows. */
function textFields(d: FlyerData): TextField[] {
  const t = d.text;
  const body: TextField[] =
    d.template === 'week'
      ? d.week.flatMap((row, i) => [
          { field: `week.${i}.day`, value: row.day, row: i },
          rowName(d, i),
          { field: `week.${i}.time`, value: row.time, row: i },
          { field: `week.${i}.cost`, value: row.cost, row: i },
        ])
      : [...d.chips.map((c) => ({ field: `chip.${c.key}`, value: c.value })), ...d.extras.map((e, i) => ({ field: `extras.${i}`, value: e }))];
  const out: TextField[] = [
    { field: 'eyebrow', value: t.eyebrow },
    { field: 'headline1', value: t.headline1 },
    { field: 'headline2', value: t.headline2 },
    { field: 'headlineEs', value: t.headlineEs },
    { field: 'askEn', value: t.askEn },
    { field: 'askEs', value: t.askEs },
    ...body,
  ];
  if (d.showPill) out.push({ field: 'tag', value: t.tag }, { field: 'handle', value: t.handle });
  return out;
}

// No rule against "Book now" or a slash as a separator: Artur found both warnings of no use (2026-10-10).
const BULLETS = /[•●▪◦‣∙]/;

export function lintFlyer(d: FlyerData): Lint[] {
  const lints: Lint[] = [];
  const fields = textFields(d);
  const warn = (f: TextField, message: string) => lints.push({ field: f.field, message: f.row === undefined ? message : `Row ${f.row + 1}: ${message}` });

  // Up to the template's own marks in the tag are free; any more typed into it count like the copy's.
  const pillFree = d.showPill ? Math.min(bangs(d.text.tag), PILL_OWN) : 0;
  const spent = fields.reduce((n, f) => n + bangs(f.value), 0) - pillFree;
  if (spent > MAX_EXCLAMATIONS) {
    // "On the flyer": extra marks typed into the tag count too.
    const limit = `At most ${MAX_EXCLAMATIONS} exclamation ${MAX_EXCLAMATIONS === 1 ? 'mark' : 'marks'} on the flyer`;
    lints.push({ field: 'text', message: pillFree ? `${limit}, besides the tag pill's own.` : `${limit}.` });
  }

  for (const f of fields) {
    if (BULLETS.test(f.value)) {
      warn(f, 'Use · or — as separators, never bullets.');
    }
  }

  // Sentence case for headlines (§12), and a week row's event name is its row's headline.
  const headlines: TextField[] = [
    { field: 'headline1', value: d.text.headline1 },
    { field: 'headline2', value: d.text.headline2 },
    ...(d.template === 'week' ? d.week.map((_, i) => rowName(d, i)) : []),
  ];
  for (const f of headlines) {
    const letters = f.value.replace(/[^\p{L}]/gu, '');
    if (letters.length > 3 && f.value === f.value.toUpperCase()) {
      warn(f, 'Sentence case for headlines — capitals are for labels only.');
    }
  }

  return lints;
}
