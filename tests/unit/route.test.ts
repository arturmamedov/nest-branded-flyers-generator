import { describe, expect, it } from 'vitest';
import { createMoveGuard, type Move, type Place } from '../../src/editor/route.js';

/* The move guard (src/editor/route.ts) against a stand-in tab that follows the Navigation API:
   every move, a replace included, is announced (navigate) before it happens, and happens only if
   not cancelled; each entry has a slot key, which a replace keeps; traverseTo() is queued, one per
   key, and lands on settle(). Chromium lets the page cancel every move the browser specs make, so
   the kind a browser may refuse to cancel (Back or Forward with no fresh interaction with the
   page) is only reachable here. */

const ORIGIN = 'http://flyers.test/';

class Tab {
  entries: { key: string; url: string }[];
  index = 0;
  guard!: ReturnType<typeof createMoveGuard>;
  private keys = 0;
  private queued: (() => void)[] = [];
  private pending = new Map<string, Promise<void>>();

  constructor(hash: string) {
    this.entries = [{ key: this.newKey(), url: ORIGIN + hash }];
  }
  place = (): Place => this.entries[this.index];
  hash = () => new URL(this.place().url).hash;
  hashes = () => this.entries.map((e) => new URL(e.url).hash);
  hasEntry = (key: string) => this.entries.some((e) => e.key === key);

  /** A link, go() or a typed #/…: returns whether it happened. */
  open(hash: string, { cancelable = true } = {}) {
    const url = new URL(hash, this.place().url).href;
    if (!this.announce('push', url, cancelable)) return false;
    this.entries.splice(this.index + 1, Infinity, { key: this.newKey(), url });
    this.index++;
    this.guard.onEntryChange();
    return true;
  }
  /** The Back or Forward button, or a jump from its menu. `cancelable: false` is the browser
      refusing to let the page cancel it; `dropped` is it being overtaken before it happens. */
  step(delta: number, { cancelable = true, dropped = false } = {}) {
    const to = this.entries[this.index + delta];
    if (!to) return false;
    const signal = new AbortController();
    if (!this.announce('traverse', to.url, cancelable, signal.signal)) return false;
    if (dropped) {
      signal.abort();
      return false;
    }
    this.index += delta;
    this.guard.onEntryChange();
    return true;
  }
  /** history.replaceState: announced as a replace; the slot is kept. */
  replaceUrl = (hash: string) => {
    const url = new URL(hash, this.place().url).href;
    if (!this.announce('replace', url, true)) return;
    this.entries[this.index] = { key: this.place().key, url };
    this.guard.onEntryChange();
  };
  /** navigation.traverseTo(): one per key; lands when the queue settles, or fails if the slot is gone. */
  traverseTo = (key: string) => {
    const running = this.pending.get(key);
    if (running) return running;
    const p = new Promise<void>((resolve, reject) =>
      this.queued.push(() => {
        this.pending.delete(key);
        const i = this.entries.findIndex((e) => e.key === key);
        if (i < 0) return reject(new Error('InvalidStateError'));
        if (i === this.index || this.step(i - this.index)) resolve();
        else reject(new Error('AbortError'));
      }),
    );
    this.pending.set(key, p);
    return p;
  };
  async settle() {
    while (this.queued.length) {
      this.queued.shift()!();
      for (let i = 0; i < 3; i++) await Promise.resolve();
    }
  }

  private newKey = () => `k${this.keys++}`;
  private announce(navigationType: Move['navigationType'], url: string, cancelable: boolean, signal?: AbortSignal) {
    let prevented = false;
    this.guard.onNavigate({ navigationType, cancelable, signal, destination: { url, sameDocument: true }, preventDefault: () => (prevented = true) });
    return !prevented;
  }
}

/** The app on a fresh tab: whether the editor holds unsaved work, the answers the user will give
    (asked only with unsaved work; a yes drops it, as leaveGuard.ts does), and the page on screen. */
function app(hash = '#/') {
  const tab = new Tab(hash);
  const answers: boolean[] = [];
  const state = { dirty: false, asked: 0, shows: 0, screen: tab.hash() };
  tab.guard = createMoveGuard({
    place: tab.place,
    mayLeave: () => {
      if (!state.dirty) return true;
      state.asked++;
      const yes = answers.shift();
      if (yes === undefined) throw new Error('asked without an answer ready');
      if (yes) state.dirty = false;
      return yes;
    },
    show: () => {
      state.shows++;
      state.screen = tab.hash();
    },
    traverseTo: tab.traverseTo,
    hasEntry: tab.hasEntry,
    replaceUrl: tab.replaceUrl,
  });
  return { tab, state, answer: (...a: boolean[]) => answers.push(...a) };
}

