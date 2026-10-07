import { deriveChips } from '../shared/chips';
import type { FlyerData, Template } from '../shared/schema';
import { isPrintable } from '../shared/week';
import { PHOTO_MODE_LABEL } from './photoModes';
import { TEMPLATE_LABEL } from './templates';

/* Which of the editor's sections are open, and what a closed one says of itself (panel.tsx draws them; the editor's
   UX round, Part 2). No React and no DOM here, so the rule is tested by itself (tests/unit/section-folds.test.ts).
   Types only from schema.ts: this is in the editor's bundle. */

/** The editor's sections, in the panel's order. A template shows its own (sectionsOf). */
export const SECTIONS = ['flyer', 'headline', 'facts', 'extras', 'rows', 'ask', 'photo', 'top', 'share'] as const;
export type SectionId = (typeof SECTIONS)[number];

/** The sections only one template has: the rest are in both. */
const ONLY: Partial<Record<SectionId, Template>> = { facts: 'activity', extras: 'activity', photo: 'activity', rows: 'week' };

export const sectionsOf = (template: Template): SectionId[] => SECTIONS.filter((id) => (ONLY[id] ?? template) === template);

/** A list of sections as the panel orders them, each once. */
const inOrder = (has: (id: SectionId) => boolean): SectionId[] => SECTIONS.filter(has);

/** Where the open sections are remembered (prefs.ts): how this viewer left them, never flyer data. */
export const SECTIONS_PREF = 'editor.sections';

/** A saved flyer's open sections before any last time: When · Where · Cost, or the rows on a This week flyer (the
    owner's answer, 2026-10-07). */
export const FIRST_OPEN: readonly SectionId[] = ['facts', 'rows'];

export const storeOpen = (open: readonly SectionId[]): string => JSON.stringify(inOrder((id) => open.includes(id)));

/** The stored list, read loosely: what is no list is no last time, and in a list only the sections this release has
    count (a later release's, met after going back, is dropped). */
function readOpen(stored: string | null): SectionId[] | null {
  let list: unknown;
  try {
    list = JSON.parse(stored ?? '');
  } catch {
    return null;
  }
  return Array.isArray(list) ? inOrder((id) => list.includes(id)) : null;
}

/** The sections open when the editor opens. A new flyer and an AI-made one start fully open, whatever was left last
    time; a saved one as the sections were left, and before any last time with FIRST_OPEN. */
export const openAtStart = (saved: boolean, stored: string | null): SectionId[] => (saved ? (readOpen(stored) ?? [...FIRST_OPEN]) : [...SECTIONS]);

export const toggled = (open: readonly SectionId[], id: SectionId): SectionId[] => inOrder((s) => (s === id ? !open.includes(s) : open.includes(s)));

/** With this section open: the same list back when it already is, so nothing is drawn or written again. */
export const opened = (open: readonly SectionId[], id: SectionId): readonly SectionId[] => (open.includes(id) ? open : toggled(open, id));

/** Whether every section the template shows is open: "Open all" then reads "Close all". */
export const allOpen = (open: readonly SectionId[], template: Template): boolean => sectionsOf(template).every((id) => open.includes(id));

/** The lines of text a copy rule can name (copyRules.ts), each with the section its field is in. A Map, never a plain
    object: "constructor" read off an object is a function. */
const TEXT_SECTION: ReadonlyMap<string, SectionId> = new Map([
  ['eyebrow', 'top'],
  ['handle', 'top'],
  ['tag', 'top'],
  ['headline1', 'headline'],
  ['headline2', 'headline'],
  ['headlineEs', 'headline'],
  ['askEn', 'ask'],
  ['askEs', 'ask'],
]);

/** The section a copy rule's field is in (Lint.field), or null for a rule about the whole flyer. */
export function sectionOfField(field: string): SectionId | null {
  if (field.startsWith('chip.')) return 'facts';
  if (field.startsWith('extras.')) return 'extras';
  if (field.startsWith('week.')) return 'rows';
  return TEXT_SECTION.get(field) ?? null;
}

/** The sections with something to see to: a copy rule's warning in one of their fields, and the Photo section while
    a frame has no photo. A closed one shows a dot. */
export function flaggedSections(lintFields: readonly string[], needsPhoto: boolean): SectionId[] {
  const flagged = new Set<SectionId | null>(lintFields.map(sectionOfField));
  if (needsPhoto) flagged.add('photo');
  return inOrder((id) => flagged.has(id));
}

const EMPTY = 'Empty';
const dotted = (parts: string[]): string =>
  parts
    .map((p) => p.trim())
    .filter(Boolean)
    .join(' · ');

/** What a closed section says of itself in one line, so the whole flyer reads at a glance. `hostelName`: null on a
    chain-wide flyer; `hasPhoto`: a photo is set, whatever the mode. */
export function sectionLine(id: SectionId, { data, hostelName, hasPhoto }: { data: FlyerData; hostelName: string | null; hasPhoto: boolean }): string {
  const t = data.text;
  switch (id) {
    case 'flyer':
      return dotted([TEMPLATE_LABEL[data.template], hostelName ?? 'All hostels']);
    case 'headline':
      // With no English line, the Spanish one is what the section holds.
      return [t.headline1, t.headline2].map((line) => line.trim()).filter(Boolean).join(' ') || t.headlineEs.trim() || EMPTY;
    case 'facts':
      // Each block's big line, as it prints: the hostel in WHERE, and no block that is hidden.
      return dotted(deriveChips(data.chips, hostelName).map((c) => c.big)) || EMPTY;
    case 'extras':
      return dotted(data.extras) || 'Nothing added';
    case 'rows': {
      const rows = data.week.filter(isPrintable);
      if (rows.length === 0) return 'No rows yet';
      // Two rows on one day name it once.
      const days = [...new Set(rows.map((r) => r.day.trim()).filter(Boolean))];
      return dotted([`${rows.length} ${rows.length === 1 ? 'row' : 'rows'}`, days.join(', ')]);
    }
    case 'ask':
      return t.askEn.trim() || t.askEs.trim() || EMPTY;
    case 'photo':
      // A photo kept for switching back prints nothing on "No photo".
      return data.photoMode === 'none' ? PHOTO_MODE_LABEL.none : dotted([PHOTO_MODE_LABEL[data.photoMode], hasPhoto ? 'photo set' : 'no photo yet']);
    case 'top':
      return dotted(data.showPill ? [t.eyebrow, t.handle, t.tag] : [t.eyebrow, 'no tag pill']) || EMPTY;
    case 'share':
      return data.share.trim() ? 'Caption written' : 'No caption yet';
  }
}
