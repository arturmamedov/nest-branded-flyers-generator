import { describe, expect, it } from 'vitest';
import { READS_AT_ONCE, flyerAnswers } from '../../src/editor/libraryFlyers';
import type { FlyerPayload } from '../../src/shared/schema';

/* The library's one store of flyer answers (src/editor/libraryFlyers.ts): the cards and the search read the same
   answers, so no flyer is asked for twice in a visit. No React and no DOM. */

/** A stand-in for GET api/flyers/:id: every request is held until the test answers it. */
function server() {
  const asked: { id: number; resolve: (p: FlyerPayload) => void; reject: (e: Error) => void }[] = [];
  const fetch = (id: number) => new Promise<FlyerPayload>((resolve, reject) => asked.push({ id, resolve, reject }));
  const payload = (id: number) => ({ flyer: { id } }) as unknown as FlyerPayload;
  /** Answers the oldest request still held for this flyer. */
  const answer = async (id: number, fail = false) => {
    const i = asked.findIndex((a) => a.id === id);
    const [a] = asked.splice(i, 1);
    if (fail) a.reject(new Error('gone'));
    else a.resolve(payload(id));
    await new Promise((r) => setTimeout(r, 0));
  };
  return { fetch, asked, answer, ids: () => asked.map((a) => a.id) };
}

const items = (...ids: number[]) => ids.map((id) => ({ id, updatedAt: `v${id}` }));

describe('the library’s flyer answers', () => {
  it('a card asks at once, and once', async () => {
    const s = server();
    const store = flyerAnswers(s.fetch);
    expect(store.answer(1, 'v1')).toEqual({ state: 'waiting' });
    store.ask(1, 'v1');
    store.ask(1, 'v1');
    expect(s.ids()).toEqual([1]);
    await s.answer(1);
    expect(store.answer(1, 'v1')).toEqual({ state: 'here', payload: { flyer: { id: 1 } } });
    store.ask(1, 'v1');
    expect(s.ids()).toEqual([]);
  });

  it('the search reads at most four at a time, in the list’s order', async () => {
    const s = server();
    const store = flyerAnswers(s.fetch);
    expect(READS_AT_ONCE).toBe(4);
    store.read(items(1, 2, 3, 4, 5, 6));
    expect(s.ids()).toEqual([1, 2, 3, 4]);
    await s.answer(2);
    expect(s.ids()).toEqual([1, 3, 4, 5]);
    await s.answer(1, true);
    expect(s.ids()).toEqual([3, 4, 5, 6]);
    store.read(items(1, 2, 3, 4, 5, 6));
    expect(s.ids(), 'nothing asked twice').toEqual([3, 4, 5, 6]);
  });

  it('a card near the screen goes ahead of the search’s queue, and is not asked for again by it', async () => {
    const s = server();
    const store = flyerAnswers(s.fetch);
    store.read(items(1, 2, 3, 4, 5, 6));
    store.ask(6, 'v6');
    expect(s.ids()).toEqual([1, 2, 3, 4, 6]);
    await s.answer(6);
    await s.answer(1);
    expect(s.ids(), 'the next of the queue, never 6').toEqual([2, 3, 4, 5]);
  });

  it('a card joins a read the search has on its way', async () => {
    const s = server();
    const store = flyerAnswers(s.fetch);
    store.read(items(1));
    store.ask(1, 'v1');
    expect(s.ids()).toEqual([1]);
  });

  it('a flyer that cannot load is not asked for again in the visit', async () => {
    const s = server();
    const store = flyerAnswers(s.fetch);
    store.ask(1, 'v1');
    await s.answer(1, true);
    expect(store.answer(1, 'v1')).toEqual({ state: 'failed' });
    store.ask(1, 'v1');
    store.read(items(1));
    expect(s.ids()).toEqual([]);
  });

  it('a flyer saved since is asked for again, and its older answer is no answer for it', async () => {
    const s = server();
    const store = flyerAnswers(s.fetch);
    store.ask(1, 'before');
    store.ask(1, 'after');
    expect(s.ids()).toEqual([1, 1]);
    await s.answer(1);
    expect(store.answer(1, 'before').state).toBe('here');
    expect(store.answer(1, 'after')).toEqual({ state: 'waiting' });
  });

  it('tells its readers when an answer lands, and hands them the same answer until it changes', async () => {
    const s = server();
    const store = flyerAnswers(s.fetch);
    let told = 0;
    const stop = store.subscribe(() => told++);
    const changes = store.changes();
    store.ask(1, 'v1');
    const waiting = store.answer(1, 'v1');
    expect(store.answer(1, 'v1')).toBe(waiting);
    await s.answer(1);
    expect(told).toBe(1);
    expect(store.changes()).not.toBe(changes);
    const here = store.answer(1, 'v1');
    expect(store.answer(1, 'v1')).toBe(here);
    stop();
    store.ask(2, 'v2');
    await s.answer(2);
    expect(told).toBe(1);
  });
});