describe('move guard', () => {
  it('lets every move through while there is no unsaved work, and shows each new page', () => {
    const { tab, state } = app();
    tab.open('#/new');
    tab.step(-1);
    tab.step(1);
    expect([state.asked, state.shows, state.screen]).toEqual([0, 3, '#/new']);
  });

  it('a move to the same page moves nothing on screen', () => {
    const { tab, state } = app('');
    state.dirty = true;
    tab.open('#/'); // the library, again
    expect([state.asked, state.shows]).toEqual([0, 0]);
  });

  it('with unsaved work, a refused link is cancelled: no entry, nothing shown', () => {
    const { tab, state, answer } = app();
    tab.open('#/new');
    state.dirty = true;
    answer(false);
    expect(tab.open('#/')).toBe(false);
    expect([state.asked, state.shows, state.screen, tab.hashes()]).toEqual([1, 1, '#/new', ['#/', '#/new']]);
  });

  it('a refused Back, Forward or jump is cancelled; an accepted one shows its page', () => {
    const { tab, state, answer } = app();
    for (const hash of ['#/new', '#/flyers/1', '#/flyers/2']) tab.open(hash);
    tab.step(-1); // on #/flyers/1, with #/flyers/2 ahead
    state.dirty = true;
    answer(false, false, false, true);
    expect(tab.step(-2)).toBe(false);
    expect(tab.step(1)).toBe(false); // Forward
    expect(tab.step(-1)).toBe(false);
    expect(tab.step(-1)).toBe(true);
    expect([state.asked, state.screen, tab.hash()]).toEqual([4, '#/new', '#/new']);
  });

  it('the first save rewrites the entry on screen, without a move or a question', () => {
    const { tab, state } = app();
    tab.open('#/new');
    state.dirty = true;
    tab.guard.replaceHash('#/new', '#/flyers/8');
    expect([state.asked, state.shows, tab.hashes()]).toEqual([0, 1, ['#/', '#/flyers/8']]);
  });

  it('a first save that answers after the user has moved on leaves their URL alone', () => {
    const { tab } = app();
    tab.open('#/new');
    tab.open('#/'); // left while the save was out
    tab.guard.replaceHash('#/new', '#/flyers/8');
    expect(tab.hashes()).toEqual(['#/', '#/new', '#/']);
  });

  describe('a Back the browser will not let the page cancel', () => {
    it('refused: the page on screen stays, and the tab returns to its entry without asking again', async () => {
      const { tab, state, answer } = app();
      tab.open('#/flyers/1');
      tab.open('#/new');
      state.dirty = true;
      answer(false);
      expect(tab.step(-1, { cancelable: false })).toBe(true); // it happens
      expect([state.screen, tab.hash()]).toEqual(['#/new', '#/flyers/1']);
      await tab.settle();
      expect([state.asked, state.shows, state.screen, tab.hash()]).toEqual([1, 2, '#/new', '#/new']);
    });

    it('accepted: it simply happens', () => {
      const { tab, state, answer } = app();
      tab.open('#/new');
      state.dirty = true;
      answer(true);
      tab.step(-1, { cancelable: false });
      expect([state.asked, state.screen]).toEqual([1, '#/']);
    });

    it('pressed again while the undo is on its way: no second question, and it ends on the entry on screen', async () => {
      const { tab, state, answer } = app();
      tab.open('#/flyers/1');
      tab.open('#/new');
      state.dirty = true;
      answer(false);
      tab.step(-1, { cancelable: false });
      tab.step(-1, { cancelable: false });
      await tab.settle();
      expect([state.asked, state.shows, state.screen, tab.hash()]).toEqual([1, 2, '#/new', '#/new']);
    });

    it('a link clicked while the undo is on its way is cancelled: the draft stays', async () => {
      const { tab, state, answer } = app();
      tab.open('#/new');
      state.dirty = true;
      answer(false);
      tab.step(-1, { cancelable: false });
      expect(tab.open('#/flyers/3')).toBe(false);
      await tab.settle();
      expect([state.asked, state.shows, state.screen, tab.hashes()]).toEqual([1, 1, '#/new', ['#/', '#/new']]);
    });

    it('overtaken before it happens: nothing is left set, and the next move asks again', () => {
      const { tab, state, answer } = app();
      tab.open('#/new');
      state.dirty = true;
      answer(false, false);
      expect(tab.step(-1, { cancelable: false, dropped: true })).toBe(false);
      expect(tab.open('#/')).toBe(false); // asked, refused, cancelled
      expect([state.asked, state.screen, tab.hashes()]).toEqual([2, '#/new', ['#/', '#/new']]);
    });

    it('a first save that answers during the undo rewrites the entry on screen once it has landed', async () => {
      const { tab, answer, state } = app();
      tab.open('#/new');
      state.dirty = true;
      answer(false);
      tab.step(-1, { cancelable: false });
      tab.guard.replaceHash('#/new', '#/flyers/9');
      expect(tab.hashes(), 'the entry the user refused is left alone').toEqual(['#/', '#/new']);
      await tab.settle();
      expect([tab.hashes(), tab.hash()]).toEqual([['#/', '#/flyers/9'], '#/flyers/9']);
    });

    it('if the entry on screen is gone before the undo lands, the tab shows where it is, and forgets its URL', async () => {
      const { tab, state, answer } = app();
      tab.open('#/new');
      state.dirty = true;
      answer(false);
      tab.step(-1, { cancelable: false });
      tab.guard.replaceHash('#/new', '#/flyers/9'); // waits for the undo
      tab.open('#/flyers/3', { cancelable: false }); // cuts #/new off: a move nothing could cancel
      await tab.settle();
      expect([state.screen, tab.hash()]).toEqual(['#/flyers/3', '#/flyers/3']);

      state.dirty = false;
      tab.open('#/new');
      tab.guard.replaceHash('#/new', '#/flyers/10'); // a later first save keeps its own URL
      expect(tab.hash()).toBe('#/flyers/10');
    });
  });
});
