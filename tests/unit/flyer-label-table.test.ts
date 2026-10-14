import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import { LabelTableSchema, applyLabels, describeFlyers, tableProblem, type LabelTable } from '../../scripts/flyers/labelTable.js';
import { siteKeeps, type SiteCall } from '../../scripts/site.js';
import { newFlyerData } from '../../src/shared/defaults.js';
import { FLYER_LABELS, LABEL_SLUGS, NO_LABEL } from '../../src/shared/labels.js';

/* `npm run flyers:labels` (scripts/flyers/labelTable.ts), on a stand-in for a site: what it reads, what it writes,
   and all it refuses to touch. The owner runs it against the live site, so a wrong write is the costliest fault it
   could have: each rule here was read by a second pair of eyes (2026-10-14), and the cases that review found
   missing are marked. The site's API itself is the contract suite's. */

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

interface SiteOptions {
  /** A release from before labels: it saves and reads none. */
  drops?: boolean;
  /** Run before a flyer is answered: someone saving it meanwhile. */
  onRead?: (id: number, store: Map<number, Stored>) => void;
  /** The labels this site's own release lists, where they differ from the checkout's. */
  knows?: readonly string[];
  /** What the site stores of the labels it is sent, where that is not what it was sent. */
  saves?: (labels: string[]) => string[];
  /** Flyers whose own file cannot be read: the list names them, and opening one fails. */
  unreadable?: number[];
}

