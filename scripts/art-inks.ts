import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PNG } from 'pngjs';
import { SWAPPED_INKS } from '../src/shared/looks/handDrawn.js';
import { ROOT } from './gen-shared.js';

/* The template's corner blobs, and the sparks on the photo's corners, in each other's ink (defaults.ts,
   SWAPPED_INKS): each file is one of the designer's drawings, pixel for pixel, in the other colour. Derived, never
   drawn by hand:

     npm run gen:art

   tests/unit/art-inks.test.ts holds the committed files to what this makes. */

export const ART_DIR = 'assets/art';

/** What counts as a drawing's ink: a pixel at least half solid (the unit tests' own measure of the art). */
export const INK_ALPHA = 128;
/** A drawing keeps its soft edge, the pixels within this many of its ink, and nothing further out. The scans carry
    a haze of faint pixels well away from the shape (about a thousand each, up to a quarter solid): in yellow on
    cream it cannot be seen, in teal it can. */
export const EDGE = 2;

type Rgb = [number, number, number];

/** The colour a drawing is printed in: the commonest among its solid pixels (the scans dither around it). */
export function inkOf(png: PNG): Rgb {
  const counts = new Map<number, number>();
  for (let i = 0; i < png.data.length; i += 4) {
    if (png.data[i + 3] !== 255) continue;
    const key = (png.data[i] << 16) | (png.data[i + 1] << 8) | png.data[i + 2];
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const [key] = [...counts].reduce((best, entry) => (entry[1] > best[1] ? entry : best));
  return [key >> 16, (key >> 8) & 255, key & 255];
}

/** Whether ink lies within EDGE pixels of a point of a drawing. */
export function nearInk(png: PNG, x: number, y: number): boolean {
  for (let v = Math.max(0, y - EDGE); v <= Math.min(png.height - 1, y + EDGE); v++)
    for (let u = Math.max(0, x - EDGE); u <= Math.min(png.width - 1, x + EDGE); u++) if (png.data[(v * png.width + u) * 4 + 3] >= INK_ALPHA) return true;
  return false;
}

/** A drawing in another ink: its own shape and soft edge, one flat colour. */
export function inked(drawing: PNG, [r, g, b]: Rgb): PNG {
  const out = new PNG({ width: drawing.width, height: drawing.height });
  for (let y = 0; y < drawing.height; y++)
    for (let x = 0; x < drawing.width; x++) {
      const i = (y * drawing.width + x) * 4;
      const alpha = nearInk(drawing, x, y) ? drawing.data[i + 3] : 0;
      out.data.set(alpha === 0 ? [0, 0, 0, 0] : [r, g, b, alpha], i);
    }
  return out;
}

const readArt = (slug: string) => PNG.sync.read(readFileSync(join(ROOT, ART_DIR, `${slug}.png`)));

/** Every derived file, by slug. */
export function derive(read: (slug: string) => PNG = readArt): Record<string, PNG> {
  return Object.fromEntries(Object.entries(SWAPPED_INKS).map(([slug, { drawing, ink }]) => [slug, inked(read(drawing), inkOf(read(ink)))]));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  for (const [slug, png] of Object.entries(derive())) {
    const file = join(ROOT, ART_DIR, `${slug}.png`);
    writeFileSync(file, PNG.sync.write(png));
    console.log(`wrote ${ART_DIR}/${slug}.png (${png.width} × ${png.height})`);
  }
}
