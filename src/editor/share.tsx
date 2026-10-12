import { useEffect, useState } from 'react';
import { COPY_FAILED, copyText, type Copied, type CopyFailure } from './clipboard';

/* The share text's copy buttons: under the caption in a form, and the reminder floating by the preview. */

/** Copies the share text (clipboard.ts); the outcome clears when the text changes, so "Copied" never vouches for an
    older one. A copy that did not happen is told to `onFail`, with why. */
export function useCopy(text: string, onFail?: (why: CopyFailure) => void) {
  const [copied, setCopied] = useState<Copied | null>(null);
  useEffect(() => setCopied(null), [text]);
  const copy = () =>
    copyText(text).then((answer) => {
      setCopied(answer);
      if (!answer.ok) onFail?.(answer.why);
    });
  return { copied, copy, reset: () => setCopied(null) };
}

/** The panel's copy button, under the caption it copies. A copy that did not happen says so here, and why. */
export function ShareCopy({ text }: { text: string }) {
  const { copied, copy } = useCopy(text);
  return (
    <div className="share-copy">
      <button type="button" className="btn btn-accent" disabled={!text.trim()} onClick={copy}>
        Copy text
      </button>
      <span className={copied && !copied.ok ? 'share-status share-status-error' : 'share-status'} role="status">
        {copied === null ? '' : copied.ok ? 'Copied' : COPY_FAILED.text[copied.why]}
      </span>
    </div>
  );
}

/* The reminder beside the preview: it floats over the stage's corner, so the flyer keeps the whole stage
   (Preview fits to the stage alone), and one tap copies the caption without scrolling back to the panel. */
export function ShareFab({ text, onFail }: { text: string; onFail: (why: CopyFailure) => void }) {
  const { copied, copy, reset } = useCopy(text, onFail);
  // The pill has room for one word: its outcome shows for a moment, then the reminder comes back. Why a copy did not
  // happen is more than a word, so the page says it (`onFail`: a toast in the editor).
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(reset, 2000);
    return () => clearTimeout(t);
  }, [copied]); // eslint-disable-line react-hooks/exhaustive-deps
  const label = copied === null ? 'Share text' : copied.ok ? 'Copied' : 'Couldn’t copy';
  return (
    <button type="button" className="share-fab" title="Copy the share text (not printed on the flyer)" aria-label="Copy the share text" onClick={copy}>
      <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
        <rect x="5" y="5" width="9" height="9" rx="2" />
        <path d="M11 5V3.5A1.5 1.5 0 0 0 9.5 2h-6A1.5 1.5 0 0 0 2 3.5v6A1.5 1.5 0 0 0 3.5 11H5" />
      </svg>
      <span>{label}</span>
    </button>
  );
}
