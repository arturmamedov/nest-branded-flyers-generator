/* The dry-brush streaks over a staggered headline's words (the Sunset look, 2026-10-30; its handoff's README §1.1
   layers 17 and 19, §7.12; Artur's answer 8, "port the generator now"): reference/source/sm-streaks.js, the design's
   generator, ported with its maths unchanged. The design made one mask per word, for SUNSET and Vibes at their sizes;
   here a streak is made at render for any word at any size.

   For one word as fitted (its text, face, size, letter spacing and turn) the word's ink is drawn on a canvas of its
   own; a distance field from the ink's edge, blurred, gives a flow along the strokes (the minor axis of the structure
   tensor); seeded noise is smeared along that flow; the lightest share of the ink (cover), at least minD from the edge,
   is knocked out, as an alpha mask at 2×. Coloured with the ground and laid over the word, it reads as a dry brush.

   Deterministic: the noise is seeded by the job's key (the word, its font, size, spacing, turn, cover and minD), so a
   flyer prints the same twice and on both exports. Cached per key, then per key and colour: the library cards mount
   the renderer, and a card, its lightbox and the preview share a word. Page-side canvas work on the main thread, as
   the design's ("the pixel loops run at native speed"): about a tenth of a second for a word at 1080 px. The DOM pass
   (streakFlyer) runs after the fit, where ready.ts and the preview call it, and writes each streak into its slot in
   the headline box (Flyer.tsx, StaggeredHeadlineBlock), as fit.ts writes a line's size: the slot keeps the job's key,
   so a later word wins over a slower streak. */

export interface StreakJob {
  /** The word as printed: upper-cased where its line is. */
  readonly text: string;
  /** A CSS font shorthand for the canvas, the word's computed weight, fitted size and family stack. */
  readonly font: string;
  /** The fitted size, in px. */
  readonly size: number;
  /** The letter spacing, in px. */
  readonly spacing: number;
  /** The word's turn, in degrees, about its baseline centre. */
  readonly angle: number;
  /** The share of the ink knocked out (looks.ts, Streak). */
  readonly cover: number;
  /** The px from the ink's edge left whole. */
  readonly minD: number;
}

/** A streak as made: an alpha mask of 2w × 2h over a box w × h whose top-left corner is (x0, y0) from the word's
    baseline centre, in canvas px. */
export interface StreakField {
  readonly x0: number;
  readonly y0: number;
  readonly w: number;
  readonly h: number;
  readonly alpha: Uint8ClampedArray;
}

/** A streak coloured, as a data URL PNG of 2w × 2h to lay over the word w × h from (x0, y0). */
export interface StreakPicture {
  readonly x0: number;
  readonly y0: number;
  readonly w: number;
  readonly h: number;
  readonly url: string;
}

/** What makes a streak the streak it is: the seed, and the cache's key. */
export const streakKey = (j: StreakJob): string => [j.text, j.font, j.spacing, j.angle, j.cover, j.minD].join('|');

const fields = new Map<string, Promise<StreakField | null>>();
const pictures = new Map<string, StreakPicture>();

/** The streak of a word as it is laid out, made once per key (null: the word has no ink, an empty word or spaces). */
export function streakField(job: StreakJob): Promise<StreakField | null> {
  const key = streakKey(job);
  const had = fields.get(key);
  if (had) return had;
  const made = make(job, key);
  fields.set(key, made);
  made.catch(() => fields.delete(key));
  return made;
}

