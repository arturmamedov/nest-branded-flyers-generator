/* Which of a focus page's standing warnings are folded into the "⚠ n" chip (Toasts.tsx draws them). No React and no
   DOM here, so the rule is tested by itself (tests/unit/toasts.test.ts). */

/** The window's width at and below which the form sits on top of the flyer (editor.css): there the flyer fills the
    stage, so a warning starts folded. */
export const NARROW_QUERY = '(max-width: 860px)';

/** A success closes by itself after this long; an error stays until it is closed. */
export const OUTCOME_MS = 6000;

/** A warning by its kind and its words: the same words are the same warning while the staff member types, and other
    words are another one, which shows again. */
export const warningId = (kind: string, words: string) => `${kind}:${words}`;

export interface Folds {
  /** The warnings standing at the last look, to tell a new one from one that was there. */
  seen: readonly string[];
  folded: readonly string[];
}

export const NO_FOLDS: Folds = { seen: [], folded: [] };

const same = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/** The folds for the warnings standing now. One that left is forgotten, so it shows again when it comes back; a new
    one starts open, or folded where the window is narrow. The same object back when nothing changed. */
export function foldsFor(prev: Folds, ids: readonly string[], narrow: boolean): Folds {
  const folded = ids.filter((id) => (prev.seen.includes(id) ? prev.folded.includes(id) : narrow));
  return same(prev.seen, ids) && same(prev.folded, folded) ? prev : { seen: [...ids], folded };
}

/** A warning's close button: it folds into the chip while its problem is still there. */
export function closeWarning(f: Folds, id: string): Folds {
  return f.seen.includes(id) && !f.folded.includes(id) ? { ...f, folded: f.seen.filter((s) => s === id || f.folded.includes(s)) } : f;
}

/** The chip: every folded warning opens again. */
export const openAll = (f: Folds): Folds => (f.folded.length ? { ...f, folded: [] } : f);
