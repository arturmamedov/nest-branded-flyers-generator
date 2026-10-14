import { lookOf } from '../shared/looks';
import { fitFlyer, type FitReport } from './fit';

const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

const drawn = (img: HTMLImageElement) => img.complete && img.naturalWidth > 0;

function backgroundArt(root: HTMLElement): string[] {
  const urls = new Set<string>();
  root.querySelectorAll<HTMLElement>('[style*="url("]').forEach((el) => {
    for (const m of el.style.backgroundImage.matchAll(/url\(["']?([^"')]+)["']?\)/g)) urls.add(m[1]);
  });
  return [...urls];
}

function preload(url: string): Promise<void> {
  const img = new Image();
  img.src = url;
  return img.decode().catch(() => undefined);
}

/** Load fonts for the actual copy (unicode-range subsets included), decode
    every image and background, then fit. Export must run this before the
    screenshot or the PNG will not match the preview. The faces are those of the
    look the flyer is drawn in, which its root names (data-look). */
export async function prepareFlyer(root: HTMLElement): Promise<FitReport> {
  const sample = (root.textContent || '') + 'AaÁáÑñ€¡¿·—';
  const { faces } = lookOf({ look: root.dataset.look });
  await Promise.all(faces.map((f) => document.fonts.load(`${f.weight} 40px "${f.family}"`, sample)));
  await document.fonts.ready;
  // A hostel's badge that fails to load gives way to the Nests wordmark (Flyer.tsx), which may still be on its way when
  // this round ends: decode again until every image is drawn. A broken image with nothing to take its place stays
  // broken, as before, once a few frames have passed.
  for (let i = 0; i < 10; i++) {
    await Promise.all(Array.from(root.querySelectorAll('img')).map((img) => img.decode().catch(() => undefined)));
    if (Array.from(root.querySelectorAll('img')).every(drawn)) break;
    await frame();
  }
  await Promise.all(backgroundArt(root).map(preload));
  fitFlyer(root);
  await frame();
  const report = fitFlyer(root);
  await frame();
  await frame();
  return report;
}
