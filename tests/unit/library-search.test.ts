import { describe, expect, it } from 'vitest';
import { FIELD, briefFieldLabel } from '../../src/editor/fields';
import { RANK, SEARCH_MIN, SEARCH_PREF, findFlyers, findIn, marked, metaOf, searchWords, type Answer } from '../../src/editor/librarySearch';
import { TEMPLATE_LABEL } from '../../src/editor/templates';
import { newFlyerData } from '../../src/shared/defaults';
import type { FlyerData, FlyerListItem, FlyerPayload } from '../../src/shared/schema';

/* The library's search (src/editor/librarySearch.ts): the words a flyer is found by, field by field, in the owner's
   order (the name, a label, the share text, the rest), and what a card marks. No React and no DOM. */

let nextId = 1;
const itemOf = (over: Partial<FlyerListItem> = {}): FlyerListItem => ({
  id: nextId++,
  title: 'Pool party',
  template: 'activity',
  hostel: 'duque',
  hostelName: 'Duque Nest',
  updatedAt: '2026-10-14T10:00:00.000Z',
  labels: [],
  ...over,
});

const payloadOf = (item: FlyerListItem, edit: (data: FlyerData) => void = () => {}): FlyerPayload => {
  const data = newFlyerData(item.template);
  edit(data);
  return {
    flyer: { id: item.id, title: item.title, hostel: item.hostel, template: item.template, data, photoId: null, createdAt: item.updatedAt, updatedAt: item.updatedAt },
    hostel: null,
    photo: null,
  } as FlyerPayload;
};

const here = (payload: FlyerPayload): Answer => ({ state: 'here', payload });

describe('what is searched for', () => {
  it('is remembered next to the filters', () => {
    expect(SEARCH_PREF).toBe('library.search');
  });

  it('starts at three characters in the box, spaces not counted (the owner’s answer)', () => {
    expect(SEARCH_MIN).toBe(3);
    for (const q of ['', ' ', 'te', ' t e ', '  a  ']) expect(searchWords(q), JSON.stringify(q)).toEqual([]);
    expect(searchWords('tei')).toEqual(['tei']);
    expect(searchWords('a b c')).toEqual(['a', 'b', 'c']);
  });

  it('is every word typed, folded: case, accents and apostrophes', () => {
    expect(searchWords('  Teide   SUNSET ')).toEqual(['teide', 'sunset']);
    expect(searchWords('Excursión café')).toEqual(['excursion', 'cafe']);
    expect(searchWords('What’s ‘on’')).toEqual(["what's", "'on'"]);
  });
});

describe('a flyer is found', () => {
  const item = itemOf({ title: 'Teide by night', labels: ['excursions'] });
  const payload = payloadOf(item, (d) => {
    d.share = 'A sunset hike to the top, then the stars.';
    d.text.headlineEs = 'Excursión al Teide';
  });

  it('when every word is somewhere in it, in any field and any order', () => {
    expect(findIn(item, payload, searchWords('teide sunset'))).not.toBeNull();
    expect(findIn(item, payload, searchWords('sunset teide'))).not.toBeNull();
    expect(findIn(item, payload, searchWords('teide sunrise'))).toBeNull();
  });

  it('whatever the case and the accents, on both sides', () => {
    expect(findIn(item, payload, searchWords('EXCURSION'))).not.toBeNull();
    const cafe = itemOf({ title: 'Café de la playa' });
    expect(findIn(cafe, null, searchWords('cafe'))).not.toBeNull();
    expect(findIn(cafe, null, searchWords('CAFÉ'))).not.toBeNull();
  });

  it('by nothing fuzzy: a typo finds nothing', () => {
    expect(findIn(item, payload, searchWords('tiede'))).toBeNull();
  });

  it('by a label’s name, never its slug, and never by a label off the list', () => {
    expect(findIn(item, null, searchWords('excursions'))).not.toBeNull();
    const off = itemOf({ title: 'Quiz night', labels: ['a-label-taken-off'] });
    expect(findIn(off, null, searchWords('taken'))).toBeNull();
    const tours = itemOf({ title: 'Masca', labels: ['tenerife-tours'] });
    expect(findIn(tours, null, searchWords('tenerife tours'))).not.toBeNull();
    expect(findIn(tours, null, searchWords('tenerife-tours'))).toBeNull();
  });

  it('by its meta line as it reads, not its date: the hostel, “All hostels”, the template', () => {
    expect(findIn(itemOf(), null, searchWords('duque'))?.rank).toBe(RANK.rest);
    expect(findIn(itemOf({ hostel: null, hostelName: null }), null, searchWords('all hostels'))).not.toBeNull();
    expect(findIn(itemOf({ template: 'week' }), null, searchWords('this week'))).not.toBeNull();
    expect(findIn(itemOf(), null, searchWords('oct'))).toBeNull();
    expect(metaOf(itemOf({ hostel: null, hostelName: null }))).toEqual({ hostel: 'All hostels', template: TEMPLATE_LABEL.activity });
  });

  it('by every line of its copy, the chips’ values (never their words), its extras', () => {
    const it = itemOf({ title: 'Surf' });
    const p = payloadOf(it, (d) => {
      d.text = { eyebrow: 'NEXT ACTIVITY', headline1: 'Two hours', headline2: 'of waves', headlineEs: 'Tu primera ola', askEn: 'Ask Marta', askEs: 'Pregunta a Marta', handle: '@surfnest', tag: 'GNARLY' };
      d.chips = [
        { key: 'when', label: 'When', value: 'Fridays · 15:00' },
        { key: 'where', label: 'Where', value: 'Playa Jardín' },
        { key: 'cost', label: 'Cost', value: '40€' },
      ];
      d.extras = ['Gear included'];
    });
    for (const q of ['next activity', 'hours', 'waves', 'primera', 'marta', 'surfnest', 'gnarly', 'fridays', 'jardin', '40€', 'gear']) expect(findIn(it, p, searchWords(q)), q).not.toBeNull();
    expect(findIn(it, p, searchWords('where'))).toBeNull();
  });

  it('by its week rows on a This week flyer: the day, the name, the short name, the time, the price', () => {
    const it = itemOf({ title: 'Our week', template: 'week' });
    const p = payloadOf(it, (d) => (d.week = [{ day: 'Saturdays', name: 'Sunset catamaran', shortName: 'Catamaran', time: '18:30', cost: '55€' }]));
    for (const q of ['saturdays', 'sunset', 'catamaran', '18:30', '55€']) expect(findIn(it, p, searchWords(q)), q).not.toBeNull();
  });

  it('only by what its template prints: switching template keeps every field', () => {
    const activity = itemOf({ title: 'Surf' });
    const withRows = payloadOf(activity, (d) => (d.week = [{ day: 'Mon', name: 'Bachata', time: '', cost: '' }]));
    expect(findIn(activity, withRows, searchWords('bachata'))).toBeNull();
    const week = itemOf({ title: 'Our week', template: 'week' });
    const withExtras = payloadOf(week, (d) => (d.extras = ['Gear included']));
    expect(findIn(week, withExtras, searchWords('gear'))).toBeNull();
  });

  it('with no answer, by its list fields alone', () => {
    expect(findIn(item, null, searchWords('teide'))).not.toBeNull();
    expect(findIn(item, null, searchWords('sunset'))).toBeNull();
  });
});

