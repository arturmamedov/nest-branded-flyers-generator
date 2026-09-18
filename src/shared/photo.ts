import type { Crop } from './schema.js';

/* Photo crop model: the image covers its frame at zoom 1; the crop's x/y is the
   focal point (0..1 of the image) placed at the frame centre, clamped so the
   frame never shows past an image edge. */

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

export const DEFAULT_CROP: Crop = { x: 0.5, y: 0.5, zoom: 1 };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function scaledSize(img: Size, frame: Size, zoom: number): Size {
  const base = Math.max(frame.width / img.width, frame.height / img.height) * clamp(zoom, 1, 3);
  return { width: img.width * base, height: img.height * base };
}

/** Keep the focal point where the image still covers the frame. */
export function clampCrop(crop: Crop, img: Size, frame: Size): Crop {
  const zoom = clamp(crop.zoom, 1, 3);
  const s = scaledSize(img, frame, zoom);
  const hx = frame.width / 2 / s.width;
  const hy = frame.height / 2 / s.height;
  return { x: clamp(crop.x, hx, 1 - hx), y: clamp(crop.y, hy, 1 - hy), zoom };
}

export function coverRect(img: Size, frame: Size, crop: Crop): Placement {
  const c = clampCrop(crop, img, frame);
  const s = scaledSize(img, frame, c.zoom);
  return {
    left: frame.width / 2 - c.x * s.width,
    top: frame.height / 2 - c.y * s.height,
    width: s.width,
    height: s.height,
  };
}

/** Drag the image by (dx, dy) frame pixels. */
export function panCrop(crop: Crop, dx: number, dy: number, img: Size, frame: Size): Crop {
  const s = scaledSize(img, frame, crop.zoom);
  return clampCrop({ ...crop, x: crop.x - dx / s.width, y: crop.y - dy / s.height }, img, frame);
}
