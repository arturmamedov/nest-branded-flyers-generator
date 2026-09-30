import { readFileSync } from 'node:fs';
import type { APIRequestContext, APIResponse, Page } from '@playwright/test';
import { PNG } from 'pngjs';
import { expect, test } from '../browser';
import { EDITOR_VIEWPORT, cutOff, cutOffOn } from '../editor';
import { bodiesOf, groupsOf, highlighterWrapSample } from './pixels';
import sharp from 'sharp';
import { apiError, type ApiErrorKey } from '../../src/shared/errors';
import { flyerFilename } from '../../src/shared/filename';
import { marksFor, resolveDoodles } from '../../src/shared/defaults';
import { CANVASES, CANVAS_IDS, artAnchors, placeArt, safeBox, weekRowRect, type CanvasId } from '../../src/shared/layout';
import { SAMPLE_FLYERS } from '../../src/shared/samples';
import type { FlyerListItem, FlyerPayload } from '../../src/shared/schema';
import { printedRows } from '../../src/shared/week';
import { WRITE_HEADERS } from '../../src/shared/writeGuard';

/* The automatable half of the handoff's export checklist (README §9), for
   every sample flyer — both stress tests included — on every output canvas:
   an Activity sample in all three photo modes, a This week sample once, as
   its rows (it has no photo, whatever its photo mode says). */


const SAMPLE_TITLES = new Set(SAMPLE_FLYERS.map((s) => s.title));

/** The seeded samples only — other specs' flyers never leak in. */
async function samples(request: APIRequestContext): Promise<FlyerPayload[]> {
  const list = ((await (await request.get('/api/flyers')).json()) as FlyerListItem[]).filter((f) => SAMPLE_TITLES.has(f.title));
  return Promise.all(list.map(async (f) => (await (await request.get(`/api/flyers/${f.id}`)).json()) as FlyerPayload));
}

async function renderPayload(page: Page, payload: FlyerPayload, canvas: CanvasId) {
  await page.setViewportSize({ width: CANVASES[canvas].width, height: CANVASES[canvas].height });
  await page.addInitScript((p) => ((window as unknown as { __FLYER_PAYLOAD: unknown }).__FLYER_PAYLOAD = p), payload);
  await page.goto(`/render.html?canvas=${canvas}`);
  await page.waitForFunction(() => {
    const w = window as unknown as { __FLYER_READY?: boolean; __FLYER_ERROR?: string };
    return w.__FLYER_READY || w.__FLYER_ERROR;
  });
  expect(await page.evaluate(() => (window as unknown as { __FLYER_ERROR?: string }).__FLYER_ERROR)).toBeUndefined();
}

