import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import { ART_DIR } from '../../scripts/art-inks.js';
import { ICON_SCALE, iconInks, iconPx, iconSvg, renderIcons } from '../../scripts/art-sunset-icons.js';
import { ROOT } from '../../scripts/gen-shared.js';
import { SUNSET_ICONS, SUNSET_VIBES, sunsetIconSlug, type SunsetIcon } from '../../src/shared/looks/sunsetVibes.js';

/* The Sunset look's icons are made by scripts/art-sunset-icons.ts (npm run gen:art) from the paths the look holds,
   one file per ink, never drawn by hand: these tests hold the committed files to what the script makes. An SVG is
   rasterised by the machine's librsvg, whose anti-aliasing may differ a little from another's, so the committed
   alpha is held to the script's within a small share of pixels, not byte for byte. */

const read = (slug: string) => PNG.sync.read(readFileSync(join(ROOT, ART_DIR, `${slug}.png`)));
const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

describe('the Sunset look’s icons', () => {
  it('are the four the look names, each the file of its ink', () => {
    expect(Object.keys(SUNSET_ICONS)).toEqual(['clock', 'pin', 'euro', 'pen']);
    const [ink] = iconInks();
    expect(iconInks()).toHaveLength(1);
    expect(SUNSET_VIBES.inline).toMatchObject({
      whenIcon: sunsetIconSlug('clock', ink),
      whereIcon: sunsetIconSlug('pin', ink),
      costIcon: sunsetIconSlug('euro', ink),
      askIcon: sunsetIconSlug('pen', ink),
    });
    expect(sunsetIconSlug('clock', '#0D6F82')).toBe('sunset-icon-clock-0d6f82');
  });

  it('are drawn at twice the size the design draws them, in the design’s stroke', () => {
    expect(ICON_SCALE).toBe(2);
    // The handoff (README §1.3): Lucide at 76 px, stroke 1.137, scaled × 1.2; the clock a 69 px circle, stroke 3.6, × 1.2.
    expect(iconPx('pin')).toBeCloseTo(91.2, 5);
    expect(iconPx('clock')).toBeCloseTo(82.8, 5);
    const svg = iconSvg('pin', '#0D6F82');
    expect(svg).toContain('width="182" height="182"');
    expect(svg).toContain('stroke="#0D6F82" stroke-width="1.137"');
    expect(svg).toContain('fill="none"');
  });

  it('each committed file is what the script makes today: its size, flat in its ink, the same shape', async () => {
    const made = await renderIcons();
    const [ink] = iconInks();
    expect(Object.keys(made).sort()).toEqual((Object.keys(SUNSET_ICONS) as SunsetIcon[]).map((icon) => sunsetIconSlug(icon, ink)).sort());
    const colour = rgb(ink);
    for (const [slug, png] of Object.entries(made)) {
      expect(existsSync(join(ROOT, ART_DIR, `${slug}.png`)), `${slug}: run npm run gen:art`).toBe(true);
      const kept = read(slug);
      const fresh = PNG.sync.read(png);
      expect([kept.width, kept.height], `${slug}: its size`).toEqual([fresh.width, fresh.height]);
      let inked = 0;
      let moved = 0;
      const offColour: string[] = [];
      for (let i = 0; i < kept.data.length; i += 4) {
        const a = kept.data[i + 3];
        if (a >= 128) {
          inked++;
          // A solid pixel is the ink; a soft edge's colour is the ink too, rounded through its alpha.
          if ([0, 1, 2].some((c) => Math.abs(kept.data[i + c] - colour[c]) > 2)) offColour.push(`${(i / 4) % kept.width},${Math.floor(i / 4 / kept.width)}`);
        }
        if (Math.abs(a - fresh.data[i + 3]) > 16) moved++;
      }
      expect(offColour.slice(0, 5), `${slug}: pixels in another colour`).toEqual([]);
      // A stroke this size is a few thousand pixels of ink at 2×.
      expect(inked, `${slug}: its ink`).toBeGreaterThan(2_000);
      expect(moved / (kept.width * kept.height), `${slug}: pixels whose alpha differs from the script's by more than 16`).toBeLessThan(0.005);
    }
  });
});
