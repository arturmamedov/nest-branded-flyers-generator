import { useEffect, useRef, useState } from 'react';
import type { Answer, PictureMessage } from './pictureActions';

/* One action at a time on a page, and what the last one came to: the editor's and the library's. `K` is what the
   page calls its actions. */
export function useOneAction<K>() {
  const [busy, setBusy] = useState<K | null>(null);
  const [message, setMessage] = useState<PictureMessage | null>(null);
  // Which action is in hand, counted: an answer that lands after its own action is over (the share sheet's) knows by
  // it that another has started since.
  const turn = useRef(0);
  // A control an action greyed. The button that starts an action is greyed while it works, and a greyed control drops
  // the focus: it gets it back when the work is done, unless the staff member has put it somewhere since. Without
  // scrolling to it: on a phone the form is above the flyer, and the flyer is what was being looked at.
  // run() notes what had the focus when the action started, and only what the action then greyed is kept: a photo
  // dropped on the preview starts from no control, and a field the caret was in must not pull the focus back.
  const pressed = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const from = pressed.current;
    if (busy !== null) {
      if (from && !from.matches(':disabled')) pressed.current = null;
      return;
    }
    pressed.current = null;
    if (from?.isConnected && document.activeElement === document.body) from.focus({ preventScroll: true });
  }, [busy]);

  // `fn` is called here and now, before anything is awaited: what it starts is still inside the tap that asked for
  // it, which a clipboard write needs (pictureActions.ts).
  async function run(kind: K, fn: () => Promise<Answer>) {
    const from = document.activeElement;
    pressed.current = from instanceof HTMLElement && from !== document.body ? from : null;
    turn.current += 1;
    setBusy(kind);
    setMessage(null);
    try {
      const ok = await fn();
      if (ok) setMessage({ kind: 'ok', ...(typeof ok === 'string' ? { text: ok } : ok) });
    } catch (e) {
      setMessage({ kind: 'error', text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  }

  return { busy, message, setMessage, run, turn };
}
