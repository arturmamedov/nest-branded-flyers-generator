import { apiError } from '../shared/errors';
import { ACCEPTED_PHOTO_TYPES, PHOTO_JPEG_QUALITY, fitLongEdge, isHeic } from '../shared/limits';
import type { ApiConfig } from '../shared/schema';

/* Shrink a photo in the browser before it is uploaded, so neither backend has
   to decode a 48 MP phone photo, and so it fits under the host's upload limit
   (shared hosts often allow 2 MB). The server still sniffs, validates and
   re-encodes everything: this is a courtesy, never a check. */

export type PhotoLimits = ApiConfig['limits'];

/** The step-down stops here; past it the server's 413 explains the problem. */
const MIN_EDGE = 1080;
const STEP = 0.85;

export async function preparePhoto(file: File, limits: PhotoLimits): Promise<{ blob: Blob; name: string }> {
  const untouched = { blob: file as Blob, name: file.name };

  // Browsers can't draw HEIC. The server answers it with the friendly message —
  // unless the file is over the host's limit, which it would refuse unread.
  if (isHeic(new Uint8Array(await file.slice(0, 16).arrayBuffer()))) {
    if (file.size > limits.maxUploadBytes) throw new Error(apiError('heic').message);
    return untouched;
  }
  // The server is the only judge of formats: send anything else as it is.
  if (!(ACCEPTED_PHOTO_TYPES as readonly string[]).includes(file.type)) return untouched;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    return untouched;
  }
  try {
    const fits = Math.max(bitmap.width, bitmap.height) <= limits.maxPhotoEdge && file.size <= limits.maxUploadBytes;
    // A JPEG that already fits goes up as it is: re-encoding it would lose quality twice.
    if (fits && file.type === 'image/jpeg') return untouched;

    try {
      let edge = Math.min(Math.max(bitmap.width, bitmap.height), limits.maxPhotoEdge);
      const canvas = draw(bitmap, edge);
      const png = file.type !== 'image/jpeg' && hasTransparency(canvas);
      let blob = await encode(canvas, png);
      // Re-encoding a PNG/WebP that already fits must not make it bigger (the canvas PNG encoder can).
      if (fits && blob.size >= file.size) return untouched;
      while (blob.size > limits.maxUploadBytes && edge > MIN_EDGE) {
        edge = Math.max(MIN_EDGE, Math.round(edge * STEP));
        blob = await encode(draw(bitmap, edge), png);
      }
      return { blob, name: file.name.replace(/\.[^.]*$/, '') + (png ? '.png' : '.jpg') };
    } catch (e) {
      // The browser could not redraw it; the server can still take a file that fits.
      if (file.size <= limits.maxUploadBytes) return untouched;
      throw e;
    }
  } finally {
    bitmap.close();
  }
}

function draw(bitmap: ImageBitmap, edge: number): HTMLCanvasElement {
  const size = fitLongEdge(bitmap.width, bitmap.height, edge);
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, size.width, size.height);
  return canvas;
}

/** Real transparency, not just an alpha channel: an opaque PNG is stored as a JPEG. */
function hasTransparency(canvas: HTMLCanvasElement): boolean {
  const { data } = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 3; i < data.length; i += 4) if (data[i] < 255) return true;
  return false;
}

function encode(canvas: HTMLCanvasElement, png: boolean): Promise<Blob> {
  return new Promise((done, fail) =>
    canvas.toBlob(
      (b) => (b ? done(b) : fail(new Error('The browser could not prepare this photo.'))),
      png ? 'image/png' : 'image/jpeg',
      png ? undefined : PHOTO_JPEG_QUALITY / 100,
    ),
  );
}
