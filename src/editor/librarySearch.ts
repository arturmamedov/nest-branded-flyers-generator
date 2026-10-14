import { labelNames } from '../shared/labels';
import type { FlyerData, FlyerListItem, FlyerPayload, Template } from '../shared/schema';
import { FIELD, briefFieldLabel } from './fields';
import { sectionsOf } from './sectionFolds';
import { TEMPLATE_LABEL } from './templates';

/* The library's search box (2026-10-14; the owner's ask: "the search field that will search for: name, label, share
   text, other relevant fields exactly with this priority order"), to find a flyer that exists before making another.
   The rule alone: a flyer's words field by field, the match, the rank, what a card marks and the "why" line. No React
   and no DOM, so it is tested by itself (tests/unit/library-search.test.ts). The words come from the list item and
   from the flyer's own answer (libraryFlyers.ts): the list carries no share text and no copy. */

/** Where the search is remembered, next to the filters (the owner's answer: "Always, like the filters"). */
export const SEARCH_PREF = 'library.search';

/** The characters the box holds, spaces not counted, before it searches (his answer: fewer is a typo, or too few). */
export const SEARCH_MIN = 3;

/** The owner's order: a match in the name first, then in a label, then in the share text, then in the rest. */
export const RANK = { name: 0, label: 1, share: 2, rest: 3 } as const;
export type Rank = (typeof RANK)[keyof typeof RANK];

/** A flyer's answer as the search sees it: on its way (or not asked yet), here, or one that cannot load. */
export type Answer = { state: 'waiting' } | { state: 'here'; payload: FlyerPayload } | { state: 'failed' };

/** A run of a text, marked where a word was found. */
export interface Part {
  text: string;
  mark: boolean;
}

/** Why a flyer found by none of its card's own words is there: the field's name in the editor's words, and the text
    around the first word, cut. */
export interface Why {
  field: string;
  parts: Part[];
}

export interface Found {
  rank: Rank;
  why: Why | null;
}

/** About a word or two of the text before the first word found: the line is one line (his answer), so the word has to
    come early in it to be seen on a phone. */
const LEAD = 16;
/** Where the line's text stops: CSS cuts it again at the card's edge. */
const SNIPPET_MAX = 120;

/** What a cut text never starts on. */
const SEPARATOR = /[\s·,;:.!?–—-]/;

/** Typed on a phone, an apostrophe is often a curly one: all of them count as one. */
const APOSTROPHES = /[‘’ʼ]/g;

/** A text folded for matching (lower case, no accents, one apostrophe), with where each folded character came from
    in the text as written: what a mark covers. */
function fold(text: string): { folded: string; from: number[]; to: number[] } {
  let folded = '';
  const from: number[] = [];
  const to: number[] = [];
  let at = 0;
  for (const char of text) {
    const f = char.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(APOSTROPHES, "'");
    if (f === '' && to.length > 0) to[to.length - 1] = at + char.length; // an accent written on its own joins its letter
    for (let k = 0; k < f.length; k++) {
      from.push(at);
      to.push(at + char.length);
    }
    folded += f;
    at += char.length;
  }
  return { folded, from, to };
}

/** The words a flyer must hold, folded: none until the box holds SEARCH_MIN characters, spaces not counted. */
export function searchWords(query: string): string[] {
  if ([...query.replace(/\s+/g, '')].length < SEARCH_MIN) return [];
  return fold(query).folded.split(/\s+/).filter(Boolean);
}

/** A card's meta line as it reads, but its date: what the search looks at, and what the card marks. A template this
    release does not know (a later release's, met after going back) reads as none. */
export const metaOf = (item: FlyerListItem) => ({ hostel: item.hostelName ?? 'All hostels', template: TEMPLATE_LABEL[item.template] ?? '' });

/** One field a flyer is searched by. `why` is its name in the "why" line; the card's own fields have none: a word
    found there is marked where it is. */
interface Field {
  rank: Rank;
  text: string;
  why?: string;
}

/** What the list gives at once: the name, the labels staff see (labelNames: a label off the list is on no screen, so
    it is not searched either), and the meta line. */
function listFields(item: FlyerListItem): Field[] {
  const meta = metaOf(item);
  return [
    { rank: RANK.name, text: item.title },
    ...labelNames(item.labels ?? []).map((name) => ({ rank: RANK.label, text: name })),
    { rank: RANK.rest, text: meta.hostel },
    { rank: RANK.rest, text: meta.template },
  ];
}

/** A week row as it reads, one line: its cells between dots. */
const rowText = (row: FlyerData['week'][number]) => [row.day, row.name, row.shortName, row.time, row.cost].filter(Boolean).join(' · ');

/** What the flyer's answer adds: the share text, then the copy in the panel's order, of what the template prints
    (switching template keeps every field, so an Activity flyer may still hold week rows nobody sees). A chip is
    searched by its value, never its WHEN / WHERE / COST. */
