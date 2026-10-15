import { describe, expect, it } from 'vitest';
import { ALL_LABELS, LABEL_PREF } from '../../src/editor/libraryLabel';
import { LIBRARY_DEFAULTS, libraryFromHash, libraryHash, rememberLibrary, rememberedLibrary, sameLibrary, type LibraryState } from '../../src/editor/libraryUrl';
import { SEARCH_PREF } from '../../src/editor/librarySearch';
import { VIEW_PREF } from '../../src/editor/libraryView';
import { parseHash } from '../../src/editor/route';
import { LABEL_SLUGS, NO_LABEL } from '../../src/shared/labels';

/* The library's filters, its search and its view in its URL (src/editor/libraryUrl.ts), so a library link opens the
   same page for anyone; and the same reader for what this browser remembers. */

const HOSTELS = ['ashavana', 'riad-sea'];
const label = LABEL_SLUGS[0];
const state = (s: Partial<LibraryState>): LibraryState => ({ ...LIBRARY_DEFAULTS, ...s });
const read = (hash: string) => libraryFromHash(hash, HOSTELS);

describe('the library’s URL', () => {
  it('is #/ with nothing chosen: every value at its default is left out', () => {
    expect(LIBRARY_DEFAULTS).toEqual({ hostel: '', template: '', label: ALL_LABELS, q: '', view: 'list' });
    expect(libraryHash(LIBRARY_DEFAULTS)).toBe('#/');
  });

  it('writes each part under its own key, in one order', () => {
    expect(libraryHash(state({ hostel: 'ashavana' }))).toBe('#/?hostel=ashavana');
    expect(libraryHash(state({ hostel: 'none' }))).toBe('#/?hostel=none');
    expect(libraryHash(state({ template: 'week' }))).toBe('#/?template=week');
    expect(libraryHash(state({ label }))).toBe(`#/?label=${label}`);
    expect(libraryHash(state({ label: NO_LABEL }))).toBe('#/?label=none');
    expect(libraryHash(state({ q: 'pool' }))).toBe('#/?q=pool');
    expect(libraryHash(state({ view: 'grid' }))).toBe('#/?view=grid');
    expect(libraryHash({ view: 'grid', q: 'pool', label, template: 'activity', hostel: 'riad-sea' })).toBe(`#/?hostel=riad-sea&template=activity&label=${label}&q=pool&view=grid`);
  });

  it('reads each part back: the round trip', () => {
    const all: LibraryState[] = [
      LIBRARY_DEFAULTS,
      state({ hostel: 'ashavana' }),
      state({ hostel: 'none', label: NO_LABEL }),
      state({ template: 'week', view: 'grid' }),
      state({ q: 'café pool  party' }),
      state({ q: '  ' }),
      { hostel: 'riad-sea', template: 'activity', label, q: 'a&b=c?d#e%f+g/h', view: 'grid' },
    ];
    for (const s of all.slice(1)) expect(read(libraryHash(s)), libraryHash(s)).toEqual(s);
  });

  it('is no state of its own when it holds none of the keys: the library as this browser remembers it', () => {
    for (const hash of ['', '#', '#/', '#/?', '#/?foo=1', '#/?&&', '#/ai', '#/new', '#/flyers/12', '#/foo?label=' + label]) expect(read(hash), hash).toBeNull();
  });

  it('is the whole state once it holds one key: a key it lacks is at its default', () => {
    expect(read('#/?view=grid')).toEqual(state({ view: 'grid' }));
    expect(read('#/?q=')).toEqual(LIBRARY_DEFAULTS);
  });

  it('ignores a value this release does not know, and drops an unknown key', () => {
    expect(read('#/?hostel=a-hostel-off-the-list')).toEqual(LIBRARY_DEFAULTS);
    expect(read('#/?template=poster')).toEqual(LIBRARY_DEFAULTS);
    expect(read('#/?label=a-label-off-the-list')).toEqual(LIBRARY_DEFAULTS);
    expect(read('#/?view=tiles')).toEqual(LIBRARY_DEFAULTS);
    expect(read('#/?view=Grid&template=__proto__&hostel=constructor')).toEqual(LIBRARY_DEFAULTS);
    expect(libraryHash(read('#/?utm_source=mail&view=grid&hostel=gone')!)).toBe('#/?view=grid');
  });

  it('reads a damaged hash without failing', () => {
    expect(read('#/?q=50%')).toEqual(state({ q: '50%' }));
    expect(read('#/?q=%E0%A4%A&view=grid')).toEqual(state({ q: expect.any(String), view: 'grid' }));
    expect(read('#/?q=%zz')).toEqual(state({ q: '%zz' }));
    expect(read('#/?label=' + label + '&label=none')).toEqual(state({ label }));
    expect(read('#/?view=grid&view=list')).toEqual(state({ view: 'grid' }));
  });

  it('carries spaces and accents in the search, as a browser writes them and as it reads them', () => {
    expect(libraryHash(state({ q: 'cena en la terraza' }))).toBe('#/?q=cena+en+la+terraza');
    expect(read('#/?q=cena%20en%20la%20terraza')).toEqual(state({ q: 'cena en la terraza' }));
    expect(read('#/?q=caf%C3%A9')).toEqual(state({ q: 'café' }));
    expect(read('#/?q=café')).toEqual(state({ q: 'café' }));
  });

  it('is the library for the hash router, whatever it holds', () => {
    for (const hash of ['#/', '#/?', `#/?label=${label}`, '#/?q=caf%C3%A9&view=grid', '#/?view=tiles&x=1', '#/?q=50%', '']) expect(parseHash(hash).page, hash).toBe('library');
  });

  it('tells two states apart, and the same one', () => {
    expect(sameLibrary(state({ q: 'pool' }), state({ q: 'pool' }))).toBe(true);
    expect(sameLibrary(state({ q: 'pool' }), state({ q: 'pool ' }))).toBe(false);
    expect(sameLibrary(LIBRARY_DEFAULTS, state({ view: 'grid' }))).toBe(false);
  });
});

