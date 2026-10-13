import { afterAll, describe, expect, it } from 'vitest';
import { newFlyerData } from '../../src/shared/defaults.js';
import { LABELS_MAX, LABEL_SLUGS, LABEL_SLUG_MAX } from '../../src/shared/labels.js';
import { FlyerPayloadSchema, FlyerSavedSchema } from '../../src/shared/schema.js';
import { SHARE_MAX } from '../../src/shared/share.js';
import { TEXT_LIMITS } from '../../src/shared/text.js';
import { fails, flyerInput, flyers, ok, send } from './client.js';

/* What every backend does to a flyer body: zod's rules (src/shared/schema.ts,
   generated as schema/flyer.schema.json for PHP) plus the normalisation in
   src/shared/normalize.ts. */

const mine = flyers();
afterAll(() => mine.archiveAll());

/** POST a body, expect 400 invalid, return the field keys. */
async function invalidFields(body: unknown): Promise<string[]> {
  const error = await fails(send('POST', 'api/flyers', body), 'invalid');
  return Object.keys(error.fields ?? {}).sort();
}

describe('normalisation', () => {
  it('trims the title the way JavaScript trim() does', async () => {
    const created = await mine.create(flyerInput({ title: ' ﻿  Pool party  \n' }));
    expect(created.flyer.title).toBe('Pool party');
    // U+0085 (NEL) and U+200B are not whitespace to trim().
    const kept = await mine.create(flyerInput({ title: 'Pool​' }));
    expect(kept.flyer.title).toBe('Pool​');
  });

  it('fills defaults, strips unknown keys at every level, and keeps record keys', async () => {
    const { v: _v, photoCrop: _c, showPill: _s, week: _w, overrides: _o, share: _h, labels: _l, ...data } = newFlyerData('activity');
    const body = {
      ...flyerInput(),
      junk: 1,
      data: {
        ...data,
        junk: { deep: true },
        text: { ...data.text, junk: 'x' },
        doodles: [{ slug: 'spark-teal', x: 1, y: 2, w: 50, extra: true }],
        overrides: { headline: { dy: 5 }, chips: { order: ['cost'], junk: 1 } },
      },
    };
    const { flyer } = await mine.create(body);
    expect(flyer.data).toEqual({
      ...newFlyerData('activity'),
      doodles: [{ slug: 'spark-teal', x: 1, y: 2, w: 50, rot: 0 }],
      overrides: { headline: { dx: 0, dy: 5, scale: 1 }, chips: { dx: 0, dy: 0, scale: 1, order: ['cost'] } },
    });
    const empty = await mine.create({ ...flyerInput(), data: { ...data, overrides: {} } });
    expect(empty.flyer.data.overrides).toEqual({});
    expect(empty.flyer.data.week).toEqual([]);
  });

  it('the template column wins over data.template', async () => {
    const { flyer } = await mine.create(flyerInput({ template: 'activity', data: { ...newFlyerData('week') } }));
    expect(flyer.template).toBe('activity');
    expect(flyer.data.template).toBe('activity');
  });

  it('the template column wins over data.template, the other way too', async () => {
    const { flyer } = await mine.create(flyerInput({ template: 'week', data: { ...newFlyerData('activity') } }));
    expect([flyer.template, flyer.data.template]).toEqual(['week', 'week']);
  });

  it('an empty hostel means chain-wide', async () => {
    const { id, flyer } = await mine.create(flyerInput({ hostel: '' }));
    expect(flyer.hostel).toBeNull();
    const payload = await ok(send('GET', `api/flyers/${id}`), FlyerPayloadSchema);
    expect(payload.hostel).toBeNull();
  });

  it('counts characters as code points: 21 emoji fit a 40-character line', async () => {
    const d = newFlyerData('activity');
    const { flyer } = await mine.create(flyerInput({ data: { ...d, text: { ...d.text, headline1: '😀'.repeat(21) } } }));
    expect(flyer.data.text.headline1).toBe('😀'.repeat(21));
    expect(await invalidFields(flyerInput({ data: { ...d, text: { ...d.text, headline1: '😀'.repeat(41) } } }))).toEqual(['data.text.headline1']);
  });
});

