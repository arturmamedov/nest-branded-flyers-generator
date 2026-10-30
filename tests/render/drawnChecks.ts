import type { APIRequestContext, Page } from '@playwright/test';
import { expect } from '../browser';
import { drawPayload } from './drawn';
import { bodiesOf, groupsOf, highlighterWrapSample } from './pixels';
import { DEFAULT_CHIP_ORDER, deriveChips } from '../../src/shared/chips';
import { marksFor, marksOf } from '../../src/shared/defaults';
import { CANVASES, artAnchors, bodyOf, placeArt, safeBox, weekRowRect, type Body, type CanvasId } from '../../src/shared/layout';
import { lookOf, type Look } from '../../src/shared/looks';
import { SAMPLE_FLYERS } from '../../src/shared/samples';
import type { FlyerListItem, FlyerPayload } from '../../src/shared/schema';
import { printedRows } from '../../src/shared/week';

/* The automatable half of the handoff's export checklist (README §9) for one flyer on one canvas, in the look it
   names: render.spec.ts runs it on every sample in hand-drawn, looks.spec.ts on every sample in the proof look. Where
   the blocks sit, the art hangs and the pill tilts is read from the flyer's look, never from hand-drawn's numbers. */

export const SAMPLE_TITLES = new Set(SAMPLE_FLYERS.map((s) => s.title));

/** The seeded samples only — other specs' flyers never leak in. */
export async function samples(request: APIRequestContext): Promise<FlyerPayload[]> {
  const list = ((await (await request.get('/api/flyers')).json()) as FlyerListItem[]).filter((f) => SAMPLE_TITLES.has(f.title));
  return Promise.all(list.map(async (f) => (await (await request.get(`/api/flyers/${f.id}`)).json()) as FlyerPayload));
}

/** What the checklist draws: every seeded sample, both stress tests included, and the highlighter wrap (every stress
    worst case, with its WHEN line wrapped), an Activity flyer in each photo mode and a This week flyer once, as its
    rows. A flyer with no photo borrows one in bleed and band. */
export async function drawnSamples(request: APIRequestContext): Promise<{ title: string; body: Body; payload: FlyerPayload }[]> {
  const all = await samples(request);
  expect(all.length).toBeGreaterThanOrEqual(6);
  const wrap = highlighterWrapSample();
  const stress = all.find((p) => p.flyer.title === 'Long copy · stress test')!;
  expect(stress.flyer.hostel).toBe(wrap.hostel);
  all.push({ ...structuredClone(stress), flyer: { ...structuredClone(stress.flyer), title: wrap.title, data: wrap.data } });
  const withPhoto = all.find((p) => p.photo)!;
  return all.flatMap((base) =>
    bodiesOf(base.flyer.data).map((body) => {
      const payload: FlyerPayload = structuredClone(base);
      if (body === 'week') {
        // A week flyer never draws a photo, whatever its photo mode and photo say: it gets both, to prove it.
        payload.flyer.data.photoMode = 'band';
        payload.photo = withPhoto.photo;
      } else {
        payload.flyer.data.photoMode = body;
        if (body !== 'none' && !payload.photo) payload.photo = withPhoto.photo;
      }
      return { title: base.flyer.title, body, payload };
    }),
  );
}

/** Draws the payload on the render page and holds it to every rule a printed flyer keeps. `clips` are the fit boxes
    this flyer is known to clip on this canvas (each by 2 px at most), by name. `look` is the look the page draws it in:
    the flyer's own, as this process's registry reads it, unless the page's build has a look this process does not
    (the proof look, in dist-proof/ alone). `cut` are the lines this flyer is known to cut off sideways in that look
    on this canvas (at their floor, still wider than their box: the editor says so), by their text. */
