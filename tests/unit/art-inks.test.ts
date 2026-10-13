import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import { ART_DIR, EDGE, INK_ALPHA, derive, inkOf, nearInk } from '../../scripts/art-inks.js';
import { ROOT } from '../../scripts/gen-shared.js';
import { SWAPPED_INKS } from '../../src/shared/defaults.js';

/* The corner blobs print in each other's ink (Artur, 2026-10-12), and so do the two sparks on the photo's corners
   (2026-10-13). The four files that do it are derived from the designer's drawings by scripts/art-inks.ts (npm run
   gen:art), never drawn by hand: these tests hold the committed files to what the script makes, and say what that
   is. Pixels are compared, not bytes: a PNG's bytes belong to its encoder. */

const read = (slug: string) => PNG.sync.read(readFileSync(join(ROOT, ART_DIR, `${slug}.png`)));
const FILES = Object.entries(SWAPPED_INKS);

describe('the template’s pairs in each other’s ink', () => {
  it('each file in assets/art/ is what the script derives today', () => {
    const made = derive();
    expect(Object.keys(made).sort()).toEqual(['blob-left-teal', 'blob-right-yellow', 'spark-left-yellow', 'spark-right-teal']);
    for (const [slug, png] of Object.entries(made)) {
      const kept = read(slug);
      expect([kept.width, kept.height], `${slug}: its size`).toEqual([png.width, png.height]);
      expect(Buffer.compare(kept.data, png.data), `${slug}: run npm run gen:art`).toBe(0);
    }
  });

  for (const [slug, { drawing, ink }] of FILES) {
    it(`${slug} is ${drawing}'s drawing, the same size, in ${ink}'s colour`, () => {
      const made = read(slug);
      const from = read(drawing);
      expect([made.width, made.height]).toEqual([from.width, from.height]);
      const colour = inkOf(read(ink));
      const problems: string[] = [];
      let inkPixels = 0;
      let edgeKept = 0;
      let hazeDropped = 0;
      for (let y = 0; y < made.height; y++)
        for (let x = 0; x < made.width; x++) {
          const i = (y * made.width + x) * 4;
          const was = from.data[i + 3];
          const is = made.data[i + 3];
          // The drawing's shape: its ink and its soft edge as they were; the scan's haze, away from the ink, is gone.
          if (was >= INK_ALPHA) inkPixels++;
          if (was >= INK_ALPHA && is !== was) problems.push(`${x},${y}: ink lost`);
          if (is !== 0 && is !== was) problems.push(`${x},${y}: a pixel the drawing never had`);
          if (is !== 0 && !nearInk(from, x, y)) problems.push(`${x},${y}: haze kept`);
          // The soft edge: every pixel within reach of the ink is as solid as the drawing has it.
          if (nearInk(from, x, y) && is !== was) problems.push(`${x},${y}: soft edge lost`);
          if (was > 0 && was < INK_ALPHA && is === was) edgeKept++;
          if (is === 0 && was !== 0) hazeDropped++;
          if (is !== 0 && (made.data[i] !== colour[0] || made.data[i + 1] !== colour[1] || made.data[i + 2] !== colour[2])) problems.push(`${x},${y}: another colour`);
        }
      expect(problems.slice(0, 5)).toEqual([]);
      // A blob has over ten thousand pixels of ink, a spark about two thousand.
      expect(inkPixels).toBeGreaterThan(slug.startsWith('blob') ? 10_000 : 1_500);
      // A shape this size has a soft edge of several hundred pixels: it is there.
      expect(edgeKept).toBeGreaterThan(400);
      // The haze is a small part of the scan, and it is all that was dropped: nothing within reach of the ink.
      expect(hazeDropped).toBeGreaterThan(500);
      expect(hazeDropped).toBeLessThan(2_500);
    });
  }

  it('what counts as ink, and how far its soft edge reaches, are pinned here: half solid, two pixels', () => {
    // The tests above ask the script what is near the ink. These two numbers are what that means.
    expect([INK_ALPHA, EDGE]).toEqual([128, 2]);
    const dot = new PNG({ width: 9, height: 1 });
    dot.data.fill(0);
    dot.data[4 * 4 + 3] = 128;
    expect(Array.from({ length: 9 }, (_, x) => nearInk(dot, x, 0))).toEqual([false, false, true, true, true, true, true, false, false]);
  });

  it('the two inks are the art’s own teal and yellow, read from the blobs, and every derived file is flat in one of them', () => {
    expect(inkOf(read('blob-teal'))).toEqual([10, 120, 143]);
    expect(inkOf(read('blob-yellow'))).toEqual([250, 194, 19]);
    // The sparks' scans are speckled: no colour is as much as a fiftieth of one's solid pixels, where a blob is flat
    // (four in five). So a spark takes its new ink from a blob, never from the other spark.
    expect(new Set(FILES.map(([, { ink }]) => ink))).toEqual(new Set(['blob-teal', 'blob-yellow']));
    for (const slug of ['spark-teal', 'spark-yellow']) {
      const png = read(slug);
      const counts = new Map<number, number>();
      let solid = 0;
      for (let i = 0; i < png.data.length; i += 4) {
        if (png.data[i + 3] !== 255) continue;
        solid++;
        const key = (png.data[i] << 16) | (png.data[i + 1] << 8) | png.data[i + 2];
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      expect(Math.max(...counts.values()) / solid, slug).toBeLessThan(0.02);
    }
    for (const [slug, { ink }] of FILES) expect(inkOf(read(slug)), slug).toEqual(inkOf(read(ink)));
  });
});