function dataFields(template: Template, data: FlyerData): Field[] {
  const shows = sectionsOf(template);
  const rest = (key: string, text: string, why = briefFieldLabel(key)): Field => ({ rank: RANK.rest, text, why });
  const t = data.text;
  return [
    { rank: RANK.share, text: data.share, why: FIELD.share },
    rest('text.eyebrow', t.eyebrow),
    rest('text.headline1', t.headline1),
    rest('text.headline2', t.headline2),
    rest('text.headlineEs', t.headlineEs),
    ...(shows.includes('facts') ? data.chips.map((chip) => rest(chip.key, chip.value)) : []),
    ...(shows.includes('extras') ? data.extras.map((extra) => rest('extras', extra)) : []),
    ...(shows.includes('rows') ? data.week.map((row) => rest('week', rowText(row))) : []),
    rest('text.askEn', t.askEn),
    rest('text.askEs', t.askEs),
    rest('text.handle', t.handle),
    rest('text.tag', t.tag),
  ];
}

type Folded = Field & { folded: string };

/* A flyer's fields folded once: the list redraws with every answer that lands and every key typed. Kept by the list
   item and by the answer, objects that are new when the flyer is. */
const LIST_FIELDS = new WeakMap<FlyerListItem, Folded[]>();
const DATA_FIELDS = new WeakMap<FlyerPayload, Folded[]>();

function foldedOnce<K extends object>(cache: WeakMap<K, Folded[]>, key: K, fields: () => Field[]): Folded[] {
  let folded = cache.get(key);
  if (!folded) {
    folded = fields().map((field) => ({ ...field, folded: fold(field.text).folded }));
    cache.set(key, folded);
  }
  return folded;
}

/** Where the words are in a text, as ranges of the text as written, joined where they meet. */
function ranges(text: string, words: readonly string[]): [number, number][] {
  const { folded, from, to } = fold(text);
  const found: [number, number][] = [];
  for (const word of words) {
    for (let at = folded.indexOf(word); at !== -1; at = folded.indexOf(word, at + 1)) found.push([from[at], to[at + word.length - 1]]);
  }
  found.sort((a, b) => a[0] - b[0]);
  const joined: [number, number][] = [];
  for (const [start, end] of found) {
    const last = joined.at(-1);
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else joined.push([start, end]);
  }
  return joined;
}

/** A text in runs, marked where a word is found: what a card draws in its name, its meta line and its pills. */
export function marked(text: string, words: readonly string[]): Part[] {
  const parts: Part[] = [];
  let at = 0;
  for (const [start, end] of ranges(text, words)) {
    if (start > at) parts.push({ text: text.slice(at, start), mark: false });
    parts.push({ text: text.slice(start, end), mark: true });
    at = end;
  }
  if (at < text.length || parts.length === 0) parts.push({ text: text.slice(at), mark: false });
  return parts;
}

/** The text of the "why" line: from a word or two before the first word found, cut at spaces, "…" where it is cut. */
function snippet(text: string, words: readonly string[]): Part[] {
  const flat = text.replace(/\s+/g, ' ').trim();
  const first = ranges(flat, words)[0][0];
  let start = 0;
  if (first - LEAD > 0) {
    const space = flat.indexOf(' ', first - LEAD);
    start = space !== -1 && space < first ? space + 1 : first;
    // Never on a separator ("…· Catamaran"): a week row's cells are between dots.
    while (start < first && SEPARATOR.test(flat[start])) start++;
  }
  let end = Math.min(flat.length, start + SNIPPET_MAX);
  if (end < flat.length) {
    const space = flat.lastIndexOf(' ', end);
    if (space > first) end = space;
  }
  const cut = `${start > 0 ? '…' : ''}${flat.slice(start, end).trim()}${end < flat.length ? '…' : ''}`;
  return marked(cut, words);
}

/** Whether a flyer holds every word, in any field and any order, and if so its rank (its best field holding one of
    them) and its "why" line. With no answer, by its list fields alone. */
export function findIn(item: FlyerListItem, payload: FlyerPayload | null, words: readonly string[]): Found | null {
  if (words.length === 0) return null;
  // The record's template wins over the list's, as on every write: the two are the same flyer's.
  const fields = [...foldedOnce(LIST_FIELDS, item, () => listFields(item)), ...(payload ? foldedOnce(DATA_FIELDS, payload, () => dataFields(payload.flyer.template, payload.flyer.data)) : [])];
  if (!words.every((word) => fields.some((field) => field.folded.includes(word)))) return null;
  const holding = fields.filter((field) => words.some((word) => field.folded.includes(word)));
  const rank = Math.min(...holding.map((field) => field.rank)) as Rank;
  // Only for a flyer whose card shows none of the words: a match in the meta line is marked there instead.
  const source = rank >= RANK.share ? holding.find((field) => field.why) : undefined;
  return { rank, why: source ? { field: source.why!, parts: snippet(source.text, words) } : null };
}

/** The library's list narrowed to the flyers found, best rank first and in the list's own order within a rank. A
    flyer on its way shows once its list fields already hold every word; the rest join as they come. */
export function findFlyers(items: readonly FlyerListItem[], words: readonly string[], answerOf: (item: FlyerListItem) => Answer) {
  const found: { item: FlyerListItem; found: Found }[] = [];
  let waiting = 0;
  for (const item of items) {
    const answer = answerOf(item);
    if (answer.state === 'waiting') waiting++;
    const f = findIn(item, answer.state === 'here' ? answer.payload : null, words);
    if (f) found.push({ item, found: f });
  }
  found.sort((a, b) => a.found.rank - b.found.rank);
  return { found, waiting };
}
