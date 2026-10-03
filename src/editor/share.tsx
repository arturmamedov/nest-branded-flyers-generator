import { useEffect, useState } from 'react';

/* The share text's copy buttons: under the caption in a form, and the reminder floating by the preview. */

/** Copies the share text; the outcome clears when the text changes, so "Copied" never vouches for an older one. */
export function useCopy(text: string) {
  const [copied, setCopied] = useState<'ok' | 'error' | null>(null);
  useEffect(() => setCopied(null), [text]);
  const copy = () =>
    navigator.clipboard.writeText(text).then(
      () => setCopied('ok'),
      () => setCopied('error'),
    );
  return { copied, copy, reset: () => setCopied(null) };
}

/** The panel's copy button, under the caption it copies. */
export function ShareCopy({ text }: { text: string }) {
  const { copied, copy } = useCopy(text);
  return (
    <div className="share-copy">
      <button type="button" className="btn btn-accent" disabled={!text.trim()} onClick={copy}>
        Copy text
      </button>
      <span className="share-status" role="status">
        {copied === 'ok' ? 'Copied' : copied === 'error' ? 'Couldn’t copy: select the text instead' : ''}
      </span>
    </div>
  );
}

/* The reminder beside the preview: it floats over the stage's corner, so the flyer keeps the whole stage
   (Preview fits to the stage alone), and one tap copies the caption without scrolling back to the panel. */
export function ShareFab({ text }: { text: string }) {
  const { copied, copy, reset } = useCopy(text);
  // The pill has room for one word: its outcome shows for a moment, then the reminder comes back.
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(reset, 2000);
    return () => clearTimeout(t);
  }, [copied]); // eslint-disable-line react-hooks/exhaustive-deps
  const label = copied === 'ok' ? 'Copied' : copied === 'error' ? 'Couldn’t copy' : 'Share text';
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
