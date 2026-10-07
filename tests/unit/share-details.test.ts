import { describe, expect, it } from 'vitest';
import { buildShareCall, type ShareInput } from '../../server/ai/prompt.js';
import { newFlyerData } from '../../src/shared/defaults.js';
import type { FlyerData } from '../../src/shared/schema.js';
import { SHARE_DETAILS, shareDetails } from '../../src/shared/share.js';

/* "The flyer's details" are what its caption is written from (src/shared/share.ts): the hostel, the template and the
   printed copy. The editor shows "Write with AI" again once they differ from the ones the caption was written from
   (the editor's UX round, Part 1), and the server's prompt reads the same list, so the two cannot drift. */

const flyer = (): FlyerData => ({ ...newFlyerData('activity'), extras: ['Towels'], share: 'Come!' });
const of = (data: FlyerData, hostel: string | null = 'adeje-nest') => shareDetails(hostel, data);

describe('the details a caption is written from', () => {
  it('change with the hostel, the template and each part of the printed copy', () => {
    const d = flyer();
    const changed: [string, string][] = [
      ['the hostel', of(d, null)],
      ['the template', of({ ...d, template: 'week' })],
      ['a line of text', of({ ...d, text: { ...d.text, headline1: 'Sunday is a' } })],
      ['a chip', of({ ...d, chips: d.chips.map((c) => (c.key === 'when' ? { ...c, value: 'Friday · 20:00' } : c)) })],
      ['an extra', of({ ...d, extras: ['Towels', 'Music'] })],
      ['a week row', of({ ...d, week: [{ day: 'Mon', name: 'Yoga', time: '9:00', cost: 'Free' }] })],
    ];
    for (const [what, details] of changed) expect(details, what).not.toBe(of(d));
  });

  it('do not change with the caption itself, the photo, its crop or how the flyer is laid out', () => {
    const d = flyer();
    const same: FlyerData[] = [
      { ...d, share: 'Another caption' },
      { ...d, photoMode: 'none' },
      { ...d, photoCrop: { ...d.photoCrop, zoom: 2 } },
      { ...d, showPill: !d.showPill },
    ];
    for (const other of same) expect(of(other)).toBe(of(d));
  });

  it('are the fields the server’s prompt reads: a field outside the list never reaches it', () => {
    const d = flyer();
    const input = (data: FlyerData): ShareInput => ({ hostel: null, template: data.template, data });
    const bundle = { prompts: { flyer: '', share: 'rules', photo: '' }, examples: [] };
    const call = (data: FlyerData) => JSON.stringify(buildShareCall(bundle, [], '2026-10-07T12:00:00.000Z', input(data)));
    const outside = Object.keys(d).filter((k) => k !== 'template' && !(SHARE_DETAILS as readonly string[]).includes(k)) as (keyof FlyerData)[];
    expect(outside.length).toBeGreaterThan(0);
    // The same flyer with every other field at another value writes the same prompt.
    const other = { ...d, share: 'x', photoMode: 'none', showPill: !d.showPill, photoCrop: { ...d.photoCrop, zoom: 3 } } as FlyerData;
    expect(call(other)).toBe(call(d));
    expect(call({ ...d, extras: ['Music'] })).not.toBe(call(d));
  });
});