describe('the rank: the name, then a label, then the share text, then the rest', () => {
  it('is the best field holding one of the words', () => {
    const item = itemOf({ title: 'Teide by night', labels: ['teide'] });
    const payload = payloadOf(item, (d) => (d.share = 'Stars over Teide, and a sunset.'));
    expect(findIn(item, payload, searchWords('teide'))?.rank).toBe(RANK.name);
    expect(findIn(item, payload, searchWords('night sunset'))?.rank).toBe(RANK.name);
    const labelled = itemOf({ title: 'Stargazing', labels: ['teide'] });
    expect(findIn(labelled, payloadOf(labelled, (d) => (d.share = 'Teide')), searchWords('teide'))?.rank).toBe(RANK.label);
    const shared = itemOf({ title: 'Stargazing' });
    expect(findIn(shared, payloadOf(shared, (d) => (d.share = 'Up on Teide')), searchWords('teide'))?.rank).toBe(RANK.share);
    expect(findIn(shared, payloadOf(shared, (d) => (d.text.headlineEs = 'El Teide')), searchWords('teide'))?.rank).toBe(RANK.rest);
  });

  it('orders the flyers found, the library’s own order within a rank', () => {
    const items = [itemOf({ title: 'Stars' }), itemOf({ title: 'Teide one' }), itemOf({ title: 'Clouds' }), itemOf({ title: 'Teide two' }), itemOf({ title: 'Nothing' })];
    const answers = new Map<number, Answer>([
      [items[0].id, here(payloadOf(items[0], (d) => (d.text.headlineEs = 'Teide')))],
      [items[2].id, here(payloadOf(items[2], (d) => (d.share = 'Teide at dawn')))],
      [items[4].id, here(payloadOf(items[4]))],
    ]);
    const { found } = findFlyers(items, searchWords('teide'), (i) => answers.get(i.id) ?? { state: 'failed' });
    expect(found.map((f) => f.item.title)).toEqual(['Teide one', 'Teide two', 'Clouds', 'Stars']);
  });
});

describe('while the flyers are read', () => {
  it('a flyer on its way shows only when its list fields already hold every word', () => {
    const items = [itemOf({ title: 'Teide' }), itemOf({ title: 'Stars' })];
    const { found, waiting } = findFlyers(items, searchWords('teide'), () => ({ state: 'waiting' }));
    expect(found.map((f) => f.item.title)).toEqual(['Teide']);
    expect(waiting).toBe(2);
  });

  it('a flyer that cannot load is searched by its list fields, and waits for nothing', () => {
    const items = [itemOf({ title: 'Teide' }), itemOf({ title: 'Stars' })];
    const { found, waiting } = findFlyers(items, searchWords('teide'), () => ({ state: 'failed' }));
    expect(found.map((f) => f.item.title)).toEqual(['Teide']);
    expect(waiting).toBe(0);
  });
});

