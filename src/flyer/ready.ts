import { FLYER_FACES } from '../shared/fonts';
import { fitFlyer, type FitReport } from './fit';

const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

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
    screenshot or the PNG will not match the preview. */
export async function prepareFlyer(root: HTMLElement): Promise<FitReport> {
  const sample = (root.textContent || '') + 'AaÁáÑñ€¡¿·—';
  await Promise.all(FLYER_FACES.map((f) => document.fonts.load(`${f.weight} 40px "${f.family}"`, sample)));
  await document.fonts.ready;
  await Promise.all(Array.from(root.querySelectorAll('img')).map((img) => img.decode().catch(() => undefined)));
  await Promise.all(backgroundArt(root).map(preload));
  fitFlyer(root);
  await frame();
  const report = fitFlyer(root);
  await frame();
  await frame();
  return report;
}
