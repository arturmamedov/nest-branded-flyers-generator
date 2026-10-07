import { newFlyerData } from '../shared/defaults';
import type { ChipKey } from '../shared/schema';
import { TEMPLATE_LABEL } from './templates';

/* What the panel calls each field, written once: the editor takes its labels and section titles from here, and the AI
   page names a brief's key with the same words when it lists what the AI assumed. Types only from schema.ts: this is
   in the editor's bundle. */

export const FIELD = {
  flyer: 'Flyer',
  template: 'Template',
  hostel: 'Hostel',
  title: 'Library name',
  headline: 'Headline',
  weekTitle: 'Title',
  line1: 'Line 1',
  line2: 'Line 2',
  spanishLine: 'Spanish line',
  facts: 'When · Where · Cost',
  extras: 'Nice to know',
  weekRows: `${TEMPLATE_LABEL.week}’s rows`,
  ask: 'The ask',
  english: 'English',
  spanish: 'Spanish',
  photo: 'Photo',
  top: 'Top and tag pill',
  eyebrow: 'Eyebrow',
  handle: 'Handle',
  tag: 'Tag',
  share: 'Share text',
} as const;

/** A chip's label is flyer data (it prints): a new flyer's is the name of the field. */
const chipLabel = (key: ChipKey): string => newFlyerData().chips.find((c) => c.key === key)?.label ?? key;

/** A line under its section, as a sentence would name it: "Headline line 1". */
const under = (section: string, field: string) => `${section} ${field.toLowerCase()}`;

/** A brief's keys (an AI assumption's `field`), each with the editor's name for it. A Map, never a plain object: the
    model chooses `field`, and "__proto__" read off an object is an object. */
const BRIEF_FIELDS: ReadonlyMap<string, string> = new Map([
  ['hostel', FIELD.hostel],
  ['template', FIELD.template],
  ['title', FIELD.title],
  ['when', chipLabel('when')],
  ['where', chipLabel('where')],
  ['cost', chipLabel('cost')],
  ['extras', FIELD.extras],
  ['week', FIELD.weekRows],
  ['share', FIELD.share],
  ['text.eyebrow', FIELD.eyebrow],
  ['text.headline1', under(FIELD.headline, FIELD.line1)],
  ['text.headline2', under(FIELD.headline, FIELD.line2)],
  ['text.headlineEs', FIELD.spanishLine],
  ['text.askEn', `${FIELD.ask} (${FIELD.english})`],
  ['text.askEs', `${FIELD.ask} (${FIELD.spanish})`],
  ['text.handle', FIELD.handle],
  ['text.tag', FIELD.tag],
]);

/** The editor's name for a brief's key; a key no field has comes back as it is. */
export const briefFieldLabel = (field: string): string => BRIEF_FIELDS.get(field) ?? field;