/** Runs in the page: the eyebrow's marks, left to right, and where its text (the calendar and the words) ends. */
function readMarks() {
  const eyebrow = document.querySelector('[data-group=eyebrow]')!;
  return {
    textRight: eyebrow.firstElementChild!.getBoundingClientRect().right,
    marks: [...eyebrow.querySelectorAll<HTMLImageElement>('img[data-logo]')].map((img) => {
      const r = img.getBoundingClientRect();
      return { logo: img.dataset.logo, path: new URL(img.src).pathname, alt: img.alt, drawn: img.complete && img.naturalWidth > 0, left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
    }),
  };
}

for (const canvas of CANVAS_IDS) {
  test(`${canvas}: every sample, every photo mode: where layout.ts says, in the safe box, no overlaps, no clipped text, real fonts`, async ({ page, request }) => {
    const all = await samples(request);
    expect(all.length).toBeGreaterThanOrEqual(6);
    // The highlighter wrap keeps every stress-test worst case and wraps its WHEN line: drawn as the stress flyer is.
    const wrap = highlighterWrapSample();
    const stress = all.find((p) => p.flyer.title === 'Long copy · stress test')!;
    expect(stress.flyer.hostel).toBe(wrap.hostel);
    all.push({ ...structuredClone(stress), flyer: { ...structuredClone(stress.flyer), title: wrap.title, data: wrap.data } });
    const withPhoto = all.find((p) => p.photo)!;
    const { width: W, height: HT } = CANVASES[canvas];
    const safe = safeBox(canvas);
    for (const base of all) {
      for (const body of bodiesOf(base.flyer.data)) {
        const payload: FlyerPayload = structuredClone(base);
        if (body === 'week') {
          // A week flyer never draws a photo, whatever its photo mode and photo say: it gets both, to prove it.
          payload.flyer.data.photoMode = 'band';
          payload.photo = withPhoto.photo;
        } else {
          payload.flyer.data.photoMode = body;
          if (body !== 'none' && !payload.photo) payload.photo = withPhoto.photo;
        }
        const label = `${canvas} / ${base.flyer.title} / ${body}`;

        await test.step(label, async () => {
          await renderPayload(page, payload, canvas);
          const r = await page.evaluate(() => {
            const groups = [...document.querySelectorAll<HTMLElement>('[data-group]')].map((el) => {
              const b = el.getBoundingClientRect();
              return { name: el.dataset.group!, left: b.left, top: b.top, right: b.right, bottom: b.bottom };
            });
            const faces = [...document.fonts].filter((f) => f.status === 'loaded').map((f) => `${f.family.replace(/"/g, '')} ${f.weight}`);
            // Every highlighter: the WHEN chip's, and each week row's day.
            const marks = [...document.querySelectorAll('[data-flyer] span[style*="mark-yellow"]')].map(
              (el) => getComputedStyle(el).getPropertyValue('box-decoration-break') || getComputedStyle(el).getPropertyValue('-webkit-box-decoration-break'),
            );
            const edges = (el: Element) => {
              const b = el.getBoundingClientRect();
              return { left: b.left, top: b.top, right: b.right, bottom: b.bottom };
            };
            // A week's rows as printed: each slot's box, its cells' text, and its right group's children.
            const rows = [...document.querySelectorAll<HTMLElement>('[data-row]')].map((el) => {
              const right = el.querySelector('[data-cell=right]');
              const name = el.querySelector('[data-cell=name]');
              return {
                slot: Number(el.dataset.row),
                box: edges(el),
                nameBox: edges(el.querySelector('[data-fit-box=name]')!),
                nameCell: name ? edges(name) : null,
                cells: [...el.querySelectorAll('[data-cell]')].map(edges),
                day: el.querySelector('[data-cell=day]')?.textContent ?? '',
                name: el.querySelector('[data-cell=name]')?.textContent ?? '',
                time: el.querySelector('[data-cell=time]')?.textContent ?? '',
                cost: [...el.querySelectorAll('[data-cell=cost]')].map((c) => c.textContent ?? ''),
                clocks: el.querySelectorAll('img').length,
                marks: el.querySelectorAll('span[style*="mark-yellow"]').length,
                right: right ? edges(right) : null,
                rightKids: right ? [...right.children].map(edges) : [],
              };
            });
            // A row field is never left as a bare separator.
            const rowDots = [...document.querySelectorAll('[data-group=rows] *')].filter((el) => el.children.length === 0 && el.textContent!.trim() === '·').length;
            // The headline's lines as printed: the Activity headline, or the week's title.
            const lines = [...document.querySelectorAll('[data-group=title] [data-fit], [data-group=headline] [data-fit]')].map((el) => el.textContent ?? '');
            // The fit boxes still too tall after the fit, and by how much (the WHERE chip is the one with the pin).
            const clips = [...document.querySelectorAll<HTMLElement>('[data-fit-box]')]
              .filter((b) => b.scrollHeight > b.clientHeight + 1)
              .map((b) => ({ box: b.querySelector('img[src*="icon-pin"]') ? 'WHERE' : (b.closest('[data-group]')?.getAttribute('data-group') ?? '?'), over: b.scrollHeight - b.clientHeight }));
            // Every fitted line's final size, against its own floor (data-fit × data-fit-min).
            const floors = [...document.querySelectorAll<HTMLElement>('[data-fit]')].map((el) => ({
              text: (el.textContent ?? '').trim(),
              min: el.dataset.fitMin ?? null,
              px: parseFloat(el.style.fontSize),
              floor: parseFloat(el.dataset.fit!) * parseFloat(el.dataset.fitMin ?? 'NaN'),
            }));
            // The marks at the eyebrow's right, in order: their right edges are where the row really ends.
            const logos = [...document.querySelectorAll<HTMLImageElement>('[data-group=eyebrow] img[data-logo]')].map((img) => ({
              logo: img.dataset.logo,
              right: img.getBoundingClientRect().right,
            }));
            // The flyer's own art (the pencil in the ask box is part of the block, not a doodle).
            const art = [...document.querySelectorAll<HTMLElement>('[data-flyer] > img[data-art]')].map((el) => ({
              left: parseFloat(el.style.left),
              top: parseFloat(el.style.top),
              width: parseFloat(el.style.width),
            }));
            return {
              art,
              clips,
              drawn: document.querySelector<HTMLElement>('[data-flyer]')!.dataset.canvas,
              groups,
              logos,
              faces,
              floors,
              fit: (window as unknown as { __FLYER_FIT: { clippedBoxes: number; entries: { text: string; base: number; finalPx: number; overflowX: boolean }[] } }).__FLYER_FIT,
              marks,
              rows,
              rowDots,
              lines,
              scroll: { w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight },
            };
          });

          expect(r.drawn, `${label}: the page drew this canvas`).toBe(canvas);
          // Every block where the registry puts it: a leftover story number would pass the safe box, not this.
          const table = groupsOf(canvas, body);
          // Exactly this template's blocks, each once: none missing (a week flyer's title, say), none extra (a photo).
          expect(r.groups.map((g) => g.name).sort(), `${label}: exactly this template's blocks`).toEqual(Object.keys(table).sort());
          const t = payload.flyer.data.text;
          expect(r.lines, `${label}: the headline's own lines`).toEqual([t.headline1, t.headline2, t.headlineEs].filter(Boolean));
          for (const g of r.groups) {
            const want = table[g.name as keyof typeof table]!;
            if (g.name === 'pill') {
              // Centred, as wide as its copy, tilted -0.6°: the tilt lifts a corner by half its width × sin 0.6°.
              const tilt = ((g.right - g.left) / 2) * Math.sin((0.6 * Math.PI) / 180);
              expect(Math.abs(g.top - want.top), `${label}: pill top`).toBeLessThanOrEqual(tilt + 0.5);
              expect(Math.abs((g.left + g.right) / 2 - W / 2), `${label}: pill centre`).toBeLessThanOrEqual(1);
              continue;
            }
            for (const [edge, value] of [
              ['left', want.left],
              ['top', want.top],
              ['right', want.left + want.width],
              ['bottom', want.top + want.height],
            ] as const)
              expect(Math.abs(g[edge] - value), `${label}: ${g.name} ${edge}`).toBeLessThanOrEqual(0.5);
          }
          // The marks the setting asks for at this flyer's hostel (defaults.ts), ending inside the safe box.
          expect(r.logos.map((m) => m.logo), `${label}: the eyebrow's marks`).toEqual(marksFor(!!payload.hostel?.logoPath).map((m) => (m === 'badge' ? 'hostel' : 'nests')));
          for (const m of r.logos) expect(m.right, `${label}: the ${m.logo} mark ends inside the safe box`).toBeLessThanOrEqual(safe.left + safe.width + 0.5);

          // The art where the registry hangs it, from data that went through the store: the template set
          // is recognised and follows the canvas (the blobs to its corners, the spark to the pill).
          const want = resolveDoodles(payload.flyer.data.doodles).map((d) => placeArt(d, artAnchors(canvas, body)));
          expect(r.art.length, `${label}: art pieces`).toBe(want.length);
          // The style reads back rounded to two decimals, so to the nearest 0.05 px.
          r.art.forEach((a, i) => {
            for (const key of ['left', 'top', 'width'] as const) expect(a[key], `${label}: art ${i} ${key}`).toBeCloseTo(want[i][key], 1);
          });

          for (const g of r.groups) {
            const bleed = g.name === 'photo' && body === 'bleed';
            if (!bleed) {
              expect(g.left, `${label}: ${g.name} left`).toBeGreaterThanOrEqual(safe.left - 0.5);
              expect(g.right, `${label}: ${g.name} right`).toBeLessThanOrEqual(safe.left + safe.width + 0.5);
            }
            expect(g.top, `${label}: ${g.name} top`).toBeGreaterThanOrEqual(safe.top - 0.5);
            expect(g.bottom, `${label}: ${g.name} bottom`).toBeLessThanOrEqual(safe.top + safe.height + 0.5);
          }
          for (let i = 0; i < r.groups.length; i++)
            for (let j = i + 1; j < r.groups.length; j++) {
              const a = r.groups[i];
              const b = r.groups[j];
              const overlap = a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
              expect(overlap, `${label}: ${a.name} overlaps ${b.name}`).toBe(false);
            }

          // Each line stops at its own floor, in the height pass too (the owner's call, 2026-09-30).
          expect(r.floors.filter((f) => f.min === null).map((f) => f.text), `${label}: fitted lines without a floor`).toEqual([]);
          expect(
            r.floors.filter((f) => f.px < f.floor - 0.005).map((f) => `${f.text}: ${f.px} px, floor ${f.floor.toFixed(2)}`),
            `${label}: lines below their floor`,
          ).toEqual([]);
          // At their floors the stress copy's address takes three lines, and on the story its WHERE chip reaches 2 px
          // into its own bottom padding: nothing visible is cut, but the chip counts as clipped and the editor says so.
          // Accepted by the owner (2026-09-30) rather than shortening the sample's copy or lowering the floor.
          const stressWhere = canvas === 'story' && ['Long copy · stress test', 'Highlighter wrap'].includes(base.flyer.title);
          expect(r.clips.map((c) => c.box), `${label}: clipped boxes`).toEqual(stressWhere ? ['WHERE'] : []);
          for (const c of r.clips) expect(c.over, `${label}: how far the ${c.box} chip runs over`).toBeLessThanOrEqual(2);
          expect(r.fit.clippedBoxes, `${label}: clipped boxes reported`).toBe(r.clips.length);
          expect(r.fit.entries.filter((e) => e.overflowX).map((e) => e.text), `${label}: overflowing lines`).toEqual([]);
          for (const face of ['Shantell Sans 700', 'Shantell Sans 800', 'Montserrat 600', 'Montserrat 700']) {
            expect(r.faces, `${label}: ${face}`).toContain(face);
          }
          for (const mark of r.marks) expect(mark, `${label}: highlighter clone`).toBe('clone');
          expect(r.scroll, `${label}: no scrollbars`).toEqual({ w: W, h: HT });

          // A week flyer prints exactly its printable rows, top-aligned, each as the shared rules say:
          // the short name, the price on two lines, no clock without a time, no highlighter without a day.
          const printed = body === 'week' ? printedRows(payload.flyer.data.week) : [];
          expect(r.rows.map((x) => x.slot), `${label}: printed rows, slot by slot`).toEqual(printed.map((_, slot) => slot));
          r.rows.forEach((x, slot) => {
            const cell = weekRowRect(canvas, slot);
            for (const [edge, value] of [
              ['left', cell.left],
              ['top', cell.top],
              ['right', cell.left + cell.width],
              ['bottom', cell.top + cell.height],
            ] as const)
              expect(Math.abs(x.box[edge] - value), `${label}: row ${slot} ${edge}`).toBeLessThanOrEqual(0.5);
            expect({ day: x.day, name: x.name, time: x.time, cost: x.cost }, `${label}: row ${slot} prints`).toEqual(printed[slot]);
            expect(x.clocks, `${label}: row ${slot} clock`).toBe(printed[slot].time ? 1 : 0);
            expect(x.marks, `${label}: row ${slot} highlighter`).toBe(printed[slot].day ? 1 : 0);
            // A long time or price shrinks inside its capped group; spilling out of it would reach the name unseen.
            for (const kid of x.rightKids)
              expect(kid.left >= x.right!.left - 0.5 && kid.right <= x.right!.right + 0.5, `${label}: row ${slot} right group holds its lines`).toBe(true);
            // The departures from the prototype, as signed off: time and price capped at 250 px, so the name keeps
            // at least what the day and the cap leave (320 px on the story, 380 on WhatsApp), and inside its box.
            const inner = { left: x.box.left + 34, right: x.box.right - 34 };
            for (const c of x.cells) expect(c.left >= inner.left - 0.5 && c.right <= inner.right + 0.5, `${label}: row ${slot} cells inside the row`).toBe(true);
            if (x.right) expect(x.right.right - x.right.left, `${label}: row ${slot} time and price capped`).toBeLessThanOrEqual(250.5);
            expect(x.nameBox.right - x.nameBox.left, `${label}: row ${slot} room for the name`).toBeGreaterThanOrEqual(inner.right - inner.left - 250 - 250 - 2 * 26 - 0.5);
            if (x.nameCell) expect(x.nameCell.left >= x.nameBox.left - 0.5 && x.nameCell.right <= x.nameBox.right + 0.5, `${label}: row ${slot} name inside its box`).toBe(true);
          });
          expect(r.rowDots, `${label}: no dangling ·`).toBe(0);
          if (base.flyer.title === 'This week · stress test') {
            expect(r.rows[1].name, `${label}: a long name prints its short name`).toBe('Catamaran to Los Gigantes');
            expect(r.rows[0].cost, `${label}: a price with a · prints on two lines`).toEqual(['25€', '18€ without breakfast']);
            // The cap is what shrinks them: sized to their copy, both would print at full size and squeeze the name.
            for (const text of ['10:00 – 13:00', '18€ without breakfast']) {
              const entry = r.fit.entries.find((e) => e.text === text)!;
              expect(entry.finalPx, `${label}: "${text}" shrinks in its capped column`).toBeLessThan(entry.base);
            }
          }
        });
      }
    }
  });
}

for (const canvas of CANVAS_IDS) {
  test(`${canvas}: a week row with nothing to print is left out, and the rows below close up`, async ({ page, request }) => {
    const sparse = (await samples(request)).find((p) => p.flyer.title === 'This week · sparse')!;
    const payload: FlyerPayload = structuredClone(sparse);
    const [first, second] = payload.flyer.data.week;
    payload.flyer.data.week = [first, { day: '', name: '', time: '', cost: '' }, { day: ' · ', name: '  ', time: '·', cost: ' · ', shortName: ' ' }, second];
    await renderPayload(page, payload, canvas);
    const rows = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('[data-row]')].map((el) => ({
        slot: el.dataset.row,
        name: el.querySelector('[data-cell=name]')?.textContent,
        top: Math.round(el.getBoundingClientRect().top),
      })),
    );
    expect(rows).toEqual([
      { slot: '0', name: first.name, top: weekRowRect(canvas, 0).top },
      { slot: '1', name: second.name, top: weekRowRect(canvas, 1).top },
    ]);
  });
}

