import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import { LabelTableSchema, applyLabels, describeFlyers, tableProblem, type LabelTable } from '../../scripts/flyers/labelTable.js';
import type { SiteCall } from '../../scripts/site.js';
import { newFlyerData } from '../../src/shared/defaults.js';
import { FLYER_LABELS } from '../../src/shared/labels.js';

/* `npm run flyers:labels` (scripts/flyers/labelTable.ts), on a stand-in for a site: what it reads, what it writes,
   and all it refuses to touch. The site's API itself is the contract suite's. */

const [FIRST, SECOND] = FLYER_LABELS;
const SITE = 'https://flyers.example/app/';

interface Stored {
  title: string;
  hostel: string | null;
  template: string;
  data: Record<string, unknown>;
  photoId: number | null;
  updatedAt: string;
}

/** A site in memory, answering as the API does. `drops`: a release from before labels, which saves and reads none. */
function site(flyers: Record<number, Partial<Stored> & { labels?: string[] }>, { drops = false, onRead }: { drops?: boolean; onRead?: (id: number, store: Map<number, Stored>) => void } = {}) {
  const store = new Map<number, Stored>();
  for (const [id, f] of Object.entries(flyers)) {
    const { labels, ...rest } = f;
    const data = { ...newFlyerData(), ...(labels ? { labels } : {}), ...(rest.data ?? {}) } as Record<string, unknown>;
    if (drops) delete data.labels;
    store.set(Number(id), { title: `flyer ${id}`, hostel: null, template: 'activity', photoId: null, updatedAt: `2026-10-0${id}T10:00:00.000Z`, ...rest, data });
  }
  const calls: { method: string; path: string; body?: unknown }[] = [];
  const call: SiteCall = async <S extends z.ZodType>(method: string, path: string, schema: S, body?: unknown) => {
    calls.push({ method, path, ...(body === undefined ? {} : { body }) });
    const one = /^api\/flyers\/(\d+)$/.exec(path);
    let answer: unknown;
    if (method === 'GET' && path === 'api/flyers') {
      answer = [...store.entries()].map(([id, f]) => ({ id, title: f.title, template: f.template, hostel: f.hostel, hostelName: null, updatedAt: f.updatedAt })).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    } else if (method === 'GET' && one) {
      onRead?.(Number(one[1]), store);
      answer = { flyer: { id: Number(one[1]), ...store.get(Number(one[1]))! }, hostel: null, photo: null };
    } else if (method === 'PUT' && one) {
      const input = body as Stored;
      const data = { ...input.data };
      if (drops) delete data.labels;
      const saved = { ...input, data, updatedAt: '2026-10-14T12:00:00.000Z' };
      store.set(Number(one[1]), saved);
      answer = { id: Number(one[1]), flyer: { id: Number(one[1]), ...saved } };
    } else throw new Error(`unexpected ${method} ${path}`);
    return schema.parse(structuredClone(answer)) as z.infer<S>;
  };
  return { call, calls, store, writes: () => calls.filter((c) => c.method !== 'GET') };
}

const table = (flyers: LabelTable['flyers']): LabelTable => ({ site: SITE, flyers });
const row = (id: number, labels: string[], title = `flyer ${id}`) => ({ id, title, labels });

describe('describeFlyers', () => {
  it('reads every flyer, as much as says what kind it is, and writes nothing', async () => {
    const data = { ...newFlyerData('week'), share: '  Come   to the\npool!  ', week: [{ day: 'Fri', name: ' Surf lesson ', time: '15:00', cost: '40€' }, { day: 'Sat', name: '', time: '', cost: '' }] };
    const s = site({ 1: { title: 'Pool party', hostel: 'duque-nest', labels: [SECOND.slug] }, 2: { title: 'Week', template: 'week', data } });
    const flyers = await describeFlyers(s.call);
    expect(flyers.map((f) => f.id), 'newest first, as the library lists them').toEqual([2, 1]);
    expect(flyers[0]).toMatchObject({ title: 'Week', template: 'week', rows: ['Surf lesson'], caption: 'Come to the pool!', labels: [] });
    expect(flyers[1]).toMatchObject({ title: 'Pool party', hostel: 'duque-nest', labels: [SECOND.slug] });
    expect(s.calls.map((c) => `${c.method} ${c.path}`)).toEqual(['GET api/flyers', 'GET api/flyers/2', 'GET api/flyers/1']);
  });

  it('reads a flyer from a release before labels as carrying none', async () => {
    const s = site({ 1: {} }, { drops: true });
    expect((await describeFlyers(s.call))[0].labels).toEqual([]);
  });
});

describe('a table of labels', () => {
  it('is one site’s: its ids mean nothing on another', () => {
    expect(tableProblem(table([row(1, [FIRST.slug])]), SITE)).toBeNull();
    expect(tableProblem(table([row(1, [FIRST.slug])]), 'https://flyers.example/app'), 'with or without the last slash').toBeNull();
    expect(tableProblem(table([row(1, [FIRST.slug])]), 'http://127.0.0.1:8787/')).toContain('not for http://127.0.0.1:8787/');
  });

  it('names only labels of the list: nobody but the owner adds one', () => {
    const problem = tableProblem(table([row(1, [FIRST.slug, 'karaoke']), row(2, ['karaoke', 'Dinners'])]), SITE);
    expect(problem).toContain('karaoke, Dinners');
    expect(problem).toContain(FIRST.slug);
  });

  it('names a flyer once', () => {
    expect(tableProblem(table([row(3, [FIRST.slug]), row(3, [SECOND.slug])]), SITE)).toContain('#3');
  });

  it('is held to its shape: a misspelt key is an error', () => {
    expect(LabelTableSchema.safeParse(table([row(1, [FIRST.slug])])).success).toBe(true);
    expect(LabelTableSchema.safeParse({ site: SITE, flyers: [{ id: 1, title: 't', label: [FIRST.slug] }] }).success).toBe(false);
    expect(LabelTableSchema.safeParse({ site: SITE, flyers: [{ id: 1, title: 't', labels: [FIRST.slug], note: 'x' }] }).success).toBe(false);
  });
});

