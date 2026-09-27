import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import { CANVASES, type CanvasId, type PhotoMode, type Rect } from '../../src/shared/layout';
import { SAMPLE_FLYERS, type SampleFlyer } from '../../src/shared/samples';

/* Pixel comparison of a client export against the server export, lifted from
   the approved Phase 1 spike (docs/spikes/client-export.md): the same diff,
   the same photo-band mask and the same per-feature regions, so a library
   upgrade that breaks one of the handoff's three load-bearing features
   (§9: stretched art, the highlighter's clone, non-scaling strokes) fails
   even when the overall difference stays small. */

/** Agreed with the owner: % of differing pixels, outside the photo band and inside each feature's own boxes. */
export const THRESHOLD = 0.5;

export interface Regions {
  /** Line boxes of the WHEN highlighter: clone only shows when it wraps. */
  markLines: number;
  art: Rect[];
  mark: Rect[];
  wonky: Rect[];
  text: Rect[];
}

export interface Metrics {
  outside: number;
  inside: number | null;
  art: number | null;
  mark: number | null;
  wonky: number | null;
  text: number | null;
}

/** No sample wraps its WHEN line, so none exercises box-decoration-break:
    clone. This record does, and keeps every other stress-test worst case. */
export function highlighterWrapSample(): SampleFlyer {
  const s = structuredClone(SAMPLE_FLYERS.find((f) => f.title.startsWith('Long copy'))!);
  s.title = 'Highlighter wrap';
  s.data.chips = s.data.chips.map((c) => (c.key === 'when' ? { ...c, value: 'Sat 27/9 & Sun 28/9 · 05:30' } : c));
  return s;
}

/** Runs in the page (render.html): the feature boxes, relative to the flyer's top-left. */
export function readRegions(): Regions {
  const root = document.querySelector<HTMLElement>('[data-flyer]')!;
  const o = root.getBoundingClientRect();
  const rel = (r: DOMRect) => ({ left: r.left - o.left, top: r.top - o.top, width: r.width, height: r.height });
  const styled = [...root.querySelectorAll<HTMLElement>('[style*="url("]')];
  const marks = styled.filter((el) => el.style.backgroundImage.includes('mark-yellow'));
  return {
    markLines: marks.reduce((n, el) => n + el.getClientRects().length, 0),
    art: styled.filter((el) => !el.style.backgroundImage.includes('mark-yellow')).map((el) => rel(el.getBoundingClientRect())),
    mark: marks.flatMap((el) => [...el.getClientRects()].map(rel)),
    wonky: [...root.querySelectorAll('svg')].map((el) => rel(el.getBoundingClientRect())),
    text: ['headline', 'extras', 'ask', 'pill'].flatMap((g) =>
      [...root.querySelectorAll(`[data-group="${g}"]`)].map((el) => rel(el.getBoundingClientRect())),
    ),
  };
}

/** A mask the size of one canvas, one byte per pixel. */
interface Mask {
  W: number;
  H: number;
  px: Uint8Array;
}

const mask = (W: number, H: number): Mask => ({ W, H, px: new Uint8Array(W * H) });

function fill({ W, H, px }: Mask, r: Rect, value: 0 | 1, grow = 0) {
  const x0 = Math.max(0, Math.floor(r.left - grow));
  const y0 = Math.max(0, Math.floor(r.top - grow));
  const x1 = Math.min(W, Math.ceil(r.left + r.width + grow));
  const y1 = Math.min(H, Math.ceil(r.top + r.height + grow));
  for (let y = y0; y < y1; y++) px.fill(value, y * W + Math.max(0, x0), y * W + Math.max(x0, x1));
}

function photoMask(canvas: CanvasId, mode: PhotoMode): Uint8Array {
  const { width, height, activity } = CANVASES[canvas];
  const m = mask(width, height);
  if (mode === 'bleed') fill(m, activity.photoBleed, 1);
  if (mode === 'band') fill(m, activity.photoBand, 1);
  return m.px;
}

/** % of differing pixels inside a region (photo band excluded), null when the region is empty. */
function regionPct(diff: Uint8Array, photo: Uint8Array, W: number, H: number, rects: Rect[], ring?: { out: number; in: number }): number | null {
  if (!rects.length) return null;
  const mm = mask(W, H);
  const m = mm.px;
  for (const r of rects) {
    fill(mm, r, 1, ring ? ring.out : 0);
    if (ring) fill(mm, { left: r.left + ring.in, top: r.top + ring.in, width: r.width - 2 * ring.in, height: r.height - 2 * ring.in }, 0);
  }
  let total = 0;
  let bad = 0;
  for (let i = 0; i < m.length; i++) {
    if (!m[i] || photo[i]) continue;
    total++;
    bad += diff[i];
  }
  return total ? (100 * bad) / total : null;
}

