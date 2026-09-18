/* Pixel-compare the app's render page against the design prototype
   (design/Nest Flyer Story Templates.dc.html) for the same records.

   Usage: start the app (npm run dev, samples seeded), then
     npm run compare:design [-- --origin http://127.0.0.1:8787]

   Both sides use the same font binaries: the prototype's Google Fonts request
   is answered with our self-hosted @fontsource files. The prototype still
   loads React from unpkg, so this needs an internet connection. The photo
   band is masked — the prototype's image-slot resamples differently. */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { chromium, type Page } from 'playwright';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import type { FlyerListItem, FlyerPayload } from '../src/shared/schema';

const ROOT = join(import.meta.dirname, '..');
const DESIGN = join(ROOT, 'design_handoff_flyer_generator', 'design');
const OUT = join(ROOT, 'test-results', 'design-compare');
const originArg = process.argv.indexOf('--origin');
const ORIGIN = originArg > -1 ? process.argv[originArg + 1] : 'http://127.0.0.1:8787';

const CASES: { record: string; mode: 'bleed' | 'band' | 'none'; label: string }[] = [
  { record: 'Pool party', mode: 'none', label: 'No photo' },
  { record: 'Long copy · stress test', mode: 'none', label: 'No photo' },
  { record: 'Paragliding', mode: 'none', label: 'No photo' },
  { record: 'Pool party', mode: 'bleed', label: 'Full bleed' },
  { record: 'Surf lesson', mode: 'band', label: 'In a frame' },
];
const PHOTO_BAND = { top: 712, bottom: 1092 };

const MIME: Record<string, string> = {
  '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.woff2': 'font/woff2', '.css': 'text/css',
};

function fontCss(): string {
  const out: string[] = [];
  for (const [pkg, weights] of [['shantell-sans', [400, 600, 700, 800]], ['montserrat', [500, 600, 700]]] as const) {
    for (const w of weights) {
      const file = join(ROOT, 'node_modules', '@fontsource', pkg, `${w}.css`);
      out.push(readFileSync(file, 'utf8').replace(/url\(\.\/files\//g, `url(http://design.local/__fonts/${pkg}/`));
    }
  }
  return out.join('\n');
}

async function shootPrototype(page: Page, c: (typeof CASES)[number]): Promise<Buffer> {
  await page.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ contentType: 'text/css', body: fontCss() }));
  await page.route('http://design.local/**', (r) => {
    const path = decodeURIComponent(new URL(r.request().url()).pathname);
    const m = path.match(/^\/__fonts\/([^/]+)\/(.+)$/);
    const file = m ? join(ROOT, 'node_modules', '@fontsource', m[1], 'files', m[2]) : join(DESIGN, path);
    try {
      r.fulfill({ body: readFileSync(file), contentType: MIME[extname(file)] ?? 'application/octet-stream' });
    } catch {
      r.fulfill({ status: 404 });
    }
  });
  await page.goto('http://design.local/Nest%20Flyer%20Story%20Templates.dc.html');
  const nb = (s: string) => new RegExp('^' + s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '[\\s\\u00a0]') + '$');
  await page.getByRole('button', { name: nb(c.record) }).click();
  await page.getByRole('button', { name: nb(c.label) }).click();
  await page.waitForTimeout(2000); // the prototype re-fits at 80/400/1200ms
  return page.locator('[data-screen-label="Story flyer 1080x1920"]').screenshot();
}

async function shootApp(page: Page, c: (typeof CASES)[number]): Promise<Buffer> {
  const list = (await (await fetch(`${ORIGIN}/api/flyers`)).json()) as FlyerListItem[];
  const item = list.find((f) => f.title === c.record);
  if (!item) throw new Error(`Sample "${c.record}" not found — run npm run seed:samples`);
  const payload = (await (await fetch(`${ORIGIN}/api/flyers/${item.id}`)).json()) as FlyerPayload;
  payload.flyer.data.photoMode = c.mode;
  await page.addInitScript((p) => ((window as unknown as { __FLYER_PAYLOAD: unknown }).__FLYER_PAYLOAD = p), payload);
  await page.goto(`${ORIGIN}/render.html`);
  await page.waitForFunction(() => (window as unknown as { __FLYER_READY?: boolean }).__FLYER_READY);
  return page.screenshot({ clip: { x: 0, y: 0, width: 1080, height: 1920 } });
}

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
let worst = 0;
for (const c of CASES) {
  const proto = await browser.newPage({ viewport: { width: 1200, height: 2200 } });
  const app = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
  const a = PNG.sync.read(await shootPrototype(proto, c));
  const b = PNG.sync.read(await shootApp(app, c));
  await proto.close();
  await app.close();
  if (a.width !== 1080 || a.height !== 1920) throw new Error(`Prototype shot is ${a.width}×${a.height}`);
  if (c.mode !== 'none') {
    for (const img of [a, b])
      for (let y = PHOTO_BAND.top; y < PHOTO_BAND.bottom; y++) img.data.fill(0, y * 1080 * 4, (y + 1) * 1080 * 4);
  }
  const diff = new PNG({ width: 1080, height: 1920 });
  const n = pixelmatch(a.data, b.data, diff.data, 1080, 1920, { threshold: 0.1 });
  const pct = (100 * n) / (1080 * 1920);
  worst = Math.max(worst, pct);
  const slug = `${c.record}-${c.mode}`.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  writeFileSync(join(OUT, `${slug}-design.png`), PNG.sync.write(a));
  writeFileSync(join(OUT, `${slug}-app.png`), PNG.sync.write(b));
  writeFileSync(join(OUT, `${slug}-diff.png`), PNG.sync.write(diff));
  console.log(`${c.record.padEnd(26)} ${c.mode.padEnd(6)} ${pct.toFixed(3)}% pixels differ  (${n})`);
}
await browser.close();
console.log(`\nWorst: ${worst.toFixed(3)}%. Diff images in ${OUT}`);
process.exit(worst <= 0.1 ? 0 : 1);
