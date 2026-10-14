import { describe, expect, it } from 'vitest';
import { flyerFromBrief } from '../../src/shared/brief.js';
import { newFlyerData, weekTitle } from '../../src/shared/defaults.js';
import { LABEL_SLUGS } from '../../src/shared/labels.js';
import { FIRST_LOOK } from '../../src/shared/looks.js';
import { BriefSchema, FlyerInputSchema, type Brief, type FlyerInput } from '../../src/shared/schema.js';

/* A brief is a flyer's copy alone (brief.ts): what scripts/flyers/post.ts sends today, and what the editor's AI
   assistant will write later. Every flyer it builds must pass the API's own rules. */

const DAY = new Date(2026, 9, 1, 12);

const valid = (input: FlyerInput) => {
  const r = FlyerInputSchema.safeParse(input);
  return r.error?.issues.map((i) => `${i.path.join('.')}: ${i.message}`) ?? [];
};

describe('a flyer from a brief', () => {
  it('fills an Activity flyer: headline, chips, extras and share text, with no photo yet', () => {
    const brief: Brief = {
      hostel: 'adeje-nest',
      template: 'activity',
      text: { eyebrow: 'TODAY', headline1: 'Stretching +', headline2: 'Sunset.', headlineEs: 'Estiramientos y atardecer.' },
      when: 'Today · 19:00',
      where: 'Pool area',
      cost: 'Free · bring water',
      extras: ['Bring a towel', 'Comfy clothes'],
      share: '¡HOY tenemos plan! 🌅\n\n---\n\nTODAY we have a plan! 🌅',
    };
    const input = flyerFromBrief(brief, 'Adeje Nest', DAY);
    expect(valid(input)).toEqual([]);
    expect(input).toMatchObject({ title: 'Stretching + Sunset', hostel: 'adeje-nest', template: 'activity', photoId: null });
    expect(input.data.photoMode).toBe('none');
    expect(input.data.text).toEqual({ ...newFlyerData().text, ...brief.text });
    expect(input.data.chips.map((c) => [c.key, c.value])).toEqual([
      ['when', 'Today · 19:00'],
      ['where', 'Pool area'],
      ['cost', 'Free · bring water'],
    ]);
    expect(input.data.extras).toEqual(brief.extras);
    expect(input.data.share).toBe(brief.share);
  });

  it('carries the brief’s labels in the list’s order, and none when the brief names none', () => {
    const [first, second] = LABEL_SLUGS;
    const input = flyerFromBrief({ hostel: null, template: 'activity', text: { headline1: 'Quiz night' }, labels: [second, first, second] }, null, DAY);
    expect(valid(input)).toEqual([]);
    expect(input.data.labels).toEqual([first, second]);
    expect(flyerFromBrief({ hostel: null, template: 'week' }, null, DAY).data.labels).toEqual([]);
    expect(flyerFromBrief({ hostel: null, template: 'week', labels: [second] }, null, DAY).data.labels, 'a This week flyer too').toEqual([second]);
  });

  it('makes the flyer in the look it is given, and in the first look when given none', () => {
    const brief = { hostel: null, template: 'activity', text: { headline1: 'Quiz night' } } as const;
    expect(flyerFromBrief(brief, null, DAY).data.look).toBe(FIRST_LOOK);
    // Whatever look the site's list starts with (its loader checked it): the brief has no say in it.
    const input = flyerFromBrief(brief, null, DAY, 'a-site-first-look');
    expect(input.data.look).toBe('a-site-first-look');
    expect(Object.keys(input.data).at(-1), 'still last, as newFlyerData() writes it').toBe('look');
    expect(flyerFromBrief({ hostel: null, template: 'week' }, null, DAY, 'a-site-first-look').data.look, 'a This week flyer too').toBe('a-site-first-look');
  });

  it('leaves what a brief doesn’t say at the template’s defaults, and every empty field to collapse', () => {
    const input = flyerFromBrief({ hostel: null, template: 'activity', text: { headline1: 'Quiz night' } }, null, DAY);
    expect(valid(input)).toEqual([]);
    const d = newFlyerData('activity');
    expect(input.data).toEqual({ ...d, photoMode: 'none', text: { ...d.text, headline1: 'Quiz night' } });
    expect(input.title).toBe('Quiz night');
  });

  it('gives a week flyer its hostel’s title lines, unless the brief writes its own', () => {
    const row = { day: 'Monday', name: 'Surf lesson', time: '10:00', cost: '35€' };
    const week = flyerFromBrief({ hostel: 'duque-nest', template: 'week', week: [row] }, 'Duque Nest', DAY);
    expect(valid(week)).toEqual([]);
    expect(week.data.text).toMatchObject(weekTitle('Duque Nest'));
    expect(week.data.week).toEqual([row]);
    expect(week.title).toBe('This week · Duque Nest · 1 Oct');

    const own = flyerFromBrief({ hostel: 'duque-nest', template: 'week', title: ' Surf week ', text: { headline2: 'surf week.' } }, 'Duque Nest', DAY);
    expect(own.data.text.headline2).toBe('surf week.');
    expect(own.title).toBe('Surf week');
  });

  it('builds a flyer the API refuses when the copy is past a limit, so the script reports it before sending', () => {
    const input = flyerFromBrief({ hostel: null, template: 'activity', text: { eyebrow: 'x'.repeat(19) } }, null, DAY);
    expect(valid(input)).toEqual(['data.text.eyebrow: Too big: expected string to have <=18 characters']);
  });
});

