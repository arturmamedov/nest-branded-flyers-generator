/* Shrink-to-fit, from _fit() in the design files (handoff README §5), with one
   departure in the height pass, explained there. Two passes: shrink a line that
   runs past its width (flex rows shrink their gap first), then shrink whole
   groups that run past their box. Nothing drops below its data-fit-min floor, so
   element positions never move because copy got long — the box clips instead.
   Scoped to one flyer root. */

export interface FitEntry {
  text: string;
  base: number;
  finalPx: number;
  overflowX: boolean;
}

export interface FitReport {
  entries: FitEntry[];
  /** Boxes whose content still overflows after the height pass. */
  clippedBoxes: number;
}

const k = new WeakMap<HTMLElement, number>();

/** The least share of its base size a line may shrink to (data-fit-min, 0.6 when absent). */
const floorOf = (el: HTMLElement) => (el.dataset.fitMin ? parseFloat(el.dataset.fitMin) : 0.6);

export function fitFlyer(root: HTMLElement): FitReport {
  const nodes = Array.from(root.querySelectorAll<HTMLElement>('[data-fit]'));
  nodes.forEach((el) => {
    el.style.fontSize = el.dataset.fit + 'px';
    if (el.dataset.fitGap) el.style.gap = el.dataset.fitGap + 'px';
  });
  nodes.forEach((el) => {
    const base = parseFloat(el.dataset.fit!);
    const floor = floorOf(el);
    const gapBase = el.dataset.fitGap ? parseFloat(el.dataset.fitGap) : null;
    let s = 1;
    let guard = 0;
    if (gapBase != null) {
      let g = 1;
      while (el.scrollWidth > el.clientWidth + 1 && g > 0.3 && guard++ < 40) {
        g -= 0.06;
        el.style.gap = (gapBase * g).toFixed(2) + 'px';
      }
    }
    guard = 0;
    while (el.scrollWidth > el.clientWidth + 1 && s > floor && guard++ < 48) {
      s = Math.max(floor, s - 0.025);
      el.style.fontSize = (base * s).toFixed(2) + 'px';
    }
    k.set(el, s);
  });
  let clippedBoxes = 0;
  root.querySelectorAll<HTMLElement>('[data-fit-box]').forEach((box) => {
    // The departure from _fit(), which scaled every line of a box by g down to 0.55 and never read data-fit-min, so a
    // line could end at floor × 0.55 (the owner's call, 2026-09-30). Here a line stops at its floor while the others
    // go on shrinking; a box still too tall once g is spent, or every line is at its floor, clips and is counted.
    // A box whose lines all stay above their floors takes the same steps to the same sizes as before.
    const kids = Array.from(box.querySelectorAll<HTMLElement>('[data-fit]'), (el) => ({ el, base: parseFloat(el.dataset.fit!), s: k.get(el) || 1, floor: floorOf(el) }));
    if (!kids.length) return;
    let g = 1;
    let guard = 0;
    while (box.scrollHeight > box.clientHeight + 1 && g > 0.55 && kids.some((c) => c.s * g > c.floor) && guard++ < 48) {
      g -= 0.025;
      for (const c of kids) c.el.style.fontSize = Math.max(c.base * c.floor, c.base * c.s * g).toFixed(2) + 'px';
    }
    if (box.scrollHeight > box.clientHeight + 1) clippedBoxes++;
  });
  return {
    entries: nodes.map((el) => ({
      text: (el.textContent || '').trim(),
      base: parseFloat(el.dataset.fit!),
      finalPx: parseFloat(el.style.fontSize),
      overflowX: el.scrollWidth > el.clientWidth + 1,
    })),
    clippedBoxes,
  };
}
