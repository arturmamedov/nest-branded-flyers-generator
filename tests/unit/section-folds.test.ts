import { describe, expect, it } from 'vitest';
import {
  FIRST_OPEN,
  SECTIONS,
  allOpen,
  flaggedSections,
  openAtStart,
  opened,
  sectionLine,
  sectionOfField,
  sectionsOf,
  storeOpen,
  toggled,
  type SectionId,
} from '../../src/editor/sectionFolds.js';
import { lintFlyer } from '../../src/shared/copyRules.js';
import { newFlyerData } from '../../src/shared/defaults.js';
import { FLYER_LABELS } from '../../src/shared/labels.js';
import type { FlyerData } from '../../src/shared/schema.js';

/* Which of the editor's sections are open (src/editor/sectionFolds.ts; the editor's UX round, Part 2). A new flyer
   and an AI-made one start fully open; a saved one as the sections were left last time, and before any last time
   with When · Where · Cost open, or the week's rows (the owner's answers, 2026-10-07). */

const NEW = false;
const SAVED = true;

const activity = (patch: Partial<FlyerData> = {}): FlyerData => ({ ...newFlyerData('activity'), ...patch });
const week = (patch: Partial<FlyerData> = {}): FlyerData => ({ ...newFlyerData('week'), ...patch });
const withText = (d: FlyerData, text: Partial<FlyerData['text']>): FlyerData => ({ ...d, text: { ...d.text, ...text } });
const chips = (when: string, where: string, cost: string): FlyerData['chips'] => [
  { key: 'when', label: 'When', value: when },
  { key: 'where', label: 'Where', value: where },
  { key: 'cost', label: 'Cost', value: cost },
];

describe('which sections start open', () => {
  it('a new flyer, and an AI-made one, starts with every section open, whatever was left last time', () => {
    expect(openAtStart(NEW, null)).toEqual([...SECTIONS]);
    expect(openAtStart(NEW, storeOpen(['photo']))).toEqual([...SECTIONS]);
  });

  it('a saved flyer, before any last time, opens When · Where · Cost and the week’s rows, and nothing else', () => {
    expect(openAtStart(SAVED, null)).toEqual(['facts', 'rows']);
    expect(FIRST_OPEN).toEqual(['facts', 'rows']);
  });

  it('a saved flyer opens as the sections were left last time, all closed included', () => {
    expect(openAtStart(SAVED, storeOpen(['share', 'headline']))).toEqual(['headline', 'share']);
    expect(openAtStart(SAVED, storeOpen([]))).toEqual([]);
  });

  it.each(['', 'null', '{"facts":true}', '"facts"', '42', 'not json', '{"__proto__":[]}'])('reads %s as no last time', (stored) => {
    expect(openAtStart(SAVED, stored)).toEqual([...FIRST_OPEN]);
  });

  it('keeps what it knows of a list and drops the rest: a section a later release added, or anything else', () => {
    expect(openAtStart(SAVED, '["photo","__proto__","later-section",7,null,"flyer","photo"]')).toEqual(['flyer', 'photo']);
  });

  it('a section an older release had is dropped the same way: "Top and tag pill" is the Tag pill and the Headline now', () => {
    expect(openAtStart(SAVED, '["top","share"]')).toEqual(['share']);
    expect(openAtStart(SAVED, '["top","pill"]')).toEqual(['pill']);
  });

  // The order a flyer is made in, top to bottom (Artur, 2026-10-13): the photo right after the headline, the pill last
  // of what prints.
  it('a template shows its own sections, in the panel’s order', () => {
    expect(sectionsOf('activity')).toEqual(['flyer', 'headline', 'photo', 'facts', 'extras', 'ask', 'pill', 'share']);
    expect(sectionsOf('week')).toEqual(['flyer', 'headline', 'rows', 'ask', 'pill', 'share']);
  });
});

describe('opening and closing', () => {
  it('a section toggles by itself, and the list keeps the panel’s order', () => {
    expect(toggled(['share'], 'flyer')).toEqual(['flyer', 'share']);
    expect(toggled(['flyer', 'share'], 'flyer')).toEqual(['share']);
  });

  it('opening an open section answers the same list, so nothing is written or drawn again', () => {
    const open: SectionId[] = ['photo'];
    expect(opened(open, 'photo')).toBe(open);
    expect(opened(open, 'ask')).toEqual(['photo', 'ask']);
  });

  it('"all open" is about the sections the template shows', () => {
    expect(allOpen(sectionsOf('week'), 'week')).toBe(true);
    expect(allOpen(sectionsOf('week'), 'activity')).toBe(false);
    expect(allOpen([...SECTIONS], 'activity')).toBe(true);
    expect(allOpen([], 'week')).toBe(false);
  });
});