describe('the “why” line', () => {
  const item = itemOf({ title: 'Stargazing', labels: ['excursions'] });

  it('is there only when the name and the labels hold none of the words', () => {
    const payload = payloadOf(item, (d) => (d.share = 'Stars over Teide and dinner after.'));
    expect(findIn(item, payload, searchWords('teide'))?.why).not.toBeNull();
    expect(findIn(item, payload, searchWords('stargazing teide'))?.why).toBeNull();
    expect(findIn(item, payload, searchWords('excursions teide'))?.why).toBeNull();
  });

  it('is not there for a match in the meta line alone: the meta line is marked instead', () => {
    expect(findIn(item, payloadOf(item), searchWords('duque'))?.why).toBeNull();
  });

  it('names the field with the editor’s words, the share text first, then the copy in the panel’s order', () => {
    const why = (edit: (d: FlyerData) => void, q: string) => findIn(item, payloadOf(item, edit), searchWords(q))?.why?.field;
    expect(why((d) => (d.share = 'Teide'), 'teide')).toBe(FIELD.share);
    expect(why((d) => ((d.share = 'Teide'), (d.text.headlineEs = 'Teide')), 'teide')).toBe(FIELD.share);
    expect(why((d) => (d.text.headlineEs = 'Teide'), 'teide')).toBe(FIELD.spanishLine);
    expect(why((d) => (d.text.headline1 = 'Teide'), 'teide')).toBe(briefFieldLabel('text.headline1'));
    expect(why((d) => (d.text.askEn = 'Ask Marta'), 'marta')).toBe(briefFieldLabel('text.askEn'));
    expect(why((d) => (d.chips[0].value = 'Fridays'), 'fridays')).toBe(briefFieldLabel('when'));
    expect(why((d) => (d.extras = ['Gear included']), 'gear')).toBe(FIELD.extras);
    const week = itemOf({ title: 'Our week', template: 'week' });
    expect(findIn(week, payloadOf(week, (d) => (d.week = [{ day: 'Sat', name: 'Catamaran', time: '', cost: '' }])), searchWords('catamaran'))?.why?.field).toBe(FIELD.weekRows);
  });

  it('shows the text around the first word found, cut with “…” on both sides at a space', () => {
    const share = 'Join us on Saturday for a slow walk up the old trail, a sunset over the clouds, and a long dinner at the hut, with stars after it all, then the long way back down to the hostel in the dark with torches and songs.';
    const why = findIn(item, payloadOf(item, (d) => (d.share = share)), searchWords('sunset'))!.why!;
    const text = why.parts.map((p) => p.text).join('');
    expect(text.startsWith('…')).toBe(true);
    expect(text.endsWith('…')).toBe(true);
    const inner = text.slice(1, -1);
    expect(share.includes(inner)).toBe(true);
    expect(inner.startsWith(' ') || inner.endsWith(' ')).toBe(false);
    // A word or two before the word: one line, so the word is seen.
    expect(inner.indexOf('sunset')).toBeLessThanOrEqual(20);
    expect(why.parts.filter((p) => p.mark).map((p) => p.text)).toEqual(['sunset']);
  });

  it('is not cut where the text is short, and reads a text of several lines as one', () => {
    const why = findIn(item, payloadOf(item, (d) => (d.share = 'Teide\n\nat   dawn')), searchWords('dawn'))!.why!;
    expect(why.parts.map((p) => p.text).join('')).toBe('Teide at dawn');
  });

  it('shows a week row as one line, its cells between dots', () => {
    const week = itemOf({ title: 'Our week', template: 'week' });
    const why = findIn(week, payloadOf(week, (d) => (d.week = [{ day: 'Sat', name: 'Catamaran', time: '18:30', cost: '' }])), searchWords('catamaran'))!.why!;
    expect(why.parts.map((p) => p.text).join('')).toBe('Sat · Catamaran · 18:30');
  });
});

describe('the marks', () => {
  it('cover every place a word is found, in the text as it is written', () => {
    expect(marked('Excursión to the Teide, teide!', searchWords('teide excursion'))).toEqual([
      { text: 'Excursión', mark: true },
      { text: ' to the ', mark: false },
      { text: 'Teide', mark: true },
      { text: ', ', mark: false },
      { text: 'teide', mark: true },
      { text: '!', mark: false },
    ]);
  });

  it('join where words overlap, and leave a text with none as one part', () => {
    expect(marked('Sunset', searchWords('suns sunset'))).toEqual([{ text: 'Sunset', mark: true }]);
    expect(marked('Night hike', searchWords('teide'))).toEqual([{ text: 'Night hike', mark: false }]);
    expect(marked('Night hike', [])).toEqual([{ text: 'Night hike', mark: false }]);
  });

  it('find a curly apostrophe for a straight one', () => {
    expect(marked('What’s on', searchWords("what's"))).toEqual([
      { text: 'What’s', mark: true },
      { text: ' on', mark: false },
    ]);
  });
});
