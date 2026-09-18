/* Phase 1 spike of docs/prompts/php-shared-hosting.md: can the browser make
   the export? Shared hosting has no Chromium, so the PNG/JPG would have to come
   from the staff member's own Chrome. The handoff (§9) rejected that once:
   html-to-image-style tools mis-rendered stretched background art, the
   highlighter's box-decoration-break: clone and the non-scaling wonky strokes.

   Golden reference: the real server export (server/services/renderer.ts) of
   every sample in all three photo modes, seeded as real flyers. Candidates:
   the same built render page with the flyer mounted offscreen (as a client
   exporter would mount it — never display:none), captured in the page by each
   library at pixel ratio 1, on a DPR 1 laptop and a DPR 2 Retina screen.

   Usage: npm run spike:client-export   (builds first)
   Output: test-results/client-export-spike/ — results.json, report.md and the
   golden / candidate / diff images. The written-up report is
   docs/spikes/client-export.md. */
import { copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';
import pixelmatch from 'pixelmatch';
import { chromium, type Browser, type BrowserContext } from 'playwright';
import { PNG } from 'pngjs';
import sharp from 'sharp';
import { createApp } from '../server/app.js';
import { openDb } from '../server/db/open.js';
import { APP_ROOT, FIXTURE_PHOTOS_DIR, SEED_FILE, dataPaths } from '../server/paths.js';
import { createFlyer } from '../server/repos/flyers.js';
import { hostelBySlug } from '../server/repos/hostels.js';
import { insertPhoto } from '../server/repos/photos.js';
import { applySeedFile } from '../server/seed.js';
import { processPhoto } from '../server/services/photos.js';
import { createRenderer } from '../server/services/renderer.js';
import { ACTIVITY, CANVAS, type PhotoMode, type Rect } from '../src/shared/layout.js';
import { SAMPLE_FLYERS } from '../src/shared/samples.js';

const PORT = 8798;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const OUT = join(APP_ROOT, 'test-results', 'client-export-spike');
const MODES: PhotoMode[] = ['bleed', 'band', 'none'];
const DPRS = [1, 2] as const;
/** Agreed with the owner: differing pixels outside the photo band, and inside each feature's own box. */
const THRESHOLD = 0.5;
const W = CANVAS.width;
const H = CANVAS.height;

const LIBS = [
  { name: 'snapdom', pkg: '@zumer/snapdom', script: 'node_modules/@zumer/snapdom/dist/snapdom.js' },
  { name: 'modern-screenshot', pkg: 'modern-screenshot', script: 'node_modules/modern-screenshot/dist/index.js' },
  { name: 'html-to-image', pkg: 'html-to-image', script: 'node_modules/html-to-image/dist/html-to-image.js' },
] as const;
type LibName = (typeof LIBS)[number]['name'];

interface Regions {
  /** Lines of the WHEN highlighter: clone only shows when it wraps. */
  markLines: number;
  art: Rect[];
  mark: Rect[];
  wonky: Rect[];
  text: Rect[];
}

interface Metrics {
  outside: number;
  inside: number | null;
  art: number | null;
  mark: number | null;
  wonky: number | null;
  text: number | null;
}

/** Breaks one feature in the rendered flyer — inline styles and attributes,
    the way the renderer writes them — to prove the matching check notices. */
interface Tamper {
  name: string;
  expect: keyof Metrics;
  script: string;
}

const CONTROLS: Tamper[] = [
  {
    name: 'control-fallback-font',
    expect: 'text',
    script: `document.querySelectorAll('[data-flyer], [data-flyer] *').forEach((el) => (el.style.fontFamily = 'serif'))`,
  },
  {
    name: 'control-scaling-stroke',
    expect: 'wonky',
    script: `document.querySelectorAll('[data-flyer] path').forEach((p) => p.removeAttribute('vector-effect'))`,
  },
  {
    name: 'control-unstretched-art',
    expect: 'art',
    script: `document.querySelectorAll('[data-flyer] div[style*="url("]').forEach((el) => (el.style.backgroundSize = 'auto'))`,
  },
  {
    name: 'control-highlighter-slice',
    expect: 'mark',
    script: `document.querySelectorAll('[data-flyer] span[style*="mark-yellow"]').forEach((el) => { el.style.boxDecorationBreak = 'slice'; el.style.webkitBoxDecorationBreak = 'slice'; })`,
  },
];

interface CaptureResult {
  lib: LibName | string;
  dpr: number;
  case: string;
  error?: string;
  ms?: number;
  markLines?: number;
  png?: { width: number; height: number };
  jpg?: { width: number; height: number; quality: number | null };
  metrics?: Metrics;
  pass?: boolean;
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
function jpegQuality(jpg: Buffer): number | null {
  const t = lumaTable(jpg);
  if (!t) return null;
  for (let q = 100; q >= 1; q--) if (ijgTable(q).every((v, i) => v === t[i])) return q;
  return null;
}

/* ---------- pixel maths ---------- */

function fill(mask: Uint8Array, r: Rect, value: 0 | 1, grow = 0) {
  const x0 = Math.max(0, Math.floor(r.left - grow));
  const y0 = Math.max(0, Math.floor(r.top - grow));
  const x1 = Math.min(W, Math.ceil(r.left + r.width + grow));
  const y1 = Math.min(H, Math.ceil(r.top + r.height + grow));
  for (let y = y0; y < y1; y++) mask.fill(value, y * W + Math.max(0, x0), y * W + Math.max(x0, x1));
}

function photoMask(mode: PhotoMode): Uint8Array {
  const m = new Uint8Array(W * H);
  if (mode === 'bleed') fill(m, ACTIVITY.photoBleed, 1);
  if (mode === 'band') fill(m, ACTIVITY.photoBand, 1);
  return m;
}

/** % of differing pixels inside a region (photo band excluded), null when the region is empty. */
function regionPct(diff: Uint8Array, photo: Uint8Array, rects: Rect[], ring?: { out: number; in: number }): number | null {
  if (!rects.length) return null;
  const m = new Uint8Array(W * H);
  for (const r of rects) {
    fill(m, r, 1, ring ? ring.out : 0);
    if (ring) fill(m, { left: r.left + ring.in, top: r.top + ring.in, width: r.width - 2 * ring.in, height: r.height - 2 * ring.in }, 0);
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

function compare(golden: PNG, candidate: PNG, mode: PhotoMode, regions: Regions): { metrics: Metrics; diffImage: PNG } {
  const diffImage = new PNG({ width: W, height: H });
  // Same settings as scripts/compare-design.ts. Anti-aliasing pixels are drawn
  // yellow and not counted; real differences are pure red.
  pixelmatch(golden.data, candidate.data, diffImage.data, W, H, { threshold: 0.1 });
  const diff = new Uint8Array(W * H);
  for (let i = 0; i < diff.length; i++) {
    const p = i * 4;
    diff[i] = diffImage.data[p] === 255 && diffImage.data[p + 1] === 0 && diffImage.data[p + 2] === 0 ? 1 : 0;
  }
  const photo = photoMask(mode);
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
    diffImage,
    metrics: {
      outside: (100 * outBad) / outT,
      inside: inT ? (100 * inBad) / inT : null,
      art: regionPct(diff, photo, regions.art),
      mark: regionPct(diff, photo, regions.mark),
      // A ring along the frame edge: the 5px stroke, not the chip text inside.
      wonky: regionPct(diff, photo, regions.wonky, { out: 6, in: 30 }),
      text: regionPct(diff, photo, regions.text),
    },
  };
}

const ok = (v: number | null) => v == null || v <= THRESHOLD;
const passes = (m: Metrics) => m.outside <= THRESHOLD && ok(m.art) && ok(m.mark) && ok(m.wonky) && ok(m.text);

/* ---------- the fixture: every sample × photo mode, as real saved flyers ---------- */

const data = dataPaths('./test-results/spike-data');
rmSync(data.root, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
for (const f of readdirSync(OUT)) rmSync(join(OUT, f), { recursive: true, force: true });
const db = openDb(data.db);
applySeedFile(db, SEED_FILE);

const photoIds = new Map<string, number>();
async function photoId(file: string): Promise<number> {
  if (!photoIds.has(file)) {
    const stored = await processPhoto(readFileSync(join(FIXTURE_PHOTOS_DIR, file)), data.root);
    photoIds.set(file, insertPhoto(db, stored).id);
  }
  return photoIds.get(file)!;
}

// No sample wraps its WHEN line, so none exercises box-decoration-break:
// clone. This spike-only record does, and keeps every other stress-test worst case.
const stressSample = SAMPLE_FLYERS.find((s) => s.title.startsWith('Long copy'))!;
const wrapSample = structuredClone(stressSample);
wrapSample.title = 'Highlighter wrap';
wrapSample.data.chips = wrapSample.data.chips.map((c) => (c.key === 'when' ? { ...c, value: 'Sat 27/9 & Sun 28/9 · 05:30' } : c));

// Samples without a photo borrow one in bleed/band, as tests/render does.
const borrowed = SAMPLE_FLYERS.find((s) => s.photo)!.photo!;
const cases: { id: number; label: string; slug: string; mode: PhotoMode }[] = [];
for (const s of [...SAMPLE_FLYERS, wrapSample]) {
  for (const mode of MODES) {
    const flyerData = structuredClone(s.data);
    flyerData.photoMode = mode;
    const label = `${s.title} / ${mode}`;
    const id = createFlyer(
      db,
      { title: label, hostel: s.hostel, template: 'activity', data: flyerData, photoId: mode === 'none' ? null : await photoId(s.photo ?? borrowed) },
      s.hostel ? (hostelBySlug(db, s.hostel)?.id ?? null) : null,
    );
    cases.push({ id, label, slug: label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''), mode });
  }
}

const server = createServer(createApp({ db, data, buildId: 'spike' }));
await new Promise<void>((r) => server.listen(PORT, '127.0.0.1', r));
const renderer = createRenderer({ origin: ORIGIN, cacheDir: data.renders, timeoutMs: 60_000 });
const browser: Browser = await chromium.launch();

/* ---------- candidates ---------- */

const OFFSCREEN = '<style>#root{position:fixed;left:-20000px;top:0}</style>';

async function candidateContext(dpr: number): Promise<BrowserContext> {
  // A laptop-sized window: the flyer lives offscreen, like a client exporter's mount.
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: dpr });
  // tsx (esbuild keepNames) wraps the functions we send to page.evaluate in __name().
  await context.addInitScript('window.__name = (f) => f');
  await context.route('**/render.html*', async (route) => {
    const res = await route.fetch();
    route.fulfill({ response: res, body: (await res.text()).replace('</head>', `${OFFSCREEN}</head>`) });
  });
  return context;
}

const withTimeout = <T>(p: Promise<T>, ms: number, what: string) =>
  Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error(`${what}: timed out after ${ms} ms`)), ms))]);

