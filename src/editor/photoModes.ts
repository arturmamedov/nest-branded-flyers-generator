import type { PhotoMode } from '../shared/layout';

/** The photo modes as the editor names them, in the order it offers them. The browser specs
    find the buttons by these labels. */
export const PHOTO_MODE_LABEL: Record<PhotoMode, string> = {
  bleed: 'Full bleed',
  band: 'In a frame',
  none: 'No photo',
};

/** What a button says while a photo is on its way to the server: the editor's photo button, and the AI page's "Open
    in editor" when it takes the picture along (the owner's answer, 2026-10-06: the editor's own word). */
export const PHOTO_UPLOADING = 'Uploading…';
