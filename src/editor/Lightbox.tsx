import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { CANVASES, type CanvasId } from '../shared/layout';
import type { FlyerPayload } from '../shared/schema';
import { FlyerThumb } from './FlyerThumb';

/* A flyer of the library, large (the owner's ask, 2026-10-13: a zoom icon on the picture opens it, and the picture's
   own click still opens the editor). The same <Flyer> as everywhere, on the canvas the ways out make, fitted to the
   window: what is seen is what is copied.
   It is the browser's own modal dialog: the focus goes in and stays in, the page behind is inert, Escape closes it,
   and the focus goes back to the zoom button that opened it (where the browser has none to go back to, the library
   hands it there in `onClose`). A press on the backdrop closes it too. */
export function Lightbox({
  title,
  payload,
  canvas,
  onClose,
  children,
}: {
  title: string;
  payload: FlyerPayload;
  canvas: CanvasId;
  onClose: () => void;
  /** Under the flyer's name: its ways out, and what they answer. */
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const room = useRef<HTMLDivElement>(null);
  const { width: W, height: H, label } = CANVASES[canvas];
  // The flyer's width on screen: the widest that fits the room the bar leaves it, at the canvas's own shape.
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const d = dialog.current!;
    d.showModal();
    // Closed by the browser before it leaves the page, or the focus would not go back to what opened it.
    return () => {
      if (d.open) d.close();
    };
  }, []);

  useLayoutEffect(() => {
    const el = room.current!;
    const fit = () => setWidth(Math.max(0, Math.floor(Math.min(el.clientWidth, (el.clientHeight * W) / H))));
    fit();
    const sized = new ResizeObserver(fit);
    sized.observe(el);
    return () => sized.disconnect();
  }, [W, H]);

  // The backdrop is the dialog itself and the room around the flyer: a press there, never one inside the flyer or
  // the bar. A press, from its start: one that starts on a button and is let go over the backdrop is a click on
  // what holds them both, and closes nothing.
  const onBackdrop = (el: EventTarget | null) => el === dialog.current || el === room.current;
  const pressed = useRef<EventTarget | null>(null);
  const onClick = (e: MouseEvent) => {
    if (onBackdrop(e.target) && onBackdrop(pressed.current)) dialog.current!.close();
  };

  return (
    <dialog ref={dialog} className="lightbox" aria-label={`${title}, large`} onClose={onClose} onPointerDown={(e) => (pressed.current = e.target)} onClick={onClick}>
      <button type="button" className="lightbox-close" aria-label="Close" onClick={() => dialog.current!.close()}>
        <span aria-hidden="true">×</span>
      </button>
      <div ref={room} className="lightbox-room">
        {/* A box of its own around the picture, which is inert: a press on the flyer is no press on the backdrop. */}
        <div className="lightbox-flyer">
          <FlyerThumb payload={payload} canvas={canvas} width={width} />
        </div>
      </div>
      <div className="lightbox-bar">
        <div className="lightbox-title">{title}</div>
        <div className="lightbox-meta">
          {label} · {W} × {H}
        </div>
        {children}
      </div>
    </dialog>
  );
}
