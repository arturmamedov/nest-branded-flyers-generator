import { describe, expect, it } from 'vitest';
import { briefFieldLabel } from '../../src/editor/fields.js';
import { BriefSchema, TextSchema } from '../../src/shared/schema.js';

/* The name the AI page gives a brief's key when it lists what the AI assumed (src/editor/fields.ts): the editor's own
   name for that field, from the one place the editor takes its labels from. An assumption's `field` is the model's to
   choose, a string of up to 40 characters and not one of a list, so a key no field has must come back as it is:
   read off a plain object, "__proto__" was an object and took the page down. */

const BRIEF_KEYS = [...Object.keys(BriefSchema.shape).filter((key) => key !== 'text'), ...Object.keys(TextSchema.shape).map((key) => `text.${key}`)];

describe('a brief key as the editor names its field', () => {
  it.each(BRIEF_KEYS)('%s has a name of its own', (key) => {
    expect(briefFieldLabel(key)).not.toBe(key);
    expect(briefFieldLabel(key)).toMatch(/^[A-Z]/);
  });

  it('says which section a line or a language belongs to', () => {
    expect(['text.headline1', 'text.headline2', 'text.askEn', 'text.askEs'].map(briefFieldLabel)).toEqual([
      'Headline line 1',
      'Headline line 2',
      'The ask (English)',
      'The ask (Spanish)',
    ]);
  });

  it.each(['__proto__', 'constructor', 'toString', 'hasOwnProperty', 'text.colour', ''])('gives back "%s", a key no field has', (key) => {
    expect(briefFieldLabel(key)).toBe(key);
  });
});
