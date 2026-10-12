import { useEffect, useRef, useState, type FocusEvent, type ReactNode } from 'react';
import { NARROW_QUERY, NO_FOLDS, OUTCOME_MS, closeWarning, foldsFor, leavesByItself, openAll } from './toastFolds';
import { useMedia } from './useMedia';

/* What a focus page has to say about the flyer on its stage, in the stage's bottom-right corner (the owner's ask,
   2026-10-07; the editor's UX round, Part 1). It floats over the stage, out of the layout, as the "Share text" pill
   does: a note never takes space from the flyer, which was his rule above the rest. The editor and the AI page both
   mount it inside their .workspace. */

/** What the last action came to: one slot, so a new action's takes the last one's place. */
export interface Outcome {
  kind: 'ok' | 'error';
  body: ReactNode;
  /** One next step the page offers with it, a button in the toast ("Copy the caption" after a picture is copied).
      An outcome that offers one stays until the step is taken or it is closed (toastFolds.ts). */
  action?: { label: string; onPress: () => void };
}

/** Something about the flyer that is still true (toastFolds.ts says what makes two of them the same one). */
export interface Warning {
  id: string;
  body: ReactNode;
}

function Close({ what, onClose }: { what: string; onClose: (hadFocus: boolean) => void }) {
  return (
    <button type="button" className="toast-close" aria-label={`Close ${what}`} onClick={(e) => onClose(document.activeElement === e.currentTarget)}>
      <span aria-hidden="true">×</span>
    </button>
  );
}

export function Toasts({ outcome, onCloseOutcome, warnings }: { outcome: Outcome | null; onCloseOutcome: () => void; warnings: Warning[] }) {
  const narrow = useMedia(NARROW_QUERY);
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
  // Each holds it by itself: the pointer leaving must not let go of a toast the keyboard is on.
  const [holds, setHolds] = useState({ pointer: false, focus: false });
  const held = holds.pointer || holds.focus;
  const close = useRef(onCloseOutcome);
  close.current = onCloseOutcome;
  // Its time runs from when it came: by its kind, its words and its step, never by the object, which a page makes
  // anew on every render, and a keystroke would start the wait again. A page empties the slot between two actions
  // (run()), so the same words twice are two toasts.
  const [kind, body, step] = [outcome?.kind, outcome?.body, outcome?.action?.label];
  useEffect(() => {
    if (!kind || !leavesByItself(kind, step !== undefined) || held) return;
    const t = setTimeout(() => close.current(), OUTCOME_MS);
    return () => clearTimeout(t);
  }, [kind, body, step, held]);
  // A toast's holds are its own, and neither a blur nor a pointer leaving is told for a node that is removed. So when
  // the slot's toast changes, the focus is looked at again: a pressed step takes its button away with the focus on
  // it, and a hold kept from it would keep the step's answer on screen for good. The pointer's hold lasts only
  // while the same toast stands with other words, under a pointer that may not have moved. (The same holds back
  // when nothing changed: the AI page's body is a new node on every render.)
  const slot = useRef<HTMLDivElement>(null);
  const stood = useRef(kind);
  // Whether the keyboard is at work in the slot's toast: its focus came there by the keyboard, or a step was pressed
  // from it. A pointer does not count: under a pointer nothing needs the focus back, and a toast that kept it would
  // wait for a blur that may never come.
  const keyboardIn = useRef(false);
  useEffect(() => {
    const sameToast = kind !== undefined && stood.current === kind;
    stood.current = kind;
    // The keyboard's focus stays with the slot. A step that is taken goes with its button, and an answer of another
    // kind is another node (an error is said from its own region): either way the focus falls to the page. It goes
    // to the toast that took the place, on its close button. Not to the chip, which is the warnings' own. Only a
    // focus that fell: one the staff member has put elsewhere since is theirs.
    const fell = !document.activeElement || document.activeElement === document.body;
    if (keyboardIn.current && fell) slot.current?.querySelector<HTMLElement>('.toast-close')?.focus();
    if (!slot.current?.contains(document.activeElement)) keyboardIn.current = false;
    const focus = !!slot.current?.contains(document.activeElement);
    setHolds((h) => {
      const pointer = sameToast && h.pointer;
      return h.pointer === pointer && h.focus === focus ? h : { pointer, focus };
    });
  }, [kind, body, step]);

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

  const pointer = {
    onPointerEnter: () => setHolds((h) => ({ ...h, pointer: true })),
    onPointerLeave: () => setHolds((h) => ({ ...h, pointer: false })),
  };
  const focus = {
    onFocus: (e: FocusEvent<HTMLDivElement>) => {
      keyboardIn.current = e.target.matches(':focus-visible');
      setHolds((h) => ({ ...h, focus: true }));
    },
    // The keyboard's part is not ended here: a blur may be told for a button that goes with its step, and the look
    // at where the focus fell (above) is what ends it.
    onBlur: () => setHolds((h) => ({ ...h, focus: false })),
  };
  const outcomeToast = (o: Outcome) => (
    <div ref={slot} className={`toast toast-${o.kind}`} {...focus} {...(o.kind === 'ok' ? pointer : {})}>
      <div className="toast-body">
        {o.body}
        {/* The page decides what becomes of the toast once its step is pressed: "Copy the caption" is answered by
            another toast, "Share now" stays while its sheet is open. Where the button goes, the keyboard's focus
            follows the slot (above): a press with no pointer behind it is the keyboard's. */}
        {o.action && (
          <button
            type="button"
            className="toast-action"
            onClick={(e) => {
              if (e.detail === 0) keyboardIn.current = true;
              o.action!.onPress();
            }}
          >
            {o.action.label}
          </button>
        )}
      </div>
      <Close what="this message" onClose={(hadFocus) => closing(hadFocus, onCloseOutcome)} />
    </div>
  );

  return (
    // The anchor is a line at the workspace's end that stays on the screen (editor.css): on a phone the stage ends
    // below the fold, and a toast in its corner would come and go unseen.
    <div className="toasts-anchor">
      <div ref={root} className="toasts">
        {/* An error is said at once. A success is said when there is a pause, from a region that is there before its
            words are. The warnings are not said: they change with every key. */}
        {outcome?.kind === 'error' && <div role="alert">{outcomeToast(outcome)}</div>}
        <div role="status">{outcome?.kind === 'ok' && outcomeToast(outcome)}</div>
        {open.length > 0 && (
          <ul className="toast-warnings" aria-label="Warnings">
            {open.map((w) => (
              <li key={w.id} className="toast toast-warn">
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
    </div>
  );
}