async function capture(
  lib: (typeof LIBS)[number],
  id: number,
  dpr: number,
  tamper: Tamper | null = null,
): Promise<{ png: Buffer; jpg: Buffer; ms: number; regions: Regions; canvas: { width: number; height: number } }> {
  const context = await candidateContext(dpr);
  try {
    const page = await context.newPage();
    await page.goto(`${ORIGIN}/render.html?id=${id}`);
    await page.waitForFunction(() => {
      const w = window as { __FLYER_READY?: boolean; __FLYER_ERROR?: string };
      return w.__FLYER_READY || w.__FLYER_ERROR;
    });
    const err = await page.evaluate(() => (window as { __FLYER_ERROR?: string }).__FLYER_ERROR);
    if (err) throw new Error('render page: ' + err);
    if (tamper) await page.evaluate(tamper.script);
    await page.addScriptTag({ path: join(APP_ROOT, lib.script) });

    const regions = await page.evaluate((): Regions => {
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
        text: ['headline', 'extras', 'ask', 'pill'].flatMap((g) => [...root.querySelectorAll(`[data-group="${g}"]`)].map((el) => rel(el.getBoundingClientRect()))),
      };
    });

    const shot = await withTimeout(
      page.evaluate(async (name) => {
        type Canvasser = (el: HTMLElement) => Promise<HTMLCanvasElement>;
        const g = window as unknown as Record<string, Record<string, (el: HTMLElement, o: object) => Promise<HTMLCanvasElement>>>;
        const libs: Record<string, Canvasser> = {
          snapdom: (el) => g.snapdom.toCanvas(el, { dpr: 1, scale: 1 }),
          'modern-screenshot': (el) => g.modernScreenshot.domToCanvas(el, { scale: 1 }),
          'html-to-image': (el) => g.htmlToImage.toCanvas(el, { pixelRatio: 1 }),
        };
        const el = document.querySelector<HTMLElement>('[data-flyer]')!;
        const t0 = performance.now();
        const canvas = await libs[name](el);
        const ms = performance.now() - t0;
        const blob = (type: string, q?: number) =>
          new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('toBlob returned null'))), type, q));
        const b64 = async (b: Blob) => {
          const bytes = new Uint8Array(await b.arrayBuffer());
          let s = '';
          for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
          return btoa(s);
        };
        return { ms, canvas: { width: canvas.width, height: canvas.height }, png: await b64(await blob('image/png')), jpg: await b64(await blob('image/jpeg', 0.9)) };
      }, lib.name),
      120_000,
      lib.name,
    );
    return { png: Buffer.from(shot.png, 'base64'), jpg: Buffer.from(shot.jpg, 'base64'), ms: shot.ms, regions, canvas: shot.canvas };
  } finally {
    await context.close();
  }
}

