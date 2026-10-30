import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { PNG } from 'pngjs';
import { expect, test } from '../browser';
import { EDITOR_VIEWPORT, canvasButton, clientOnlyEditor, download, exportFit, libraryCard, openSection } from '../editor';
import { FIELD } from '../../src/editor/fields';
import { drawPayload } from './drawn';
import { checkDrawn, drawnSamples, samples } from './drawnChecks';
import { pixel, serverPng } from './exports';
import { compare, failures, regionsOf } from './pixels';
import { sampleCopy } from './proofFlyers';
import { CANVASES, CANVAS_IDS, DEFAULT_CANVAS, boxesOf, wordSlot, type CanvasId } from '../../src/shared/layout';
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
// Sunset Vibes: the headline words are staggered (stage 2), each fitted to its own slot (layout.ts, wordSlot): on the
// story 749.62 px for the first word and 474.06 for the second, on WhatsApp 809.62 and 534.06; at the floor of 0.6 the
// first word prints at 86.78 px in Archivo Black (about 14 upper-case letters in its slot) and the second at 112.9 px in
// Caveat Brush (about 9 letters on the story, 11 on WhatsApp). The stress test's 18 and 18 characters are cut on both
// canvases; on the story alone a 13-letter second word ("every Friday.", "of fun waves.") and the 14-letter "Family
// dinner," are cut too. The editor says so; the samples' copy is kept, and whether the floor stays at 0.6 is Artur's
// (docs/reports/sunset-vibes.md, stages 1 and 2). The Highlighter wrap record is the stress test with its WHEN line
// wrapped: the same headline.
const SUNSET_CUTS: [readonly CanvasId[], string, string[]][] = [
  [CANVAS_IDS, 'Long copy · stress test', ['Sunrise hike above', 'the sea of clouds.']],
  [CANVAS_IDS, 'Highlighter wrap', ['Sunrise hike above', 'the sea of clouds.']],
  [['story'], 'Pizza · weekly', ['Family dinner,', 'every Friday.']],
  [['story'], 'Surf lesson', ['of fun waves.']],
  [['story'], 'Pizza night', ['Family dinner,']],
];
for (const [canvases, title, lines] of SUNSET_CUTS)
  for (const canvas of canvases) for (const body of ['bleed', 'band', 'none']) CUT[`sunset-vibes | ${canvas} | ${title} / ${body}`] = lines;

/** A pixel of the look's ground on a canvas: the top-left corner, unless the photo lies behind everything there; then
    a point on the splash, 60 px above the photo's bottom in the side margin (left of the headline's ink and clear of
    the botanicals, which hang at the splash's edge higher up), where a week flyer with no photo prints the ground too. */
