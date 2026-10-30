import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { expect, test } from '../browser';
import { EDITOR_VIEWPORT, canvasButton, clientOnlyEditor, download, exportFit, libraryCard } from '../editor';
import { drawPayload } from './drawn';
import { checkDrawn, drawnSamples, samples } from './drawnChecks';
import { pixel, serverPng } from './exports';
import { compare, failures, regionsOf } from './pixels';
import { sampleCopy } from './proofFlyers';
import { CANVASES, CANVAS_IDS, DEFAULT_CANVAS, type CanvasId } from '../../src/shared/layout';
import { FIRST_LOOK, allLooks, type Look } from '../../src/shared/looks';
import { DEFAULT_COLORS } from '../../src/shared/looks/handDrawn';
import type { FlyerPayload } from '../../src/shared/schema';
import { WRITE_HEADERS } from '../../src/shared/writeGuard';

/* Every look the release ships after the first (the Sunset Vibes look, 2026-10-30), on the release's build, which
   render.spec.ts holds in hand-drawn and looks.spec.ts in the tests' proof look: every sample on both canvases prints
   where the look's boxes are, in the safe box, fitted, in its faces; its faces carry the letters Spanish copy needs;
   the client export matches the server's; the library card fits as the export does. The site names no look, so a flyer
   in the look still opens, saves and prints in it (M2). */

const SHIPPED = allLooks().filter((l) => l.id !== FIRST_LOOK);

/** The payload as a look draws it. */
const inLook = (payload: FlyerPayload, look: Look): FlyerPayload => ({ ...payload, flyer: { ...payload.flyer, data: { ...payload.flyer.data, look: look.id } } });

/** The fit boxes a sample is known to clip in a look on a canvas (each by 2 px at most), by name, as
    `<look> | <canvas> | <title> / <body>`, each with its why. None yet. */
const CLIPS: Record<string, string[]> = {};

/** The lines a sample is known to cut off sideways in a look on a canvas, by their text, keyed as CLIPS, each with
    its why. The editor says such a line is cut off; the samples' copy is kept as it is (the owner's call for the
    WHERE chip, 2026-09-30, holds here too). */
const CUT: Record<string, string[]> = {};
// Sunset Vibes: the stress test's headline, 18 characters, in Archivo Black at the floor of its 144.64 px (86.8 px)
// is wider than the safe column on both canvases: the design's headline face holds about 14 of its upper-case
// letters in the column. The staggered kind (stage 2) fits each word by itself to its own room; whether the floor
// stays at 0.6 is Artur's (docs/reports/sunset-vibes.md, stage 1). The Highlighter wrap record is the stress test
// with its WHEN line wrapped: the same headline.
for (const canvas of CANVAS_IDS)
  for (const title of ['Long copy · stress test', 'Highlighter wrap'])
    for (const body of ['bleed', 'band', 'none']) CUT[`sunset-vibes | ${canvas} | ${title} / ${body}`] = ['Sunrise hike above'];

/** The letters every face must carry (the handoff's README §1.5), beyond ASCII. */
const LETTERS = 'ÑñÁÉÍÓÚ¡¿€·’';

/** Flyers a test saved: archived afterwards, so the specs after this one find the library as seeded. */
const saved: number[] = [];
const keep = (id: number) => saved.push(id);
test.afterAll(async ({ request }) => {
  for (const id of saved.splice(0)) await request.delete(`/api/flyers/${id}`, { headers: WRITE_HEADERS });
});

test('the release ships a look after the first', () => {
  expect(SHIPPED.map((l) => l.id)).toEqual(['sunset-vibes']);
});

