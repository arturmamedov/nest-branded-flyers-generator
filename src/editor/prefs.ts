/* Per-viewer conveniences (the library's hostel filter, the editor's canvas),
   remembered in localStorage. Never flyer data: a private window, blocked site
   data or a full quota just means nothing is remembered. */

import { DEFAULT_CANVAS, isCanvasId, type CanvasId } from '../shared/layout';

export function localStorageGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function localStorageSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* not remembered, and that's fine */
  }
}

/** The canvas on screen is how this viewer likes to work, never flyer data: the one they last chose in the editor,
    else the default. The library's lightbox and its ways out make the same one. */
export const CANVAS_PREF = 'editor.canvas';
export const savedCanvas = (): CanvasId => {
  const v = localStorageGet(CANVAS_PREF);
  return isCanvasId(v) ? v : DEFAULT_CANVAS;
};