async function measure(
  lib: (typeof LIBS)[number],
  c: (typeof cases)[number],
  dpr: number,
  golden: PNG,
  opts: { tamper?: Tamper; save?: boolean } = {},
): Promise<CaptureResult> {
  const result: CaptureResult = { lib: opts.tamper?.name ?? lib.name, dpr, case: c.label };
  try {
    const shot = await capture(lib, c.id, dpr, opts.tamper ?? null);
    result.ms = Math.round(shot.ms);
    result.markLines = shot.regions.markLines;
    const png = PNG.sync.read(shot.png);
    const jpgMeta = await sharp(shot.jpg).metadata();
    result.png = { width: png.width, height: png.height };
    result.jpg = { width: jpgMeta.width!, height: jpgMeta.height!, quality: jpegQuality(shot.jpg) };
    if (png.width !== W || png.height !== H) throw new Error(`captured ${png.width}×${png.height}, canvas ${shot.canvas.width}×${shot.canvas.height}`);
    const { metrics, diffImage } = compare(golden, png, c.mode, shot.regions);
    result.metrics = metrics;
    result.pass = passes(metrics) && result.jpg.width === W && result.jpg.height === H && result.jpg.quality === 90;
    if (opts.save || !result.pass) {
      const dir = join(OUT, String(result.lib));
      mkdirSync(dir, { recursive: true });
      const tag = `${c.slug}@${dpr}x`;
      writeFileSync(join(dir, `${tag}-candidate.png`), shot.png);
      writeFileSync(join(dir, `${tag}-diff.png`), PNG.sync.write(diffImage));
    }
  } catch (e) {
    result.error = e instanceof Error ? e.message : String(e);
    result.pass = false;
  }
  return result;
}

