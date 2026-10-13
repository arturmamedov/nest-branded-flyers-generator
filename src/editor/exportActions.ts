/* What the editor's toolbar offers for the flyer as a picture (the editor's UX round, Part 3). No React and no DOM
   here, so the rule is tested by itself (tests/unit/export-actions.test.ts). */

import { bodyOf, photoFrame, type CanvasId } from '../shared/layout';
import type { FlyerData } from '../shared/schema';

/** One way to take the flyer out of the editor as a picture of the canvas on screen. */
export type ExportAction = 'copy' | 'share' | 'png' | 'jpg';

/** What each one is called, what its button reads while it works, and the few words its menu entry adds. */
export const EXPORT_ACTION: Record<ExportAction, { label: string; busy: string; hint?: string }> = {
  copy: { label: 'Copy image', busy: 'Copying…' },
  share: { label: 'Share…', busy: 'Preparing…' },
  png: { label: 'PNG', busy: 'Rendering…', hint: 'sharpest' },
  jpg: { label: 'JPG', busy: 'Rendering…', hint: 'smaller file' },
};

/** The button that opens the list of ways out: a download is one of them, picked there. */
export const DOWNLOAD = 'Download';

/** The picture a copy and a share hand over: a PNG, the one picture type a browser's clipboard takes. */
export const PICTURE_TYPE = 'image/png';

/** "A phone": a finger as the main pointer, the signal "Take a photo" already goes by (editor.css). Not the width at
    which the form sits on top: a narrow desktop window is no phone, and a tablet lying wide is one. */
export const TOUCH_QUERY = '(pointer: coarse)';

/** What this browser can do with a picture (clipboard.ts and shareSheet.ts ask it). */
export interface Can {
  copy: boolean;
  share: boolean;
}

/** The toolbar's ways out: one first button beside "Download", and the entries behind it. */
export interface Offer {
  first: ExportAction | null;
  menu: ExportAction[];
}

/** The same ways out wherever they are possible; the device only chooses the first button.
    - A desktop: `[Copy image] [Download ▾]` (the owner's "Copy beside Download", 2026-10-07), the menu holding the
      two formats, and Share… after them where the device has a sheet.
    - A phone: `[Share…] [Download ▾]`: the sheet is how a phone hands a picture to WhatsApp or Instagram. Copy image
      is behind Download.
    Where the first one is not possible the other takes its place, and where neither is, Download stands alone:
    nothing is offered that would only fail. */
export function exportActions(can: Can, touch: boolean): Offer {
  const [first = null, ...rest] = (touch ? (['share', 'copy'] as const) : (['copy', 'share'] as const)).filter((action) => can[action]);
  return { first, menu: ['png', 'jpg', ...rest] };
}

/** A frame with no photo in it would print as a blank strip, so such a flyer is not made into a picture: the editor
    and the library both grey its ways out by this. A week flyer has no frame at all. */
export const needsPhoto = (canvas: CanvasId, data: Pick<FlyerData, 'template' | 'photoMode'>, photo: object | null): boolean =>
  photoFrame(canvas, bodyOf(data)) !== null && !photo;

/** What the library reads beside such a flyer, where its ways out are greyed: the editor says it with a warning. */
export const NO_PHOTO = 'No photo in its frame yet: open it to add one.';
