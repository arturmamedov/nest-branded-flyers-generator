import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import type { APIRequestContext } from '@playwright/test';
import { expect, test } from '../browser';
import { PNG } from 'pngjs';
import { PROTOTYPE_DOODLES } from '../../src/shared/defaults';
import type { Rect } from '../../src/shared/layout';
import { SAMPLE_FLYERS } from '../../src/shared/samples';
import type { Crop, DoodlePlacement, FlyerData, FlyerListItem, FlyerPayload, FlyerSaved } from '../../src/shared/schema';
import { WRITE_HEADERS } from '../../src/shared/writeGuard';
import { bodiesOf, highlighterWrapSample } from './pixels';

/* Opt-in pixel baseline of the story canvas: proof that a change leaves the
   story exactly as it was. fidelity.spec holds the client export to the server
   one *of the same code*, so a change made to both passes it; this holds the
   server export to PNGs captured before the change. Nothing is committed:

     RENDER_BASELINE=capture RENDER_BASELINE_DIR=<folder>  npx playwright test tests/render/baseline.spec.ts   (before)
     RENDER_BASELINE=check   RENDER_BASELINE_DIR=<folder>  npx playwright test tests/render/baseline.spec.ts   (after)

   Run `npm run build` first. The cases are every sample as the render suites
   draw it (each Activity sample in each photo mode, each week sample once, with
   no photo), the highlighter wrap, and a few Pool party variants.

   A capture names its folder (never test-results/, which Playwright empties),
   and lists its cases in manifest.json once the last shot is in, so a capture
   that fails half-way leaves no list. A check compares every listed case, and
   skips, by name, a case the list lacks (one added since); a listed case whose
   PNG is missing fails, and the check goes on. A folder captured before the list
   existed (captured-from.txt) is checked where it has the case's PNGs; capture
   again for a strict check. No capture at all fails at once, and so does a check
   that compared nothing. A check renders every case with the default canvas and
   again with canvas: 'story' when the server knows canvases, and wants
   byte-identical RGBA. */

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
  return out;
}

async function photoId(request: APIRequestContext): Promise<number> {
  const list = (await (await request.get('/api/flyers')).json()) as FlyerListItem[];
  const pool = list.find((f) => f.title === 'Pool party')!;
  const payload = (await (await request.get(`/api/flyers/${pool.id}`)).json()) as FlyerPayload;
  return payload.photo!.id;
}

const file = (name: string, variant = '') => join(DIR, `${name.replace(/[^\w.-]+/g, '_')}${variant}.png`);

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

/** A capture renders until two renders agree byte for byte: the safe-zone overlay can take more than three on this
    machine (two captures in a row failed at three, 2026-09-30). */
const CAPTURE_TRIES = 5;

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
  cases: string[];
}

/** What a check holds the renders to: a capture and its case list, which a folder from before the list lacks (null). */
type Capture = { from: string; cases: Set<string> | null };

function readCapture(): Capture | null {
  if (existsSync(LIST)) {
    const m = JSON.parse(readFileSync(LIST, 'utf8')) as Manifest;
    return { from: m.capturedFrom, cases: new Set(m.cases) };
  }
  if (existsSync(LEGACY)) return { from: readFileSync(LEGACY, 'utf8').trim(), cases: null };
  return null;
}

test('story baseline: every case renders byte-identical to the captured PNGs', async ({ request, page }) => {
  test.setTimeout(1_200_000);
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
      const files = [file(c.name), file(`${c.name}.safe`)];
      if (held) {
        const missing = files.filter((f) => !existsSync(f));
        // A case the list lacks was added after the capture. A folder from before the list can only say it has no PNGs.
        const absent = held.cases ? !held.cases.has(c.name) : missing.length === files.length;
        if (absent) {
          const reason = held.cases
            ? `not in the capture from ${held.from}`
            : `no PNGs in the capture from ${held.from}, which has no case list (capture again for a strict check)`;
          skipped.set(reason, [...(skipped.get(reason) ?? []), c.name]);
          step.skip(true, reason);
        }
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
      // The safe-zone overlay (editor chrome, never exported), from the render page.
      const overlay = (query: string) => async () => {
        await page.goto(`/render.html?id=${saved.id}&safe=1${query}`);
        await page.waitForFunction(() => {
          const w = window as { __FLYER_READY?: boolean; __FLYER_ERROR?: string };
          return w.__FLYER_READY || w.__FLYER_ERROR;
        });
        return page.screenshot({ clip: { x: 0, y: 0, width: 1080, height: 1920 }, animations: 'disabled', caret: 'hide', scale: 'css' });
      };

      if (MODE === 'capture') {
        writeFileSync(files[0], await capture(c.name, exportPng({ format: 'png' })));
        writeFileSync(files[1], await capture(`${c.name}.safe`, overlay('')));
      } else {
        // The default canvas, and the story asked for by name (ignored by a server that has no canvases).
        problems.push(
          (await check(c.name, '', exportPng({ format: 'png' }))) ?? '',
          (await check(c.name, '.story', exportPng({ format: 'png', canvas: 'story' }))) ?? '',
          (await check(`${c.name}.safe`, '', overlay(''))) ?? '',
          (await check(`${c.name}.safe`, '.story', overlay('&canvas=story'))) ?? '',
        );
      }
      done.push(c.name);
      await request.delete(`/api/flyers/${saved.id}`, { headers: WRITE_HEADERS });
    });
  }
  if (MODE === 'capture') {
    writeFileSync(LIST, JSON.stringify({ capturedFrom: from, cases: done } satisfies Manifest, null, 2) + '\n');
    console.log(`Captured ${done.length} cases from ${from} into ${DIR}`);
    return;
  }
  // The list reporter prints stdout, never a step's skip reason: this line says what the check covered.
  const skips = [...skipped].map(([reason, names]) => `${reason}, ${names.length}: ${names.join(', ')}`);
  console.log(`Baseline ${DIR}: ${done.length} compared, ${[...skipped.values()].flat().length} skipped${skips.length ? ` (${skips.join('; ')})` : ''}`);
  expect(problems.filter(Boolean), `baseline in ${DIR}`).toEqual([]);
  expect(done.length, `nothing compared against ${DIR}`).toBeGreaterThan(0);
});