function groundAt(look: Look, canvas: CanvasId): { x: number; y: number } {
  if (!look.geometry.photoBehind) return { x: 2, y: 2 };
  const photo = boxesOf(canvas, look.geometry).activity.photoBleed;
  return { x: 20, y: Math.round(photo.top + photo.height - 60) };
}

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
          const at = groundAt(look, canvas);
          expect(pixel(golden, at.x, at.y), `${canvas}: the server drew the look's ground`).toBe(look.palette({ colors: DEFAULT_COLORS }).ground.toUpperCase());
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

  if (look.geometry.photoBehind) {
    /* The photo behind everything (Artur's decision 1 and answers 6 and 7, 2026-10-30): the flyer's first block, so
       the art and the copy paint over it; In a frame prints exactly as Full bleed; No photo prints the placeholder
       colour in the photo's box, with the splash (the ground over the photo's bottom) and the botanicals as with a photo. */
    test(`${look.id}: the photo is drawn first, under everything; In a frame prints exactly as Full bleed; No photo prints the placeholder in the photo's box`, async ({ page, request }) => {
      test.setTimeout(240_000);
      const pool = (await samples(request)).find((p) => p.flyer.title === 'Pool party')!;
      const paint = look.palette({ colors: DEFAULT_COLORS });
      for (const canvas of CANVAS_IDS) {
        const box = boxesOf(canvas, look.geometry).activity.photoBleed;
        for (const mode of ['bleed', 'band', 'none'] as const) {
          await drawPayload(page, inLook({ ...pool, flyer: { ...pool.flyer, data: { ...pool.flyer.data, photoMode: mode } } }, look), canvas);
          const first = await page.evaluate(() => {
            const el = document.querySelector('[data-flyer]')!.firstElementChild as HTMLElement;
            const b = el.getBoundingClientRect();
            return { group: el.dataset.group, top: b.top, height: b.height, left: b.left, width: b.width, img: el.querySelectorAll('img').length };
          });
          // Chrome lays out in 1/64 px: the box's edges to the nearest one.
          const { top, height, ...rest } = first;
          expect(rest, `${canvas} / ${mode}: the photo box is the first block`).toEqual({ group: 'photo', left: 0, width: 1080, img: mode === 'none' ? 0 : 1 });
          expect(top, `${canvas} / ${mode}: the photo box's top`).toBeCloseTo(box.top, 1);
          expect(height, `${canvas} / ${mode}: the photo box's height`).toBeCloseTo(box.height, 1);
          // The splash hangs from the photo's bottom in every mode, the week aside: the placeholder box is a photo box.
          const splash = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('[data-flyer] > img[data-art][data-anchor=photoBottom]')].map((el) => parseFloat(el.style.top)));
          expect(splash.length, `${canvas} / ${mode}: the pieces at the photo's bottom`).toBe(look.art(pool.flyer.data).filter((d) => d.anchor === 'photoBottom').length);
          expect(Math.min(...splash), `${canvas} / ${mode}: the splash's top`).toBeCloseTo(box.top + box.height - 484.14, 1);
        }
        // The exports: a copy In a frame and a copy in Full bleed are one picture. Chrome now and then rasterises a
        // small piece differently (baseline.spec.ts): fresh copies, up to three times, until two agree.
        let same = false;
        for (let i = 0; i < 3 && !same; i++) {
          const band = await serverPng(request, (await sampleCopy(request, 'Pool party', 'band', keep, look.id)).id, canvas);
          const bleed = await serverPng(request, (await sampleCopy(request, 'Pool party', 'bleed', keep, look.id)).id, canvas);
          same = band.data.equals(bleed.data);
        }
        expect(same, `${canvas}: In a frame prints exactly as Full bleed`).toBe(true);
        // No photo: the placeholder at the photo box's top-left corner on the canvas, the ground on the splash below
        // its crests (60 px above the photo's bottom, left of the headline's ink and clear of the botanicals).
        const none = await serverPng(request, (await sampleCopy(request, 'Pool party', 'none', keep, look.id)).id, canvas);
        expect(pixel(none, 2, Math.max(0, box.top) + 2), `${canvas}: the placeholder where the photo would be`).toBe(paint.placeholder.toUpperCase());
        expect(pixel(none, groundAt(look, canvas).x, groundAt(look, canvas).y), `${canvas}: the splash over the photo's bottom`).toBe(paint.ground.toUpperCase());
      }
    });
  }

  if (look.headline) {
    const kind = look.headline;
    /* The staggered headline (README §1.1): each word in its slot (layout.ts, wordSlot), its baseline centre on the
       slot's top-middle, turned by its line's rotate about that point; the Spanish line centred at its own top. */
    test(`${look.id}: the headline staggered: each word in its slot, turned about its baseline centre; the Spanish line centred at its top`, async ({ page, request }) => {
      const pool = (await samples(request)).find((p) => p.flyer.title === 'Pool party')!;
      for (const canvas of CANVAS_IDS) {
        await drawPayload(page, inLook(pool, look), canvas);
        const box = boxesOf(canvas, look.geometry).activity.headline;
        const r = await page.evaluate(() => {
          const read = (el: HTMLElement) => {
            const s = getComputedStyle(el);
            // matrix(a, b, c, d, tx, ty): a turn by θ has a = cos θ, b = sin θ; the move after it is (tx, ty).
            const m = s.transform === 'none' ? [1, 0, 0, 1, 0, 0] : s.transform.replace(/^matrix\(|\)$/g, '').split(',').map(Number);
            return { text: el.textContent, left: el.offsetLeft, top: el.offsetTop, width: el.offsetWidth, height: el.offsetHeight, size: parseFloat(el.style.fontSize), angle: (Math.atan2(m[1], m[0]) * 180) / Math.PI, tx: m[4], ty: m[5], origin: s.transformOrigin, align: s.textAlign };
          };
          return {
            words: [...document.querySelectorAll<HTMLElement>('[data-group=headline] [data-word]')].map(read),
            spanish: [...document.querySelectorAll<HTMLElement>('[data-group=headline] [data-fit]:not([data-word])')].map(read),
          };
        });
        const t = pool.flyer.data.text;
        expect(r.words.map((w) => w.text), `${canvas}: the two words`).toEqual([t.headline1, t.headline2]);
        for (const [i, w] of ([kind.word1, kind.word2] as const).entries()) {
          const drawn = r.words[i];
          const slot = wordSlot(canvas, w);
          const line = i === 0 ? look.type.headline1 : look.type.headline2;
          const label = `${canvas}: word ${i + 1}`;
          // The slot, in the box (offsets are whole pixels).
          expect(Math.abs(drawn.left - (slot.left - box.left)), `${label}: its slot's left`).toBeLessThanOrEqual(1);
          expect(Math.abs(drawn.width - slot.width), `${label}: its slot's width`).toBeLessThanOrEqual(1);
          expect(Math.abs(drawn.top - w.y), `${label}: its baseline's row`).toBeLessThanOrEqual(1);
          // One line, line-height 1: the box is the fitted size tall; fitted to the slot, never below the floor.
          expect(Math.abs(drawn.height - drawn.size), `${label}: one line`).toBeLessThanOrEqual(1);
          expect(drawn.size, `${label}: fitted`).toBeLessThanOrEqual(line.size + 0.01);
          expect(drawn.size, `${label}: at or above its floor`).toBeGreaterThanOrEqual(line.size * line.floor! - 0.01);
          // Turned by its line's rotate about its baseline centre (the slot's middle, rise into the line), then moved
          // up by the baseline's share of the line, so the baseline centre lands on the slot's top.
          expect(drawn.angle, `${label}: its turn`).toBeCloseTo(line.rotate!, 3);
          const [ox, oy] = drawn.origin.replace(/px/g, '').split(' ').map(Number);
          expect(Math.abs(ox - drawn.width / 2), `${label}: turned about the slot's middle`).toBeLessThanOrEqual(0.5);
          expect(Math.abs(oy - w.rise * drawn.size), `${label}: turned about its baseline`).toBeLessThanOrEqual(0.5);
          expect(Math.abs(drawn.ty + w.rise * drawn.size), `${label}: moved up to its baseline`).toBeLessThanOrEqual(0.5);
          expect(Math.abs(drawn.tx), `${label}: not moved sideways`).toBeLessThanOrEqual(0.5);
        }
        expect(r.spanish.map((s) => s.text), `${canvas}: the Spanish line`).toEqual([t.headlineEs]);
        expect(Math.abs(r.spanish[0].top - kind.spanishTop), `${canvas}: the Spanish line's top`).toBeLessThanOrEqual(1);
        expect(r.spanish[0].align, `${canvas}: the Spanish line centred`).toBe('center');
        expect(r.spanish[0].width, `${canvas}: the Spanish line across the box`).toBe(box.width);
      }
    });
  }

  if (look.headline && look.streaks) {
    const kind = look.headline;
    const streaks = look.streaks;
    /** What the page shows of each streak: its slot, its picture and the word it lies over. */
    const readStreaks = (page: Page) =>
      page.evaluate(() => {
        const box = document.querySelector<HTMLElement>('[data-group=headline]')!.getBoundingClientRect();
        return [...document.querySelectorAll<HTMLElement>('[data-group=headline] [data-streak]')].map((slot) => {
          const img = slot.querySelector('img')!;
          const word = slot.parentElement!.querySelector<HTMLElement>(`[data-word="${slot.dataset.streak}"]`)!;
          const at = img.getBoundingClientRect();
          const of = word.getBoundingClientRect();
          const s = getComputedStyle(slot);
          return {
            word: slot.dataset.streak,
            key: slot.dataset.streakKey,
            ink: slot.dataset.streakInk,
            cover: slot.dataset.streakCover,
            minD: slot.dataset.streakMin,
            slot: { left: slot.offsetLeft, top: slot.offsetTop, width: slot.offsetWidth, height: slot.offsetHeight, contain: s.contain },
            hook: img.dataset.deco,
            shown: img.style.display !== 'none',
            src: img.src,
            natural: { width: img.naturalWidth, height: img.naturalHeight },
            rect: { left: at.left - box.left, top: at.top - box.top, width: at.width, height: at.height },
            wordRect: { left: of.left - box.left, top: of.top - box.top, width: of.width, height: of.height },
            wordWidth: word.offsetWidth,
            size: parseFloat(word.style.fontSize),
          };
        });
      });

    /* The streaks (README §1.1 layers 17 and 19; Artur's answer 8): a dry-brush knock-out over each word, made at render
       from the word as fitted, in the ground colour, at 2×, hung from the word's baseline centre (the slot's top-middle),
       the same every time the flyer is drawn. The slot is a point of no size laid out by itself, so the picture counts
       in no box's overflow (the fit's height pass reads it). */
    test(`${look.id}: a dry-brush streak over each headline word: in the ground colour at 2×, from the word's baseline centre, the same twice`, async ({ page, request }) => {
      test.setTimeout(120_000);
      const pool = (await samples(request)).find((p) => p.flyer.title === 'Pool party')!;
      const ground = look.palette({ colors: DEFAULT_COLORS }).ground.toUpperCase();
      for (const canvas of CANVAS_IDS) {
        await drawPayload(page, inLook(pool, look), canvas);
        const box = boxesOf(canvas, look.geometry).activity.headline;
        const first = await readStreaks(page);
        expect(first.map((s) => s.word), `${canvas}: a streak per word`).toEqual(['1', '2']);
        for (const s of first) {
          const w = s.word === '1' ? kind.word1 : kind.word2;
          const spec = s.word === '1' ? streaks.headline1! : streaks.headline2!;
          const label = `${canvas}: word ${s.word}`;
          const slot = wordSlot(canvas, w);
          // The slot: the word's baseline centre, no size, laid out by itself; the look's numbers on it.
          expect(Math.abs(s.slot.left - (slot.left - box.left + slot.width / 2)), `${label}: the slot at the slot's middle`).toBeLessThanOrEqual(1);
          expect(Math.abs(s.slot.top - w.y), `${label}: the slot on the baseline's row`).toBeLessThanOrEqual(1);
          expect([s.slot.width, s.slot.height, s.slot.contain], `${label}: a point laid out by itself`).toEqual([0, 0, 'layout']);
          expect({ ink: s.ink, cover: s.cover, minD: s.minD }, `${label}: the look's streak`).toEqual({ ink: ground, cover: String(spec.cover), minD: String(spec.minD) });
          // The picture: shown, hooked as a decoration, a PNG at twice its size, over the word, the baseline centre inside it.
          expect(s.hook, `${label}: hooked`).toBe('streak');
          expect(s.shown, `${label}: shown`).toBe(true);
          expect(s.src.startsWith('data:image/png;base64,'), `${label}: a PNG`).toBe(true);
          expect(s.natural, `${label}: at 2×`).toEqual({ width: Math.round(2 * s.rect.width), height: Math.round(2 * s.rect.height) });
          expect(s.rect.left <= s.slot.left + 1 && s.slot.left <= s.rect.left + s.rect.width + 1, `${label}: the baseline centre inside the streak, across`).toBe(true);
          expect(s.rect.top <= s.slot.top + 1 && s.slot.top <= s.rect.top + s.rect.height + 1, `${label}: the baseline centre inside the streak, down`).toBe(true);
          // As wide as the word's ink, give or take the turn and the 4 px round it: never wider than the box, never a sliver.
          expect(s.rect.width, `${label}: over the word`).toBeGreaterThan(s.size * 2);
          expect(s.rect.width, `${label}: no wider than the box`).toBeLessThanOrEqual(box.width + 8);
          // Every painted pixel is the ground; some of the word is knocked out, most of it is not.
          const png = PNG.sync.read(Buffer.from(s.src.slice('data:image/png;base64,'.length), 'base64'));
          let painted = 0;
          let covered = 0;
          const wrong = new Set<string>();
          for (let p = 0; p < png.data.length; p += 4) {
            const a = png.data[p + 3];
            if (!a) continue;
            painted++;
            covered += a / 255;
            const hex = `#${[png.data[p], png.data[p + 1], png.data[p + 2]].map((v) => v.toString(16).padStart(2, '0')).join('')}`.toUpperCase();
            if (hex !== ground) wrong.add(hex);
          }
          expect([...wrong], `${label}: the streak's ink`).toEqual([]);
          expect(painted, `${label}: knocked out`).toBeGreaterThan(0);
          expect(covered / (png.width * png.height), `${label}: a share of the word, not the word`).toBeLessThan(0.3);
        }
        // Deterministic: drawn again, the same pictures (the seed is the word, its face, size, spacing and turn).
        await drawPayload(page, inLook(pool, look), canvas);
        const again = await readStreaks(page);
        expect(again.map((s) => [s.key, s.src]), `${canvas}: the same twice`).toEqual(first.map((s) => [s.key, s.src]));
        expect(first[0].key, `${canvas}: seeded by the word, its font, its size and its turn`).toContain(`${first[0].size}px`);
      }
      // A word cut at its floor is streaked as drawn: the stress test's first word is wider than its slot, and so is its streak.
      const stress = (await samples(request)).find((p) => p.flyer.title === 'Long copy · stress test')!;
      await drawPayload(page, inLook(stress, look), 'story');
      const cut = await readStreaks(page);
      expect(cut.map((s) => s.shown)).toEqual([true, true]);
      expect(cut[0].rect.width, 'the cut word, streaked as drawn').toBeGreaterThan(cut[0].wordWidth);
    });

    test(`${look.id}: the preview draws the streaks, and draws them again as a word is typed`, async ({ page, request }) => {
      await page.setViewportSize(EDITOR_VIEWPORT);
      const { id } = await sampleCopy(request, 'Pool party', 'band', keep, look.id);
      await page.goto(`/#/flyers/${id}`);
      const shown = page.locator('.stage-canvas [data-flyer] img[data-deco=streak]');
      await expect(shown).toHaveCount(2);
      for (const i of [0, 1]) await expect(shown.nth(i)).toBeVisible();
      const before = await shown.first().getAttribute('src');
      await openSection(page, FIELD.headline);
      await page.getByLabel(FIELD.line1).fill('Sunset');
      const slot = page.locator('.stage-canvas [data-flyer] [data-streak="1"]');
      await expect(slot).toHaveAttribute('data-streak-key', /^SUNSET\|/);
      await expect(shown.first()).toBeVisible();
      await expect.poll(() => shown.first().getAttribute('src')).not.toBe(before);
      // Emptied, no streak over nothing.
      await page.getByLabel(FIELD.line1).fill('');
      await expect(page.locator('.stage-canvas [data-flyer] [data-streak="1"]')).toHaveCount(0);
      await expect(shown).toHaveCount(1);
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
    // The card carries the streaks the export carries (the stress test's words, cut at their floor, streaked as drawn).
    const streaked = look.streaks ? Object.keys(look.streaks).length : 0;
    expect(await flyer.evaluate((root) => [...root.querySelectorAll<HTMLImageElement>('img[data-deco=streak]')].filter((i) => i.style.display !== 'none' && i.src.startsWith('data:image/png')).length), 'the card’s streaks').toBe(streaked);
  });
}
