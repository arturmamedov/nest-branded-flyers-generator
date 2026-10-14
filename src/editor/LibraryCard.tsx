import { useRef, type RefObject } from 'react';
import { labelNames } from '../shared/labels';
import { libraryDate } from '../shared/names';
import type { CanvasId } from '../shared/layout';
import type { FlyerListItem, FlyerPayload } from '../shared/schema';
import { NO_PHOTO, needsPhoto, type ExportAction, type Offer } from './exportActions';
import { FlyerThumb, flyerSize, useNearFlyer } from './FlyerThumb';
import type { FlyerAnswers } from './libraryFlyers';
import { Menu } from './Menu';
import { go } from './route';
import { TEMPLATE_LABEL } from './templates';
import { WaysOut } from './WaysOut';

/* One flyer of the library: its picture, its name, and what staff do with it without opening it (the library's
   views, 2026-10-13): the editor's ways out as a picture, its caption, and a zoom into the lightbox.
   - The card asks for its flyer once, when it nears the screen (useNearFlyer), and that one answer serves the
     picture, the lightbox and the ways out. So the caption is in hand at the tap, which a clipboard write needs, and
     the list stays six text fields.
   - Until the flyer is here its buttons wait greyed; a flyer that cannot load leaves them so, and the card still
     opens it. */

/** A flyer with all of it in hand: what the lightbox shows and the ways out are made of. */
export interface Target {
  item: FlyerListItem;
  payload: FlyerPayload;
}

/** What a card does besides the ways out. */
export type CardAction = 'duplicate' | 'archive';

/** The library's action in hand, and whose it is. */
export interface Busy {
  id: number;
  kind: ExportAction | CardAction;
}

/** Whether this flyer can be made into a picture of `canvas`: the editor's own rule (exportActions.ts). The record's
    template wins over the one in its data, as on every write. */
export const lacksPhoto = (canvas: CanvasId, { flyer, photo }: FlyerPayload) => needsPhoto(canvas, { template: flyer.template, photoMode: flyer.data.photoMode }, photo);

const when = (iso: string) => libraryDate(new Date(iso), true);

function ZoomIcon() {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
      <circle cx="7" cy="7" r="4.6" />
      <path d="M10.5 10.5 14 14M7 5v4M5 7h4" />
    </svg>
  );
}

export function LibraryCard({
  item,
  scroller,
  flyers,
  canvas,
  offer,
  busy,
  ways,
  onZoom,
  onDuplicate,
  onArchive,
}: {
  item: FlyerListItem;
  /** The library's scroller: nearness is measured against it. */
  scroller: RefObject<HTMLElement | null>;
  /** The library's answers, which its search reads too (libraryFlyers.ts). */
  flyers: FlyerAnswers;
  /** The canvas the ways out make: the viewer's own (prefs.ts). The card's picture is always the default one. */
  canvas: CanvasId;
  offer: Offer;
  busy: Busy | null;
  /** The ways out for a flyer, as the library runs them (pictureActions.ts). */
  ways: (target: Target) => { act: Record<ExportAction, () => void>; copyCaption: () => void };
  /** `from` is the button that asked: the focus goes back to it when the lightbox closes. */
  onZoom: (target: Target, from: HTMLElement) => void;
  onDuplicate: (item: FlyerListItem) => void;
  onArchive: (item: FlyerListItem) => void;
}) {
  const box = useRef<HTMLLIElement>(null);
  const payload = useNearFlyer(box, item.id, item.updatedAt, scroller, flyers);
  const target = payload && { item, payload };
  const noPhoto = payload !== null && lacksPhoto(canvas, payload);
  const mine = busy?.id === item.id ? busy.kind : null;
  const out = target && ways(target);
  const idle: Record<ExportAction, () => void> = { copy() {}, share() {}, png() {}, jpg() {} };
  // From the list itself, so they are here with the card's name and its box never changes when its picture lands.
  // Read loosely: a backend from before labels sends none.
  const labels = labelNames(item.labels ?? []);

  return (
    <li ref={box} className="card" style={flyerSize()}>
      <div className="card-head">
        {/* The picture is inside the link and hidden from its name (FlyerThumb): the card is still its title. */}
        <a className="card-main" href={`#/flyers/${item.id}`}>
          <FlyerThumb payload={payload} />
          <span className="card-text">
            <span className="card-title">{item.title}</span>
            <span className="card-meta">
              {item.hostelName ?? 'All hostels'} · {TEMPLATE_LABEL[item.template]} · {when(item.updatedAt)}
            </span>
            {labels.length > 0 && (
              <span className="card-labels">
                {labels.map((name) => (
                  <span key={name} className="card-label">
                    {name}
                  </span>
                ))}
              </span>
            )}
            {noPhoto && <span className="card-note">{NO_PHOTO}</span>}
          </span>
        </a>
        {/* Over the picture's corner, and no part of the link: a button in a link is no button, and the picture is
            inert. Its click opens the lightbox and nothing else. It waits while an action is in hand: a duplicate
            that lands would leave the page from under the lightbox. */}
        <button type="button" className="card-zoom" aria-label={`Zoom in on ${item.title}`} disabled={!target || busy !== null} onClick={(e) => target && onZoom(target, e.currentTarget)}>
          <span>
            <ZoomIcon />
          </span>
        </button>
      </div>
      <div className="card-actions">
        <WaysOut offer={offer} act={out?.act ?? idle} busy={mine} disabled={busy !== null || !out || noPhoto}>
          <button type="button" className="btn" disabled={!out || !payload?.flyer.data.share.trim()} onClick={out?.copyCaption}>
            Copy text
          </button>
        </WaysOut>
        {/* The rest of what a card does, one tap further (the owner's pick, 2026-10-13: "Ways out only, rest in a
            menu"). Open is the card's own click too. */}
        <Menu
          label={mine === 'duplicate' ? 'Duplicating…' : mine === 'archive' ? 'Archiving…' : 'More'}
          className="btn btn-quiet"
          disabled={busy !== null}
          entries={[
            { id: 'open', label: 'Open', onPick: () => go(`#/flyers/${item.id}`) },
            { id: 'duplicate', label: 'Duplicate', onPick: () => onDuplicate(item) },
            { id: 'archive', label: 'Archive', onPick: () => onArchive(item) },
          ]}
        />
      </div>
    </li>
  );
}