/* A model writes a blank where it has nothing to say: claude-haiku-4-5 wrote " " as a fourth extra (2026-10-04). The
   flyer printed nothing for it, but the editor opened with an empty field, and a headline line of one space would have
   printed as an empty line. A hand-written "" already means "print nothing"; a field of spaces now means the same. */
describe('what a brief leaves blank', () => {
  const base = { hostel: null, template: 'activity' } as const;

  it('drops an extra that says nothing, and trims the ones that do', () => {
    const input = flyerFromBrief({ ...base, extras: ['Bring water', ' ', '', '  Bring a towel '] }, null, DAY);
    expect(valid(input)).toEqual([]);
    expect(input.data.extras).toEqual(['Bring water', 'Bring a towel']);
  });

  it('reads a line that holds only spaces as an empty one, which prints nothing', () => {
    const input = flyerFromBrief({ ...base, text: { headline1: 'Quiz night', headlineEs: '   ', askEs: '\n' } }, null, DAY);
    expect([input.data.text.headline1, input.data.text.headlineEs, input.data.text.askEs]).toEqual(['Quiz night', '', '']);
  });

  it('reads a chip that holds only spaces as an empty one', () => {
    const input = flyerFromBrief({ ...base, when: 'Tonight · 21:00', cost: ' ' }, null, DAY);
    expect(input.data.chips.map((c) => c.value)).toEqual(['Tonight · 21:00', '', '']);
  });

  it('reads a share text that holds only spaces as none', () => {
    expect(flyerFromBrief({ ...base, share: ' \n ' }, null, DAY).data.share).toBe('');
  });

  it('leaves out a week row with nothing in it', () => {
    const row = { day: 'Monday', name: 'Surf lesson', time: '10:00', cost: '35€' };
    const blank = { day: ' ', name: '', time: '', cost: ' · ' };
    const input = flyerFromBrief({ hostel: null, template: 'week', week: [blank, row, blank] }, null, DAY);
    expect(input.data.week).toEqual([row]);
  });
});

describe('a brief file', () => {
  it('refuses a misspelt key, at any level', () => {
    expect(BriefSchema.safeParse({ hostel: null, template: 'activity', whenn: 'x' }).success).toBe(false);
    expect(BriefSchema.safeParse({ hostel: null, template: 'activity', text: { headline: 'x' } }).success).toBe(false);
    expect(BriefSchema.safeParse({ hostel: null, template: 'activity', text: { headline1: 'x' } }).success).toBe(true);
  });
});