/** The streak coloured with the ground, once per key and colour. */
export function streakPicture(field: StreakField, colour: string, key: string): StreakPicture {
  const ck = `${key}|${colour}`;
  const had = pictures.get(ck);
  if (had) return had;
  const c = document.createElement('canvas');
  c.width = 2 * field.w;
  c.height = 2 * field.h;
  const g = c.getContext('2d')!;
  const id = g.createImageData(c.width, c.height);
  const o = id.data;
  const r = parseInt(colour.slice(1, 3), 16);
  const gg = parseInt(colour.slice(3, 5), 16);
  const b = parseInt(colour.slice(5, 7), 16);
  for (let i = 0, p = 0; i < field.alpha.length; i++, p += 4) {
    o[p] = r;
    o[p + 1] = gg;
    o[p + 2] = b;
    o[p + 3] = field.alpha[i];
  }
  g.putImageData(id, 0, 0);
  const picture = { x0: field.x0, y0: field.y0, w: field.w, h: field.h, url: c.toDataURL('image/png') };
  pictures.set(ck, picture);
  return picture;
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/* The generator, as the design wrote it (unchanged maths), on a canvas of the word's own instead of the design's board:
   the word is drawn about its baseline centre (ox, oy), as the renderer turns it, so the field's corner comes out
   from that point. */
async function make(job: StreakJob, key: string): Promise<StreakField | null> {
  // The design waits a moment so the page paints first, and for the face (a fallback face would streak the wrong ink).
  await wait(20);
  await Promise.race([document.fonts.load(job.font, job.text).catch(() => null), wait(400)]);
  // What a streak costs, readable from any page (performance.getEntriesByName('streak')): the report's number.
  const started = performance.now();
  const text = job.text;
  const font = job.font;
  const lsPx = job.spacing;
  const probe = document.createElement('canvas').getContext('2d')!;
  probe.font = font;
  probe.letterSpacing = `${lsPx}px`;
  const tw = probe.measureText(text).width;
  // Room for the turned word around its baseline centre, with a size's margin all round.
  const sn = Math.abs(Math.sin((job.angle * Math.PI) / 180));
  const BW = Math.ceil(tw + 2 * job.size + tw * sn);
  const BH = Math.ceil(3 * job.size + tw * sn);
  const ox = Math.round(BW / 2);
  const oy = Math.ceil(1.5 * job.size + (tw / 2) * sn);
  const draw = (g: CanvasRenderingContext2D, sc: number, dx: number, dy: number) => {
    g.setTransform(sc, 0, 0, sc, -dx * sc, -dy * sc);
    g.font = font;
    g.letterSpacing = lsPx + 'px';
    g.textAlign = 'center';
    g.textBaseline = 'alphabetic';
    g.translate(ox, oy);
    g.rotate((job.angle * Math.PI) / 180);
    g.fillStyle = '#000';
    g.fillText(text, 0, 0);
  };
  const c0 = document.createElement('canvas');
  c0.width = BW;
  c0.height = BH;
  const g0 = c0.getContext('2d', { willReadFrequently: true })!;
  draw(g0, 1, 0, 0);
  const A0 = g0.getImageData(0, 0, BW, BH).data;
  let x0 = 1e9;
  let y0 = 1e9;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < BH; y++)
    for (let x = 0; x < BW; x++)
      if (A0[(y * BW + x) * 4 + 3] > 127) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  if (x1 < 0) return null;
  x0 = Math.max(0, x0 - 4);
  y0 = Math.max(0, y0 - 4);
  x1 = Math.min(BW - 1, x1 + 4);
  y1 = Math.min(BH - 1, y1 + 4);
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const n = w * h;
  const M = new Uint8Array(n);
  const D = new Float32Array(n);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      M[i] = A0[((y + y0) * BW + x + x0) * 4 + 3] > 127 ? 1 : 0;
      D[i] = M[i] ? 1e6 : 0;
    }
  // The distance from the ink's edge, in two chamfer passes.
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!D[i]) continue;
      let v = D[i];
      if (x > 0) v = Math.min(v, D[i - 1] + 1);
      if (y > 0) v = Math.min(v, D[i - w] + 1);
      if (x > 0 && y > 0) v = Math.min(v, D[i - w - 1] + 1.414);
      if (x < w - 1 && y > 0) v = Math.min(v, D[i - w + 1] + 1.414);
      D[i] = v;
    }
  for (let y = h - 1; y >= 0; y--)
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      if (!D[i]) continue;
      let v = D[i];
      if (x < w - 1) v = Math.min(v, D[i + 1] + 1);
      if (y < h - 1) v = Math.min(v, D[i + w] + 1);
      if (x < w - 1 && y < h - 1) v = Math.min(v, D[i + w + 1] + 1.414);
      if (x > 0 && y < h - 1) v = Math.min(v, D[i + w - 1] + 1.414);
      D[i] = v;
    }
  const blur = (src: Float32Array, r: number): Float32Array => {
    const t = new Float32Array(n);
    const o = new Float32Array(n);
    const q = 2 * r + 1;
    for (let y = 0; y < h; y++) {
      let a = 0;
      for (let x = -r; x <= r; x++) a += src[y * w + Math.min(w - 1, Math.max(0, x))];
      for (let x = 0; x < w; x++) {
        t[y * w + x] = a / q;
        a += src[y * w + Math.min(w - 1, x + r + 1)] - src[y * w + Math.max(0, x - r)];
      }
    }
    for (let x = 0; x < w; x++) {
      let a = 0;
      for (let y = -r; y <= r; y++) a += t[Math.min(h - 1, Math.max(0, y)) * w + x];
      for (let y = 0; y < h; y++) {
        o[y * w + x] = a / q;
        a += t[Math.min(h - 1, y + r + 1) * w + x] - t[Math.max(0, y - r) * w + x];
      }
    }
    return o;
  };
  // The flow along the strokes: the structure tensor of the blurred field, its minor axis.
  const Ds = blur(D, 2);
  const Jxx = new Float32Array(n);
  const Jxy = new Float32Array(n);
  const Jyy = new Float32Array(n);
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const gx = (Ds[i + 1] - Ds[i - 1]) / 2;
      const gy = (Ds[i + w] - Ds[i - w]) / 2;
      Jxx[i] = gx * gx;
      Jxy[i] = gx * gy;
      Jyy[i] = gy * gy;
    }
  const Sxx = blur(Jxx, 7);
  const Sxy = blur(Jxy, 7);
  const Syy = blur(Jyy, 7);
  const VX = new Float32Array(n);
  const VY = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const th = 0.5 * Math.atan2(2 * Sxy[i], Sxx[i] - Syy[i]) + Math.PI / 2;
    VX[i] = Math.cos(th);
    VY[i] = Math.sin(th);
  }
  // Seeded noise, sparse, away from the edge.
  let seed = 0;
  for (const ch of key) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const Nz = new Float32Array(n);
  for (let i = 0; i < n; i++)
    if (rnd() < 0.009 && D[i] >= job.minD) {
      const v = 0.55 + 0.45 * rnd();
      const t = rnd() < 0.6 ? 2 : 1;
      for (let dy = 0; dy < t; dy++)
        for (let dx = 0; dx < t; dx++) {
          const j = i + dy * w + dx;
          if (j < n) Nz[j] = Math.max(Nz[j], v);
        }
    }
  // The noise smeared along the flow, both ways, fading with distance.
  const Lf = new Float32Array(n);
  const LEN = 44;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!M[i]) continue;
      let acc = Nz[i];
      let cnt = 1;
      for (let sg = -1; sg <= 1; sg += 2) {
        let px = x + 0.5;
        let py = y + 0.5;
        let dx = VX[i] * sg;
        let dy = VY[i] * sg;
        for (let k = 0; k < LEN; k++) {
          const xi = px | 0;
          const yi = py | 0;
          if (xi < 0 || yi < 0 || xi >= w || yi >= h) break;
          const j = yi * w + xi;
          if (!M[j]) break;
          let vx = VX[j];
          let vy = VY[j];
          if (vx * dx + vy * dy < 0) {
            vx = -vx;
            vy = -vy;
          }
          dx = vx;
          dy = vy;
          px += dx;
          py += dy;
          const xj = px | 0;
          const yj = py | 0;
          if (xj < 0 || yj < 0 || xj >= w || yj >= h) break;
          const wt = 1 - k / LEN;
          acc += Nz[yj * w + xj] * wt;
          cnt += wt;
        }
      }
      Lf[i] = acc / cnt;
    }
  // The knocked-out share: the lightest `cover` of the ink, ramping to full over the top 40 % of it.
  let cntIn = 0;
  for (let i = 0; i < n; i++) if (M[i]) cntIn++;
  const vals = new Float32Array(cntIn);
  for (let i = 0, k = 0; i < n; i++) if (M[i]) vals[k++] = Lf[i];
  vals.sort();
  const lo = vals[Math.floor(cntIn * (1 - job.cover))] || 0;
  const hi = Math.max(lo + 1e-6, vals[Math.floor(cntIn * (1 - job.cover * 0.4))] || 0);
  // The mask at 2×, inside the ink as drawn at 2×, fading in from minD.
  const c2 = document.createElement('canvas');
  c2.width = 2 * w;
  c2.height = 2 * h;
  const g2 = c2.getContext('2d', { willReadFrequently: true })!;
  draw(g2, 2, x0, y0);
  const A2 = g2.getImageData(0, 0, 2 * w, 2 * h).data;
  const W2 = 2 * w;
  const H2 = 2 * h;
  const alpha = new Uint8ClampedArray(W2 * H2);
  const samp = (Fd: Float32Array, fx: number, fy: number) => {
    const xa = Math.max(0, Math.min(w - 1, Math.floor(fx)));
    const ya = Math.max(0, Math.min(h - 1, Math.floor(fy)));
    const xb = Math.min(w - 1, xa + 1);
    const yb = Math.min(h - 1, ya + 1);
    const ax = Math.max(0, Math.min(1, fx - xa));
    const ay = Math.max(0, Math.min(1, fy - ya));
    return (Fd[ya * w + xa] * (1 - ax) + Fd[ya * w + xb] * ax) * (1 - ay) + (Fd[yb * w + xa] * (1 - ax) + Fd[yb * w + xb] * ax) * ay;
  };
  const Dc = new Float32Array(n);
  for (let i = 0; i < n; i++) Dc[i] = Math.min(D[i], 60);
  for (let Y = 0; Y < H2; Y++)
    for (let X = 0; X < W2; X++) {
      const p = Y * W2 + X;
      const m2 = A2[p * 4 + 3];
      if (!m2) continue;
      const fx = (X + 0.5) / 2 - 0.5;
      const fy = (Y + 0.5) / 2 - 0.5;
      const lv = samp(Lf, fx, fy);
      const dv = samp(Dc, fx, fy);
      let a = (lv - lo) / (hi - lo);
      a = Math.max(0, Math.min(1, a)) * Math.max(0, Math.min(1, (dv - job.minD) / 1.5 + 1)) * (m2 / 255);
      alpha[p] = Math.round(a * 255);
    }
  performance.measure('streak', { start: started, detail: { key, w, h } });
  return { x0: x0 - ox, y0: y0 - oy, w, h, alpha };
}

