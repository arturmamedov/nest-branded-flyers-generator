import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type RefObject } from 'react';
import { Flyer } from '../flyer/Flyer';
import { prepareFlyer } from '../flyer/ready';
import { CANVASES, DEFAULT_CANVAS, type CanvasId } from '../shared/layout';
import type { FlyerPayload } from '../shared/schema';
import type { FlyerAnswers } from './libraryFlyers';

/* A library card's picture of its flyer, and the lightbox's larger one: the same <Flyer> the editor and the export
   mount, at its canvas's true size, scaled down with a transform (never CSS zoom: the fit pass measures layout px)
   and prepared as an export is (prepareFlyer: fonts, images, fit). Never a second renderer and never a stored
   thumbnail, so it cannot drift from the flyer.
   - A card asks for its own flyer (useNearFlyer: GET api/flyers/:id, which both backends already answer with all the
     renderer needs) once it nears the screen: a long library costs what is looked at, and the list stays a few text
     fields. The one answer serves the card's picture, its lightbox and its ways out (LibraryCard.tsx), and the
     library's search: it is asked for through the library's one store of answers (libraryFlyers.ts).
   - Its box is the same size while it waits, once it shows and when the flyer cannot load, so nothing jumps.
   - It is decoration: hidden from assistive technology and inert. In a card it is inside the card's own link, so the
     link's name is still the title, nothing in the flyer takes focus, and a click on the picture is a click on the
     card. */

/** The flyer's own size, for editor.css: the box's width on screen is CSS's one number (--thumb-w), the rest follows
    from these. Set on the card as well, whose zoom button is placed by them. */
export const flyerSize = (canvas: CanvasId = DEFAULT_CANVAS) => ({ '--flyer-w': CANVASES[canvas].width, '--flyer-h': CANVASES[canvas].height }) as CSSProperties;

/** How near the screen a card comes before its flyer is asked for: about a card and a half ahead of the scroll. */
const NEAR = '300px 0px';

/** A card's flyer, asked for once the card nears the screen: null while it waits, and when it cannot load.
    `version` is the flyer's `updatedAt`, as the list gave it: a flyer saved since is asked for again. Nearness is
    measured against the library's scroller, not the window. The answer is the library's store's (libraryFlyers.ts):
    one the search has already read is not asked for again, and is still drawn only once the card is near. */
export function useNearFlyer(box: RefObject<HTMLElement | null>, id: number, version: string, scroller: RefObject<HTMLElement | null>, flyers: FlyerAnswers): FlyerPayload | null {
  const [near, setNear] = useState(false);

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
  }, [box, scroller]);

  useEffect(() => {
    if (near) flyers.ask(id, version);
  }, [near, id, version, flyers]);

  // Read by id and version: an answer for the flyer as it was before a save is no answer for the card, whatever
  // order the answers land in. A flyer that cannot load leaves the box empty.
  const answer = useSyncExternalStore(flyers.subscribe, () => flyers.answer(id, version));
  return near && answer.state === 'here' ? answer.payload : null;
}

interface Props {
  /** The flyer to draw, or null while it is on its way: the box is there either way. */
  payload: FlyerPayload | null;
  canvas?: CanvasId;
  /** The box's width on screen in px, where the page works it out (the lightbox fits the window); a card's is CSS's. */
  width?: number;
}

export function FlyerThumb({ payload, canvas = DEFAULT_CANVAS, width }: Props) {
  const flyer = useRef<HTMLDivElement>(null);
  // What is fitted: the flyer, by its object, on its canvas. Another one (saved since, another canvas) starts
  // unseen again.
  const [fitted, setFitted] = useState<{ payload: object; canvas: CanvasId } | null>(null);

  // Shown only once it is fitted, so no unfitted copy is ever on screen.
  useEffect(() => {
    if (!payload || !flyer.current) return;
    let live = true;
    prepareFlyer(flyer.current).then(
      () => live && setFitted({ payload, canvas }),
      () => {},
    );
    return () => {
      live = false;
    };
  }, [payload, canvas]);

  const style = { ...flyerSize(canvas), ...(width === undefined ? {} : { '--thumb-w': width }) } as CSSProperties;
  return (
    <div className={'card-thumb' + (payload && fitted?.payload === payload && fitted.canvas === canvas ? ' card-thumb-ready' : '')} style={style} aria-hidden="true" inert>
      {payload && (
        <div className="card-thumb-flyer">
          <Flyer ref={flyer} data={payload.flyer.data} canvas={canvas} hostel={payload.hostel} photo={payload.photo} />
        </div>
      )}
    </div>
  );
}
