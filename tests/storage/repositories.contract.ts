import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SEED_FILE } from '../../server/paths.js';
import { applySeedFile } from '../../server/storage/seed.js';
import { MissingReferenceError, type Clock, type Repositories } from '../../server/storage/types.js';
import { SAMPLE_FLYERS } from '../../src/shared/samples.js';
import type { FlyerInput } from '../../src/shared/schema.js';

/* One behaviour for every storage driver (Liskov): each driver's test file
   calls describeRepositoryContract with a factory for a fresh, empty store.
   Rules the HTTP layer owns (trim, template column, empty hostel) are in the
   HTTP contract suite instead; drivers store exactly what they are given. */

export class FakeClock implements Clock {
  private t = Date.parse('2026-09-18T10:00:00.000Z');
  now() {
    return new Date(this.t).toISOString();
  }
  tick(ms = 1000) {
    this.t += ms;
  }
}

export type RepositoryFactory = (clock: Clock) => Promise<{ repos: Repositories; cleanup: () => Promise<void> }>;

const data = SAMPLE_FLYERS[0].data;
const input = (over: Partial<FlyerInput> = {}): FlyerInput => ({ title: 'A flyer', hostel: null, template: 'activity', data, photoId: null, ...over });
const photoPath = (n: number) => `uploads/2026/09/${n.toString(16).padStart(16, '0')}.jpg`;
const hostel = (slug: string, name: string, sortOrder = 10) => ({ slug, name, island: 'Tenerife', logoPath: null, sortOrder });