for (const canvas of CANVAS_IDS) {
  test(`${canvas}: a week flyer prints its own title, and a word too long for its row shrinks inside its box`, async ({ page, request }) => {
    const sparse = (await samples(request)).find((p) => p.flyer.title === 'This week · sparse')!;
    const payload: FlyerPayload = structuredClone(sparse);
    // Edited title lines, the Spanish one emptied; a price at the cap, so the name has its least room.
    payload.flyer.data.text = { ...payload.flyer.data.text, headline1: 'Our week', headline2: 'this week.', headlineEs: '' };
    payload.flyer.data.week = [{ day: 'Fridays', name: 'Strandvolleyball', time: '', cost: '18€ without breakfast' }];
    await renderPayload(page, payload, canvas);
    const r = await page.evaluate(() => {
      const edges = (el: Element) => {
        const b = el.getBoundingClientRect();
        return { left: b.left, right: b.right };
      };
      const row = document.querySelector('[data-row="0"]')!;
      const fit = (window as unknown as { __FLYER_FIT: { entries: { text: string; finalPx: number; overflowX: boolean }[] } }).__FLYER_FIT;
      return {
        title: [...document.querySelectorAll('[data-group=title] [data-fit]')].map((el) => el.textContent),
        nameBox: edges(row.querySelector('[data-fit-box=name]')!),
        name: edges(row.querySelector('[data-cell=name]')!),
        word: fit.entries.find((e) => e.text === 'Strandvolleyball')!,
      };
    });
    expect(r.title).toEqual(['Our week', 'this week.']);
    // The word is wider than the column at 44 px: it shrinks, whole, inside its box, and is not cut off.
    expect(r.word.finalPx).toBeLessThan(44);
    expect(r.word.overflowX).toBe(false);
    expect(r.name.left).toBeGreaterThanOrEqual(r.nameBox.left - 0.5);
    expect(r.name.right).toBeLessThanOrEqual(r.nameBox.right + 0.5);
  });

  test(`${canvas}: a time or price still too long at its floor is cut at its column, never drawn across the row's frame`, async ({ page, request }) => {
    const sparse = (await samples(request)).find((p) => p.flyer.title === 'This week · sparse')!;
    const payload: FlyerPayload = structuredClone(sparse);
    payload.flyer.data.week = [{ day: 'Fridays', name: 'Surf', time: 'Mon–Fri 10:00–13:00', cost: 'Donation, any amount welcome' }];
    await renderPayload(page, payload, canvas);
    const { strip, cut } = await page.evaluate(() => {
      const right = document.querySelector('[data-row="0"] [data-cell=right]')!.getBoundingClientRect();
      const row = document.querySelector('[data-row="0"]')!.getBoundingClientRect();
      const fit = (window as unknown as { __FLYER_FIT: { entries: { text: string; overflowX: boolean }[] } }).__FLYER_FIT;
      // Between the column's right edge and the frame's stroke, over the row's middle (clear of the frame's rounded
      // corners, whose stroke curves in within ~30 px of the row's top and bottom): row fill only.
      const x = Math.ceil(right.right) + 1;
      return {
        strip: { x, y: Math.round(row.top) + 32, width: Math.floor(row.right) - 14 - x, height: Math.round(row.height) - 64 },
        cut: fit.entries.filter((e) => e.overflowX).map((e) => e.text),
      };
    });
    // Past their floor, both lines still say so: the editor warns that copy is cut off.
    expect(cut).toEqual(expect.arrayContaining(['Mon–Fri 10:00–13:00', 'Donation, any amount welcome']));
    const shot = PNG.sync.read(await page.screenshot({ clip: strip }));
    let inked = 0;
    for (let i = 0; i < shot.data.length; i += 4) if (Math.min(shot.data[i], shot.data[i + 1], shot.data[i + 2]) < 235) inked++;
    expect(inked, `ink between the column and the frame (${JSON.stringify(strip)})`).toBe(0);
  });

  test(`${canvas}: a day too long for three lines shrinks inside its row, even the fifth, and is not cut off`, async ({ page, request }) => {
    const sparse = (await samples(request)).find((p) => p.flyer.title === 'This week · sparse')!;
    const payload: FlyerPayload = structuredClone(sparse);
    // 28 of the day's 30 characters, four lines at 34 px: they spilled 14 px above and below a 122 px row, and from the
    // story's fifth row 2 px into the ask's box.
    const day = 'Tuesday Friday Monday Sunday';
    const [a, b] = payload.flyer.data.week;
    payload.flyer.data.week = [a, b, a, b, { day, name: 'Surf', time: '10:00', cost: '40€' }];
    await renderPayload(page, payload, canvas);
    const r = await page.evaluate((text) => {
      const edges = (b: DOMRect) => ({ top: b.top, bottom: b.bottom, right: b.right });
      const fit = (window as unknown as { __FLYER_FIT: { clippedBoxes: number; entries: { text: string; finalPx: number; overflowX: boolean }[] } }).__FLYER_FIT;
      return {
        row: edges(document.querySelector('[data-row="4"]')!.getBoundingClientRect()),
        column: edges(document.querySelector('[data-row="4"] [data-cell=day]')!.getBoundingClientRect()),
        // The highlighter's line boxes: the day's ink, padding included.
        lines: [...document.querySelector('[data-row="4"] [data-cell=day] > span')!.getClientRects()].map(edges),
        day: fit.entries.find((e) => e.text === text)!,
        clipped: fit.clippedBoxes,
        cut: fit.entries.filter((e) => e.overflowX).map((e) => e.text),
      };
    }, day);
    expect(r.lines.length, 'the day drew its highlighter').toBeGreaterThan(0);
    for (const line of r.lines) {
      expect(line.top >= r.row.top - 0.5 && line.bottom <= r.row.bottom + 0.5, `a line of the day ${JSON.stringify(line)} inside its row ${JSON.stringify(r.row)}`).toBe(true);
      // Shrunk, the day wraps again, and a line's highlighter can end up to its own 10 px padding past the column, in
      // the gap before the name: fit.ts then reports the day as overflowing, and the editor calls it cut off. Accepted
      // by the owner (2026-09-30) rather than changing the fit or where every day wraps.
      expect(line.right, 'at most the highlighter’s padding past the column').toBeLessThanOrEqual(r.column.right + 10.5);
    }
    expect(r.day.finalPx, 'the day shrank').toBeLessThan(34);
    expect(r.clipped, 'no box reported clipped').toBe(0);
    expect(r.cut.filter((t) => t !== day), 'nothing else cut sideways').toEqual([]);
  });

  test(`${canvas}: a WHEN chip too full for its lines' floors stops them there, clips, and says so`, async ({ page, request }) => {
    const paragliding = (await samples(request)).find((p) => p.flyer.title === 'Paragliding')!;
    const payload: FlyerPayload = structuredClone(paragliding);
    // A day that wraps, and a time: at their floors (27.6 and 28 px) the two lines need about 107 px, and 74 are free.
    payload.flyer.data.chips = payload.flyer.data.chips.map((c) => (c.key === 'when' ? { ...c, value: 'Saturdays and Sundays, mornings and evenings · 05:30' } : c));
    await renderPayload(page, payload, canvas);
    const r = await page.evaluate(() => {
      const over = [...document.querySelectorAll<HTMLElement>('[data-fit-box]')].filter((b) => b.scrollHeight > b.clientHeight + 1);
      return {
        clipped: (window as unknown as { __FLYER_FIT: { clippedBoxes: number } }).__FLYER_FIT.clippedBoxes,
        // The WHEN chip is the one with the calendar icon.
        over: over.map((b) => (b.querySelector('img[src*="icon-calendar"]') ? 'WHEN' : (b.textContent ?? '').slice(0, 40))),
        lines: over.flatMap((b) =>
          [...b.querySelectorAll<HTMLElement>('[data-fit]')].map((el) => ({
            text: (el.textContent ?? '').trim(),
            px: parseFloat(el.style.fontSize),
            floor: parseFloat(el.dataset.fit!) * parseFloat(el.dataset.fitMin!),
          })),
        ),
      };
    });
    expect(r.over, 'the box still too tall').toEqual(['WHEN']);
    expect(r.clipped, 'counted, so the editor says so').toBe(1);
    expect(r.lines.map((l) => l.text)).toEqual(['Saturdays and Sundays, mornings and evenings', '05:30']);
    for (const line of r.lines) expect(line.px, `${line.text}: at its floor`).toBeCloseTo(line.floor, 2);
  });

  test(`${canvas}: a flyer at a hostel with a badge prints the marks as set, in the eyebrow and the safe box, a long eyebrow too`, async ({ page, request }) => {
    const pool = (await samples(request)).find((p) => p.flyer.title === 'Pool party')!;
    const eyebrow = CANVASES[canvas].activity.eyebrow;
    const safe = safeBox(canvas);
    const want = marksFor(true).map((m) => (m === 'badge' ? 'hostel' : 'nests'));
    // The default eyebrow, then 18 of the widest letters, which leave the marks less room than they need: they give
    // way, rather than leave the box.
    for (const text of ['NEXT ACTIVITY', 'M'.repeat(18)]) {
      const payload: FlyerPayload = structuredClone(pool);
      payload.hostel = { ...payload.hostel!, logoPath: 'assets/logos/duque-nest.png' };
      payload.flyer.data.text.eyebrow = text;
      await renderPayload(page, payload, canvas);
      const r = await page.evaluate(readMarks);
      const label = `${canvas} / ${text}`;
      expect(r.marks.map((m) => m.logo), `${label}: the marks`).toEqual(want);
      for (const m of r.marks) {
        expect(m.drawn, `${label}: ${m.logo} drawn`).toBe(true);
        expect(m.top >= eyebrow.top - 0.5 && m.bottom <= eyebrow.top + eyebrow.height + 0.5, `${label}: ${m.logo} inside the eyebrow box`).toBe(true);
        expect(m.right, `${label}: ${m.logo} inside the eyebrow and the safe box`).toBeLessThanOrEqual(Math.min(safe.left + safe.width, eyebrow.left + eyebrow.width) + 0.5);
      }
      expect(r.marks[0].left - r.textRight, `${label}: the text keeps its 24 px from the marks`).toBeGreaterThanOrEqual(23.5);
      for (let i = 1; i < r.marks.length; i++) expect(r.marks[i].left, `${label}: the marks side by side`).toBeGreaterThanOrEqual(r.marks[i - 1].right);
      if (text !== 'NEXT ACTIVITY') continue;
      // With room, each mark keeps its size: 56 px tall, the badge square.
      for (const m of r.marks) expect(m.height, `${label}: ${m.logo} 56 px tall`).toBeCloseTo(56, 0);
      const badge = r.marks.find((m) => m.logo === 'hostel');
      if (badge) expect([badge.path, badge.alt, Math.round(badge.width)], `${label}: the badge`).toEqual(['/assets/logos/duque-nest.png', 'Duque Nest', 56]);
      const nests = r.marks.find((m) => m.logo === 'nests');
      if (nests) expect([nests.path, nests.alt], `${label}: the wordmark`).toEqual(['/assets/nest-logo-teal.png', 'Nests Hostels']);
    }
  });
}

