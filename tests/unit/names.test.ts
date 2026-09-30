import { describe, expect, it } from 'vitest';
import { followHostel, newFlyerData } from '../../src/shared/defaults.js';
import { TITLE_MAX, copyTitle, libraryDate, libraryName } from '../../src/shared/names.js';
import { FlyerInputSchema, type FlyerData, type FlyerText } from '../../src/shared/schema.js';

/* What an untitled flyer is called in the library (the owner's answer of 2026-09-30): an untitled week flyer is
   named for its hostel and the day it was first saved, while its title still reads the defaults; any other flyer is
   named by its headline. Either way the name fits the title's limit, so a first save never fails on it. */

const DAY = new Date(2026, 8, 30, 12);
const codePoints = (s: string) => Array.from(s).length;
const withLines = (template: FlyerData['template'], lines: Partial<FlyerText>): FlyerData => {
  const d = newFlyerData(template);
  return { ...d, text: { ...d.text, ...lines } };
};

describe('an untitled flyer’s library name', () => {
  it('fits the title’s limit, cut by code points, so a first save never fails on it', () => {
    // Two full headline lines and no final dot: 81 code points, with an emoji at the 80th.
    const data = withLines('activity', { headline1: 'x'.repeat(40), headline2: `${'y'.repeat(38)}😀z` });
    const name = libraryName(data, null, DAY);
    const input = FlyerInputSchema.safeParse({ title: name, hostel: null, template: data.template, data, photoId: null });
    expect(input.error?.issues.map((i) => `${i.path.join('.')}: ${i.message}`) ?? []).toEqual([]);
    expect(codePoints(name)).toBe(TITLE_MAX);
    expect(name.endsWith('😀'), 'the emoji at the cut stays whole').toBe(true);
  });

  it('names a week flyer whose title still reads the defaults for its hostel and the day', () => {
    const duque = followHostel(newFlyerData('week'), null, 'Duque Nest');
    expect(libraryName(duque, 'Duque Nest', DAY)).toBe('This week · Duque Nest · 30 Sept');
    expect(libraryName(newFlyerData('week'), null, DAY)).toBe('This week · 30 Sept');
    // The Spanish line doesn't name the flyer: edited alone, the title still reads the defaults.
    expect(libraryName({ ...duque, text: { ...duque.text, headlineEs: 'Nuestra semana.' } }, 'Duque Nest', DAY)).toBe('This week · Duque Nest · 30 Sept');
  });

  it('names a week flyer by the title lines someone typed, as today', () => {
    expect(libraryName(withLines('week', { headline1: 'Surf', headline2: 'week.' }), 'Duque Nest', DAY)).toBe('Surf week');
  });

  it('names an Activity flyer by its headline, whatever it says', () => {
    expect(libraryName(withLines('activity', { headline1: 'Pool', headline2: 'party.' }), 'Duque Nest', DAY)).toBe('Pool party');
    expect(libraryName(withLines('activity', { headline1: 'What’s on', headline2: 'this week.' }), 'Duque Nest', DAY)).toBe('What’s on this week');
    expect(libraryName(newFlyerData('activity'), null, DAY)).toBe('Untitled flyer');
  });
});

describe('the library’s dates', () => {
  it('one format: a card shows the day, the month and the time, a week flyer’s name the day and the month', () => {
    expect(libraryDate(DAY, true)).toBe('30 Sept, 12:00');
    expect(libraryDate(DAY)).toBe('30 Sept');
  });
});

describe('a duplicate’s name', () => {
  it('keeps “ (copy)” and the title’s limit, cutting the name by code points', () => {
    expect(copyTitle('Pool party')).toBe('Pool party (copy)');
    const long = copyTitle(`${'a'.repeat(72)}😀bcdefgh`);
    expect(codePoints(long)).toBe(TITLE_MAX);
    expect(long).toBe(`${'a'.repeat(72)}😀 (copy)`);
  });
});