describe('which section a copy rule’s field is in', () => {
  // A flyer that breaks a rule in every field that prints, so every field a rule can name is here.
  const BROKEN = 'Pool • party';
  const text = { eyebrow: BROKEN, headline1: BROKEN, headline2: BROKEN, headlineEs: BROKEN, askEn: BROKEN, askEs: BROKEN, handle: BROKEN, tag: BROKEN };
  const brokenActivity = activity({ text, chips: chips(BROKEN, BROKEN, BROKEN), extras: [BROKEN, BROKEN] });
  const brokenWeek = week({
    text,
    week: [
      { day: BROKEN, name: BROKEN, time: BROKEN, cost: BROKEN },
      { day: BROKEN, name: 'A long name', shortName: BROKEN, time: BROKEN, cost: BROKEN },
    ],
  });
  const fieldsOf = (d: FlyerData) => [...new Set(lintFlyer(d).map((l) => l.field))];

  it('every field of an Activity flyer is in one of its sections', () => {
    const fields = fieldsOf(brokenActivity);
    expect(fields.length, 'eight lines of text, three blocks, two items').toBe(13);
    for (const field of fields) expect(sectionsOf('activity'), field).toContain(sectionOfField(field));
    expect(new Set(fields.map(sectionOfField))).toEqual(new Set(['pill', 'headline', 'ask', 'facts', 'extras']));
  });

  it('every field of a This week flyer is in one of its sections', () => {
    const fields = fieldsOf(brokenWeek);
    expect(fields.length, 'eight lines of text and four cells of two rows').toBe(16);
    for (const field of fields) expect(sectionsOf('week'), field).toContain(sectionOfField(field));
    expect(new Set(fields.map(sectionOfField))).toEqual(new Set(['pill', 'headline', 'ask', 'rows']));
  });

  it('the eyebrow is in the Headline, above its lines, and the pill’s two words in the Tag pill', () => {
    expect(['eyebrow', 'headline1', 'headline2', 'headlineEs'].map(sectionOfField)).toEqual(['headline', 'headline', 'headline', 'headline']);
    expect(['handle', 'tag'].map(sectionOfField)).toEqual(['pill', 'pill']);
  });

  it('a rule about the whole flyer, and a field nobody has, are in none', () => {
    const marks = lintFlyer(withText(activity(), { headline1: 'Come!!!!', headline2: 'Now!' }));
    expect(marks.map((l) => l.field)).toEqual(['text']);
    expect(['text', '', '__proto__', 'constructor', 'chips', 'photo'].map(sectionOfField)).toEqual([null, null, null, null, null, null]);
  });

  it('a section is flagged by a warning in one of its fields, and the Photo section by a frame with no photo', () => {
    expect(flaggedSections(['headline1', 'text', 'chip.cost', 'headline2'], false)).toEqual(['headline', 'facts']);
    expect(flaggedSections(['tag', 'eyebrow'], true), 'in the panel’s order').toEqual(['headline', 'photo', 'pill']);
    expect(flaggedSections([], true)).toEqual(['photo']);
    expect(flaggedSections([], false)).toEqual([]);
  });
});