test('a badge that fails to load leaves the Nests wordmark in its place, drawn by the time the page is ready', async ({ browser, baseURL, request }) => {
  const payload: FlyerPayload = structuredClone((await samples(request)).find((p) => p.flyer.title === 'Pool party')!);
  // A path with no file behind it: /assets answers 404 (it never falls through).
  payload.hostel = { ...payload.hostel!, logoPath: 'assets/logos/missing.png' };
  const context = await browser.newContext({ baseURL, viewport: { width: CANVASES.story.width, height: CANVASES.story.height } });
  try {
    let delayed = 0;
    // The badge fails late, once the page is already waiting for its images (the fonts load first), and the wordmark
    // that takes its place arrives later still. When the badge prints alone ('hostel'), a page that stopped waiting
    // when the badge failed is caught out here; at 'both' the wordmark is in the page from the start, so there is
    // nothing to wait for, and the test holds the fallback alone.
    await context.route('**/assets/logos/missing.png', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 400));
      await route.continue();
    });
    await context.route('**/assets/nest-logo-teal.png', async (route) => {
      delayed++;
      await new Promise((resolve) => setTimeout(resolve, 800));
      await route.continue();
    });
    const page = await context.newPage();
    // Records the eyebrow's images (all but its calendar icon) at the very moment the page reports ready.
    await page.addInitScript((p) => {
      const w = window as unknown as Record<string, unknown>;
      w.__FLYER_PAYLOAD = p;
      let ready: unknown;
      Object.defineProperty(window, '__FLYER_READY', {
        configurable: true,
        get: () => ready,
        set: (value) => {
          w.__MARKS_AT_READY = [...document.querySelectorAll<HTMLImageElement>('[data-group=eyebrow] img')]
            .filter((img) => !img.src.includes('icon-calendar'))
            .map((img) => ({ logo: img.dataset.logo ?? null, path: new URL(img.src).pathname, drawn: img.complete && img.naturalWidth > 0 }));
          ready = value;
        },
      });
    }, payload);
    await page.goto('/render.html?canvas=story');
    await page.waitForFunction(() => {
      const w = window as unknown as { __FLYER_READY?: boolean; __FLYER_ERROR?: string };
      return w.__FLYER_READY || w.__FLYER_ERROR;
    });
    expect(delayed, 'the wordmark was asked for, and held back').toBeGreaterThan(0);
    expect(await page.evaluate(() => (window as unknown as { __MARKS_AT_READY: unknown }).__MARKS_AT_READY)).toEqual([
      { logo: 'nests', path: '/assets/nest-logo-teal.png', drawn: true },
    ]);
  } finally {
    await context.close();
  }
});