/** The job a streak slot asks for, read from its word as laid out (its fitted size is its inline font size, its turn
    its inline transform's rotate), or null where the word is empty. */
function jobOf(slot: HTMLElement, word: HTMLElement | null): StreakJob | null {
  const raw = word?.textContent ?? '';
  if (!word || !raw.trim()) return null;
  const cs = getComputedStyle(word);
  const size = parseFloat(word.style.fontSize) || parseFloat(cs.fontSize);
  return {
    text: cs.textTransform === 'uppercase' ? raw.toUpperCase() : cs.textTransform === 'lowercase' ? raw.toLowerCase() : raw,
    font: `${cs.fontWeight} ${size}px ${cs.fontFamily}`,
    size,
    spacing: parseFloat(cs.letterSpacing) || 0,
    angle: parseFloat(/rotate\((-?[\d.]+)deg\)/.exec(word.style.transform)?.[1] ?? '0'),
    cover: parseFloat(slot.dataset.streakCover!),
    minD: parseFloat(slot.dataset.streakMin!),
  };
}

function hide(img: HTMLImageElement) {
  img.style.display = 'none';
  img.removeAttribute('src');
}

async function show(img: HTMLImageElement, p: StreakPicture) {
  img.style.left = `${p.x0}px`;
  img.style.top = `${p.y0}px`;
  img.style.width = `${p.w}px`;
  img.style.height = `${p.h}px`;
  img.style.display = '';
  if (img.src !== p.url) img.src = p.url;
  await img.decode().catch(() => undefined);
}

