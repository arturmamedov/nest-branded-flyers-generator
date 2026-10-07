import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { NARROW_QUERY, NO_FOLDS, OUTCOME_MS, closeWarning, foldsFor, openAll } from './toastFolds';

/* What a focus page has to say about the flyer on its stage, in the stage's bottom-right corner (the owner's ask,
   2026-10-07; the editor's UX round, Part 1). It floats over the stage, out of the layout, as the "Share text" pill
   does: a note never takes space from the flyer, which was his rule above the rest. The editor and the AI page both
   mount it inside their .workspace. */

/** What the last action came to: one slot, so a new action's takes the last one's place. */
export interface Outcome {
  kind: 'ok' | 'error';
  body: ReactNode;
}

/** Something about the flyer that is still true (toastFolds.ts says what makes two of them the same one). */
export interface Warning {
  id: string;
  body: ReactNode;
}

function useNarrow(): boolean {
  return useSyncExternalStore(
    (changed) => {
      const query = matchMedia(NARROW_QUERY);
      query.addEventListener('change', changed);
      return () => query.removeEventListener('change', changed);
    },
    () => matchMedia(NARROW_QUERY).matches,
  );
}

function Close({ what, onClose }: { what: string; onClose: (hadFocus: boolean) => void }) {
  return (
    <button type="button" className="toast-close" aria-label={`Close ${what}`} onClick={(e) => onClose(document.activeElement === e.currentTarget)}>
      <span aria-hidden="true">×</span>
    </button>
  );
}

export function Toasts({ outcome, onCloseOutcome, warnings }: { outcome: Outcome | null; onCloseOutcome: () => void; warnings: Warning[] }) {
  const narrow = useNarrow();
  // Worked out while rendering, so a warning that starts folded is never on screen for a frame first.
  const [kept, setFolds] = useState(NO_FOLDS);
  const folds = foldsFor(
    kept,
    warnings.map((w) => w.id),
    narrow,
  );
  if (folds !== kept) setFolds(folds);
  const open = warnings.filter((w) => !folds.folded.includes(w.id));
  const folded = warnings.length - open.length;

  // A success leaves by itself; it waits while the pointer or the focus is on it. An error stays until it is closed.
  const [held, setHeld] = useState(false);
  const close = useRef(onCloseOutcome);
  close.current = onCloseOutcome;
  useEffect(() => {
    if (outcome?.kind !== 'ok' || held) return;
    const t = setTimeout(() => close.current(), OUTCOME_MS);
    return () => clearTimeout(t);
  }, [outcome, held]);
  useEffect(() => {
    if (!outcome) setHeld(false);
  }, [outcome]);

  // A toast never takes the focus. One closed from the keyboard would drop it nowhere, though: it goes to the chip
  // the warning folded into, else to the next toast's close button.
  const root = useRef<HTMLDivElement>(null);
  const chip = useRef<HTMLButtonElement>(null);
  const [refocus, setRefocus] = useState(0);
  useEffect(() => {
    if (refocus) (chip.current ?? root.current?.querySelector<HTMLElement>('.toast-close'))?.focus();
  }, [refocus]);
  const closing = (hadFocus: boolean, then: () => void) => {
    then();
    if (hadFocus) setRefocus((n) => n + 1);
  };

  const hold = { onPointerEnter: () => setHeld(true), onPointerLeave: () => setHeld(false), onFocus: () => setHeld(true), onBlur: () => setHeld(false) };
  const outcomeToast = (o: Outcome) => (
    <div className={`toast toast-${o.kind}`} {...(o.kind === 'ok' ? hold : {})}>
      <div className="toast-body">{o.body}</div>
      <Close what="this message" onClose={(hadFocus) => closing(hadFocus, onCloseOutcome)} />
    </div>
  );

  return (
    <div ref={root} className="toasts">
      {/* An error is said at once. A success is said when there is a pause, from a region that is there before its
          words are. The warnings are not said: they change with every key. */}
      {outcome?.kind === 'error' && <div role="alert">{outcomeToast(outcome)}</div>}
      <div role="status">{outcome?.kind === 'ok' && outcomeToast(outcome)}</div>
      {open.length > 0 && (
        <ul className="toast-warnings" aria-label="Warnings">
          {open.map((w, i) => (
            <li key={`${i}:${w.id}`} className="toast toast-warn">
              <div className="toast-body">{w.body}</div>
              <Close what="this warning" onClose={(hadFocus) => closing(hadFocus, () => setFolds((f) => closeWarning(f, w.id)))} />
            </li>
          ))}
        </ul>
      )}
      {folded > 0 && (
        <button ref={chip} type="button" className="toast-chip" aria-label={folded === 1 ? 'Show 1 warning' : `Show ${folded} warnings`} onClick={() => setFolds(openAll)}>
          <span aria-hidden="true">⚠ {folded}</span>
        </button>
      )}
    </div>
  );
}
