import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import type { APIRequestContext, BrowserContext, Page } from '@playwright/test';
import { KIT_URL, expect, test } from '../browser';
import { PNG } from 'pngjs';
import { PROTOTYPE_DOODLES } from '../../src/shared/defaults';
import { CANVASES, CANVAS_IDS, type CanvasId, type Rect } from '../../src/shared/layout';
import { SAMPLE_FLYERS } from '../../src/shared/samples';
import type { Colors, Crop, DoodlePlacement, FlyerData, FlyerListItem, FlyerPayload, FlyerSaved } from '../../src/shared/schema';
import { WRITE_HEADERS } from '../../src/shared/writeGuard';
import { bodiesOf, highlighterWrapSample } from './pixels';

/* Opt-in pixel baseline of every canvas: proof that a change leaves the
   drawing exactly as it was. fidelity.spec holds the client export to the server
   one *of the same code*, so a change made to both passes it; this holds the
   server export to PNGs captured before the change. Nothing is committed:

     RENDER_BASELINE=capture RENDER_BASELINE_DIR=<folder>  npx playwright test tests/render/baseline.spec.ts   (before)
     RENDER_BASELINE=check   RENDER_BASELINE_DIR=<folder>  npx playwright test tests/render/baseline.spec.ts   (after)

   Run `npm run build` first. The cases are every sample as the render suites
   draw it (each Activity sample in each photo mode, each week sample once, with
   no photo), the highlighter wrap, a few Pool party variants, and flyers with
   colours of their own. Each case is shot on every canvas: the export and the
   safe-zone overlay.

   A capture names its folder (never test-results/, which Playwright empties),
   and lists its cases and canvases in manifest.json once the last shot is in, so
   a capture that fails half-way leaves no list. A check compares every listed
   case on every listed canvas, and skips, by name, a case or a canvas the list
   lacks (one added since); a listed case whose PNG is missing fails, and the
   check goes on. The story keeps the file names it had when it was the only
   canvas, and a list without canvases is a capture of the story alone, so a
   capture from then still checks the story. A folder captured before the list
   existed (captured-from.txt) is checked where it has the case's PNGs; capture
   again for a strict check. No capture at all fails at once, and so does a check
   that compared nothing. A check renders the story with the default canvas and
   again with canvas: 'story' when the server knows canvases, every other canvas
   by name, and wants byte-identical RGBA. */

const MODE = process.env.RENDER_BASELINE as 'capture' | 'check' | undefined;
const DIR = process.env.RENDER_BASELINE_DIR || join(tmpdir(), 'nest-story-baseline');
const MODES = ['bleed', 'band', 'none'] as const;
/** The case list a capture writes after its last shot. */
const LIST = join(DIR, 'manifest.json');
/** What a capture wrote before the list: the commit alone. */
const LEGACY = join(DIR, 'captured-from.txt');

test.skip(!MODE, 'opt-in: set RENDER_BASELINE=capture|check');

/** Canvas-anchored art all over the canvas: top, middle, bottom, off both edges. */
const CUSTOM_ART: DoodlePlacement[] = [
  { slug: 'spark-teal', x: -40, y: 120, w: 104, rot: 12 },
  { slug: 'blob-yellow', x: 1000, y: 960, w: 200, rot: 0 },
  { slug: 'icon-clock', x: 300, y: 1300, w: 74, rot: -9, flipX: true, opacity: 0.8 },
  { slug: 'blob-teal', x: 500, y: 1800, w: 290, rot: 0 },
];

/* Colours of a flyer's own, none of them a default. The renderer reads a flyer's ink, accent and ground from the
   flyer: without these cases, a change that read them from anywhere else would pass on every sample, which all
   carry the defaults. The week flyer is here because its rows read them in code of their own. */
const OWN_COLORS: Colors = { bg: '#EEF3E2', ink: '#2B1D3A', accent: '#7A2E5C', mark: '#7FB800' };

interface Case {
  name: string;
  title: string;
  hostel: string | null;
  data: FlyerData;
  photo: boolean;
}