/* ---------- run ---------- */

const results: CaptureResult[] = [];
const goldenJpg: { case: string; width: number; height: number; quality: number | null }[] = [];
mkdirSync(join(OUT, 'golden'), { recursive: true });

try {
  for (const c of cases) {
    const key = `spike-${c.id}`;
    const goldenPngFile = (await renderer.render(c.id, 'png', key)).file;
    const goldenJpgFile = (await renderer.render(c.id, 'jpg', key)).file;
    copyFileSync(goldenPngFile, join(OUT, 'golden', `${c.slug}.png`));
    const golden = PNG.sync.read(readFileSync(goldenPngFile));
    const gj = readFileSync(goldenJpgFile);
    const gm = await sharp(gj).metadata();
    goldenJpg.push({ case: c.label, width: gm.width!, height: gm.height!, quality: jpegQuality(gj) });

    for (const lib of LIBS) {
      for (const dpr of DPRS) {
        const r = await measure(lib, c, dpr, golden, { save: dpr === 1 });
        results.push(r);
        const m = r.metrics;
        console.log(
          `${c.label.padEnd(34)} ${lib.name.padEnd(18)} @${dpr}x  ` +
            (r.error ? `ERROR ${r.error}` : `${m!.outside.toFixed(3)}% outside  ${r.pass ? 'pass' : 'FAIL'}  ${r.ms} ms`),
        );
      }
    }
  }

  // Negative controls: break each feature in the page and capture as usual.
  // Each must fail its own check, or that check is blind. The wrap record in
  // band mode carries every feature (wrapped WHEN line, chips, band frame).
  const stress = cases.find((c) => c.label === 'Highlighter wrap / band')!;
  const stressGolden = PNG.sync.read(readFileSync(join(OUT, 'golden', `${stress.slug}.png`)));
  for (const tamper of CONTROLS) {
    const r = await measure(LIBS[0], stress, 1, stressGolden, { tamper, save: true });
    results.push(r);
    console.log(`${tamper.name.padEnd(28)} ${tamper.expect} ${r.error ? 'ERROR ' + r.error : `${r.metrics![tamper.expect]?.toFixed(2)}%`}`);
  }
} finally {
  await browser.close();
  await renderer.close();
  server.close();
  db.close();
}