export function describeRepositoryContract(name: string, factory: RepositoryFactory) {
  describe(`${name} repositories`, () => {
    let repos: Repositories;
    let cleanup: () => Promise<void>;
    let clock: FakeClock;

    beforeEach(async () => {
      clock = new FakeClock();
      ({ repos, cleanup } = await factory(clock));
    });
    afterEach(async () => {
      await repos.close();
      await cleanup();
    });

    describe('hostels', () => {
      it('list by sortOrder, then name in code-point order, then id', async () => {
        for (const n of ['B', 'a', 'Á', '10', '9']) await repos.hostels.upsert(hostel(`h-${n.codePointAt(0)}`, n));
        await repos.hostels.upsert(hostel('first', 'Zed', 5));
        // Equal sortOrder and name: id decides, whatever the insertion order.
        for (const id of [90, 30, 60]) await repos.hostels.put({ id, ...hostel(`twin-${id}`, 'Twin', 7) });
        const list = await repos.hostels.list();
        expect(list.map((h) => h.name)).toEqual(['Zed', 'Twin', 'Twin', 'Twin', '10', '9', 'B', 'a', 'Á']);
        expect(list.filter((h) => h.name === 'Twin').map((h) => h.id)).toEqual([30, 60, 90]);
      });

      it('upsert by slug keeps the id and updates the rest; bySlug finds it', async () => {
        await repos.hostels.upsert(hostel('duque-nest', 'Duque'));
        const before = (await repos.hostels.bySlug('duque-nest'))!;
        await repos.hostels.upsert({ slug: 'duque-nest', name: 'Duque Nest', island: 'Tenerife South', logoPath: 'assets/x.png', sortOrder: 3 });
        expect(await repos.hostels.bySlug('duque-nest')).toEqual({
          id: before.id,
          slug: 'duque-nest',
          name: 'Duque Nest',
          island: 'Tenerife South',
          logoPath: 'assets/x.png',
          sortOrder: 3,
        });
        expect(await repos.hostels.bySlug('nowhere')).toBeNull();
        expect(await repos.hostels.list()).toHaveLength(1);
      });

      it('put keeps the given id, and later upserts keep it too', async () => {
        await repos.hostels.put({ id: 42, ...hostel('flamingo-nest', 'Flamingo') });
        await repos.hostels.upsert(hostel('flamingo-nest', 'Flamingo Nest'));
        await repos.hostels.upsert(hostel('new-nest', 'New'));
        const all = await repos.hostels.list();
        expect(all.find((h) => h.slug === 'flamingo-nest')).toMatchObject({ id: 42, name: 'Flamingo Nest' });
        expect(all.find((h) => h.slug === 'new-nest')!.id).toBeGreaterThan(42);
      });
    });

    describe('doodles', () => {
      it('list built-ins first, then kind, then label, then id', async () => {
        await repos.doodles.upsert({ slug: 'staff', label: 'Aardvark', path: 'uploads/doodles/a.png', kind: 'icon', builtin: false });
        await repos.doodles.upsert({ slug: 'b', label: 'Spark', path: 'assets/art/b.png', kind: 'spark', builtin: true });
        await repos.doodles.upsert({ slug: 'a', label: 'Pin', path: 'assets/art/a.png', kind: 'icon', builtin: true });
        await repos.doodles.upsert({ slug: 'c', label: 'Clock', path: 'assets/art/c.png', kind: 'icon', builtin: true });
        for (const id of [90, 30, 60]) await repos.doodles.put({ id, slug: `twin-${id}`, label: 'Twin', path: 'assets/art/t.png', kind: 'icon', builtin: true });
        expect((await repos.doodles.list()).map((d) => d.slug)).toEqual(['c', 'a', 'twin-30', 'twin-60', 'twin-90', 'b', 'staff']);
      });

      it('upsert keeps the id, updates label/path/kind, never flips builtin', async () => {
        await repos.doodles.upsert({ slug: 'spark', label: 'Spark', path: 'assets/art/spark.png', kind: 'spark', builtin: true });
        const id = (await repos.doodles.list())[0].id;
        await repos.doodles.upsert({ slug: 'spark', label: 'Teal spark', path: 'assets/art/spark-teal.png', kind: 'sparks', builtin: false });
        expect(await repos.doodles.list()).toEqual([
          { id, slug: 'spark', label: 'Teal spark', path: 'assets/art/spark-teal.png', kind: 'sparks', builtin: true },
        ]);
      });

      it('put keeps the given id and builtin flag', async () => {
        await repos.doodles.put({ id: 9, slug: 'mine', label: 'Mine', path: 'uploads/doodles/m.png', kind: 'icon', builtin: false });
        expect(await repos.doodles.list()).toEqual([{ id: 9, slug: 'mine', label: 'Mine', path: 'uploads/doodles/m.png', kind: 'icon', builtin: false }]);
        await repos.doodles.upsert({ slug: 'next', label: 'Next', path: 'assets/art/n.png', kind: 'icon', builtin: true });
        expect((await repos.doodles.list()).find((d) => d.slug === 'next')!.id).toBeGreaterThan(9);
      });
    });

    describe('photos', () => {
      it('insert stamps createdAt and hands out new ids; get finds them', async () => {
        const a = await repos.photos.insert({ path: photoPath(1), width: 3240, height: 1620 });
        clock.tick();
        const b = await repos.photos.insert({ path: photoPath(2), width: 800, height: 600 });
        expect(a).toEqual({ id: a.id, path: photoPath(1), width: 3240, height: 1620, createdAt: '2026-09-18T10:00:00.000Z' });
        expect(b.id).toBeGreaterThan(a.id);
        expect(await repos.photos.get(b.id)).toEqual(b);
        expect(await repos.photos.get(9999)).toBeNull();
      });

      it('put keeps id and createdAt; the next insert gets a higher id; all() is by id', async () => {
        const kept = { id: 30, path: photoPath(30), width: 10, height: 20, createdAt: '2025-01-02T03:04:05.678Z' };
        await repos.photos.put(kept);
        await repos.photos.put({ ...kept, id: 7, path: photoPath(7) });
        const next = await repos.photos.insert({ path: photoPath(31), width: 1, height: 1 });
        expect(next.id).toBeGreaterThan(30);
        expect((await repos.photos.all()).map((p) => p.id)).toEqual([7, 30, next.id]);
        expect(await repos.photos.get(30)).toEqual(kept);
      });
    });

    describe('flyers', () => {
      beforeEach(async () => {
        await repos.hostels.upsert(hostel('duque-nest', 'Duque Nest'));
        await repos.hostels.upsert(hostel('flamingo-nest', 'Flamingo Nest', 20));
      });

      it('create stores the input as given, stamped createdAt = updatedAt', async () => {
        const photo = await repos.photos.insert({ path: photoPath(1), width: 100, height: 50 });
        const id = await repos.flyers.create(input({ hostel: 'duque-nest', photoId: photo.id, title: 'Pool party' }));
        expect(await repos.flyers.get(id)).toEqual({
          id,
          hostel: 'duque-nest',
          template: 'activity',
          title: 'Pool party',
          data,
          photoId: photo.id,
          createdAt: '2026-09-18T10:00:00.000Z',
          updatedAt: '2026-09-18T10:00:00.000Z',
        });
      });

      it('rejects a hostel or photo that does not exist', async () => {
        await expect(repos.flyers.create(input({ hostel: 'nowhere' }))).rejects.toBeInstanceOf(MissingReferenceError);
        await expect(repos.flyers.create(input({ photoId: 404 }))).rejects.toBeInstanceOf(MissingReferenceError);
        expect(await repos.flyers.list({})).toEqual([]);
      });

      it('update bumps updatedAt, keeps createdAt, and misses missing flyers', async () => {
        const id = await repos.flyers.create(input());
        clock.tick();
        expect(await repos.flyers.update(id, input({ title: 'Renamed', hostel: 'flamingo-nest' }))).toBe(true);
        expect(await repos.flyers.get(id)).toMatchObject({
          title: 'Renamed',
          hostel: 'flamingo-nest',
          createdAt: '2026-09-18T10:00:00.000Z',
          updatedAt: '2026-09-18T10:00:01.000Z',
        });
        expect(await repos.flyers.update(9999, input())).toBe(false);
      });

      it('archive is a soft delete that bumps updatedAt and hides the flyer', async () => {
        const id = await repos.flyers.create(input());
        clock.tick();
        expect(await repos.flyers.archive(id)).toBe(true);
        expect(await repos.flyers.get(id)).toBeNull();
        expect(await repos.flyers.list({})).toEqual([]);
        expect(await repos.flyers.archive(id)).toBe(false);
        expect(await repos.flyers.update(id, input())).toBe(false);
        expect(await repos.flyers.archive(9999)).toBe(false);
        const [stored] = await repos.flyers.all();
        expect(stored).toMatchObject({ id, archived: true, updatedAt: '2026-09-18T10:00:01.000Z' });
      });

      it('list is newest first (updatedAt, then id) with current hostel names', async () => {
        const a = await repos.flyers.create(input({ title: 'a', hostel: 'duque-nest' }));
        const b = await repos.flyers.create(input({ title: 'b' })); // same timestamp as a
        clock.tick();
        const c = await repos.flyers.create(input({ title: 'c', hostel: 'flamingo-nest' }));
        clock.tick();
        await repos.flyers.update(a, input({ title: 'a2', hostel: 'duque-nest' }));
        await repos.hostels.upsert(hostel('duque-nest', 'Duque Nest Hostel'));
        expect(await repos.flyers.list({})).toEqual([
          { id: a, title: 'a2', template: 'activity', hostel: 'duque-nest', hostelName: 'Duque Nest Hostel', updatedAt: '2026-09-18T10:00:02.000Z' },
          { id: c, title: 'c', template: 'activity', hostel: 'flamingo-nest', hostelName: 'Flamingo Nest', updatedAt: '2026-09-18T10:00:01.000Z' },
          { id: b, title: 'b', template: 'activity', hostel: null, hostelName: null, updatedAt: '2026-09-18T10:00:00.000Z' },
        ]);
      });

      it('list breaks updatedAt ties by id, descending, whatever the insertion order', async () => {
        const at = '2026-01-01T00:00:00.000Z';
        for (const id of [9, 3, 6]) {
          await repos.flyers.put({ id, hostel: null, template: 'activity', title: `t${id}`, data, photoId: null, createdAt: at, updatedAt: at, archived: false });
        }
        expect((await repos.flyers.list({})).map((f) => f.id)).toEqual([9, 6, 3]);
      });

      it('list filters by hostel slug, "none" (chain-wide) and template', async () => {
        const duque = await repos.flyers.create(input({ title: 'duque', hostel: 'duque-nest' }));
        const chain = await repos.flyers.create(input({ title: 'chain' }));
        const week = await repos.flyers.create(input({ title: 'week', template: 'week', data: { ...data, template: 'week' } }));
        const ids = async (f: { hostel?: string; template?: string }) => (await repos.flyers.list(f)).map((x) => x.id).sort();
        expect(await ids({ hostel: 'duque-nest' })).toEqual([duque]);
        expect(await ids({ hostel: 'none' })).toEqual([chain, week].sort());
        expect(await ids({ hostel: 'nowhere' })).toEqual([]);
        expect(await ids({ template: 'week' })).toEqual([week]);
        expect(await ids({ template: 'nope' })).toEqual([]);
        expect(await ids({ hostel: '', template: '' })).toEqual([duque, chain, week].sort());
      });

      it('all() and put() round-trip ids, timestamps and archived; new ids continue above them', async () => {
        const photo = await repos.photos.insert({ path: photoPath(1), width: 100, height: 50 });
        const stored = [
          { id: 5, hostel: null, template: 'activity' as const, title: 'five', data, photoId: photo.id, createdAt: '2025-01-01T00:00:00.000Z', updatedAt: '2025-02-01T00:00:00.000Z', archived: true },
          { id: 12, hostel: 'duque-nest', template: 'activity' as const, title: 'twelve', data, photoId: null, createdAt: '2025-03-01T00:00:00.000Z', updatedAt: '2025-03-02T00:00:00.000Z', archived: false },
        ];
        for (const f of stored) await repos.flyers.put(f);
        expect(await repos.flyers.all()).toEqual(stored);
        const next = await repos.flyers.create(input());
        expect(next).toBeGreaterThan(12);
        await repos.flyers.put({ ...stored[1], title: 'twelve again' });
        expect((await repos.flyers.get(12))!.title).toBe('twelve again');
        await expect(repos.flyers.put({ ...stored[1], id: 13, hostel: 'nowhere' })).rejects.toBeInstanceOf(MissingReferenceError);
      });
    });

    describe('seeding', () => {
      it('applies seed/hostels.json idempotently, keeping ids', async () => {
        const first = await applySeedFile(repos, SEED_FILE);
        const ids = (await repos.hostels.list()).map((h) => h.id);
        const again = await applySeedFile(repos, SEED_FILE);
        expect(again).toEqual(first);
        expect(first.orphanHostels).toEqual([]);
        expect((await repos.hostels.list()).map((h) => h.id)).toEqual(ids);
        expect(await repos.hostels.list()).toHaveLength(first.hostels);
        expect(await repos.doodles.list()).toHaveLength(first.doodles);
      });
    });
  });
}