function cases(): Case[] {
  const out: Case[] = [];
  // bodiesOf gives the photo modes in MODES' order, so an Activity case keeps the name older captures gave it.
  for (const s of [...SAMPLE_FLYERS, highlighterWrapSample()]) {
    for (const body of bodiesOf(s.data)) {
      const base = { name: `${s.title} - ${body}`, title: s.title, hostel: s.hostel };
      out.push(body === 'week' ? { ...base, data: s.data, photo: false } : { ...base, data: { ...s.data, photoMode: body }, photo: body !== 'none' });
    }
  }
  const pool = SAMPLE_FLYERS.find((s) => s.title === 'Pool party')!;
  const variant = (name: string, patch: Partial<FlyerData>) =>
    MODES.map((mode) => ({ name: `${name} - ${mode}`, title: pool.title, hostel: pool.hostel, data: { ...pool.data, ...patch, photoMode: mode }, photo: mode !== 'none' }));
  out.push(...variant('prototype art', { doodles: PROTOTYPE_DOODLES }));
  out.push(...variant('custom art', { doodles: CUSTOM_ART }));
  const crop = (name: string, mode: 'bleed' | 'band', photoCrop: Crop) =>
    out.push({ name: `${name} - ${mode}`, title: pool.title, hostel: pool.hostel, data: { ...pool.data, photoMode: mode, photoCrop }, photo: true });
  crop('crop zoomed out', 'band', { x: 0.3, y: 0.7, zoom: 0.6 });
  crop('crop zoomed in', 'bleed', { x: 0.8, y: 0.2, zoom: 2.5 });
  out.push(...variant('own colours', { colors: OWN_COLORS }));
  const week = SAMPLE_FLYERS.find((s) => s.title === 'This week · Duque Nest')!;
  out.push({ name: 'own colours - week', title: week.title, hostel: week.hostel, data: { ...week.data, colors: OWN_COLORS }, photo: false });
  return out;
}

async function photoId(request: APIRequestContext): Promise<number> {
  const list = (await (await request.get('/api/flyers')).json()) as FlyerListItem[];
  const pool = list.find((f) => f.title === 'Pool party')!;
  const payload = (await (await request.get(`/api/flyers/${pool.id}`)).json()) as FlyerPayload;
  return payload.photo!.id;
}

const file = (name: string, variant = '') => join(DIR, `${name.replace(/[^\w.-]+/g, '_')}${variant}.png`);

/** A case's name on a canvas: the story keeps the names it had when it was the only canvas. */
const onCanvas = (name: string, canvas: CanvasId) => (canvas === 'story' ? name : `${name}.${canvas}`);

/** How a canvas is asked for. The story is what a request that names no canvas gets (the contract), so it is
    captured that way, as before canvases, and checked that way and by name. Every other canvas is asked by name. */
const askedFor = (canvas: CanvasId): { variant: string; canvas?: CanvasId }[] =>
  canvas === 'story' ? [{ variant: '' }, { variant: '.story', canvas: 'story' }] : [{ variant: '', canvas }];

/** A shot of the wrong size would still be captured, and checked against itself: each one is held to its canvas. */
function sized(canvas: CanvasId, name: string, shoot: () => Promise<Buffer>): () => Promise<Buffer> {
  return async () => {
    const shot = await shoot();
    const { width, height } = PNG.sync.read(shot);
    expect({ width, height }, `${name} on the ${canvas} canvas`).toEqual({ width: CANVASES[canvas].width, height: CANVASES[canvas].height });
    return shot;
  };
}

interface Difference {
  message: string;
  pixels: number;
  /** Box around every differing pixel; null when the sizes differ. */
  box: Rect | null;
}

/** null when the two PNGs are byte-identical in size and RGBA, else how and where they differ. */
function differs(expected: Buffer, actual: Buffer): Difference | null {
  const a = PNG.sync.read(expected);
  const b = PNG.sync.read(actual);
  if (a.width !== b.width || a.height !== b.height) return { message: `${b.width}×${b.height}, baseline ${a.width}×${a.height}`, pixels: Infinity, box: null };
  if (a.data.equals(b.data)) return null;
  let [x0, y0, x1, y1, n] = [Infinity, Infinity, -1, -1, 0];
  for (let i = 0; i < a.data.length; i += 4) {
    if (a.data.readUInt32BE(i) === b.data.readUInt32BE(i)) continue;
    const x = (i / 4) % a.width;
    const y = Math.floor(i / 4 / a.width);
    [x0, y0, x1, y1, n] = [Math.min(x0, x), Math.min(y0, y), Math.max(x1, x), Math.max(y1, y), n + 1];
  }
  return { message: `${n} pixels differ in ${x0}..${x1} × ${y0}..${y1}`, pixels: n, box: { left: x0, top: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 } };
}

/* Chrome now and then draws a small image or a frame stroke with different
   anti-aliasing: the WHEN chip's calendar icon (324 px in a 31 × 30 box) and a
   chip frame's edge (54 px in 32 × 27), on random cases, on unchanged code. So
   a capture keeps a render only once another one agrees with it, and a check
   renders again, up to three times, only while the difference is that small and
   that local. Anything bigger fails at once, and a real change, being
   deterministic, differs in every render. */
const TRIES = 3;

const flake = (d: Difference) => d.box !== null && d.pixels <= 1000 && d.box.width <= 64 && d.box.height <= 64;

/** A capture keeps a render once another agrees with it byte for byte, rendering up to five times. */
const CAPTURE_TRIES = 5;