describe('what this browser remembers of the library', () => {
  const store = (entries: Record<string, string>) => (key: string) => entries[key] ?? null;

  it('is the defaults for someone who never chose', () => {
    expect(rememberedLibrary(store({}), HOSTELS)).toEqual(LIBRARY_DEFAULTS);
  });

  it('is read by the URL’s rule, from the keys it always had', () => {
    const remembered = { 'library.hostel': 'riad-sea', 'library.template': 'week', [LABEL_PREF]: label, [SEARCH_PREF]: 'pool', [VIEW_PREF]: 'grid' };
    expect(rememberedLibrary(store(remembered), HOSTELS)).toEqual({ hostel: 'riad-sea', template: 'week', label, q: 'pool', view: 'grid' });
  });

  it('ignores a stored value it does not know, a hostel off the list too', () => {
    const remembered = { 'library.hostel': 'gone', 'library.template': 'poster', [LABEL_PREF]: 'gone', [VIEW_PREF]: 'tiles' };
    expect(rememberedLibrary(store(remembered), HOSTELS)).toEqual(LIBRARY_DEFAULTS);
  });

  it('is written under those keys, and reads back the same', () => {
    const written: Record<string, string> = {};
    const s: LibraryState = { hostel: 'none', template: 'activity', label: NO_LABEL, q: 'café', view: 'grid' };
    rememberLibrary((key, value) => (written[key] = value), s);
    expect(written).toEqual({ 'library.hostel': 'none', 'library.template': 'activity', [LABEL_PREF]: NO_LABEL, [SEARCH_PREF]: 'café', [VIEW_PREF]: 'grid' });
    expect(rememberedLibrary(store(written), HOSTELS)).toEqual(s);
  });
});
