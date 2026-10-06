import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import type { AiFeatureOn } from '../shared/ai';
import { ACCEPTED_PHOTO_TYPES } from '../shared/limits';
import { AiUsedUp } from './panel';

/* "From a photo" on the AI page (docs/prompts/ai-flyer-from-photo.md, stage 3): the picture a staff member chooses,
   and the button that has it read. It makes no request of its own: choosing a picture sends nothing, and AiPage has
   it read and takes the words. Any file may be chosen: the server is the only judge of formats, as for a flyer's
   photo, and its message says what is wrong with one it refuses. */

export function AiPhoto({
  ai,
  picture,
  onPick,
}: {
  /** The picture read as api/config lists it: its own limit, and what is left of it today. */
  ai: AiFeatureOn;
  /** The picture chosen, or null. It is the page's, so it is still there after a look at the other way. */
  picture: File | null;
  /** A picture chosen, dropped or pasted, in the place of the one before; null takes the one there away. */
  onPick: (picture: File | null) => void;
}) {
  const cameraInput = useRef<HTMLInputElement>(null);
  const chooseInput = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const left = ai.remaining;
  const accept = ACCEPTED_PHOTO_TYPES.join(',');
  // Emptied afterwards, so the same file chosen again is a change again.
  const onChosen = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) onPick(f);
    e.target.value = '';
  };

  // A screenshot off the clipboard (Ctrl+V), while this way is on screen. Text alone is no picture, and is left to
  // whatever has the focus.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const file = e.clipboardData?.files[0];
      if (!file) return;
      e.preventDefault();
      onPick(file);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [onPick]);

  return (
    <>
      {/* The box takes its own drops. One beside it is refused by the page (leaveGuard.ts), so the browser never
          opens the file in the tab. */}
      <div
        className={'ai-picker' + (dragOver ? ' ai-picker-over' : '')}
        onDragOver={(e) => {
          if ([...e.dataTransfer.items].some((i) => i.kind === 'file')) {
            e.preventDefault();
            setDragOver(true);
          }
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const file = e.dataTransfer.files[0];
          if (file) onPick(file);
        }}
      >
        <div className="photo-row">
          {/* The device's own camera (the owner's answer, 2026-10-06: "Phone's own camera; none on a laptop"). A
              laptop's browser ignores `capture` and would open the same file dialog as the button beside it, so
              this one shows only where the main pointer is a finger (editor.css). */}
          <button type="button" className="btn ai-touch" onClick={() => cameraInput.current?.click()}>
            Take a photo
          </button>
          <button type="button" className="btn" onClick={() => chooseInput.current?.click()}>
            Choose a picture
          </button>
          <input ref={cameraInput} type="file" accept={accept} capture="environment" hidden onChange={onChosen} />
          <input ref={chooseInput} type="file" accept={accept} hidden onChange={onChosen} />
        </div>
        <p className="help ai-mouse">Or drop a picture here, or paste a screenshot.</p>
        {picture && <Chosen picture={picture} onRemove={() => onPick(null)} />}
      </div>
      <button type="button" className="btn btn-accent" disabled={!picture || left === 0}>
        ✨ Read the picture <span className="ai-left">({left} left today)</span>
      </button>
      <AiUsedUp feature={ai.name} limit={ai.limit} left={left} />
    </>
  );
}

/** The chosen picture, small, straight from memory: nothing is uploaded before it is read. One the browser cannot
    draw (an iPhone's HEIC) shows by its name alone. */
function Chosen({ picture, onRemove }: { picture: File; onRemove: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const made = URL.createObjectURL(picture);
    setUrl(made);
    return () => {
      URL.revokeObjectURL(made);
      setUrl(null);
    };
  }, [picture]);

  return (
    <div className="ai-picture">
      {url && <img src={url} alt="" onError={() => setUrl(null)} />}
      <span className="ai-picture-name">{picture.name}</span>
      <button type="button" className="btn btn-quiet" onClick={onRemove}>
        Remove
      </button>
    </div>
  );
}