describe('a closed section’s line', () => {
  const pool = withText(activity({ chips: chips('Saturday 19/9 · 15:00', 'The pool', 'Free · food & drinks'), extras: ['Everyone welcome', ' ', 'Bring a towel'] }), {
    headline1: 'Saturday is a',
    headline2: 'pool party.',
  });
  const line = (id: SectionId, data: FlyerData, facts: { hostelName?: string | null; hasPhoto?: boolean } = {}) =>
    sectionLine(id, { data, hostelName: facts.hostelName ?? null, hasPhoto: facts.hasPhoto ?? false });

  it('Flyer: the template, the hostel, and its labels by their names', () => {
    expect(line('flyer', pool, { hostelName: 'Duque Nest' })).toBe('Activity · Duque Nest');
    expect(line('flyer', week())).toBe('This week · All hostels');
    // The listed ones, in the list's order, whatever order they are stored in; one off the list is on no screen.
    const [first, second] = FLYER_LABELS;
    expect(line('flyer', { ...pool, labels: [second.slug, 'a-label-taken-off-the-list', first.slug] }, { hostelName: 'Duque Nest' })).toBe(`Activity · Duque Nest · ${first.name}, ${second.name}`);
    expect(line('flyer', { ...week(), labels: [first.slug] })).toBe(`This week · All hostels · ${first.name}`);
    expect(line('flyer', { ...pool, labels: ['a-label-taken-off-the-list'] })).toBe('Activity · All hostels');
  });

  it('Flyer: its look last, only where the editor shows the Look switch', () => {
    // Artur's pick from the pictures (2026-10-14): "Look last in the line". A site with one look shows no switch, and
    // the line is as it was before looks.
    const [first] = FLYER_LABELS;
    const flyer = (lookName: string | null, data = pool) => sectionLine('flyer', { data, hostelName: 'Duque Nest', hasPhoto: false, lookName });
    expect(flyer('Proof')).toBe('Activity · Duque Nest · Proof');
    expect(flyer('Hand-drawn', { ...pool, labels: [first.slug] })).toBe(`Activity · Duque Nest · ${first.name} · Hand-drawn`);
    expect(flyer(null)).toBe('Activity · Duque Nest');
    for (const id of SECTIONS.filter((section) => section !== 'flyer')) {
      expect(sectionLine(id, { data: pool, hostelName: null, hasPhoto: false, lookName: 'Proof' }), id).toBe(line(id, pool));
    }
  });

  it('Headline: its two lines as one', () => {
    expect(line('headline', pool)).toBe('Saturday is a pool party.');
    expect(line('headline', withText(pool, { headline1: '  ' }))).toBe('pool party.');
    // Found in review (2026-10-07): with no English line, a Spanish line that prints is what the section holds.
    expect(line('headline', withText(activity(), { headlineEs: 'El sábado toca fiesta.' }))).toBe('El sábado toca fiesta.');
    expect(line('headline', activity())).toBe('Empty');
    // The eyebrow is one of the section's fields, and its line is still the headline's own.
    expect(line('headline', withText(pool, { eyebrow: 'TONIGHT' }))).toBe('Saturday is a pool party.');
  });

  it('When · Where · Cost: each block’s big line, as it prints', () => {
    expect(line('facts', pool)).toBe('Saturday 19/9 · The pool · Free');
    // The hostel prints big in WHERE, and a block with nothing to say is hidden.
    expect(line('facts', { ...pool, chips: chips('Saturday 19/9', 'The pool', '') }, { hostelName: 'Duque Nest' })).toBe('Saturday 19/9 · Duque Nest');
    expect(line('facts', activity())).toBe('Empty');
  });

  it('Nice to know: the items that print', () => {
    expect(line('extras', pool)).toBe('Everyone welcome · Bring a towel');
    expect(line('extras', activity())).toBe('Nothing added');
  });

  it('This week’s rows: how many print, and their days', () => {
    const rows = week({
      week: [
        { day: 'Fridays', name: 'Surf', time: '', cost: '' },
        { day: '', name: '', time: '', cost: '' },
        { day: 'Sundays', name: 'Hike', time: '', cost: '' },
        { day: '', name: 'Paella', time: '20:00', cost: '' },
      ],
    });
    expect(line('rows', rows)).toBe('3 rows · Fridays, Sundays');
    // Two rows on one day name it once.
    const twice = week({ week: ['Surf', 'Dinner', 'Hike'].map((name, i) => ({ day: i < 2 ? 'Fridays' : 'Sundays', name, time: '', cost: '' })) });
    expect(line('rows', twice)).toBe('3 rows · Fridays, Sundays');
    expect(line('rows', week({ week: [{ day: '', name: 'Paella', time: '', cost: '' }] }))).toBe('1 row');
    expect(line('rows', week())).toBe('No rows yet');
  });

  it('The ask: the English line, else the Spanish one', () => {
    expect(line('ask', pool)).toBe('Sign up at reception.');
    expect(line('ask', withText(pool, { askEn: '' })), 'found in review: it said "Empty" over a Spanish ask that prints').toBe('Apúntate en recepción.');
    expect(line('ask', withText(pool, { askEn: ' ', askEs: '' }))).toBe('Empty');
  });

  it('Photo: the mode, and whether a photo is set', () => {
    expect(line('photo', pool, { hasPhoto: true })).toBe('In a frame · photo set');
    expect(line('photo', { ...pool, photoMode: 'bleed' })).toBe('Full bleed · no photo yet');
    // A photo kept for switching back prints nothing on "No photo".
    expect(line('photo', { ...pool, photoMode: 'none' }, { hasPhoto: true })).toBe('No photo');
  });

  it('Tag pill: its two words, or that it is not shown', () => {
    expect(line('pill', pool)).toBe('@NESTSHOSTELS · ¡TAG US!');
    expect(line('pill', withText(pool, { handle: ' ' }))).toBe('¡TAG US!');
    expect(line('pill', { ...pool, showPill: false })).toBe('Not shown');
    expect(line('pill', withText(pool, { handle: '', tag: '' }))).toBe('Empty');
  });

  it('Share text: whether there is a caption', () => {
    expect(line('share', { ...pool, share: 'Come to the pool' })).toBe('Caption written');
    expect(line('share', { ...pool, share: ' \n' })).toBe('No caption yet');
  });
});