/* The overlays are shot from a context of their own, with no route in it. The fixture's context blocks the nav kit
   with a route, and a route makes Playwright intercept every request, the flyer's images included: the timing that
   adds changed how Chrome rasterised a chip frame's edge, the WHEN calendar icon and the corner sparks from one load
   to the next (on 20 of 32 cases across three passes; with no route, on none, 2026-09-30). The server's exporter
   installs no route, which is why the exports held. render.html never loads the kit, and the test checks that. */
const KIT_PATH = new URL(KIT_URL).pathname;

async function capture(name: string, shoot: () => Promise<Buffer>): Promise<Buffer> {
  const shots: Buffer[] = [];
  for (let i = 0; i < CAPTURE_TRIES; i++) {
    const shot = await shoot();
    if (shots.some((s) => s.equals(shot))) return shot;
    shots.push(shot);
  }
  const how = shots.slice(1).map((s, i) => `render ${i + 2}: ${differs(shots[0], s)?.message}`);
  throw new Error(`${name}: no two of ${CAPTURE_TRIES} renders agree, so the baseline would not be stable. Against render 1, ${how.join('; ')}`);
}

async function check(name: string, variant: string, shoot: () => Promise<Buffer>): Promise<string | null> {
  const expected = readFileSync(file(name));
  for (let i = 0; i < TRIES; i++) {
    const actual = await shoot();
    const d = differs(expected, actual);
    if (!d) return null;
    if (flake(d) && i < TRIES - 1) continue;
    writeFileSync(file(name, `${variant}.actual`), actual);
    return `${name}${variant}: ${d.message} (render ${i + 1}, written next to the baseline)`;
  }
  return null;
}

/** Which code a baseline was captured from, so a check says what it compares. */
const source = () => {
  const commit = execSync('git rev-parse --short HEAD').toString().trim();
  const dirty = execSync('git status --porcelain --untracked-files=no').toString().trim() !== '';
  return `${commit}${dirty ? ' + uncommitted changes' : ''}`;
};

interface Manifest {
  capturedFrom: string;
  /** Absent from a capture made when the story was the only canvas. */
  canvases?: CanvasId[];
  cases: string[];
}

/** What a check holds the renders to: a capture, its canvases, and its case list, which a folder from before the
    list lacks (null). */
type Capture = { from: string; canvases: Set<string>; cases: Set<string> | null };

function readCapture(): Capture | null {
  if (existsSync(LIST)) {
    const m = JSON.parse(readFileSync(LIST, 'utf8')) as Manifest;
    return { from: m.capturedFrom, canvases: new Set(m.canvases ?? ['story']), cases: new Set(m.cases) };
  }
  if (existsSync(LEGACY)) return { from: readFileSync(LEGACY, 'utf8').trim(), canvases: new Set(['story']), cases: null };
  return null;
}

