import type { FlyerPayload } from '../shared/schema';
import type { Answer } from './librarySearch';

/* The library's flyers as each one's own answer gives them (GET api/flyers/:id), kept for one visit to the library:
   one store the cards and the search both read (the library's search, 2026-10-14), so no flyer is asked for twice.
   - Kept by the flyer's id and its updatedAt as the list gave it: a flyer saved since is asked for again, and an
     answer for the flyer as it was is no answer for it.
   - A card asks once it nears the screen, at once. The search reads every listed flyer, at most READS_AT_ONCE at a
     time and in the list's order; a card asking for one still in its queue takes it out and asks now.
   - A flyer that cannot load is remembered as such: neither asks again in the visit, as a card never did.
   - The store saves the request, never the drawing: a card still draws its picture only once it nears the screen.
   No React and no DOM, so it is tested by itself (tests/unit/library-flyers.test.ts). */

/** How many of the search's reads are on their way at once: a library of a hundred flyers is read in a few seconds
    without holding up a card that comes to the screen meanwhile. */
export const READS_AT_ONCE = 4;

const WAITING: Answer = { state: 'waiting' };

const keyOf = (id: number, version: string) => `${id}@${version}`;

export type FlyerAnswers = ReturnType<typeof flyerAnswers>;

export function flyerAnswers(fetch: (id: number) => Promise<FlyerPayload>, most = READS_AT_ONCE) {
  const answers = new Map<string, Answer>();
  const queue: { id: number; version: string }[] = [];
  const listeners = new Set<() => void>();
  let reading = 0;
  let changed = 0;

  const settle = (key: string, answer: Answer) => {
    answers.set(key, answer);
    changed++;
    for (const listener of listeners) listener();
  };

  /** Asks for a flyer that has not been asked for: what a card and the search's queue share. */
  const start = (id: number, version: string) => {
    const key = keyOf(id, version);
    answers.set(key, WAITING);
    return fetch(id).then(
      (payload) => settle(key, { state: 'here', payload }),
      () => settle(key, { state: 'failed' }),
    );
  };

  const pump = () => {
    while (reading < most && queue.length > 0) {
      const { id, version } = queue.shift()!;
      if (answers.has(keyOf(id, version))) continue;
      reading++;
      void start(id, version).finally(() => {
        reading--;
        pump();
      });
    }
  };

  return {
    /** A flyer's answer: waiting while it is on its way or not asked for yet. The same object until it changes. */
    answer: (id: number, version: string): Answer => answers.get(keyOf(id, version)) ?? WAITING,

    /** A card's ask, once it nears the screen: now, ahead of the search's queue. */
    ask(id: number, version: string) {
      if (answers.has(keyOf(id, version))) return;
      const queued = queue.findIndex((q) => q.id === id && q.version === version);
      if (queued !== -1) queue.splice(queued, 1);
      void start(id, version);
    },

    /** The search's reads: every flyer of the list not asked for yet, a few at a time. */
    read(items: readonly { id: number; updatedAt: string }[]) {
      for (const { id, updatedAt } of items) {
        const key = keyOf(id, updatedAt);
        if (!answers.has(key) && !queue.some((q) => keyOf(q.id, q.version) === key)) queue.push({ id, version: updatedAt });
      }
      pump();
    },

    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },

    /** A number that moves with every answer that lands, for a page that redraws with them. */
    changes: () => changed,
  };
}
