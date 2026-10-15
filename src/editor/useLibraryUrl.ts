import { useEffect, useState } from 'react';
import { LIBRARY_DEFAULTS, libraryFromHash, libraryHash, rememberLibrary, rememberedLibrary, sameLibrary, type LibraryState } from './libraryUrl';
import { localStorageGet, localStorageSet } from './prefs';
import { go, parseHash, replaceHash } from './route';

/* The library's state, kept in its URL (libraryUrl.ts holds the rule). The Library is not keyed on the route's moves
   (App.tsx), and every library hash is one page to the router, so a move between two library URLs reaches no one but
   this hook: it follows them itself.
   - A filter, the view or Clear is a step in the history (`choose`): Back undoes it, Forward redoes it.
   - Typing rewrites the step on screen (`type`), so Back undoes the last choice, never a letter.
   - A bare #/ is the library as remembered when the library opens on it (a new tab, "← Library", the bar's link
     from another page, the AI page's way out), completed by a replace. Reached while the library is on screen (Back,
     Forward, the bar's link) it is every flyer: a step to every flyer is written #/, and Forward must redo it.
   - Whatever the library shows is what this browser remembers, as if chosen by hand. */
export function useLibraryUrl(hostels: readonly string[]) {
  const [state, setState] = useState<LibraryState>(() => libraryFromHash(location.hash, hostels) ?? rememberedLibrary(localStorageGet, hostels));

  // The URL says what is on screen: completed from memory, or rewritten without what this release doesn't know.
  useEffect(() => {
    const to = libraryHash(state);
    if (location.hash !== to) replaceHash(location.hash, to);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Back and Forward between two library steps (and a library link followed from the library).
  useEffect(() => {
    const follow = () => {
      if (parseHash(location.hash).page !== 'library') return; // leaving: the next page is not the library's to read
      const next = libraryFromHash(location.hash, hostels) ?? LIBRARY_DEFAULTS;
      setState((now) => (sameLibrary(now, next) ? now : next));
      const to = libraryHash(next);
      if (location.hash !== to) replaceHash(location.hash, to);
    };
    window.addEventListener('hashchange', follow);
    return () => window.removeEventListener('hashchange', follow);
  }, [hostels]);

  useEffect(() => rememberLibrary({ get: localStorageGet, set: localStorageSet }, state, hostels), [state, hostels]);

  /** A choice: a step of its own, unless it changes nothing. */
  const choose = (change: Partial<LibraryState>) => {
    const next = { ...state, ...change };
    if (sameLibrary(next, state)) return;
    setState(next);
    go(libraryHash(next));
  };

  /** The box as typed: the step on screen, rewritten. */
  const type = (q: string) => {
    const next = { ...state, q };
    setState(next);
    replaceHash(location.hash, libraryHash(next));
  };

  return { state, choose, type };
}