/* ---------- report ---------- */

const pkgVersion = (pkg: string) => (JSON.parse(readFileSync(join(APP_ROOT, 'node_modules', pkg, 'package.json'), 'utf8')) as { version: string }).version;
const chromiumVersion = await (async () => {
  const b = await chromium.launch();
  const v = b.version();
  await b.close();
  return v;
})();
const fmt = (v: number | null | undefined, digits = 3) => (v == null ? '—' : v.toFixed(digits));
const mark = (v: number | null | undefined) => (v == null ? '—' : v <= THRESHOLD ? '✓' : `✗ ${v.toFixed(2)}`);
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : NaN;
};

const lines: string[] = [];
lines.push('# Client-export spike — raw results', '');
lines.push(`Chromium ${chromiumVersion} · threshold ${THRESHOLD}% · pixelmatch threshold 0.1 (anti-aliasing not counted)`);
lines.push(`Libraries: ${LIBS.map((l) => `${l.pkg} ${pkgVersion(l.pkg)}`).join(' · ')}`, '');
lines.push('## Summary', '');
lines.push('| Library | DPR | Cases passing | Worst % outside band | Art | Highlighter | Wonky | Fonts | 1080×1920 | JPG q90 | Median ms |');
lines.push('|---|---|---|---|---|---|---|---|---|---|---|');
for (const lib of LIBS) {
  for (const dpr of DPRS) {
    const rs = results.filter((r) => r.lib === lib.name && r.dpr === dpr);
    const ms = rs.filter((r) => r.metrics);
    const worst = (k: keyof Metrics) => {
      const vs = ms.map((r) => r.metrics![k]).filter((v): v is number => v != null);
      return vs.length ? Math.max(...vs) : null;
    };
    const sizeOk = rs.every((r) => r.png?.width === W && r.png?.height === H && r.jpg?.width === W && r.jpg?.height === H);
    const q90 = rs.every((r) => r.jpg?.quality === 90);
    lines.push(
      `| ${lib.name} | ${dpr} | ${rs.filter((r) => r.pass).length}/${rs.length}${rs.some((r) => r.error) ? ` (${rs.filter((r) => r.error).length} errors)` : ''} | ${fmt(worst('outside'))} | ${mark(worst('art'))} | ${mark(worst('mark'))} | ${mark(worst('wonky'))} | ${mark(worst('text'))} | ${sizeOk ? '✓' : '✗'} | ${q90 ? '✓' : '✗'} | ${Math.round(median(ms.map((r) => r.ms!)))} |`,
    );
  }
}
lines.push('', `Golden JPGs (server export): ${goldenJpg.every((g) => g.width === W && g.height === H) ? 'all 1080×1920' : 'SIZE MISMATCH'}, quality ${[...new Set(goldenJpg.map((g) => g.quality))].join('/')}.`);
lines.push(`WHEN highlighter lines per case: ${[...new Set(cases.map((c) => `${c.label.split(' / ')[0]} ${results.find((r) => r.case === c.label && r.markLines != null)?.markLines ?? '?'}`))].join(' · ')}.`);
lines.push('', `## Negative controls (${LIBS[0].name} @1x, Highlighter wrap / band)`, '');
lines.push('Each control breaks one feature in the page before capture. Its check must fail, or the check is blind.', '');
lines.push('| Control | Check | % differing in its region | Caught |', '|---|---|---|---|');
for (const t of CONTROLS) {
  const r = results.find((x) => x.lib === t.name)!;
  const v = r.metrics?.[t.expect];
  lines.push(`| ${t.name} | ${t.expect} | ${r.error ? 'error: ' + r.error : fmt(v, 2)} | ${r.error ? '—' : v != null && v > THRESHOLD ? 'yes' : '**NO — blind**'} |`);
}
lines.push('');

