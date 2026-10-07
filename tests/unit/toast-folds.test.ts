import { describe, expect, it } from 'vitest';
import { NO_FOLDS, closeWarning, foldsFor, openAll, warningId, type Folds } from '../../src/editor/toastFolds.js';

/* Which of the standing warnings are folded into the "⚠ n" chip (src/editor/toastFolds.ts; the editor's UX round, Part 1).
   A warning is known by its kind and its words, so a closed one stays folded while the staff member types, and one
   whose words change, or that left and came back, shows again. */

const DESKTOP = false;
const NARROW = true;

const after = (steps: ((f: Folds) => Folds)[]) => steps.reduce((f, step) => step(f), NO_FOLDS);

describe('the warnings’ folds', () => {
  it('a new warning is open on a desktop, and folded where the window is narrow', () => {
    expect(foldsFor(NO_FOLDS, ['a', 'b'], DESKTOP).folded).toEqual([]);
    expect(foldsFor(NO_FOLDS, ['a', 'b'], NARROW).folded).toEqual(['a', 'b']);
  });

  it('a closed warning stays folded while it stands, whatever else comes and goes', () => {
    const f = after([(f) => foldsFor(f, ['a', 'b'], DESKTOP), (f) => closeWarning(f, 'a'), (f) => foldsFor(f, ['a', 'c'], DESKTOP)]);
    expect(f.folded).toEqual(['a']);
  });

  it('a warning that went away and came back shows again', () => {
    const f = after([
      (f) => foldsFor(f, ['a'], DESKTOP),
      (f) => closeWarning(f, 'a'),
      (f) => foldsFor(f, [], DESKTOP),
      (f) => foldsFor(f, ['a'], DESKTOP),
    ]);
    expect(f.folded).toEqual([]);
  });

  it('the chip opens every one, and they stay open where the window is narrow', () => {
    const f = after([(f) => foldsFor(f, ['a', 'b'], NARROW), openAll, (f) => foldsFor(f, ['a', 'b'], NARROW)]);
    expect(f.folded).toEqual([]);
    // One that arrives later is new there, and starts folded as the first ones did.
    expect(foldsFor(f, ['a', 'b', 'c'], NARROW).folded).toEqual(['c']);
  });

  it('answers the same folds when nothing changed, so a render that asks again settles', () => {
    const f = foldsFor(NO_FOLDS, ['a'], NARROW);
    expect(foldsFor(f, ['a'], NARROW)).toBe(f);
    expect(foldsFor(NO_FOLDS, [], DESKTOP)).toBe(NO_FOLDS);
  });

  it('closing a warning that is not there changes nothing', () => {
    const f = foldsFor(NO_FOLDS, ['a'], DESKTOP);
    expect(closeWarning(f, 'gone')).toBe(f);
  });

  it('a warning is its kind and its words: other words are another warning', () => {
    expect(warningId('lint', 'Too many !')).toBe(warningId('lint', 'Too many !'));
    expect(warningId('lint', 'Too many !')).not.toBe(warningId('lint', 'Too many ?'));
    expect(warningId('lint', 'x')).not.toBe(warningId('cut-off', 'x'));
  });
});