describe('applyLabels', () => {
  it('fills the flyers that carry none, oldest first, with the flyer otherwise as the site sent it', async () => {
    const s = site({ 1: { title: 'older', hostel: 'duque-nest', photoId: 7 }, 2: { title: 'newer' }, 3: { title: 'not in the table' } });
    const outcomes = await applyLabels(s.call, table([row(2, [SECOND.slug, FIRST.slug], 'newer'), row(1, [SECOND.slug], 'older')]));
    expect(outcomes.map((o) => [o.id, o.result, o.labels])).toEqual([
      [1, 'labelled', [SECOND.slug]],
      [2, 'labelled', [FIRST.slug, SECOND.slug]],
    ]);
    expect(s.writes().map((c) => c.path), 'oldest first: each save moves a flyer to the top').toEqual(['api/flyers/1', 'api/flyers/2']);
    const sent = s.writes()[0].body as Stored;
    expect({ ...sent, data: null }).toEqual({ title: 'older', hostel: 'duque-nest', template: 'activity', data: null, photoId: 7 });
    expect(sent.data).toEqual({ ...newFlyerData(), labels: [SECOND.slug] });
    expect(s.store.get(3)!.data.labels, 'a flyer the table does not name is not touched').toEqual([]);
  });

  it('never changes a flyer that already carries a label', async () => {
    const s = site({ 1: { labels: [SECOND.slug] } });
    const [outcome] = await applyLabels(s.call, table([row(1, [FIRST.slug])]));
    expect(outcome.result).toBe('has-labels');
    expect(outcome.note).toContain(SECOND.name);
    expect(s.writes()).toEqual([]);
  });

  it('keeps a label that is off the list on a flyer it fills: that flyer shows none, so it is filled', async () => {
    const s = site({ 1: { labels: ['a-label-taken-off-the-list'] } });
    const [outcome] = await applyLabels(s.call, table([row(1, [FIRST.slug])]));
    expect(outcome.result).toBe('labelled');
    expect(s.store.get(1)!.data.labels).toEqual([FIRST.slug, 'a-label-taken-off-the-list']);
  });

  it('writes nothing on a dry run, and says what it would', async () => {
    const s = site({ 1: {}, 2: { labels: [FIRST.slug] } });
    const outcomes = await applyLabels(s.call, table([row(1, [FIRST.slug]), row(2, [SECOND.slug])]), { dry: true });
    expect(outcomes.map((o) => o.result)).toEqual(['would', 'has-labels']);
    expect(outcomes[0].note).toBe(FIRST.name);
    expect(s.writes()).toEqual([]);
  });

  it('leaves a flyer that is not as the table read it: gone, renamed, or with no label chosen', async () => {
    const s = site({ 1: { title: 'Renamed since' }, 2: {} });
    const outcomes = await applyLabels(s.call, table([row(1, [FIRST.slug], 'Its old name'), row(2, []), row(9, [FIRST.slug])]));
    expect(Object.fromEntries(outcomes.map((o) => [o.id, o.result]))).toEqual({ 1: 'renamed', 2: 'nothing-to-add', 9: 'not-listed' });
    expect(s.writes()).toEqual([]);
  });

  it('leaves a flyer someone saved while it ran', async () => {
    // Saved between the list and the read that comes right before the write: that read finds a later updatedAt.
    const s = site({ 1: {}, 2: {} }, { onRead: (id, store) => void (id === 1 && store.set(1, { ...store.get(1)!, updatedAt: '2026-10-14T09:00:00.000Z' })) });
    const outcomes = await applyLabels(s.call, table([row(1, [FIRST.slug]), row(2, [FIRST.slug])]));
    expect(Object.fromEntries(outcomes.map((o) => [o.id, o.result]))).toEqual({ 1: 'moved', 2: 'labelled' });
    expect(s.writes().map((c) => c.path)).toEqual(['api/flyers/2']);
  });

  it('stops before anything on a site that would drop the labels: a release from before them', async () => {
    const s = site({ 1: {} }, { drops: true });
    await expect(applyLabels(s.call, table([row(1, [FIRST.slug])]))).rejects.toThrow(/from before labels/);
    expect(s.writes()).toEqual([]);
  });

  it('says so when a save is refused, and goes on with the rest', async () => {
    const s = site({ 1: {}, 2: {} });
    const refusing: SiteCall = (method, path, schema, body) => (method === 'PUT' && path === 'api/flyers/1' ? Promise.reject(new Error('Some fields are not valid.')) : s.call(method, path, schema, body));
    const outcomes = await applyLabels(refusing, table([row(1, [FIRST.slug]), row(2, [FIRST.slug])]));
    expect(outcomes.map((o) => [o.id, o.result, o.result === 'failed' ? o.note : ''])).toEqual([
      [1, 'failed', 'Some fields are not valid.'],
      [2, 'labelled', ''],
    ]);
  });
});
