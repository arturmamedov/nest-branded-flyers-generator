/* Shrink-to-fit, ported from _fit() in the design files (handoff README §5).
   Two passes: shrink a line that runs past its width (flex rows shrink their
   gap first), then shrink whole groups that run past their box. Nothing drops
   below its data-fit-min floor, so element positions never move because copy
   got long — the box clips instead. Scoped to one flyer root. */

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

export function fitFlyer(root: HTMLElement): FitReport {
  const nodes = Array.from(root.querySelectorAll<HTMLElement>('[data-fit]'));
  nodes.forEach((el) => {
    el.style.fontSize = el.dataset.fit + 'px';
    if (el.dataset.fitGap) el.style.gap = el.dataset.fitGap + 'px';
  });
  nodes.forEach((el) => {
    const base = parseFloat(el.dataset.fit!);
    const floor = el.dataset.fitMin ? parseFloat(el.dataset.fitMin) : 0.6;
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
    const kids = Array.from(box.querySelectorAll<HTMLElement>('[data-fit]'));
    if (!kids.length) return;
    let g = 1;
    let guard = 0;
    while (box.scrollHeight > box.clientHeight + 1 && g > 0.55 && guard++ < 48) {
      g -= 0.025;
      kids.forEach((el) => {
        el.style.fontSize = (parseFloat(el.dataset.fit!) * (k.get(el) || 1) * g).toFixed(2) + 'px';
      });
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
