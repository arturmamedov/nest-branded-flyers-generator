import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { followHostel, newFlyerData, switchTemplate, weekTitle } from '../../src/shared/defaults.js';
import { SAMPLE_FLYERS } from '../../src/shared/samples.js';
import { FlyerDataSchema, type WeekRow } from '../../src/shared/schema.js';
import { WEEK_ROWS_MAX, WEEK_ROW_LIMITS, eventName, isPrintable, printedName, printedRows, rowFromActivity } from '../../src/shared/week.js';

/* The This week template's rules (handoff §2, §6; the owner's answers of 2026-09-29):
   the title's defaults, switching template, rows taken from saved flyers, and what a row prints. */

const row = (day: string, name: string, time: string, cost: string, shortName?: string): WeekRow =>
  shortName === undefined ? { day, name, time, cost } : { day, name, time, cost, shortName };

describe('the week title', () => {
  it('a new week flyer is prefilled: THIS WEEK, What’s on / this week., and the whole chain in Spanish', () => {
    expect(newFlyerData('week').text).toMatchObject({
      eyebrow: 'THIS WEEK',
      headline1: 'What’s on',
      headline2: 'this week.',
      headlineEs: 'El plan de la semana en Nests Hostels.',
    });
    // An Activity flyer starts as it always has.
    expect(newFlyerData('activity').text).toMatchObject({ eyebrow: 'NEXT ACTIVITY', headline1: '', headline2: '', headlineEs: '' });
  });

  it('the Spanish line names the hostel', () => {
    expect(weekTitle('Duque Nest').headlineEs).toBe('El plan de la semana en Duque Nest.');
    expect(weekTitle(null).headlineEs).toBe('El plan de la semana en Nests Hostels.');
  });

  it('the default Spanish line follows the hostel; a line someone edited stays theirs', () => {
    const d = newFlyerData('week');
    const duque = followHostel(d, null, 'Duque Nest');
    expect(duque.text.headlineEs).toBe('El plan de la semana en Duque Nest.');
    expect(followHostel(duque, 'Duque Nest', null).text.headlineEs).toBe('El plan de la semana en Nests Hostels.');

    const edited = { ...d, text: { ...d.text, headlineEs: 'Nuestra semana en el hostel.' } };
    expect(followHostel(edited, null, 'Duque Nest')).toBe(edited);
    // An Activity flyer's Spanish line is its headline's: it never follows.
    const activity = { ...newFlyerData('activity'), text: { ...newFlyerData('activity').text, headlineEs: 'El plan de la semana en Nests Hostels.' } };
    expect(followHostel(activity, null, 'Duque Nest')).toBe(activity);
  });
});

describe('switching template', () => {
  it('an untouched new flyer round-trips exactly, so switching and back leaves nothing unsaved', () => {
    const d = newFlyerData('activity');
    const week = switchTemplate(d, 'week', 'Duque Nest');
    expect(week.template).toBe('week');
    expect(week.text).toMatchObject({
      eyebrow: 'THIS WEEK',
      headline1: 'What’s on',
      headline2: 'this week.',
      headlineEs: 'El plan de la semana en Duque Nest.',
    });
    expect(JSON.stringify(switchTemplate(week, 'activity', 'Duque Nest'))).toBe(JSON.stringify(d));
  });

  it('a saved Activity flyer loses nothing: its headline becomes the title, its photo, chips and extras wait for the way back', () => {
    const pool = structuredClone(SAMPLE_FLYERS.find((s) => s.title === 'Pool party')!.data);
    pool.photoMode = 'band';
    pool.photoCrop = { x: 0.3, y: 0.6, zoom: 1.5 };
    const week = switchTemplate(pool, 'week', 'Duque Nest');
    expect(week.template).toBe('week');
    expect(week.text).toMatchObject({ eyebrow: 'THIS WEEK', headline1: 'Saturday is a', headline2: 'pool party.', headlineEs: 'El sábado toca fiesta en la piscina.' });
    const { template: _a, text: _b, ...rest } = pool;
    const { template: _c, text: _d, ...kept } = week;
    expect(kept).toEqual(rest);
    expect(JSON.stringify(switchTemplate(week, 'activity', 'Duque Nest'))).toBe(JSON.stringify(pool));
  });

  it('the eyebrow follows only while it is the template default', () => {
    const d = newFlyerData('activity');
    d.text.eyebrow = 'TONIGHT';
    expect(switchTemplate(d, 'week', null).text.eyebrow).toBe('TONIGHT');
  });

  it('a week title someone edited stays when going back to Activity, and so do the rows', () => {
    const week = newFlyerData('week');
    week.text.headline1 = 'Our week';
    week.week = [row('Fridays', 'Two hours of fun waves', '15:00', '40€ a class')];
    const activity = switchTemplate(week, 'activity', null);
    expect(activity.text).toMatchObject({ eyebrow: 'NEXT ACTIVITY', headline1: 'Our week', headline2: 'this week.' });
    expect(activity.week).toEqual(week.week);
  });

  it('switching to the template a flyer already has changes nothing', () => {
    const d = newFlyerData('week');
    expect(switchTemplate(d, 'week', 'Duque Nest')).toBe(d);
  });
});