lines.push('## Per case — % differing pixels outside the photo band (inside the band in brackets)', '');
lines.push(`| Case | ${LIBS.flatMap((l) => DPRS.map((d) => `${l.name} @${d}x`)).join(' | ')} |`);
lines.push(`|---|${LIBS.flatMap(() => DPRS.map(() => '---')).join('|')}|`);
for (const c of cases) {
  const cells = LIBS.flatMap((l) =>
    DPRS.map((d) => {
      const r = results.find((x) => x.lib === l.name && x.dpr === d && x.case === c.label)!;
      if (r.error) return `error`;
      const m = r.metrics!;
      return `${r.pass ? '' : '**'}${fmt(m.outside)}${m.inside != null ? ` (${fmt(m.inside, 2)})` : ''}${r.pass ? '' : '**'}`;
    }),
  );
  lines.push(`| ${c.label} | ${cells.join(' | ')} |`);
}

lines.push('', '## Failures in detail', '');
for (const r of results.filter((x) => !x.pass && !x.lib.startsWith('control-'))) {
  const m = r.metrics;
  lines.push(
    `- ${r.lib} @${r.dpr}x · ${r.case}: ` +
      (r.error
        ? `error: ${r.error}`
        : `outside ${fmt(m!.outside)}% · art ${fmt(m!.art, 2)} · highlighter ${fmt(m!.mark, 2)} · wonky ${fmt(m!.wonky, 2)} · fonts ${fmt(m!.text, 2)} · jpg q${r.jpg?.quality ?? '?'}`),
  );
}

writeFileSync(join(OUT, 'results.json'), JSON.stringify({ threshold: THRESHOLD, chromium: chromiumVersion, goldenJpg, results }, null, 2));
writeFileSync(join(OUT, 'report.md'), lines.join('\n') + '\n');
console.log(`\nReport: ${join(OUT, 'report.md')}`);