export async function checkDrawn(page: Page, payload: FlyerPayload, canvas: CanvasId, label: string, clips: string[] = [], look: Look = lookOf(payload.flyer.data), cut: string[] = []): Promise<void> {
  const geometry = look.geometry;
  const body = bodyOf(payload.flyer.data);
  const { width: W, height: HT } = CANVASES[canvas];
  const safe = safeBox(canvas);
  await drawPayload(page, payload, canvas);
  const r = await page.evaluate(() => {
    const groups = [...document.querySelectorAll<HTMLElement>('[data-group]')].map((el) => {
      const b = el.getBoundingClientRect();
      return { name: el.dataset.group!, left: b.left, top: b.top, right: b.right, bottom: b.bottom };
    });
    const faces = [...document.fonts].filter((f) => f.status === 'loaded').map((f) => `${f.family.replace(/"/g, '')} ${f.weight}`);
    // Every highlighter: the WHEN chip's, and each week row's day.
    const marks = [...document.querySelectorAll('[data-flyer] [data-deco=highlighter]')].map(
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
        // The time and each cost line as laid out: the text's own width (past a clip too) and the cell's.
        lines: [...el.querySelectorAll<HTMLElement>('[data-cell=time], [data-cell=cost]')].map((c) => {
          const range = document.createRange();
          range.selectNodeContents(c);
          return { text: (c.textContent ?? '').trim(), textWidth: range.getBoundingClientRect().width, cellWidth: c.getBoundingClientRect().width };
        }),
        // Each cost line's size before the fit: the price's, then the price sub-line's (a line the look does not fit prints at its size).
        costSizes: [...el.querySelectorAll<HTMLElement>('[data-cell=cost]')].map((c) => parseFloat(c.dataset.fit ?? getComputedStyle(c).fontSize)),
        clocks: el.querySelectorAll('[data-deco=clock]').length,
        marks: el.querySelectorAll('[data-deco=highlighter]').length,
        right: right ? edges(right) : null,
        rightKids: right ? [...right.children].map(edges) : [],
      };
    });
    // A row field is never left as a bare separator.
    const rowDots = [...document.querySelectorAll('[data-group=rows] *')].filter((el) => el.children.length === 0 && el.textContent!.trim() === '·').length;
    // The headline's lines as printed: the Activity headline, or the week's title.
    const lines = [...document.querySelectorAll('[data-group=title] [data-fit], [data-group=headline] [data-fit]')].map((el) => el.textContent ?? '');
    // The fit boxes still too tall after the fit, and by how much (a chip by its key, the WHERE chip as 'WHERE').
    const clips = [...document.querySelectorAll<HTMLElement>('[data-fit-box]')]
      .filter((b) => b.scrollHeight > b.clientHeight + 1)
      .map((b) => ({ box: b.dataset.chip === 'where' ? 'WHERE' : (b.closest('[data-group]')?.getAttribute('data-group') ?? '?'), over: b.scrollHeight - b.clientHeight }));
    // Everything drawn that is no copy carries a hook naming what it is, so a spec finds it in any look, never by
    // the file one look draws it from: art, a decoration, a mark, or the photo.
    const unhooked = [...document.querySelectorAll<HTMLElement>('[data-flyer] img, [data-flyer] svg, [data-flyer] [style*="url("]')]
      .filter((el) => !el.matches('[data-art], [data-deco], [data-logo]') && !(el.tagName === 'IMG' && el.closest('[data-group=photo]')))
      .map((el) => el.outerHTML.slice(0, 120));
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
      height: img.getBoundingClientRect().height,
    }));
    // The inline art, by slot: what each block drew where the look names a file, and nothing where it names none.
    const eyebrow = document.querySelector('[data-group=eyebrow]')!;
    const inline = {
      eyebrowIcons: eyebrow.querySelectorAll('img[data-deco=icon]').length,
      // Every rule with a picture in it: the eyebrow's, the ask's, and the one that stands for no photo.
      rules: [...document.querySelectorAll('[data-flyer] [data-deco=rule]')].filter((el) => getComputedStyle(el).backgroundImage !== 'none').length,
      chips: [...document.querySelectorAll<HTMLElement>('[data-chip]')].map((el) => ({
        key: el.dataset.chip,
        icons: el.querySelectorAll('img[data-deco=icon]').length,
        glyphs: el.querySelectorAll('span[data-deco=icon]').length,
        clocks: el.querySelectorAll('[data-deco=clock]').length,
        marks: el.querySelectorAll('[data-deco=highlighter]').length,
      })),
    };
    // The flyer's own art (the pencil in the ask box is part of the block, not a doodle).
    const file = (el: HTMLElement) => new URL((el as HTMLImageElement).src).pathname.split('/').pop();
    const art = [...document.querySelectorAll<HTMLElement>('[data-flyer] > img[data-art]')].map((el) => ({
      left: parseFloat(el.style.left),
      top: parseFloat(el.style.top),
      width: parseFloat(el.style.width),
      file: file(el),
    }));
    // The art that hangs from the pill is drawn beside it: where its box starts, from the right end of the
    // pill's own box and the top of its row. A turned piece keeps its centre, so that is what is measured.
    const pill = document.querySelector<HTMLElement>('[data-group=pill]');
    const pillArt = [...(pill?.parentElement!.querySelectorAll<HTMLElement>(':scope > img[data-art]') ?? [])].map((el) => {
      const from = pill!.parentElement!.getBoundingClientRect();
      const at = el.getBoundingClientRect();
      return {
        x: at.left + at.width / 2 - el.offsetWidth / 2 - from.right,
        y: at.top + at.height / 2 - el.offsetHeight / 2 - from.top,
        width: el.offsetWidth,
        file: file(el),
      };
    });
    return {
      art,
      pillArt,
      inline,
      clips,
      unhooked,
      drawn: document.querySelector<HTMLElement>('[data-flyer]')!.dataset.canvas,
      drawnLook: document.querySelector<HTMLElement>('[data-flyer]')!.dataset.look,
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
  expect(r.drawnLook, `${label}: the page drew this look`).toBe(look.id);
  expect(r.unhooked, `${label}: everything drawn names what it is`).toEqual([]);
  // Every block where the registry puts it: a leftover story number would pass the safe box, not this.
  const table = groupsOf(canvas, body, geometry);
  // Exactly this template's blocks, each once: none missing (a week flyer's title, say), none extra (a photo).
  expect(r.groups.map((g) => g.name).sort(), `${label}: exactly this template's blocks`).toEqual(Object.keys(table).sort());
  const t = payload.flyer.data.text;
  expect(r.lines, `${label}: the headline's own lines`).toEqual([t.headline1, t.headline2, t.headlineEs].filter(Boolean));
  for (const g of r.groups) {
    const want = table[g.name as keyof typeof table]!;
    if (g.name === 'pill') {
      // Centred, as wide as its copy, tilted as its look says: the tilt lifts a corner by half its width × sin θ.
      const tilt = ((g.right - g.left) / 2) * Math.sin((Math.abs(look.pill.tilt) * Math.PI) / 180);
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
  // The marks the look asks for at this flyer's hostel (the app's setting unless the look says), at the look's height or
  // less (a long eyebrow shrinks them), ending inside the safe box.
  const marks = marksOf(look);
  expect(r.logos.map((m) => m.logo), `${label}: the eyebrow's marks`).toEqual(marksFor(!!payload.hostel?.logoPath, marks.which).map((m) => (m === 'badge' ? 'hostel' : 'nests')));
  for (const m of r.logos) {
    expect(m.right, `${label}: the ${m.logo} mark ends inside the safe box`).toBeLessThanOrEqual(safe.left + safe.width + 0.5);
    expect(m.height, `${label}: the ${m.logo} mark's height`).toBeGreaterThan(0);
    expect(m.height, `${label}: the ${m.logo} mark's height`).toBeLessThanOrEqual(marks.height + 0.5);
  }

  // The inline art is drawn where the look names a file, and nowhere it names none: the eyebrow's icon and rule, each
  // chip's icon (the € glyph stands in on the COST chip when the look has no cost icon), the WHEN chip's clock and
  // highlighter, the ask's rule, and the rule that stands for no photo.
  const slots = look.inline;
  const printed = body === 'week' ? printedRows(payload.flyer.data.week) : [];
  const asks = !!(t.askEn || t.askEs);
  expect(r.inline.eyebrowIcons, `${label}: the eyebrow's icon`).toBe(slots.eyebrowIcon ? 1 : 0);
  expect(r.inline.rules, `${label}: the rules drawn`).toBe((slots.eyebrowRule ? 1 : 0) + (asks && slots.askRule ? 1 : 0) + (body === 'none' && slots.photoRule ? 1 : 0));
  const chips = body === 'week' ? [] : deriveChips(payload.flyer.data.chips, payload.hostel?.name ?? null, payload.flyer.data.overrides.chips?.order ?? DEFAULT_CHIP_ORDER);
  expect(
    r.inline.chips,
    `${label}: each chip's inline art`,
  ).toEqual(
    chips.map((chip) => {
      const icon = chip.key === 'when' ? slots.whenIcon : chip.key === 'where' ? slots.whereIcon : slots.costIcon;
      return {
        key: chip.key,
        icons: icon ? 1 : 0,
        glyphs: chip.key === 'cost' && !icon ? 1 : 0,
        clocks: chip.key === 'when' && chip.sub && slots.clock ? 1 : 0,
        marks: chip.key === 'when' && slots.highlighter ? 1 : 0,
      };
    }),
  );

  // The art where the look hangs it, from data that went through the store: hand-drawn's template set is
  // recognised and follows the canvas (the blobs to its corners, in each other's ink). The art at the end of the
  // ask is drawn inside the ask's block, and is not among these (art.spec.ts holds it). The art off the pill's end
  // is the look's own count: hand-drawn hangs its spark there, another look may hang nothing.
  const pieces = look.art(payload.flyer.data);
  const onPill = pieces.filter((d) => d.anchor === 'pillEnd');
  // A piece hung from a point this body lacks (the photo's bottom, with no photo box) is not drawn.
  const want = pieces
    .filter((d) => d.anchor !== 'pillEnd' && d.anchor !== 'askEnd')
    .flatMap((d) => {
      const at = placeArt(d, artAnchors(canvas, body, geometry));
      return at ? [{ ...at, file: `${d.slug}.png` }] : [];
    });
  expect(r.art.map((a) => a.file), `${label}: art pieces`).toEqual(want.map((a) => a.file));
  // The style reads back rounded to two decimals, so to the nearest 0.05 px.
  r.art.forEach((a, i) => {
    for (const key of ['left', 'top', 'width'] as const) expect(a[key], `${label}: art ${i} ${key}`).toBeCloseTo(want[i][key], 1);
  });
  // The spark off the pill's end is drawn with the pill, at its offsets from the end of this pill.
  expect(r.pillArt.map((a) => a.file), `${label}: the pill's art`).toEqual(onPill.map((d) => `${d.slug}.png`));
  r.pillArt.forEach((a, i) => {
    expect(Math.abs(a.x - onPill[i].x), `${label}: the pill's spark, from the pill's end`).toBeLessThanOrEqual(0.5);
    expect(Math.abs(a.y - onPill[i].y), `${label}: the pill's spark, from the top of the pill's row`).toBeLessThanOrEqual(0.5);
    expect(a.width, `${label}: the pill's spark, its width`).toBe(onPill[i].w);
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

  // Each line stops at its own floor, in the height pass too (the owner's call, 2026-09-30). A line the look gives no
  // floor is not fitted at all: it carries no data-fit, rather than a floor that reads as none (the Sunset look's
  // labels, asks and row text, README §7.17).
  expect(r.floors.filter((f) => f.min === null || Number.isNaN(f.floor)).map((f) => f.text), `${label}: fitted lines without a floor`).toEqual([]);
  expect(
    r.floors.filter((f) => f.px < f.floor - 0.005).map((f) => `${f.text}: ${f.px} px, floor ${f.floor.toFixed(2)}`),
    `${label}: lines below their floor`,
  ).toEqual([]);
  // The boxes the caller knows this flyer clips, each by at most 2 px: nothing visible is cut, but the box counts as
  // clipped and the editor says so.
  expect(r.clips.map((c) => c.box), `${label}: clipped boxes`).toEqual(clips);
  for (const c of r.clips) expect(c.over, `${label}: how far the ${c.box} chip runs over`).toBeLessThanOrEqual(2);
  expect(r.fit.clippedBoxes, `${label}: clipped boxes reported`).toBe(r.clips.length);
  expect(r.fit.entries.filter((e) => e.overflowX).map((e) => e.text), `${label}: lines cut off sideways`).toEqual(cut);
  for (const face of look.faces.map((f) => `${f.family} ${f.weight}`)) {
    expect(r.faces, `${label}: ${face}`).toContain(face);
  }
  for (const mark of r.marks) expect(mark, `${label}: highlighter clone`).toBe('clone');
  expect(r.scroll, `${label}: no scrollbars`).toEqual({ w: W, h: HT });

  // A week flyer prints exactly its printable rows, top-aligned, each as the shared rules say:
  // the short name, the price on two lines, no clock without a time, no highlighter without a day (and neither where
  // the look has no clock or no highlighter).
  expect(r.rows.map((x) => x.slot), `${label}: printed rows, slot by slot`).toEqual(printed.map((_, slot) => slot));
  r.rows.forEach((x, slot) => {
    const cell = weekRowRect(canvas, slot, geometry);
    for (const [edge, value] of [
      ['left', cell.left],
      ['top', cell.top],
      ['right', cell.left + cell.width],
      ['bottom', cell.top + cell.height],
    ] as const)
      expect(Math.abs(x.box[edge] - value), `${label}: row ${slot} ${edge}`).toBeLessThanOrEqual(0.5);
    expect({ day: x.day, name: x.name, time: x.time, cost: x.cost }, `${label}: row ${slot} prints`).toEqual(printed[slot]);
    // The price is set in weekPrice; the part after the middle dot, under it, in weekPriceSub.
    expect(x.costSizes, `${label}: row ${slot} cost lines' sizes`).toEqual(printed[slot].cost.map((_, i) => (i === 0 ? look.type.weekPrice : look.type.weekPriceSub).size));
    expect(x.clocks, `${label}: row ${slot} clock`).toBe(printed[slot].time && slots.clock ? 1 : 0);
    expect(x.marks, `${label}: row ${slot} highlighter`).toBe(printed[slot].day && slots.highlighter ? 1 : 0);
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
  if (payload.flyer.title === 'This week · stress test') {
    expect(r.rows[1].name, `${label}: a long name prints its short name`).toBe('Catamaran to Los Gigantes');
    expect(r.rows[0].cost, `${label}: a price with a · prints on two lines`).toEqual(['25€', '18€ without breakfast']);
    // The cap is what shrinks them: sized to their copy, both would print at full size and squeeze the name. In a face
    // wide enough (hand-drawn's) each is wider than its cell at its size, and shrinks; in a narrower one it fits as it is,
    // and nothing shrinks it. A line the look never shrinks (no floor) is not fitted, so there is no entry to read: the
    // cap clips it instead.
    for (const [text, line] of [
      ['10:00 – 13:00', 'weekTime'],
      ['18€ without breakfast', 'weekPriceSub'],
    ] as const) {
      if (look.type[line].floor === undefined) continue;
      const entry = r.fit.entries.find((e) => e.text === text)!;
      const drawn = r.rows.flatMap((x) => x.lines).find((l) => l.text === text)!;
      // How wide the line would be at its size: its width as drawn, scaled back from its final size.
      const natural = (drawn.textWidth * entry.base) / entry.finalPx;
      if (natural > drawn.cellWidth + 0.5) expect(entry.finalPx, `${label}: "${text}" shrinks in its capped column`).toBeLessThan(entry.base);
      else expect(entry.finalPx, `${label}: "${text}" fits its column at its size, so nothing shrinks it`).toBe(entry.base);
    }
  }
}