describe('rows taken from a saved Activity flyer (the prototype’s derivation)', () => {
  it('the six design records, as the prototype reads them: day and time from WHEN, the whole name, the first price', () => {
    const got = SAMPLE_FLYERS.filter((s) => s.data.template === 'activity').map((s) => rowFromActivity(s.data, s.title));
    expect(got).toEqual([
      row('Saturday 19/9', 'Saturday is a pool party', '15:00', 'Free'),
      row('Tonight', 'Family dinner, pizza night', '20:30', '8€ with a drink'),
      row('Fridays', 'Two hours of fun waves', '15:00', '40€ a class'),
      row('Saturday 27/9', 'Sunrise hike above the sea of clouds', '05:30', '25€ with breakfast'),
      row('Most mornings', 'Step off and fly', '', '90€'),
      row('Fridays', 'Family dinner, every Friday', '20:30', '8€ with a drink'),
    ]);
  });

  it('finds WHEN and COST by key, whatever their labels or order', () => {
    const d = newFlyerData('activity');
    d.text.headline1 = 'Karaoke';
    d.chips = [
      { key: 'cost', label: 'Precio', value: '5€ · a drink' },
      { key: 'where', label: 'Dónde', value: 'The bar' },
      { key: 'when', label: 'Cuándo', value: 'Thursday · 22:00 · till late' },
    ];
    expect(rowFromActivity(d, 'Karaoke night')).toEqual(row('Thursday', 'Karaoke', '22:00', '5€'));
  });

  it('falls back to the flyer’s title when the headline is empty', () => {
    expect(rowFromActivity(newFlyerData('activity'), 'Pub quiz').name).toBe('Pub quiz');
  });

  it('cuts every field to its limit in code points, never into half a surrogate pair, so the row always saves', () => {
    const d = newFlyerData('activity');
    d.text.headline1 = 'A'.repeat(40);
    d.text.headline2 = 'B'.repeat(40);
    // The emoji is UTF-16 units 29 and 30: a unit slice at 30 would leave half of it, which PHP refuses.
    d.chips[0].value = `${'x'.repeat(29)}😀yy · 15:00`;
    d.chips[2].value = 'c'.repeat(40);
    const r = rowFromActivity(d, 'Long');
    expect(r.name).toBe(`${'A'.repeat(40)} ${'B'.repeat(39)}`);
    expect(r.day).toBe(`${'x'.repeat(29)}😀`);
    expect(r.cost).toBe('c'.repeat(30));
    const week = newFlyerData('week');
    week.week = [r];
    expect(FlyerDataSchema.safeParse(week).success).toBe(true);
  });
});

describe('the event name', () => {
  it('joins the two headline lines, collapses spaces and drops one final dot, even with stray spaces', () => {
    expect(eventName({ headline1: 'Two hours', headline2: 'of fun waves.' })).toBe('Two hours of fun waves');
    expect(eventName({ headline1: 'Saturday is a ', headline2: ' pool party .' })).toBe('Saturday is a pool party');
    expect(eventName({ headline1: 'Saturday is a', headline2: 'pool party. ' })).toBe('Saturday is a pool party');
    expect(eventName({ headline1: '', headline2: 'Wait for it..' })).toBe('Wait for it.');
    expect(eventName({ headline1: ' ', headline2: '' })).toBe('');
  });
});

