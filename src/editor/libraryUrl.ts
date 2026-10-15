import type { Template } from '../shared/schema';
import { ALL_LABELS, LABEL_PREF, labelFilterFrom } from './libraryLabel';
import { SEARCH_PREF } from './librarySearch';
import { DEFAULT_VIEW, VIEW_PREF, viewFrom, type LibraryView } from './libraryView';
import { isTemplate } from './templates';

/* The library's filters, its search and its view in its URL (2026-10-15, Artur's ask: "sharable url with saved
   params for open always same page"), so a library link opens the same page for anyone. One reader serves the URL
   and what this browser remembers: opening a link is the same as choosing what it holds. No React and no DOM here,
   so the rule is tested by itself (tests/unit/library-url.test.ts). */

/** What the library shows: the three filters, the search box as typed, and the view. */
export interface LibraryState {
  hostel: string;
  template: Template | '';
  label: string;
  q: string;
  view: LibraryView;
}

/** Every flyer, an empty box, the list: what someone who never chose sees, and a URL with nothing in it. */
export const LIBRARY_DEFAULTS: LibraryState = { hostel: '', template: '', label: ALL_LABELS, q: '', view: DEFAULT_VIEW };

/** Each part's key in the URL, in the order a URL writes them, and where this browser remembers it. */
const PARTS: readonly { part: keyof LibraryState; key: string; pref: string }[] = [
  { part: 'hostel', key: 'hostel', pref: 'library.hostel' },
  { part: 'template', key: 'template', pref: 'library.template' },
  { part: 'label', key: 'label', pref: LABEL_PREF },
  { part: 'q', key: 'q', pref: SEARCH_PREF },
  { part: 'view', key: 'view', pref: VIEW_PREF },
];

/** The hostel filter: a hostel of the list, the chain-wide flyers (`none`), or every flyer. */
const hostelFrom = (value: string | null, hostels: readonly string[]) => (value !== null && (value === 'none' || hostels.includes(value)) ? value : '');

/** The state a source names, part by part. A value this release doesn't know (a hostel or a label off the list, a
    template or a view that is neither) is ignored, as a stored one always was: that part is at its default. */
function readLibrary(get: (part: (typeof PARTS)[number]) => string | null, hostels: readonly string[]): LibraryState {
  const [hostel, template, label, q, view] = PARTS.map(get);
  return {
    hostel: hostelFrom(hostel, hostels),
    template: isTemplate(template) ? template : '',
    label: labelFilterFrom(label),
    q: q ?? '',
    view: viewFrom(view),
  };
}

/** The state a library hash holds, or null when it holds none of the keys (`#/`, no hash, a page that is not the
    library): the library as this browser remembers it. Once it holds one key it is the whole state, and a key it
    lacks is at its default. A key twice counts once, the first; a damaged %-escape is read as it stands. */
export function libraryFromHash(hash: string, hostels: readonly string[]): LibraryState | null {
  const url = /^#\/(?:\?(.*))?$/s.exec(hash);
  if (!url) return null;
  const params = new URLSearchParams(url[1] ?? '');
  if (!PARTS.some(({ key }) => params.has(key))) return null;
  return readLibrary(({ key }) => params.get(key), hostels);
}

/** The library's hash for a state: a part at its default is left out, so nothing chosen is `#/`. */
export function libraryHash(state: LibraryState): string {
  const params = new URLSearchParams();
  for (const { part, key } of PARTS) if (state[part] !== LIBRARY_DEFAULTS[part]) params.set(key, state[part]);
  const query = params.toString();
  return query ? `#/?${query}` : '#/';
}

/** What this browser remembers, read by the URL's rule. */
export const rememberedLibrary = (get: (key: string) => string | null, hostels: readonly string[]): LibraryState => readLibrary(({ pref }) => get(pref), hostels);

/** Remembers a state, as if each part had been chosen by hand. */
export function rememberLibrary(set: (key: string, value: string) => void, state: LibraryState) {
  for (const { part, pref } of PARTS) set(pref, state[part]);
}

export const sameLibrary = (a: LibraryState, b: LibraryState) => PARTS.every(({ part }) => a[part] === b[part]);