/** Draws the streaks of one flyer root, after its fit: each slot ([data-streak], the word's number) takes the word's
    job from the word as fitted; a streak already made is shown at once (the preview on a keystroke, a card drawn
    twice), the rest once made, unless the slot has moved on to another word. Resolves once every streak is shown and
    decoded: ready.ts awaits it before an export. A root with no slot (hand-drawn, the week) resolves at once. */
export function streakFlyer(root: HTMLElement): Promise<void> {
  const jobs = Array.from(root.querySelectorAll<HTMLElement>('[data-streak]'), (slot) => {
    const img = slot.querySelector('img')!;
    const job = jobOf(slot, slot.parentElement?.querySelector<HTMLElement>(`[data-word="${slot.dataset.streak}"]`) ?? null);
    if (!job) {
      slot.dataset.streakKey = '';
      hide(img);
      return Promise.resolve();
    }
    const key = streakKey(job);
    const colour = slot.dataset.streakInk!;
    slot.dataset.streakKey = key;
    const made = pictures.get(`${key}|${colour}`);
    if (made) return show(img, made);
    hide(img);
    return streakField(job).then((field) => {
      if (slot.dataset.streakKey !== key) return;
      return field ? show(img, streakPicture(field, colour, key)) : hide(img);
    });
  });
  return Promise.all(jobs).then(() => undefined);
}