test('the export waits for every image a week flyer draws: a slow clock is decoded when the page says it is ready', async ({ browser, baseURL, request }) => {
  const stress = (await samples(request)).find((p) => p.flyer.title === 'This week · stress test')!;
  const context = await browser.newContext({ baseURL, viewport: { width: CANVASES.story.width, height: CANVASES.story.height } });
  try {
    let delayed = 0;
    await context.route('**/assets/art/icon-clock.png', async (route) => {
      delayed++;
      await new Promise((resolve) => setTimeout(resolve, 800));
      await route.continue();
    });
    const page = await context.newPage();
    // Records the flyer's images at the very moment the page reports ready, not after.
    await page.addInitScript((p) => {
      const w = window as unknown as Record<string, unknown>;
      w.__FLYER_PAYLOAD = p;
      let ready: unknown;
      Object.defineProperty(window, '__FLYER_READY', {
        configurable: true,
        get: () => ready,
        set: (value) => {
          w.__IMAGES_AT_READY = [...document.querySelectorAll<HTMLImageElement>('[data-flyer] img')].map((img) => ({
            src: img.src,
            decoded: img.complete && img.naturalWidth > 0,
          }));
          ready = value;
        },
      });
    }, stress);
    await page.goto('/render.html?canvas=story');
    await page.waitForFunction(() => {
      const w = window as unknown as { __FLYER_READY?: boolean; __FLYER_ERROR?: string };
      return w.__FLYER_READY || w.__FLYER_ERROR;
    });
    const images = (await page.evaluate(() => (window as unknown as { __IMAGES_AT_READY: { src: string; decoded: boolean }[] }).__IMAGES_AT_READY)) ?? [];
    expect(delayed, 'the clock was requested, and held back').toBeGreaterThan(0);
    expect(images.filter((i) => i.src.includes('icon-clock')).length, 'the rows draw their clocks').toBeGreaterThan(0);
    expect(images.filter((i) => !i.decoded)).toEqual([]);
  } finally {
    await context.close();
  }
});

