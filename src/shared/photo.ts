import type { Crop } from './schema.js';

/* Photo crop model. zoom 1 = the photo just covers its frame; below 1 it
   shrinks inside the frame (the flyer background shows around it), above 1 it
   crops in. x/y is the point of the photo (0..1 of its width/height, may run
   past 0..1 when zoomed out) placed at the frame centre.

   Positioning is free on both axes, with one guard so a photo can't be lost:
   the frame stays covered, or the photo's centre stays inside the frame.
   Edges and the centre are slightly sticky so "flush" is easy to hit. */

export interface Size {
  width: number;
  height: number;
}

export interface Placement {
  left: number;
  top: number;
  width: number;
  height: number;
}

export const ZOOM_MIN = 0.25;
export const ZOOM_MAX = 4;
export const DEFAULT_CROP: Crop = { x: 0.5, y: 0.5, zoom: 1 };
const SNAP = 12; // frame px

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export const clampZoom = (zoom: number) => clamp(zoom, ZOOM_MIN, ZOOM_MAX);

function scaledSize(img: Size, frame: Size, zoom: number): Size {
  const base = Math.max(frame.width / img.width, frame.height / img.height) * clampZoom(zoom);
  return { width: img.width * base, height: img.height * base };
}

/** Allowed range for the photo's leading edge on one axis. */
function edgeRange(len: number, frameLen: number): [number, number] {
  // Union of "frame covered" [frameLen - len, 0] and "centre inside" [-len/2, frameLen - len/2].
  return [Math.min(frameLen - len, -len / 2), Math.max(0, frameLen - len / 2)];
}

/** Flush-left/top, centred, flush-right/bottom. */
function snapEdge(pos: number, len: number, frameLen: number): number {
  for (const target of [0, (frameLen - len) / 2, frameLen - len]) {
    if (Math.abs(pos - target) <= SNAP) return target;
  }
  return pos;
}

function leading(c: number, len: number, frameLen: number): number {
  return frameLen / 2 - c * len;
}

function focal(pos: number, len: number, frameLen: number): number {
  return (frameLen / 2 - pos) / len;
}

export function clampCrop(crop: Crop, img: Size, frame: Size): Crop {
  const zoom = clampZoom(crop.zoom);
  const s = scaledSize(img, frame, zoom);
  const [lx, hx] = edgeRange(s.width, frame.width);
  const [ly, hy] = edgeRange(s.height, frame.height);
  return {
    x: focal(clamp(leading(crop.x, s.width, frame.width), lx, hx), s.width, frame.width),
    y: focal(clamp(leading(crop.y, s.height, frame.height), ly, hy), s.height, frame.height),
    zoom,
  };
}

export function coverRect(img: Size, frame: Size, crop: Crop): Placement {
  const c = clampCrop(crop, img, frame);
  const s = scaledSize(img, frame, c.zoom);
  return {
    left: leading(c.x, s.width, frame.width),
    top: leading(c.y, s.height, frame.height),
    width: s.width,
    height: s.height,
  };
}

/** Move the photo by (dx, dy) frame pixels from where `crop` put it. Drags
    snap to edges/centre; keyboard nudges pass snap=false so small steps are
    never pulled back. */
export function panCrop(crop: Crop, dx: number, dy: number, img: Size, frame: Size, snap = true): Crop {
  const s = scaledSize(img, frame, crop.zoom);
  let left = leading(crop.x, s.width, frame.width) + dx;
  let top = leading(crop.y, s.height, frame.height) + dy;
  if (snap) {
    left = snapEdge(left, s.width, frame.width);
    top = snapEdge(top, s.height, frame.height);
  }
  return clampCrop(
    { zoom: crop.zoom, x: focal(left, s.width, frame.width), y: focal(top, s.height, frame.height) },
    img,
    frame,
  );
}

/** Zoom about the frame centre, keeping what's under it in place. */
export function zoomCrop(crop: Crop, zoom: number, img: Size, frame: Size): Crop {
  return clampCrop({ ...crop, zoom: clampZoom(zoom) }, img, frame);
}

/** The zoom at which the whole photo fits inside the frame. */
export function wholePhotoZoom(img: Size, frame: Size): number {
  const contain = Math.min(frame.width / img.width, frame.height / img.height);
  const cover = Math.max(frame.width / img.width, frame.height / img.height);
  return clampZoom(contain / cover);
}
