import { useEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { Flyer } from '../flyer/Flyer';
import { prepareFlyer } from '../flyer/ready';
import { CANVASES, DEFAULT_CANVAS } from '../shared/layout';
import type { FlyerPayload } from '../shared/schema';
import { api } from './api';

/* A library card's picture of its flyer: the same <Flyer> the editor and the export mount, at its canvas's true
   size, scaled down with a transform (never CSS zoom: the fit pass measures layout px) and prepared as an export is
   (prepareFlyer: fonts, images, fit). Never a second renderer and never a stored thumbnail, so it cannot drift from
   the flyer.
   - It asks for its own flyer (GET api/flyers/:id, which both backends already answer with all the renderer needs)
     once the card nears the screen: a long library costs what is looked at, and the list stays six text fields.
   - Its box is the same size while it waits, once it shows and when the flyer cannot load, so nothing jumps.
   - It is decoration, inside the card's own link: hidden from assistive technology and inert, so the link's name is
     still the title, nothing in the flyer takes focus, and a click on the picture is a click on the card. */

const { width: W, height: H } = CANVASES[DEFAULT_CANVAS];
/** The flyer's own size, for editor.css: the box's width on screen is CSS's one number, the rest follows from these. */
const FLYER_SIZE = { '--flyer-w': W, '--flyer-h': H } as CSSProperties;

/** How near the screen a card comes before its flyer is asked for: about a card and a half ahead of the scroll. */
const NEAR = '300px 0px';

interface Props {
  id: number;
  /** The flyer's `updatedAt`, as the list gave it: a flyer saved since is asked for again. */
  version: string;
  /** The library's scroller: nearness is measured against it, not the window. */
  scroller: RefObject<HTMLElement | null>;
}

export function FlyerThumb({ id, version, scroller }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const flyer = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  const [payload, setPayload] = useState<FlyerPayload | null>(null);
  const [fitted, setFitted] = useState(false);

  useEffect(() => {
    const seen = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        setNear(true);
        seen.disconnect();
      },
      { root: scroller.current, rootMargin: NEAR },
    );
    seen.observe(box.current!);
    return () => seen.disconnect();
  }, [scroller]);

  // An answer for a card that has gone, or for the flyer as it was before a save, is dropped: the library shows only
  // its latest list (Library.tsx), and so do its pictures. A flyer that cannot load leaves the box empty.
  useEffect(() => {
    if (!near) return;
    let live = true;
    setPayload(null);
    setFitted(false);
    api.flyer(id).then(
      (p) => live && setPayload(p),
      () => {},
    );
    return () => {
      live = false;
    };
  }, [near, id, version]);

  // Shown only once it is fitted, so no unfitted copy is ever on screen.
  useEffect(() => {
    if (!payload || !flyer.current) return;
    let live = true;
    prepareFlyer(flyer.current).then(
      () => live && setFitted(true),
      () => {},
    );
    return () => {
      live = false;
    };
  }, [payload]);

  return (
    <div ref={box} className={'card-thumb' + (fitted ? ' card-thumb-ready' : '')} style={FLYER_SIZE} aria-hidden="true" inert>
      {payload && (
        <div className="card-thumb-flyer">
          <Flyer ref={flyer} data={payload.flyer.data} canvas={DEFAULT_CANVAS} hostel={payload.hostel} photo={payload.photo} />
        </div>
      )}
    </div>
  );
}