test('export API returns every canvas at its exact size as PNG and JPG, each cached until the flyer changes', async ({ request }) => {
  const list = (await (await request.get('/api/flyers')).json()) as FlyerListItem[];
  const stress = list.find((f) => f.title === 'Long copy · stress test')!;
  const post = (canvas: CanvasId, format: 'png' | 'jpg') => request.post(`/api/render/${stress.id}`, { headers: WRITE_HEADERS, data: { format, canvas } });
  const payload = (await (await request.get(`/api/flyers/${stress.id}`)).json()) as FlyerPayload;
  // Saving empties the flyer's render cache, whatever other tests asked for.
  const save = async () => {
    const put = await request.put(`/api/flyers/${stress.id}`, {
      headers: WRITE_HEADERS,
      data: { title: payload.flyer.title, hostel: payload.flyer.hostel, template: payload.flyer.template, data: payload.flyer.data, photoId: payload.flyer.photoId },
    });
    expect(put.status()).toBe(200);
  };
  await save();

  // Story first: a cache that ignored the canvas would hand WhatsApp the story's file, at the wrong size.
  for (const canvas of CANVAS_IDS) {
    for (const format of ['png', 'jpg'] as const) {
      const res = await post(canvas, format);
      expect(res.status()).toBe(200);
      expect(res.headers()['x-render-cache'], `${canvas} ${format} first time`).toBe('miss');
      const meta = await sharp(await res.body()).metadata();
      expect([meta.format, meta.width, meta.height], `${canvas} ${format}`).toEqual([format === 'png' ? 'png' : 'jpeg', CANVASES[canvas].width, CANVASES[canvas].height]);
      expect(res.headers()['content-disposition']).toContain(`filename="${flyerFilename(stress.title, stress.id, format, canvas)}"`);
    }
  }

  for (const canvas of CANVAS_IDS) expect((await post(canvas, 'png')).headers()['x-render-cache'], canvas).toBe('hit');
  // No canvas at all (an editor from before canvases) is the story, from the same cache.
  const legacy = await request.post(`/api/render/${stress.id}`, { headers: WRITE_HEADERS, data: { format: 'png' } });
  expect(legacy.headers()['x-render-cache']).toBe('hit');
  expect((await sharp(await legacy.body()).metadata()).height).toBe(CANVASES.story.height);

  await save();
  for (const canvas of CANVAS_IDS) expect((await post(canvas, 'png')).headers()['x-render-cache'], `${canvas} after a save`).toBe('miss');
});

