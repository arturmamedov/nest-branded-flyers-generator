import { afterAll, describe, expect, it } from 'vitest';
import { newFlyerData } from '../../src/shared/defaults.js';
import { FlyerPayloadSchema } from '../../src/shared/schema.js';
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
    const { v: _v, photoCrop: _c, showPill: _s, week: _w, overrides: _o, ...data } = newFlyerData('activity');
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
