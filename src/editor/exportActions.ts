/* What the editor's toolbar offers for the flyer as a picture (the editor's UX round, Part 3). No React and no DOM
   here, so the rule is tested by itself (tests/unit/export-actions.test.ts). */

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

/** What a menu entry reads: its name, and its hint where it has one. */
export const entryText = (action: ExportAction) => {
  const { label, hint } = EXPORT_ACTION[action];
  return hint ? `${label} · ${hint}` : label;
};

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
