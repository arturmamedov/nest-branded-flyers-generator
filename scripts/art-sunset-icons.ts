import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { DEFAULT_COLORS } from '../src/shared/looks/handDrawn.js';
import { SUNSET_ICONS, SUNSET_VIBES, sunsetIconSlug, type SunsetIcon } from '../src/shared/looks/sunsetVibes.js';
import { ART_DIR } from './art-inks.js';
import { ROOT } from './gen-shared.js';

/* The Sunset look's icons (its README §5, §7.15): the handoff draws them as inline SVG in the line colour; the app's
   inline slots are PNG files, so each ink gets its own file, rasterised here from the paths the look holds
   (SUNSET_ICONS), never drawn by hand:

     npm run gen:art

   tests/unit/art-sunset-icons.test.ts holds the committed files to what this makes. */

/** Drawn at twice the size the design draws them, so the 1080 px canvas gets a crisp edge at any size a kind draws. */
export const ICON_SCALE = 2;

/** The icon's size in canvas px, as the design draws it (its SVG size times the scale its box gives it). */
export const iconPx = (icon: SunsetIcon) => SUNSET_ICONS[icon].drawn * SUNSET_ICONS[icon].scale;

/** The SVG the file is made from: the look's paths, stroked in the ink, at ICON_SCALE times the drawn size. */
export function iconSvg(icon: SunsetIcon, ink: string): string {
  const { viewBox, stroke, body } = SUNSET_ICONS[icon];
  const size = Math.round(iconPx(icon) * ICON_SCALE);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${viewBox}" fill="none" stroke="${ink}" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
}

/** The inks the look's icons are printed in: its line colour, per colour set (Day alone today). */
export const iconInks = (): string[] => [SUNSET_VIBES.palette({ colors: DEFAULT_COLORS }).line];

/** Every icon file, by slug, as a PNG. */
export async function renderIcons(): Promise<Record<string, Buffer>> {
  const out: Record<string, Buffer> = {};
  for (const ink of iconInks())
    for (const icon of Object.keys(SUNSET_ICONS) as SunsetIcon[]) out[sunsetIconSlug(icon, ink)] = await sharp(Buffer.from(iconSvg(icon, ink))).png().toBuffer();
  return out;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  for (const [slug, png] of Object.entries(await renderIcons())) {
    const file = join(ROOT, ART_DIR, `${slug}.png`);
    writeFileSync(file, png);
    const { width, height } = await sharp(png).metadata();
    console.log(`wrote ${ART_DIR}/${slug}.png (${width} × ${height})`);
  }
}
