import { afterAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { FlyerListItemSchema, FlyerPayloadSchema, FlyerSavedSchema } from '../../src/shared/schema.js';
import { fails, flyerInput, flyers, hostelName, ok, send } from './client.js';

const mine = flyers();
afterAll(() => mine.archiveAll());

const list = (query = '') => ok(send('GET', `api/flyers${query}`), z.array(FlyerListItemSchema));
const listed = async (ids: number[], query = '') => (await list(query)).filter((f) => ids.includes(f.id));

describe('flyers', () => {
  it('create (201), read, update (200), with the hostel resolved', async () => {
    const created = await mine.create(flyerInput({ hostel: 'duque-nest' }));
    expect(created.flyer).toMatchObject({ id: created.id, hostel: 'duque-nest', template: 'activity', photoId: null });
    expect(created.flyer.createdAt).toBe(created.flyer.updatedAt);

    const got = await ok(send('GET', `api/flyers/${created.id}`), FlyerPayloadSchema);
    expect(got.flyer).toEqual(created.flyer);
    expect(got.hostel).toMatchObject({ slug: 'duque-nest', name: hostelName('duque-nest') });
    expect(got.photo).toBeNull();

    const text = { ...created.flyer.data.text, headline2: 'pizza party.' };
    const updated = await ok(
      send('PUT', `api/flyers/${created.id}`, flyerInput({ title: created.flyer.title, data: { ...created.flyer.data, text } })),
      FlyerSavedSchema,
    );
    expect(updated.flyer.data.text.headline2).toBe('pizza party.');
    expect(updated.flyer.hostel).toBeNull();
    expect(updated.flyer.createdAt).toBe(created.flyer.createdAt);
    expect(updated.flyer.updatedAt >= created.flyer.updatedAt).toBe(true);
    const again = await ok(send('GET', `api/flyers/${created.id}`), FlyerPayloadSchema);
    expect(again.hostel).toBeNull();
  });

  it('lists newest first, and filters by hostel, chain-wide ("none") and template', async () => {
    const a = (await mine.create(flyerInput({ hostel: 'duque-nest' }))).id;
    const b = (await mine.create(flyerInput())).id;
    const c = (await mine.create(flyerInput({ hostel: 'flamingo-nest' }))).id;
    const ids = [a, b, c];
    const all = await listed(ids);
    expect(all.map((f) => f.id)).toEqual([c, b, a]);
    expect(all.find((f) => f.id === c)).toMatchObject({ hostel: 'flamingo-nest', hostelName: hostelName('flamingo-nest'), template: 'activity' });
    expect(all.find((f) => f.id === b)).toMatchObject({ hostel: null, hostelName: null });
    expect((await listed(ids, '?hostel=duque-nest')).map((f) => f.id)).toEqual([a]);
    expect((await listed(ids, '?hostel=none')).map((f) => f.id)).toEqual([b]);
    expect(await listed(ids, '?hostel=nowhere-nest')).toEqual([]);
    expect((await listed(ids, '?template=activity')).map((f) => f.id)).toEqual([c, b, a]);
    expect(await listed(ids, '?template=week')).toEqual([]);
  });

  it('DELETE archives (204): gone from reads, lists and writes', async () => {
    const { id } = await mine.create();
    const res = await send('DELETE', `api/flyers/${id}`);
    expect(res.status).toBe(204);
    expect(await res.text()).toBe('');
    await fails(send('GET', `api/flyers/${id}`), 'no_such_flyer');
    expect(await listed([id])).toEqual([]);
    await fails(send('DELETE', `api/flyers/${id}`), 'no_such_flyer');
    await fails(send('PUT', `api/flyers/${id}`, flyerInput()), 'no_such_flyer');
  });

  it('an id that is not a positive integer, or unknown, is 404', async () => {
    for (const id of ['0', '-3', 'abc', '1.5', '99999999']) {
      await fails(send('GET', `api/flyers/${id}`), 'no_such_flyer');
      await fails(send('DELETE', `api/flyers/${id}`), 'no_such_flyer');
    }
    // The id is checked before the body is validated.
    await fails(send('PUT', 'api/flyers/abc', { nonsense: true }), 'no_such_flyer');
  });
});
