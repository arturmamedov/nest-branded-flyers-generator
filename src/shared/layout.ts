/* Story canvas geometry — every number from the handoff README §2, in one
   place. Tops are measured from the canvas edge. The bottom of the canvas is
   allocated upward from the 1620 floor: pill, ask, extras, blocks.

   Deliberate departures from the prototype (team design pass, 2026-09-18):
   the headline block sits at 345 (was 382) to clear the sparks on the photo's
   top corners, so the eyebrow box ends at 345 (was 104 tall; its content is
   62px, so nothing moves). */

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export const CANVAS = { width: 1080, height: 1920 } as const;

/** Instagram safe zones: 250 top, 300 bottom, 70 sides. */
export const SAFE = { top: 250, bottom: 300, side: 70 } as const;
export const SAFE_BOX: Rect = {
  left: SAFE.side,
  top: SAFE.top,
  width: CANVAS.width - 2 * SAFE.side,
  height: CANVAS.height - SAFE.top - SAFE.bottom,
};

const inner = (top: number, height: number): Rect => ({
  left: SAFE.side,
  top,
  width: CANVAS.width - 2 * SAFE.side,
  height,
});

export const ACTIVITY = {
  eyebrow: inner(250, 95),
  headline: inner(345, 300),
  headlineNoPhoto: inner(398, 460),
  photoBleed: { left: 0, top: 712, width: CANVAS.width, height: 380 } as Rect,
  photoBand: inner(712, 380),
  noPhotoRule: { left: 240, top: 900, width: CANVAS.width - 480, height: 32 } as Rect,
  chips: inner(1110, 206),
  chipGap: 20,
  extras: inner(1318, 40),
  ask: inner(1382, 150),
  pill: { top: 1544, height: 72 },
} as const;

export const WEEK = {
  title: inner(398, 250),
  rows: { top: 700, rowHeight: 122, gap: 15, max: 5 },
} as const;

export type PhotoMode = 'bleed' | 'band' | 'none';

export type GroupId = 'eyebrow' | 'headline' | 'photo' | 'chips' | 'extras' | 'ask' | 'pill';

/** The fixed boxes of the Activity template for a photo mode. */
export function activityGroups(mode: PhotoMode): Partial<Record<GroupId, Rect>> {
  const groups: Partial<Record<GroupId, Rect>> = {
    eyebrow: ACTIVITY.eyebrow,
    headline: mode === 'none' ? ACTIVITY.headlineNoPhoto : ACTIVITY.headline,
    chips: ACTIVITY.chips,
    extras: ACTIVITY.extras,
    ask: ACTIVITY.ask,
    pill: inner(ACTIVITY.pill.top, ACTIVITY.pill.height),
  };
  if (mode === 'bleed') groups.photo = ACTIVITY.photoBleed;
  if (mode === 'band') groups.photo = ACTIVITY.photoBand;
  if (mode === 'none') groups.photo = ACTIVITY.noPhotoRule;
  return groups;
}

export function overlaps(a: Rect, b: Rect): boolean {
  return (
    a.left < b.left + b.width &&
    b.left < a.left + a.width &&
    a.top < b.top + b.height &&
    b.top < a.top + a.height
  );
}

export function inside(inner: Rect, outer: Rect, tolerance = 0): boolean {
  return (
    inner.left >= outer.left - tolerance &&
    inner.top >= outer.top - tolerance &&
    inner.left + inner.width <= outer.left + outer.width + tolerance &&
    inner.top + inner.height <= outer.top + outer.height + tolerance
  );
}

export interface Point {
  x: number;
  y: number;
}

/** Where photo-anchored art hangs from: the top corners of the photo slot
    (the bleed photo uses the band's corners so the art stays on canvas), or
    the ends of the brush rule when there is no photo. */
export function photoAnchors(mode: PhotoMode): { photoLeft: Point; photoRight: Point } {
  if (mode === 'none') {
    const r = ACTIVITY.noPhotoRule;
    return { photoLeft: { x: r.left, y: r.top }, photoRight: { x: r.left + r.width, y: r.top } };
  }
  const b = ACTIVITY.photoBand;
  return { photoLeft: { x: b.left, y: b.top }, photoRight: { x: b.left + b.width, y: b.top } };
}

/** Photo frame size per mode, for crop maths. */
export function photoFrame(mode: PhotoMode): { width: number; height: number } | null {
  if (mode === 'bleed') return { width: ACTIVITY.photoBleed.width, height: ACTIVITY.photoBleed.height };
  if (mode === 'band') return { width: ACTIVITY.photoBand.width, height: ACTIVITY.photoBand.height };
  return null;
}
