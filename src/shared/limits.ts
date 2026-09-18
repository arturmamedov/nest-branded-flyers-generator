/* Photo and export limits shared by the editor, the Node server and (through
   the generated schema/shared.json) the PHP backend. */

/** Largest upload the Node server accepts. PHP reports its own, lower, ini-derived limit through /api/config. */
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

/** 3× the widest frame: plenty for zoom, small enough to decode on a small host. */
export const MAX_PHOTO_EDGE = 3240;

/** Stored photos: JPEG quality on the 0–100 scale (the browser's canvas uses /100). */
export const PHOTO_JPEG_QUALITY = 88;

/** Downloaded JPG exports (handoff §9: "JPG at quality 0.9"). */
export const EXPORT_JPEG_QUALITY = 90;

/** What the photo picker offers and the servers keep; anything else gets a 415. */
export const ACCEPTED_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

/** iPhone photos: browsers and the servers can't draw HEIC, so both say so plainly.
    An ISO-BMFF file carries `ftyp` at byte 4 and its major brand at byte 8. */
export const HEIC = {
  ftypOffset: 4,
  brandOffset: 8,
  minBytes: 12,
  brands: ['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1'],
} as const;

export function isHeic(bytes: Uint8Array): boolean {
  if (bytes.length < HEIC.minBytes) return false;
  const ascii = (from: number) => String.fromCharCode(...bytes.subarray(from, from + 4));
  return ascii(HEIC.ftypOffset) === 'ftyp' && (HEIC.brands as readonly string[]).includes(ascii(HEIC.brandOffset));
}

/** The size a photo is stored at: long edge capped at `max`, never enlarged, the
    short edge rounded half up and at least 1 px. Matches sharp's
    `resize({ fit: 'inside', withoutEnlargement: true })` (tests/fixtures/fit-long-edge.json). */
export function fitLongEdge(width: number, height: number, max: number = MAX_PHOTO_EDGE): { width: number; height: number } {
  const long = Math.max(width, height);
  if (long <= max) return { width, height };
  const scale = (n: number) => Math.max(1, Math.round((n * max) / long));
  return width >= height ? { width: max, height: scale(height) } : { width: scale(width), height: max };
}
