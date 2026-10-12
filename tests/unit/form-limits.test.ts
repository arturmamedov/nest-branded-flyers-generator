import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROOT } from '../../scripts/gen-shared.js';

/* A limit has one home (src/shared/: text.ts, chips.ts, extras.ts, week.ts, share.ts, names.ts), read by the schema
   and by the form. Typed again beside an input, it is a second copy: the form and the API then disagree the day one
   of them moves (the tag went from 12 to 24 in the editor's UX round, Part 4, and the chip's 90 and the extras' 32
   and 4 were still typed in the editor). */

const EDITOR = join(ROOT, 'src/editor');
const sources = (readdirSync(EDITOR, { recursive: true }) as string[]).filter((f) => /\.tsx?$/.test(f)).map((f) => ({ file: f.replace(/\\/g, '/'), text: readFileSync(join(EDITOR, f), 'utf8') }));

describe('the form’s limits', () => {
  it('no input in the editor has its limit typed as a number', () => {
    expect(sources.length).toBeGreaterThan(20);
    const typed = sources.flatMap(({ file, text }) => [...text.matchAll(/maxLength=\{\s*\d+\s*\}|maxLength="\d+"/g)].map((m) => `${file}: ${m[0]}`));
    expect(typed).toEqual([]);
  });

  it('the editor counts its extras against EXTRAS_MAX, not a number', () => {
    // Against 0 or 1 it is asking whether there are any, which is no limit.
    const typed = sources.flatMap(({ file, text }) => [...text.matchAll(/extras\.length\s*(<|<=|>=|>|===)\s*(?:[2-9]|\d{2,})/g)].map((m) => `${file}: ${m[0]}`));
    expect(typed).toEqual([]);
  });
});
