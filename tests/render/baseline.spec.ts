import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type APIRequestContext } from '@playwright/test';
import { PNG } from 'pngjs';
import { PROTOTYPE_DOODLES } from '../../src/shared/defaults';
import type { Rect } from '../../src/shared/layout';
import { SAMPLE_FLYERS } from '../../src/shared/samples';
import type { Crop, DoodlePlacement, FlyerData, FlyerListItem, FlyerPayload, FlyerSaved } from '../../src/shared/schema';
import { highlighterWrapSample } from './pixels';

/* Opt-in pixel baseline of the story canvas: proof that a refactor leaves the
   story exactly as it was. fidelity.spec holds the client export to the server
   one *of the same code*, so a change made to both passes it; this holds the
   server export to PNGs captured before the change. Nothing is committed:

     RENDER_BASELINE=capture  npx playwright test tests/render/baseline.spec.ts   (on the old commit)
     RENDER_BASELINE=check    npx playwright test tests/render/baseline.spec.ts   (after the change)

   Run `npm run build` first. RENDER_BASELINE_DIR picks the folder (default: the
   OS temp dir), never test-results/, which Playwright empties. A check renders
   every case with the default canvas and again with canvas: 'story' when the
   server knows canvases, and wants byte-identical RGBA. */

const MODE = process.env.RENDER_BASELINE as 'capture' | 'check' | undefined;
const DIR = process.env.RENDER_BASELINE_DIR || join(tmpdir(), 'nest-story-baseline');
const HDR = { 'X-Nest-Flyers': '1' };
const MODES = ['bleed', 'band', 'none'] as const;

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
  for (const s of [...SAMPLE_FLYERS, highlighterWrapSample()]) {
    for (const mode of MODES) out.push({ name: `${s.title} - ${mode}`, title: s.title, hostel: s.hostel, data: { ...s.data, photoMode: mode }, photo: mode !== 'none' });
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
   a capture keeps the one of three renders another one agrees with, and a check
   renders again, up to three times, only while the difference is that small and
   that local. Anything bigger fails at once, and a real change, being
   deterministic, differs in every render. */
const TRIES = 3;

const flake = (d: Difference) => d.box !== null && d.pixels <= 1000 && d.box.width <= 64 && d.box.height <= 64;

async function capture(name: string, shoot: () => Promise<Buffer>): Promise<Buffer> {
  const shots: Buffer[] = [];
  for (let i = 0; i < TRIES; i++) shots.push(await shoot());
  const agreed = shots.find((s, i) => shots.some((t, j) => j !== i && t.equals(s)));
  if (!agreed) throw new Error(`${name}: no two of ${TRIES} renders agree; the baseline would not be stable`);
  return agreed;
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

test('story baseline: every case renders byte-identical to the captured PNGs', async ({ request, page }) => {
  test.setTimeout(1_200_000);
  mkdirSync(DIR, { recursive: true });
  const manifest = join(DIR, 'captured-from.txt');
  if (MODE === 'capture') writeFileSync(manifest, source());
  else console.log(`Checking ${source()} against the baseline captured from ${existsSync(manifest) ? readFileSync(manifest, 'utf8') : 'an unknown commit'}`);
  const photo = await photoId(request);
  const problems: string[] = [];
  for (const c of cases()) {
    const input = { title: `baseline-${c.name}`, hostel: c.hostel, template: 'activity', data: c.data, photoId: c.photo ? photo : null };
    const saved = (await (await request.post('/api/flyers', { headers: HDR, data: input })).json()) as FlyerSaved;

    // The export, as the editor's server exporter asks for it. Saving the flyer
    // again empties its render cache, so every shot is a fresh render.
    const exportPng = (body: Record<string, unknown>) => async () => {
      expect((await request.put(`/api/flyers/${saved.id}`, { headers: HDR, data: input })).status()).toBe(200);
      const res = await request.post(`/api/render/${saved.id}`, { headers: HDR, data: body });
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
      writeFileSync(file(c.name), await capture(c.name, exportPng({ format: 'png' })));
      writeFileSync(file(`${c.name}.safe`), await capture(`${c.name}.safe`, overlay('')));
    } else {
      // The default canvas, and the story asked for by name (ignored by a server that has no canvases).
      problems.push(
        (await check(c.name, '', exportPng({ format: 'png' }))) ?? '',
        (await check(c.name, '.story', exportPng({ format: 'png', canvas: 'story' }))) ?? '',
        (await check(`${c.name}.safe`, '', overlay(''))) ?? '',
        (await check(`${c.name}.safe`, '.story', overlay('&canvas=story'))) ?? '',
      );
    }
    await request.delete(`/api/flyers/${saved.id}`, { headers: HDR });
  }
  expect(problems.filter(Boolean), `baseline in ${DIR}`).toEqual([]);
});
