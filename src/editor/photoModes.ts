import type { PhotoMode } from '../shared/layout';

/** The photo modes as the editor names them, in the order it offers them. The browser specs
    find the buttons by these labels. */
export const PHOTO_MODE_LABEL: Record<PhotoMode, string> = {
  bleed: 'Full bleed',
  band: 'In a frame',
  none: 'No photo',
};