describe('what a row prints', () => {
  it('its short name when it has one; an empty or blank one is none', () => {
    expect(printedName(row('Sat', 'Sunset catamaran along the cliffs', '', '', 'Catamaran'))).toBe('Catamaran');
    expect(printedName(row('Sat', 'Surf', '', '', ''))).toBe('Surf');
    expect(printedName(row('Sat', 'Surf', '', '', '   '))).toBe('Surf');
    expect(printedName(row('Sat', 'Surf', '', ''))).toBe('Surf');
  });

  it('no dangling ·, the price on at most two lines, and a row with nothing in it not at all', () => {
    const rows = [
      row('Fridays ·', 'Surf', ' · 15:00', '25€ · 18€ without breakfast'),
      row('', '', '', ' · '),
      row('', '  ', '', '', ''),
      row('Sat', 'A very long name nobody reads', '', 'Free', 'Short'),
      row('', '', '', '10€ · 8€ with a card · kids free'),
    ];
    expect(printedRows(rows)).toEqual([
      { day: 'Fridays', name: 'Surf', time: '15:00', cost: ['25€', '18€ without breakfast'] },
      { day: 'Sat', name: 'Short', time: '', cost: ['Free'] },
      { day: '', name: '', time: '', cost: ['10€', '8€ with a card · kids free'] },
    ]);
    expect(rows.map(isPrintable)).toEqual([true, false, false, true, true]);
  });
});

describe('the week’s limits', () => {
  it('five rows save, a sixth is refused', () => {
    const d = newFlyerData('week');
    d.week = Array.from({ length: WEEK_ROWS_MAX }, () => row('Fridays', 'Surf', '15:00', '40€'));
    expect(WEEK_ROWS_MAX).toBe(5);
    expect(FlyerDataSchema.safeParse(d).success).toBe(true);
    d.week.push(row('Fridays', 'Surf', '15:00', '40€'));
    expect(FlyerDataSchema.safeParse(d).success).toBe(false);
  });

  it('each row field saves up to its limit in code points, and not one more', () => {
    for (const [field, max] of Object.entries(WEEK_ROW_LIMITS) as [keyof typeof WEEK_ROW_LIMITS, number][]) {
      const d = newFlyerData('week');
      d.week = [{ ...row('Fridays', 'Surf', '15:00', '40€'), [field]: '😀'.repeat(max) }];
      expect(FlyerDataSchema.safeParse(d).success, `${field} at ${max}`).toBe(true);
      d.week = [{ ...row('Fridays', 'Surf', '15:00', '40€'), [field]: '😀'.repeat(max + 1) }];
      expect(FlyerDataSchema.safeParse(d).success, `${field} at ${max + 1}`).toBe(false);
    }
  });
});

describe('the week samples', () => {
  const hostels = new Map(
    (JSON.parse(readFileSync(new URL('../../seed/hostels.json', import.meta.url), 'utf8')) as { hostels: { slug: string; name: string }[] }).hostels.map((h) => [h.slug, h.name]),
  );
  const weeks = SAMPLE_FLYERS.filter((s) => s.data.template === 'week');

  it('come after the Activity ones, which the other suites take by position, with unique titles', () => {
    expect(weeks.length).toBeGreaterThanOrEqual(3);
    expect(SAMPLE_FLYERS[0].data.template).toBe('activity');
    expect(SAMPLE_FLYERS.find((s) => s.photo)!.data.template).toBe('activity');
    expect(SAMPLE_FLYERS.find((s) => s.title.startsWith('Long copy'))!.data.template).toBe('activity');
    expect(SAMPLE_FLYERS.findIndex((s) => s.data.template === 'week')).toBe(SAMPLE_FLYERS.length - weeks.length);
    expect(new Set(SAMPLE_FLYERS.map((s) => s.title)).size).toBe(SAMPLE_FLYERS.length);
  });

  it('name their hostel in Spanish as seed/hostels.json spells it, or the chain', () => {
    for (const s of weeks) {
      const name = s.hostel ? hostels.get(s.hostel) : 'Nests Hostels';
      expect(name, s.title).toBeDefined();
      expect(s.data.text.headlineEs, s.title).toBe(`El plan de la semana en ${name}.`);
      expect(s.photo, s.title).toBeNull();
    }
  });

  it('the stress week fills all five rows and has every case the renderer must collapse or fit', () => {
    const stress = weeks.find((s) => s.title === 'This week · stress test')!;
    const rows = stress.data.week;
    expect(rows).toHaveLength(WEEK_ROWS_MAX);
    expect(rows.some((r) => r.shortName && r.name.length > 60), 'a long name with its short name').toBe(true);
    expect(rows.some((r) => r.cost.includes('·')), 'a two-line price').toBe(true);
    expect(rows.some((r) => r.day === ''), 'an empty day').toBe(true);
    expect(rows.some((r) => r.time === ''), 'an empty time').toBe(true);
    expect(rows.some((r) => r.cost === ''), 'an empty cost').toBe(true);
    expect(rows.some((r) => r.time.length >= 13), 'a long time').toBe(true);
  });
});