test('the export route checks the id, then the format, then the canvas, then the flyer (docs/api-contract.md)', async ({ request }) => {
  const list = (await (await request.get('/api/flyers')).json()) as FlyerListItem[];
  const id = list.find((f) => SAMPLE_TITLES.has(f.title))!.id;
  const post = (path: string, data: unknown, headers: Record<string, string> = WRITE_HEADERS) => request.post(path, { headers, data });
  const fails = async (res: APIResponse, key: ApiErrorKey) => {
    const spec = apiError(key);
    const { error } = (await res.json()) as { error: { code: string; message: string } };
    expect([res.status(), error.code, error.message]).toEqual([spec.status, spec.code, spec.message]);
  };

  await fails(await post(`/api/render/${id}`, { format: 'png' }, {}), 'forbidden');
  await fails(await post('/api/render/abc', { format: 'gif' }), 'no_such_flyer');
  await fails(await post(`/api/render/${id}`, { format: 'gif' }), 'bad_format');
  await fails(await post('/api/render/999999', { format: 'gif' }), 'bad_format');
  await fails(await post(`/api/render/${id}`, { format: 'gif', canvas: 'square' }), 'bad_format');
  for (const canvas of ['square', '', 'STORY', '__proto__', 'toString', 5, true, ['story'], { id: 'story' }])
    await fails(await post(`/api/render/${id}`, { format: 'png', canvas }), 'bad_canvas');
  await fails(await post('/api/render/999999', { format: 'png', canvas: 'square' }), 'bad_canvas');
  await fails(await post('/api/render/999999', { format: 'png', canvas: 'whatsapp' }), 'no_such_flyer');
  await fails(await post('/api/render/999999', { format: 'png' }), 'no_such_flyer');
  // null is absent, as it is for format.
  expect((await post(`/api/render/${id}`, { format: 'png', canvas: null })).status()).toBe(200);
});