test('baseline: every case renders byte-identical to the captured PNGs, on every canvas', async ({ request, browser, baseURL }) => {
  test.setTimeout(1_800_000);
  // A context for each canvas, at its size: the story's is the one every capture before canvases was shot from.
  const overlays: BrowserContext[] = [];
  const pages = new Map<CanvasId, Page>();
  const kit: string[] = [];
  for (const canvas of CANVAS_IDS) {
    const { width, height } = CANVASES[canvas];
    const context = await browser.newContext({ baseURL, viewport: { width, height }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    page.on('request', (r) => {
      if (r.url().includes(KIT_PATH)) kit.push(r.url());
    });
    overlays.push(context);
    pages.set(canvas, page);
  }
  const held = MODE === 'check' ? readCapture() : null;
  if (MODE === 'capture') {
    // A capture relabels its folder, so it never falls back to the default one, which may hold an older capture.
    expect(process.env.RENDER_BASELINE_DIR, 'a capture names its folder: set RENDER_BASELINE_DIR').toBeTruthy();
    mkdirSync(DIR, { recursive: true });
    rmSync(LIST, { force: true });
    rmSync(LEGACY, { force: true });
  } else {
    expect(held, `no capture in ${DIR}: run RENDER_BASELINE=capture first`).not.toBeNull();
  }
  const from = source();
  if (held) console.log(`Checking ${from} against the baseline captured from ${held.from}`);
  const photo = await photoId(request);
  const problems: string[] = [];
  const done: string[] = [];
  /** Skipped cases by reason: a folder from before the list skips many for one reason. */
  const skipped = new Map<string, string[]>();
  for (const c of cases()) {
    await test.step(c.name, async (step) => {
      const filesOf = (canvas: CanvasId) => [file(onCanvas(c.name, canvas)), file(`${onCanvas(c.name, canvas)}.safe`)];
      let canvases = [...CANVAS_IDS];
      if (held) {
        // A case the list lacks was added after the capture. A folder from before the list can only say it has no PNGs.
        const absent = held.cases ? !held.cases.has(c.name) : filesOf('story').every((f) => !existsSync(f));
        if (absent) {
          const reason = held.cases
            ? `not in the capture from ${held.from}`
            : `no PNGs in the capture from ${held.from}, which has no case list (capture again for a strict check)`;
          skipped.set(reason, [...(skipped.get(reason) ?? []), c.name]);
          step.skip(true, reason);
        }
        // A canvas the list lacks was added after the capture, or the capture is from when the story was the only one.
        for (const canvas of canvases.filter((canvas) => !held.canvases.has(canvas))) {
          const reason = `no ${canvas} canvas in the capture from ${held.from}`;
          skipped.set(reason, [...(skipped.get(reason) ?? []), c.name]);
        }
        canvases = canvases.filter((canvas) => held.canvases.has(canvas));
        const missing = canvases.flatMap(filesOf).filter((f) => !existsSync(f));
        if (missing.length) {
          problems.push(`${c.name}: ${missing.map((f) => basename(f)).join(', ')} missing from the capture`);
          return;
        }
      }

      const input = { title: `baseline-${c.name}`, hostel: c.hostel, template: c.data.template, data: c.data, photoId: c.photo ? photo : null };
      const saved = (await (await request.post('/api/flyers', { headers: WRITE_HEADERS, data: input })).json()) as FlyerSaved;

      // The export, as the editor's server exporter asks for it. Saving the flyer
      // again empties its render cache, so every shot is a fresh render.
      const exportPng = (body: Record<string, unknown>) => async () => {
        expect((await request.put(`/api/flyers/${saved.id}`, { headers: WRITE_HEADERS, data: input })).status()).toBe(200);
        const res = await request.post(`/api/render/${saved.id}`, { headers: WRITE_HEADERS, data: body });
        expect(res.status(), c.name).toBe(200);
        return res.body();
      };
      // The safe-zone overlay (editor chrome, never exported), from the render page, in the canvas's own context.
      const overlay = (canvas: CanvasId, query: string) => async () => {
        const page = pages.get(canvas)!;
        await page.goto(`/render.html?id=${saved.id}&safe=1${query}`);
        await page.waitForFunction(() => {
          const w = window as { __FLYER_READY?: boolean; __FLYER_ERROR?: string };
          return w.__FLYER_READY || w.__FLYER_ERROR;
        });
        const { width, height } = CANVASES[canvas];
        return page.screenshot({ clip: { x: 0, y: 0, width, height }, animations: 'disabled', caret: 'hide', scale: 'css' });
      };

      for (const canvas of canvases) {
        const name = onCanvas(c.name, canvas);
        const [exportFile, overlayFile] = filesOf(canvas);
        const asked = askedFor(canvas);
        const body = (a: (typeof asked)[number]) => (a.canvas ? { format: 'png', canvas: a.canvas } : { format: 'png' });
        const query = (a: (typeof asked)[number]) => (a.canvas ? `&canvas=${a.canvas}` : '');
        if (MODE === 'capture') {
          writeFileSync(exportFile, await capture(name, sized(canvas, name, exportPng(body(asked[0])))));
          writeFileSync(overlayFile, await capture(`${name}.safe`, sized(canvas, `${name}.safe`, overlay(canvas, query(asked[0])))));
        } else {
          // The story with no canvas named and by name (a server that has no canvases ignores the name); the others by name.
          for (const a of asked) problems.push((await check(name, a.variant, exportPng(body(a)))) ?? '');
          for (const a of asked) problems.push((await check(`${name}.safe`, a.variant, overlay(canvas, query(a)))) ?? '');
        }
      }
      done.push(c.name);
      await request.delete(`/api/flyers/${saved.id}`, { headers: WRITE_HEADERS });
    });
  }
  for (const context of overlays) await context.close();
  expect(kit, 'the render page asked for the nav kit, which its unrouted context would fetch').toEqual([]);
  if (MODE === 'capture') {
    writeFileSync(LIST, JSON.stringify({ capturedFrom: from, canvases: CANVAS_IDS, cases: done } satisfies Manifest, null, 2) + '\n');
    console.log(`Captured ${done.length} cases on ${CANVAS_IDS.join(' and ')} from ${from} into ${DIR}`);
    return;
  }
  // The list reporter prints stdout, never a step's skip reason: this line says what the check covered.
  const skips = [...skipped].map(([reason, names]) => `${reason}, ${names.length}: ${names.join(', ')}`);
  console.log(`Baseline ${DIR}: ${done.length} compared, ${[...skipped.values()].flat().length} skipped${skips.length ? ` (${skips.join('; ')})` : ''}`);
  expect(problems.filter(Boolean), `baseline in ${DIR}`).toEqual([]);
  expect(done.length, `nothing compared against ${DIR}`).toBeGreaterThan(0);
});
