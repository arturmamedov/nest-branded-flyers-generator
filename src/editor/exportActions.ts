/* What the editor's toolbar offers for the flyer as a picture (the editor's UX round, Part 3). No React and no DOM
   here, so the rule is tested by itself (tests/unit/export-actions.test.ts). */

/** One way to take the flyer out of the editor as a picture of the canvas on screen. */
export type ExportAction = 'copy' | 'png' | 'jpg';

/** What each one is called, what its button reads while it works, and the few words its menu entry adds. */
export const EXPORT_ACTION: Record<ExportAction, { label: string; busy: string; hint?: string }> = {
  copy: { label: 'Copy image', busy: 'Copying…' },
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

/** What this browser can do with a picture (clipboard.ts asks it). */
export interface Can {
  copy: boolean;
}

/** The toolbar's ways out: one first button beside "Download", and the entries behind it. */
export interface Offer {
  first: ExportAction | null;
  menu: ExportAction[];
}

/** The owner's "Copy beside Download" (2026-10-07): `[Copy image] [Download ▾]`, the menu holding the two formats.
    Nothing is offered that would only fail: where a picture cannot be copied, Download stands alone. */
export function exportActions(can: Can): Offer {
  return { first: can.copy ? 'copy' : null, menu: ['png', 'jpg'] };
}
