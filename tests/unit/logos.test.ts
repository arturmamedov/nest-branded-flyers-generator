import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROOT } from '../../scripts/gen-shared.js';
import { SEED_FILE } from '../../server/paths.js';
import { marksFor, type EyebrowMarks } from '../../src/shared/defaults.js';
import { SeedFileSchema } from '../../src/shared/seed.js';

/* The marks at the eyebrow's right (the owner's call, 2026-09-30): one setting for every flyer, set in the code and
   never per flyer, until a pilot decides; and the hostels' badges that seed/hostels.json points at. */

describe('the eyebrow’s marks', () => {
  it('at a hostel with a badge, prints what the setting says: the badge, the wordmark, or the badge beside it', () => {
    expect(marksFor(true, 'hostel')).toEqual(['badge']);
    expect(marksFor(true, 'nests')).toEqual(['nests']);
    expect(marksFor(true, 'both')).toEqual(['badge', 'nests']);
  });

  it('chain-wide, or at a hostel with no badge, prints the Nests wordmark whatever the setting', () => {
    for (const marks of ['hostel', 'nests', 'both'] satisfies EyebrowMarks[]) expect(marksFor(false, marks)).toEqual(['nests']);
  });
});

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe('the hostels’ badges', () => {
  it('every logo_path in seed/hostels.json is a square PNG under assets/logos/', () => {
    const { hostels } = SeedFileSchema.parse(JSON.parse(readFileSync(SEED_FILE, 'utf8')));
    const problems = hostels.flatMap(({ slug, logo_path: path }) => {
      if (path === null) return [];
      if (!/^assets\/logos\/[a-z0-9-]+\.png$/.test(path)) return [`${slug}: ${path} is not a PNG in assets/logos/`];
      const file = join(ROOT, path);
      if (!existsSync(file)) return [`${slug}: ${path} is missing`];
      const png = readFileSync(file);
      if (!png.subarray(0, 8).equals(PNG_SIGNATURE)) return [`${slug}: ${path} is not a PNG`];
      // The IHDR chunk comes first: the width at byte 16, the height at byte 20.
      if (png.readUInt32BE(16) !== png.readUInt32BE(20)) return [`${slug}: ${path} is not square`];
      return [];
    });
    expect(problems).toEqual([]);
  });
});