for (const look of SHIPPED) {
  for (const canvas of CANVAS_IDS) {
    test(`${look.id} / ${canvas}: every sample, every photo mode: where its boxes are, in the safe box, fitted, its faces`, async ({ page, request }) => {
      for (const { title, body, payload } of await drawnSamples(request)) {
        const label = `${canvas} / ${title} / ${body} / ${look.id}`;
        const key = `${look.id} | ${canvas} | ${title} / ${body}`;
        await test.step(label, () => checkDrawn(page, inLook(payload, look), canvas, label, CLIPS[key] ?? [], look, CUT[key] ?? []));
      }
    });
  }

  test(`${look.id}: every face it loads covers the Spanish letters, the punctuation and the euro sign`, async ({ page, request }) => {
    const pool = (await samples(request)).find((p) => p.flyer.title === 'Pool party')!;
    await drawPayload(page, inLook(pool, look), 'story');
    // The faces are self-hosted subsets, each declaring the code points it carries (unicode-range): a letter outside
    // every loaded subset of a family would print in a fallback face.
    const missing = await page.evaluate(
      async ({ faces, letters }) => {
        const out: string[] = [];
        for (const { family, weight } of faces) {
          await document.fonts.load(`${weight} 40px "${family}"`, letters);
          const ranges = [...document.fonts]
            .filter((f) => f.family.replace(/"/g, '') === family && f.status === 'loaded')
            .flatMap((f) => f.unicodeRange.split(',').map((r) => r.trim().replace(/^U\+/i, '')))
            .map((r) => {
              const [lo, hi] = r.split('-');
              return [parseInt(lo.replace(/\?/g, '0'), 16), parseInt((hi ?? lo).replace(/\?/g, 'F'), 16)];
            });
          for (const ch of letters) {
            const cp = ch.codePointAt(0)!;
            if (!ranges.some(([lo, hi]) => cp >= lo && cp <= hi)) out.push(`${family} ${weight}: ${ch}`);
          }
        }
        return out;
      },
      { faces: look.faces, letters: LETTERS },
    );
    expect(missing).toEqual([]);
  });

  for (const [sample, body] of [['Pool party', 'band'], ['Pool party', 'bleed'], ['Paragliding', 'none'], ['This week · stress test', 'week']] as const) {
    test(`${look.id}: the client export matches the server's: ${sample} / ${body}, on every canvas`, async ({ browser, baseURL, page, request }) => {
      test.setTimeout(180_000);
      const { id } = await sampleCopy(request, sample, body, keep, look.id);
      const { context, page: editor, overridden } = await clientOnlyEditor(browser, baseURL);
      try {
        await editor.goto(`./#/flyers/${id}`);
        for (const canvas of CANVAS_IDS) {
          const golden = await serverPng(request, id, canvas);
          const regions = await regionsOf(page, id, canvas);
          expect(pixel(golden, 2, 2), `${canvas}: the server drew the look's ground`).toBe(look.palette({ colors: DEFAULT_COLORS }).ground.toUpperCase());
          await canvasButton(editor, canvas).click();
          const candidate = PNG.sync.read(readFileSync(await (await download(editor, 'png')).path()));
          expect([candidate.width, candidate.height]).toEqual([CANVASES[canvas].width, CANVASES[canvas].height]);
          const metrics = compare(golden, candidate, canvas, body, regions);
          expect(failures(metrics), `${canvas}: ${JSON.stringify(metrics)}`).toEqual([]);
        }
        expect(overridden(), 'the editor read the client-only config').toBe(true);
      } finally {
        await context.close();
      }
    });
  }

  test(`${look.id}: a library card shows its flyer in it, fitted as the export fits it`, async ({ page, request }) => {
    await page.setViewportSize(EDITOR_VIEWPORT);
    const { id, title } = await sampleCopy(request, 'Long copy · stress test', 'band', keep, look.id);
    const want = await exportFit(page, id, DEFAULT_CANVAS as CanvasId);
    await page.goto('/');
    const card = libraryCard(page, title);
    await card.scrollIntoViewIfNeeded();
    await expect(card.locator('.card-thumb.card-thumb-ready')).toBeVisible();
    const flyer = card.locator('.card-thumb [data-flyer]');
    await expect(flyer).toHaveAttribute('data-look', look.id);
    expect(await flyer.evaluate((root) => [...root.querySelectorAll<HTMLElement>('[data-fit]')].map((el) => el.style.fontSize)), 'card = export').toEqual(want);
  });
}