describe('validation', () => {
  const d = newFlyerData('activity');

  it('names each bad field by its dotted path', async () => {
    expect(await invalidFields(flyerInput({ title: '' }))).toEqual(['title']);
    expect(await invalidFields(flyerInput({ title: ' \t ' }))).toEqual(['title']);
    expect(await invalidFields(flyerInput({ title: 'x'.repeat(81) }))).toEqual(['title']);
    const { photoId: _, ...noPhoto } = flyerInput();
    expect(await invalidFields(noPhoto)).toEqual(['photoId']);
    expect(await invalidFields(flyerInput({ template: 'poster' as never }))).toEqual(['template']);
    const chips = d.chips.map((c, i) => (i === 0 ? { ...c, label: 'x'.repeat(13) } : c));
    expect(await invalidFields(flyerInput({ data: { ...d, chips } }))).toEqual(['data.chips.0.label']);
    expect(await invalidFields(flyerInput({ data: { ...d, colors: { ...d.colors, bg: '#aabbcc\n' } } }))).toEqual(['data.colors.bg']);
    expect(await invalidFields(flyerInput({ data: { ...d, photoCrop: { x: 0.5, y: 0.5, zoom: 5 } } }))).toEqual(['data.photoCrop.zoom']);
    expect(await invalidFields(flyerInput({ data: { ...d, photoCrop: null as never } }))).toEqual(['data.photoCrop']);
    expect(await invalidFields(flyerInput({ data: { ...d, extras: ['a', 'b', 'c', 'd', 'e'] } }))).toEqual(['data.extras']);
    expect(await invalidFields(flyerInput({ photoId: 1.5 }))).toEqual(['photoId']);
    expect(await invalidFields(flyerInput({ photoId: '1' as never }))).toEqual(['photoId']);
  });

  it('checks the week rows: at most five, each field to its limit, every field but the short name required', async () => {
    const w = newFlyerData('week');
    const row = { day: 'Fridays', name: 'Surf lesson', time: '15:00', cost: '40€' };
    const withRows = (week: unknown[]) => flyerInput({ template: 'week', data: { ...w, week: week as never } });
    expect(await invalidFields(withRows(Array.from({ length: 6 }, () => row)))).toEqual(['data.week']);
    expect(await invalidFields(withRows([{ ...row, name: 'x'.repeat(81) }]))).toEqual(['data.week.0.name']);
    expect(await invalidFields(withRows([row, { ...row, shortName: 'x'.repeat(61) }]))).toEqual(['data.week.1.shortName']);
    const { time: _, ...noTime } = row;
    expect(await invalidFields(withRows([noTime]))).toEqual(['data.week.0.time']);
    const { flyer } = await mine.create(withRows([row, { ...row, shortName: 'Surf' }]));
    expect(flyer.data.week).toEqual([row, { ...row, shortName: 'Surf' }]);
  });

  it('keeps the share text as typed, line breaks and emoji included, and holds it to its limit', async () => {
    const share = '🐱‍🏍¡HOY tenemos plan al atardecer! 🧘‍♀️✨\n\n🕖 19:00 h\n📍 Zona de la piscina\n\n---\n\n🌅 TODAY we have a sunset plan!';
    const { id, flyer } = await mine.create(flyerInput({ data: { ...d, share } }));
    expect(flyer.data.share).toBe(share);
    const updated = await ok(send('PUT', `api/flyers/${id}`, flyerInput({ data: { ...d, share: `${share}\n💙` } })), FlyerSavedSchema);
    expect(updated.flyer.data.share).toBe(`${share}\n💙`);
    // Counted in code points, as every other limit: a long caption of emoji fits exactly.
    expect((await mine.create(flyerInput({ data: { ...d, share: '🌅'.repeat(SHARE_MAX) } }))).flyer.data.share).toBe('🌅'.repeat(SHARE_MAX));
    expect(await invalidFields(flyerInput({ data: { ...d, share: '🌅'.repeat(SHARE_MAX + 1) } }))).toEqual(['data.share']);
  });

  it('keeps a flyer’s labels in the list’s order, once each, one off the list too; holds them to their shape and their number', async () => {
    const [first, second] = LABEL_SLUGS;
    const withLabels = (labels: unknown) => flyerInput({ data: { ...d, labels: labels as string[] } });
    const { id, flyer } = await mine.create(withLabels([second, 'off-the-list', first, second]));
    // A label is checked by its shape, never against the list: one taken off the list stays on its flyers.
    expect(flyer.data.labels).toEqual([first, second, 'off-the-list']);
    expect((await ok(send('GET', `api/flyers/${id}`), FlyerPayloadSchema)).flyer.data.labels, 'and it reads back').toEqual([first, second, 'off-the-list']);
    const updated = await ok(send('PUT', `api/flyers/${id}`, withLabels([second])), FlyerSavedSchema);
    expect(updated.flyer.data.labels).toEqual([second]);
    expect((await ok(send('PUT', `api/flyers/${id}`, withLabels([])), FlyerSavedSchema)).flyer.data.labels).toEqual([]);

    expect(await invalidFields(withLabels(['Not A Slug']))).toEqual(['data.labels.0']);
    expect(await invalidFields(withLabels([first, `${second}\n`]))).toEqual(['data.labels.1']);
    expect(await invalidFields(withLabels(['x'.repeat(LABEL_SLUG_MAX + 1)]))).toEqual(['data.labels.0']);
    expect(await invalidFields(withLabels(Array.from({ length: LABELS_MAX + 1 }, (_, i) => `label-${i}`)))).toEqual(['data.labels']);
    expect(await invalidFields(withLabels(first))).toEqual(['data.labels']);
    const most = Array.from({ length: LABELS_MAX }, (_, i) => `label-${i}`);
    expect((await mine.create(withLabels(most))).flyer.data.labels).toEqual(most);
  });

  it('holds each line of copy to its limit, and names the line: a tag of 24 is saved, one of 25 refused', async () => {
    const withText = (text: Partial<typeof d.text>) => flyerInput({ data: { ...d, text: { ...d.text, ...text } } });
    // The pill's two lines, as the editor's UX round left them (Part 4): the tag doubled, the handle as it was.
    expect([TEXT_LIMITS.handle, TEXT_LIMITS.tag]).toEqual([18, 24]);
    const tag = '¡TAG US FOR A FREE SHOT!';
    expect([...tag].length).toBe(24);
    const { id, flyer } = await mine.create(withText({ tag }));
    expect(flyer.data.text.tag).toBe(tag);
    expect((await ok(send('GET', `api/flyers/${id}`), FlyerPayloadSchema)).flyer.data.text.tag, 'and it reads back').toBe(tag);
    expect(await invalidFields(withText({ tag: `${tag}!` }))).toEqual(['data.text.tag']);
    // Every line, at its limit and one past it, counted in code points.
    for (const [line, max] of Object.entries(TEXT_LIMITS)) {
      const kept = await mine.create(withText({ [line]: '🌅'.repeat(max) }));
      expect(kept.flyer.data.text[line as keyof typeof d.text], `${line} at ${max}`).toBe('🌅'.repeat(max));
      expect(await invalidFields(withText({ [line]: '🌅'.repeat(max + 1) })), `${line} at ${max + 1}`).toEqual([`data.text.${line}`]);
    }
  });

  it('reports every bad field at once', async () => {
    const chips = d.chips.map((c, i) => (i === 1 ? { ...c, value: 'x'.repeat(91) } : c));
    expect(await invalidFields(flyerInput({ title: '', data: { ...d, chips, colors: { ...d.colors, ink: 'red' } } }))).toEqual([
      'data.chips.1.value',
      'data.colors.ink',
      'title',
    ]);
  });

  it('a body that is not an object is reported at "_"', async () => {
    expect(await invalidFields([])).toEqual(['_']);
  });

  it('ignores a number it cannot represent under a key it strips anyway', async () => {
    const body = JSON.stringify({ ...flyerInput(), junk: 7 }).replace('"junk":7', '"junk":1e400');
    const { flyer } = await mine.create(body);
    expect(flyer).not.toHaveProperty('junk');
  });

  it('reports a non-finite number together with every other bad field', async () => {
    const body = JSON.stringify(flyerInput({ title: '', data: { ...d, photoCrop: { x: 7, y: 0.5, zoom: 1 } } })).replace('"x":7', '"x":1e400');
    const error = await fails(send('POST', 'api/flyers', body), 'invalid');
    expect(Object.keys(error.fields ?? {}).sort()).toEqual(['data.photoCrop.x', 'title']);
  });

  it('rejects numbers JSON can carry but JavaScript cannot (1e400)', async () => {
    const body = JSON.stringify(flyerInput({ data: { ...d, doodles: [{ slug: 'spark-teal', x: 7, y: 2, w: 50, rot: 0 }] } })).replace('"x":7', '"x":1e400');
    const error = await fails(send('POST', 'api/flyers', body), 'invalid');
    expect(Object.keys(error.fields ?? {})).toEqual(['data.doodles.0.x']);
  });

  it('checks the schema first, then the hostel, then the photo', async () => {
    expect(await invalidFields(flyerInput({ title: '', hostel: 'nowhere-nest' }))).toEqual(['title']);
    await fails(send('POST', 'api/flyers', flyerInput({ hostel: 'nowhere-nest', photoId: 99999999 })), 'unknown_hostel');
    await fails(send('POST', 'api/flyers', flyerInput({ photoId: 99999999 })), 'unknown_photo');
  });

  it('a body that is not JSON is malformed', async () => {
    await fails(send('POST', 'api/flyers', '{"title": '), 'malformed');
  });
});