export function compare(golden: PNG, candidate: PNG, canvas: CanvasId, mode: PhotoMode, regions: Regions): Metrics {
  const { width: W, height: H } = CANVASES[canvas];
  const diffImage = new PNG({ width: W, height: H });
  // Same settings as scripts/compare-design.ts. Anti-aliasing pixels are drawn
  // yellow and not counted; real differences are pure red.
  pixelmatch(golden.data, candidate.data, diffImage.data, W, H, { threshold: 0.1 });
  const diff = new Uint8Array(W * H);
  for (let i = 0; i < diff.length; i++) {
    const p = i * 4;
    diff[i] = diffImage.data[p] === 255 && diffImage.data[p + 1] === 0 && diffImage.data[p + 2] === 0 ? 1 : 0;
  }
  const photo = photoMask(canvas, mode);
  let outT = 0;
  let outBad = 0;
  let inT = 0;
  let inBad = 0;
  for (let i = 0; i < diff.length; i++) {
    if (photo[i]) {
      inT++;
      inBad += diff[i];
    } else {
      outT++;
      outBad += diff[i];
    }
  }
  return {
    outside: (100 * outBad) / outT,
    inside: inT ? (100 * inBad) / inT : null,
    art: regionPct(diff, photo, W, H, regions.art),
    mark: regionPct(diff, photo, W, H, regions.mark),
    // A ring along the frame edge: the 5px stroke, not the chip text inside.
    wonky: regionPct(diff, photo, W, H, regions.wonky, { out: 6, in: 30 }),
    text: regionPct(diff, photo, W, H, regions.text),
  };
}

/** Each metric that failed, as "name 1.234%". Empty means the export matches. */
export function failures(m: Metrics): string[] {
  return Object.entries(m)
    .filter(([, v]) => v != null && v > THRESHOLD)
    .map(([k, v]) => `${k} ${(v as number).toFixed(3)}%`);
}

/* ---------- JPEG quality: read the luminance DQT, match the IJG tables ---------- */

const ZIGZAG = [
  0, 1, 8, 16, 9, 2, 3, 10, 17, 24, 32, 25, 18, 11, 4, 5, 12, 19, 26, 33, 40, 48, 41, 34, 27, 20, 13, 6, 7, 14, 21, 28, 35, 42,
  49, 56, 57, 50, 43, 36, 29, 22, 15, 23, 30, 37, 44, 51, 58, 59, 52, 45, 38, 31, 39, 46, 53, 60, 61, 54, 47, 55, 62, 63,
];
const STD_LUMA = [
  16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55, 14, 13, 16, 24, 40, 57, 69, 56, 14, 17, 22, 29, 51, 87, 80, 62,
  18, 22, 37, 56, 68, 109, 103, 77, 24, 35, 55, 64, 81, 104, 113, 92, 49, 64, 78, 87, 103, 121, 120, 101, 72, 92, 95, 98, 112,
  100, 103, 99,
];
const ijgTable = (q: number) => {
  const s = q < 50 ? 5000 / q : 200 - 2 * q;
  return STD_LUMA.map((v) => Math.min(255, Math.max(1, Math.floor((v * s + 50) / 100))));
};

function lumaTable(jpg: Buffer): number[] | null {
  let i = 2; // after SOI
  while (i + 4 <= jpg.length && jpg[i] === 0xff) {
    const marker = jpg[i + 1];
    const len = jpg.readUInt16BE(i + 2);
    if (marker === 0xda) return null; // start of scan: no DQT before it
    if (marker === 0xdb) {
      let p = i + 4;
      while (p < i + 2 + len) {
        const precision = jpg[p] >> 4;
        const table = jpg[p] & 15;
        p++;
        const zz = Array.from({ length: 64 }, (_, k) => (precision ? jpg.readUInt16BE(p + 2 * k) : jpg[p + k]));
        p += precision ? 128 : 64;
        if (table === 0) {
          const natural = new Array<number>(64);
          ZIGZAG.forEach((n, k) => (natural[n] = zz[k]));
          return natural;
        }
      }
    }
    i += 2 + len;
  }
  return null;
}

/** The IJG quality whose luminance table the file carries exactly, else null. */
export function jpegQuality(jpg: Buffer): number | null {
  const t = lumaTable(jpg);
  if (!t) return null;
  for (let q = 100; q >= 1; q--) if (ijgTable(q).every((v, i) => v === t[i])) return q;
  return null;
}
