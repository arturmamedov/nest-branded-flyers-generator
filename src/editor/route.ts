import { useEffect, useState } from 'react';

export type Route = { page: 'library' } | { page: 'new' } | { page: 'edit'; id: number } | { page: 'ai' };

export function parseHash(hash: string): Route {
  const edit = /^#\/flyers\/(\d+)$/.exec(hash);
  if (edit) return { page: 'edit', id: Number(edit[1]) };
  if (hash === '#/new') return { page: 'new' };
  if (hash === '#/ai') return { page: 'ai' };
  return { page: 'library' };
}

export const go = (hash: string) => {
  location.hash = hash;
};

/** Whether `page` is the one in the URL now. An answer that arrives after the user has moved on
    must not move them: React unmounts the page that asked a few tasks after the move. */
export const onPage = (page: Route['page']) => parseHash(location.hash).page === page;

/* Moves inside the app are hash navigations: the ← Library link, go(), Back and Forward, a
   typed #/…. The Navigation API (Chrome and Edge since 2022, Safari 26.2 and Firefox 147 since
   early 2026) announces each one before it happens, with a `navigate` event the page may cancel.
   A refused move is cancelled, so it never happens: no history entry, nothing to undo.
   The one move a browser may refuse to let the page cancel is Back or Forward pressed without
   a fresh interaction with the page (the HTML spec's history-action activation, so a page
   can't trap its visitors). That one is let through, the page on screen stays, and it is undone
   by returning to the entry on screen: by key, so it lands exactly, however the steps queued up.
   tests/unit/route.test.ts drives createMoveGuard through every case (Chromium never refuses a
   cancel, so the undo is reachable only there); tests/render/editor.spec.ts drives the browser. */

/** A move as the Navigation API announces it, before it happens (a NavigateEvent). */
export interface Move {
  readonly navigationType: NavigationType;
  readonly cancelable: boolean;
  readonly destination: { readonly url: string; readonly sameDocument: boolean };
  /** Aborts if the move is dropped before it happens (another move overtook it). */
  readonly signal?: AbortSignal;
  preventDefault(): void;
}

/** The entry the tab is on: its slot (a replace keeps it) and its URL. */
export interface Place {
  readonly key: string;
  readonly url: string;
}

const hashOf = (url: string) => new URL(url).hash;
const pageOf = (url: string) => JSON.stringify(parseHash(hashOf(url)));

/** Decides every move. `show` puts the current URL's page on screen; `traverseTo` returns to a
    slot; `hasEntry` says whether a slot is still in the history; `replaceUrl` rewrites the
    current entry's URL. */
export function createMoveGuard(deps: {
  place: () => Place;
  mayLeave: () => boolean;
  show: () => void;
  traverseTo: (key: string) => Promise<unknown>;
  hasEntry: (key: string) => boolean;
  replaceUrl: (hash: string) => void;
}) {
  const { place, mayLeave, show, traverseTo, hasEntry, replaceUrl } = deps;
  /** The entry whose page is on screen. */
  let shown = place();
  /** A refused move the browser wouldn't cancel is being undone: the page on screen stays put. */
  let undoing = false;
  /** That move has been refused but has not happened yet. */
  let refusedAhead = false;
  /** A URL for the entry on screen, asked for while an undo was on its way back to it. */
  let pendingHash: string | null = null;

  function onNavigate(e: Move) {
    if (!e.destination.sameDocument || e.navigationType === 'replace' || e.navigationType === 'reload') return;
    if (undoing) {
      // Back and Forward are brought back by the undo; anything else waits until it has landed.
      if (e.navigationType !== 'traverse' && e.cancelable) e.preventDefault();
      return;
    }
    if (pageOf(e.destination.url) === pageOf(place().url)) return; // the same page: nothing is left behind
    if (mayLeave()) return;
    if (e.cancelable) {
      e.preventDefault();
      return;
    }
    undoing = refusedAhead = true;
    // Dropped before it happened (another move overtook it): there is nothing to undo.
    e.signal?.addEventListener('abort', () => {
      if (refusedAhead) undoing = refusedAhead = false;
    });
  }

  function onEntryChange() {
    const now = place();
    if (now.key === shown.key) {
      // The entry on screen again: its URL replaced (a first save), or an undo landing.
      shown = now;
      undoing = refusedAhead = false;
      const hash = pendingHash;
      pendingHash = null;
      if (hash) replaceUrl(hash);
      return;
    }
    if (undoing) {
      refusedAhead = false;
      traverseTo(shown.key).catch(() => {
        // Overtaken by another step, which starts its own undo; only a slot that is gone ends it.
        if (!undoing || hasEntry(shown.key)) return;
        undoing = false;
        pendingHash = null;
        shown = place();
        show();
      });
      return;
    }
    const moved = pageOf(now.url) !== pageOf(shown.url);
    shown = now;
    if (moved) show();
  }

  /** Rewrites the URL of the entry on screen from `from` to `to`, without a move, if it still
      shows `from`; while an undo is on its way back to it, once it has landed. */
  function replaceHash(from: string, to: string) {
    if (hashOf(shown.url) !== from) return;
    if (undoing) pendingHash = to;
    else replaceUrl(to);
  }

  return { onNavigate, onEntryChange, replaceHash };
}

let guard: ReturnType<typeof createMoveGuard> | null = null;
const replaceUrl = (hash: string) => history.replaceState(null, '', hash);

/** Rewrites the URL of the entry on screen from `from` to `to` without a move, if it still shows
    `from`: a new flyer's first save makes its URL reopenable, unless the user has moved on. */
export function replaceHash(from: string, to: string) {
  if (guard) guard.replaceHash(from, to);
  else if (location.hash === from) replaceUrl(to);
}

/** The route in the hash. `nav` counts moves to another page: the editor is keyed on it, so each
    one remounts it. `mayLeave` is asked before a move and can refuse it. */
export function useHashRoute(mayLeave: () => boolean): { route: Route; nav: number } {
  const [route, setRoute] = useState(() => parseHash(location.hash));
  const [nav, setNav] = useState(0);

  useEffect(() => {
    const show = () => {
      setRoute(parseHash(location.hash));
      setNav((n) => n + 1);
    };
    const nav = (window as { navigation?: Navigation }).navigation;
    if (!nav) {
      // Without the Navigation API (Safari before 26.2, Firefox before 147) a move can't be refused:
      // the ← Library link asks on its own, and leaving the page asks (beforeunload).
      window.addEventListener('hashchange', show);
      return () => window.removeEventListener('hashchange', show);
    }
    const g = createMoveGuard({
      place: () => ({ key: nav.currentEntry!.key, url: location.href }),
      mayLeave,
      show,
      traverseTo: (key) => {
        const { committed, finished } = nav.traverseTo(key);
        committed?.catch(() => {}); // `finished` carries the same failure
        return finished ?? Promise.resolve();
      },
      hasEntry: (key) => nav.entries().some((e) => e.key === key),
      replaceUrl,
    });
    guard = g;
    const onEntryChange = () => g.onEntryChange();
    nav.addEventListener('navigate', g.onNavigate);
    nav.addEventListener('currententrychange', onEntryChange);
    return () => {
      nav.removeEventListener('navigate', g.onNavigate);
      nav.removeEventListener('currententrychange', onEntryChange);
      if (guard === g) guard = null;
    };
  }, [mayLeave]);

  return { route, nav };
}