test('the render page refuses an unknown canvas instead of drawing the story', async ({ page, request }) => {
  const list = (await (await request.get('/api/flyers')).json()) as FlyerListItem[];
  const id = list.find((f) => SAMPLE_TITLES.has(f.title))!.id;
  await page.goto(`/render.html?id=${id}&canvas=square`);
  await page.waitForFunction(() => (window as unknown as { __FLYER_ERROR?: string }).__FLYER_ERROR);
  expect(await page.evaluate(() => (window as unknown as { __FLYER_ERROR?: string }).__FLYER_ERROR)).toContain('square');
  expect(await page.locator('[data-flyer]').count()).toBe(0);
});

/** The fitted font sizes of one flyer, in document order. */
const fitted = (selector: string) =>
  [...document.querySelectorAll<HTMLElement>(`${selector} [data-fit]`)].map((el) => el.style.fontSize);

/** What the render page (the export) fits for a flyer on a canvas. */
async function exportFit(page: Page, id: number, canvas: CanvasId): Promise<string[]> {
  const other = await page.context().newPage();
  await other.setViewportSize({ width: CANVASES[canvas].width, height: CANVASES[canvas].height });
  await other.goto(`/render.html?id=${id}&canvas=${canvas}`);
  await other.waitForFunction(() => (window as unknown as { __FLYER_READY?: boolean }).__FLYER_READY);
  const sizes = await other.evaluate(fitted, '[data-flyer]');
  await other.close();
  return sizes;
}

test('the editor previews, fits and downloads every canvas, through the server exporter', async ({ page, request }) => {
  const list = (await (await request.get('/api/flyers')).json()) as FlyerListItem[];
  const flyer = list.find((f) => f.title === 'Long copy · stress test')!;
  const renders: string[] = [];
  page.on('request', (r) => {
    if (r.method() === 'POST' && /\/api\/render\/\d+$/.test(r.url())) renders.push(r.postData() ?? '');
  });
  await page.setViewportSize(EDITOR_VIEWPORT);
  await page.goto(`/#/flyers/${flyer.id}`);
  await expect.poll(async () => page.evaluate(() => document.fonts.status)).toBe('loaded');
  const preview = page.locator('.stage-canvas [data-flyer]');
  const toggle = (canvas: CanvasId) => page.getByRole('button', { name: CANVASES[canvas].label, exact: true });

  // With the story on screen, WhatsApp is fitted offscreen, as its export will be. The stress copy
  // fits differently on the two canvases, so neither comparison can pass by accident.
  await expect(toggle('story')).toHaveAttribute('aria-pressed', 'true');
  const want = { story: await exportFit(page, flyer.id, 'story'), whatsapp: await exportFit(page, flyer.id, 'whatsapp') };
  expect(want.story, 'the stress copy fits differently per canvas').not.toEqual(want.whatsapp);
  await expect.poll(() => page.evaluate(fitted, '[aria-hidden="true"] [data-flyer][data-canvas="whatsapp"]'), { message: 'offscreen WhatsApp fit' }).toEqual(want.whatsapp);

  for (const canvas of CANVAS_IDS) {
    await toggle(canvas).click();
    await expect(toggle(canvas)).toHaveAttribute('aria-pressed', 'true');
    await expect(preview).toHaveAttribute('data-canvas', canvas);
    // Preview = export: the render page's fitted sizes for this canvas (a stale fit would keep the other canvas's).
    expect(await page.evaluate(fitted, '.stage-canvas'), `${canvas}: preview fit`).toEqual(want[canvas]);

    for (const [button, format] of [['Download PNG', 'png'], ['JPG', 'jpg']] as const) {
      const btn = page.getByRole('button', { name: button, exact: true });
      await expect(btn).toBeEnabled();
      const [download] = await Promise.all([page.waitForEvent('download'), btn.click()]);
      expect(download.suggestedFilename()).toBe(flyerFilename(flyer.title, flyer.id, format, canvas));
      const meta = await sharp(readFileSync(await download.path())).metadata();
      expect([meta.format, meta.width, meta.height]).toEqual([format === 'png' ? 'png' : 'jpeg', CANVASES[canvas].width, CANVASES[canvas].height]);
      await expect(page.getByText(`(${CANVASES[canvas].width} × ${CANVASES[canvas].height})`)).toBeVisible();
    }
  }
  expect(renders.map((b) => JSON.parse(b).canvas), 'every download went through POST /api/render with its canvas').toEqual(
    CANVAS_IDS.flatMap((c) => [c, c]),
  );

  // The last canvas chosen is remembered for this viewer; a value no canvas has is ignored.
  const last = CANVAS_IDS.at(-1)!;
  await page.reload();
  await expect(toggle(last)).toHaveAttribute('aria-pressed', 'true');
  await expect(preview).toHaveAttribute('data-canvas', last);
  await page.evaluate(() => localStorage.setItem('editor.canvas', '__proto__'));
  await page.reload();
  await expect(toggle('story')).toHaveAttribute('aria-pressed', 'true');

  // Copy that is cut off says so, naming every canvas it is cut off on, and the warning shrinks when it fits again: to
  // the story alone, whose WHERE chip this copy fills 2 px past its padding at its floors (accepted, 2026-09-30).
  const line2 = page.getByLabel('Line 2');
  const before = await line2.inputValue();
  const warning = cutOff(page);
  await expect(warning).toContainText(cutOffOn('story'));
  await line2.fill('W'.repeat(40));
  await expect(warning).toContainText(cutOffOn(...CANVAS_IDS));
  await line2.fill(before);
  await expect(warning).toContainText(cutOffOn('story'));
});