/** A site in memory, answering as the API does. */
function site(flyers: Record<number, Partial<Stored> & { labels?: string[] }>, { drops = false, onRead, knows = LABEL_SLUGS, saves, unreadable = [] }: SiteOptions = {}) {
  const store = new Map<number, Stored>();
  for (const [id, f] of Object.entries(flyers)) {
    const { labels, ...rest } = f;
    const data = { ...newFlyerData(), ...(labels ? { labels } : {}), ...(rest.data ?? {}) } as Record<string, unknown>;
    if (drops) delete data.labels;
    store.set(Number(id), { title: `flyer ${id}`, hostel: null, template: 'activity', photoId: null, updatedAt: `2026-10-0${id}T10:00:00.000Z`, ...rest, data });
  }
  const calls: { method: string; path: string; body?: unknown }[] = [];
  const labelsOf = (f: Stored) => (Array.isArray(f.data.labels) ? (f.data.labels as string[]) : []);
  const call: SiteCall = async <S extends z.ZodType>(method: string, path: string, schema: S, body?: unknown) => {
    calls.push({ method, path, ...(body === undefined ? {} : { body }) });
    const one = /^api\/flyers\/(\d+)$/.exec(path);
    let answer: unknown;
    if (method === 'GET' && (path === 'api/flyers' || path === `api/flyers?label=${NO_LABEL}`)) {
      answer = [...store.entries()]
        .filter(([, f]) => path === 'api/flyers' || !labelsOf(f).some((slug) => knows.includes(slug)))
        .map(([id, f]) => ({ id, title: f.title, template: f.template, hostel: f.hostel, hostelName: null, updatedAt: f.updatedAt }))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    } else if (method === 'GET' && one) {
      if (unreadable.includes(Number(one[1]))) throw new Error('Something went wrong on the server.');
      onRead?.(Number(one[1]), store);
      answer = { flyer: { id: Number(one[1]), ...store.get(Number(one[1]))! }, hostel: null, photo: null };
    } else if (method === 'PUT' && one) {
      const input = body as Stored;
      const data = { ...input.data };
      if (drops) delete data.labels;
      else if (saves) data.labels = saves(data.labels as string[]);
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
const results = (outcomes: { id: number; result: string }[]) => Object.fromEntries(outcomes.map((o) => [o.id, o.result]));

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

  // Found in review: the library lists a flyer whose own file is damaged, and one such flyer stopped the whole print.
  it('names a flyer that cannot be opened and goes on: the library lists it, so the print does', async () => {
    const s = site({ 1: { title: 'fine' }, 2: { title: 'damaged' }, 3: { title: 'fine too' } }, { unreadable: [2] });
    const flyers = await describeFlyers(s.call);
    expect(flyers.map((f) => [f.id, f.title, f.unread ?? null])).toEqual([
      [3, 'fine too', null],
      [2, 'damaged', 'Something went wrong on the server.'],
      [1, 'fine', null],
    ]);
  });
});

describe('siteKeeps (does this site’s release keep a field of a flyer’s data?)', () => {
  it('asks the first flyer that opens, and says yes, no, or that there is none to ask', async () => {
    expect(await siteKeeps(site({ 1: {} }).call, 'labels')).toBe(true);
    expect(await siteKeeps(site({ 1: {} }, { drops: true }).call, 'labels')).toBe(false);
    expect(await siteKeeps(site({}).call, 'labels')).toBeNull();
    // The newest cannot be opened: the next one answers.
    const s = site({ 1: {}, 2: {} }, { unreadable: [2] });
    expect(await siteKeeps(s.call, 'labels')).toBe(true);
    expect(s.calls.map((c) => c.path)).toEqual(['api/flyers', 'api/flyers/2', 'api/flyers/1']);
    expect(await siteKeeps(site({ 1: {} }, { unreadable: [1] }).call, 'labels'), 'none opens').toBeNull();
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
    // Found in review: with dates that rise with the ids, an order by id alone passed. Here the lower id is the newer.
    const s = site({
      1: { title: 'saved last', hostel: 'duque-nest', photoId: 7, updatedAt: '2026-10-09T10:00:00.000Z' },
      2: { title: 'saved first', updatedAt: '2026-10-02T10:00:00.000Z' },
      3: { title: 'not in the table' },
    });
    const outcomes = await applyLabels(s.call, table([row(1, [SECOND.slug], 'saved last'), row(2, [SECOND.slug, FIRST.slug], 'saved first')]));
    expect(outcomes.map((o) => [o.id, o.result, o.labels])).toEqual([
      [2, 'labelled', [FIRST.slug, SECOND.slug]],
      [1, 'labelled', [SECOND.slug]],
    ]);
    expect(s.writes().map((c) => c.path), 'oldest first: each save moves a flyer to the top').toEqual(['api/flyers/2', 'api/flyers/1']);
    const sent = s.writes()[1].body as Stored;
    expect({ ...sent, data: null }).toEqual({ title: 'saved last', hostel: 'duque-nest', template: 'activity', data: null, photoId: 7 });
    expect(sent.data).toEqual({ ...newFlyerData(), labels: [SECOND.slug] });
    expect(s.store.get(3)!.data.labels, 'a flyer the table does not name is not touched').toEqual([]);
  });

  // Found in review: the stand-in's data was exactly a new flyer's, so a key lost on the way back went unseen.
  it('hands back everything of a flyer’s data, a key this checkout does not know too: the site may run a later release', async () => {
    const later = { look: 'a-later-look', nested: { deep: [1, 2] } };
    const s = site({ 1: { data: { aKeyALaterReleaseAdded: later, share: 'Come!' } } });
    await applyLabels(s.call, table([row(1, [FIRST.slug])]));
    const sent = (s.writes()[0].body as Stored).data;
    expect(sent.aKeyALaterReleaseAdded).toEqual(later);
    expect(sent.share).toBe('Come!');
    expect(sent.labels).toEqual([FIRST.slug]);
  });

  it('never changes a flyer that already carries a label', async () => {
    const s = site({ 1: { labels: [SECOND.slug] } });
    const [outcome] = await applyLabels(s.call, table([row(1, [FIRST.slug])]));
    expect(outcome.result).toBe('has-labels');
    expect(outcome.note).toContain(SECOND.name);
    expect(s.writes()).toEqual([]);
  });

  // Found in review: "has a label" was judged by this checkout's list. A site on a later release may list a label
  // this checkout does not, and its flyer would have been given more labels: any stored label now leaves it alone.
  it('never changes a flyer that stores a label this checkout’s list does not have: the site’s own list may', async () => {
    const s = site({ 1: { labels: ['a-label-this-checkout-does-not-list'] } });
    const [outcome] = await applyLabels(s.call, table([row(1, [FIRST.slug])]));
    expect(outcome.result).toBe('has-labels');
    expect(outcome.note).toContain('a-label-this-checkout-does-not-list');
    expect(s.writes()).toEqual([]);
  });

  it('writes nothing on a dry run, and says what it would', async () => {
    const s = site({ 1: {}, 2: { labels: [FIRST.slug] } });
    const outcomes = await applyLabels(s.call, table([row(1, [FIRST.slug]), row(2, [SECOND.slug])]), { dry: true });
    expect(outcomes.map((o) => o.result)).toEqual(['would', 'has-labels']);
    expect(outcomes[0].note).toBe(FIRST.name);
    expect(s.calls.every((c) => c.method === 'GET'), 'only reads').toBe(true);
  });

  it('leaves a flyer that is not as the table read it: gone, renamed, or with no label chosen', async () => {
    const s = site({ 1: { title: 'Renamed since' }, 2: {} });
    const outcomes = await applyLabels(s.call, table([row(1, [FIRST.slug], 'Its old name'), row(2, []), row(9, [FIRST.slug])]));
    expect(results(outcomes)).toEqual({ 1: 'renamed', 2: 'nothing-to-add', 9: 'not-listed' });
    expect(s.writes()).toEqual([]);
  });

  it('leaves a flyer someone saved while it ran', async () => {
    // Saved between the list and the read that comes right before the write: that read finds a later updatedAt.
    const s = site({ 1: {}, 2: {} }, { onRead: (id, store) => void (id === 1 && store.set(1, { ...store.get(1)!, updatedAt: '2026-10-14T09:00:00.000Z' })) });
    const outcomes = await applyLabels(s.call, table([row(1, [FIRST.slug]), row(2, [FIRST.slug])]));
    expect(results(outcomes)).toEqual({ 1: 'moved', 2: 'labelled' });
    expect(s.writes().map((c) => c.path)).toEqual(['api/flyers/2']);
  });

  // Found in review: this half of the second read was pinned by no case.
  it('leaves a flyer renamed between the list and its own read, whatever its date says', async () => {
    const s = site({ 1: {} }, { onRead: (id, store) => void store.set(id, { ...store.get(id)!, title: 'Renamed just now' }) });
    const [outcome] = await applyLabels(s.call, table([row(1, [FIRST.slug])]));
    expect(outcome.result).toBe('moved');
    expect(s.writes()).toEqual([]);
  });

  it('stops before anything on a site that would drop the labels: a release from before them', async () => {
    const s = site({ 1: {} }, { drops: true });
    await expect(applyLabels(s.call, table([row(1, [FIRST.slug])]))).rejects.toThrow(/from before labels/);
    expect(s.writes()).toEqual([]);
  });

  it('asks the first flyer that opens whether the site keeps labels, so one damaged flyer does not stop the rest', async () => {
    const s = site({ 1: {}, 2: { title: 'damaged' } }, { unreadable: [2] });
    const outcomes = await applyLabels(s.call, table([row(1, [FIRST.slug]), row(2, [FIRST.slug], 'damaged')]));
    expect(outcomes.map((o) => [o.id, o.result])).toEqual([
      [1, 'labelled'],
      [2, 'failed'],
    ]);
  });

  // Found in review: nothing reached the check after a save, the one guard against a wrong "labelled".
  it('says a save failed when the site answers other labels than it was sent', async () => {
    const s = site({ 1: {}, 2: {} }, { saves: (labels) => labels.slice(1) });
    const outcomes = await applyLabels(s.call, table([row(1, [FIRST.slug, SECOND.slug]), row(2, [])]));
    expect(outcomes.find((o) => o.id === 1)).toMatchObject({ result: 'failed' });
    expect(outcomes.find((o) => o.id === 1)!.note).toContain(`the site saved ["${SECOND.slug}"]`);
  });

  // Found in review: a site whose release lists none of the labels saves them by their shape and shows none.
  it('says so when the site saved the labels and lists none of them: its release is behind this checkout’s list', async () => {
    const s = site({ 1: {}, 2: {} }, { knows: [SECOND.slug] });
    const outcomes = await applyLabels(s.call, table([row(1, [FIRST.slug]), row(2, [FIRST.slug, SECOND.slug])]));
    expect(results(outcomes)).toEqual({ 1: 'unlisted', 2: 'labelled' });
    expect(outcomes.find((o) => o.id === 1)!.note).toContain('shows it with no label');
    expect(s.store.get(1)!.data.labels, 'it is saved all the same, and shows once the release has the label').toEqual([FIRST.slug]);
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
