import { describe, expect, it } from 'vitest';
import { RECENT_MAX, RECENT_PREF, byRecent, forgetFlyer, openedAgo, recentFrom, rememberOpened, withOpened, type Recent } from '../../src/editor/recentFlyers';

/* The flyers this browser opened last (src/editor/recentFlyers.ts; Artur's ask and answers, 2026-10-15): the last 5
   go first in the library, the last opened on top, each with a line that says when. Per browser, never flyer data. */

const H = 3_600_000;
const memory = (stored: Record<string, string> = {}) => ({ stored, get: (key: string) => stored[key] ?? null, set: (key: string, value: string) => void (stored[key] = value) });

describe('the recent flyers', () => {
  it('are remembered as library.recent, the last 5', () => {
    expect(RECENT_PREF).toBe('library.recent');
    expect(RECENT_MAX).toBe(5);
  });

  it('are none for someone who never opened one, or when what is stored is damaged', () => {
    for (const stored of [null, '', 'null', '{}', '[1,2]', 'not json', '[{"id":"3","at":1}]', '[{"id":0,"at":1}]', '[{"id":2.5,"at":1}]', '[{"id":3}]']) expect(recentFrom(stored), String(stored)).toEqual([]);
  });

  it('keep what they can of a list partly damaged, once each, at most 5', () => {
    const stored = JSON.stringify([{ id: 4, at: 9 }, { id: 'x' }, { id: 4, at: 8 }, { id: 7, at: 7 }, { id: 1, at: 6 }, { id: 2, at: 5 }, { id: 3, at: 4 }, { id: 5, at: 3 }]);
    expect(recentFrom(stored)).toEqual([
      { id: 4, at: 9 },
      { id: 7, at: 7 },
      { id: 1, at: 6 },
      { id: 2, at: 5 },
      { id: 3, at: 4 },
    ]);
  });

  it('put the one opened on top; opened again it moves up; the 6th falls off', () => {
    let recent: Recent[] = [];
    for (const id of [1, 2, 3, 4, 5]) recent = withOpened(recent, id, id * 10);
    expect(recent.map((r) => r.id)).toEqual([5, 4, 3, 2, 1]);
    recent = withOpened(recent, 3, 60);
    expect(recent).toEqual([
      { id: 3, at: 60 },
      { id: 5, at: 50 },
      { id: 4, at: 40 },
      { id: 2, at: 20 },
      { id: 1, at: 10 },
    ]);
    recent = withOpened(recent, 9, 70);
    expect(recent.map((r) => r.id)).toEqual([9, 3, 5, 4, 2]);
  });

  it('are written to the browser, read back as written, and an archived flyer is forgotten', () => {
    const m = memory();
    rememberOpened(m, 12, 100);
    rememberOpened(m, 7, 200);
    expect(recentFrom(m.stored[RECENT_PREF])).toEqual([
      { id: 7, at: 200 },
      { id: 12, at: 100 },
    ]);
    forgetFlyer(m, 12);
    expect(recentFrom(m.get(RECENT_PREF))).toEqual([{ id: 7, at: 200 }]);
    forgetFlyer(m, 99);
    expect(recentFrom(m.get(RECENT_PREF))).toEqual([{ id: 7, at: 200 }]);
  });

  it('a damaged store is written over by the next one opened', () => {
    const m = memory({ [RECENT_PREF]: 'not json' });
    rememberOpened(m, 3, 1);
    expect(recentFrom(m.get(RECENT_PREF))).toEqual([{ id: 3, at: 1 }]);
  });
});

describe('the library’s order', () => {
  const items = [11, 10, 9, 8, 7, 6].map((id) => ({ id, title: `flyer ${id}` }));

  it('is the list’s own (newest first) with nothing opened', () => {
    const { items: ordered, openedAt } = byRecent(items, []);
    expect(ordered).toEqual(items);
    expect(openedAt.size).toBe(0);
  });

  it('puts the recent ones first, the last opened on top, then the rest in the list’s order', () => {
    const recent = [
      { id: 7, at: 300 },
      { id: 10, at: 200 },
    ];
    const { items: ordered, openedAt } = byRecent(items, recent);
    expect(ordered.map((i) => i.id)).toEqual([7, 10, 11, 9, 8, 6]);
    expect([...openedAt]).toEqual([
      [7, 300],
      [10, 200],
    ]);
  });

  it('skips a recent flyer the list does not hold (filtered out, or archived elsewhere)', () => {
    const { items: ordered, openedAt } = byRecent(items, [
      { id: 42, at: 900 },
      { id: 6, at: 800 },
    ]);
    expect(ordered.map((i) => i.id)).toEqual([6, 11, 10, 9, 8, 7]);
    expect([...openedAt.keys()]).toEqual([6]);
  });
});

describe('when it was opened', () => {
  // A fixed afternoon, in the browser's own time zone, as the line is read.
  const now = new Date(2026, 9, 15, 16, 30).getTime();

  it('says it in the staff’s words', () => {
    expect(openedAgo(now - 20_000, now)).toBe('Opened just now');
    expect(openedAgo(now - 60_000, now)).toBe('Opened 1 min ago');
    expect(openedAgo(now - 45 * 60_000, now)).toBe('Opened 45 min ago');
    expect(openedAgo(now - H, now)).toBe('Opened 1 h ago');
    expect(openedAgo(now - 16 * H, now), 'still today').toBe('Opened 16 h ago');
    expect(openedAgo(new Date(2026, 9, 14, 23, 50).getTime(), now)).toBe('Opened yesterday');
    expect(openedAgo(new Date(2026, 9, 14, 0, 5).getTime(), now)).toBe('Opened yesterday');
    expect(openedAgo(new Date(2026, 9, 13, 23, 0).getTime(), now)).toBe('Opened 2 days ago');
    expect(openedAgo(new Date(2026, 8, 30, 12, 0).getTime(), now)).toBe('Opened 15 days ago');
  });

  it('says "just now" for a time ahead of the clock (another device’s, a clock set back)', () => {
    expect(openedAgo(now + 5 * H, now)).toBe('Opened just now');
  });
});
