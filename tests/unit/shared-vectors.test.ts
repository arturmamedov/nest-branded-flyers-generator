import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { API_ERRORS, apiError, formatMb } from '../../src/shared/errors.js';
import { flyerFilename } from '../../src/shared/filename.js';
import { HEIC, fitLongEdge, isHeic } from '../../src/shared/limits.js';
import { normalizeFlyerInput } from '../../src/shared/normalize.js';
import { SAMPLE_FLYERS } from '../../src/shared/samples.js';

/* The shared rules, checked against the vectors in tests/fixtures — the same
   files PHPUnit replays against the PHP implementation. */

const fixture = <T>(name: string): T => JSON.parse(readFileSync(join(import.meta.dirname, '../fixtures', name), 'utf8')) as T;

describe('fitLongEdge', () => {
  const { maxEdge, cases } = fixture<{ maxEdge: number; cases: { in: [number, number]; out: [number, number] }[] }>('fit-long-edge.json');

  it('matches the vectors', () => {
    for (const c of cases) expect(Object.values(fitLongEdge(c.in[0], c.in[1], maxEdge)), c.in.join('×')).toEqual(c.out);
  });

  it('the vectors are what sharp really does', async () => {
    for (const c of cases) {
      const { info } = await sharp({ create: { width: c.in[0], height: c.in[1], channels: 3, background: '#888' } })
        .resize({ width: maxEdge, height: maxEdge, fit: 'inside', withoutEnlargement: true })
        .raw()
        .toBuffer({ resolveWithObject: true });
      expect([info.width, info.height], c.in.join('×')).toEqual(c.out);
    }
  }, 60_000); // a few of the inputs are 100 MP blanks
});

describe('EXIF orientation', () => {
  type Orientation = {
    marker: { width: number; height: number; colors: Record<string, string> };
    cases: { orientation: number; out: [number, number]; quadrants: string[] }[];
  };
  const { marker, cases } = fixture<Orientation>('orientation.json');
  const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

  it('the vectors are what sharp really does for orientations 1–8', async () => {
    const { width: w, height: h, colors } = marker;
    const quarter = (c: string) => sharp({ create: { width: w / 2, height: h / 2, channels: 3, background: c } }).png().toBuffer();
    const png = await sharp({ create: { width: w, height: h, channels: 3, background: '#000' } })
      .composite([
        { input: await quarter(colors.red), left: 0, top: 0 },
        { input: await quarter(colors.green), left: w / 2, top: 0 },
        { input: await quarter(colors.blue), left: 0, top: h / 2 },
        { input: await quarter(colors.white), left: w / 2, top: h / 2 },
      ])
      .png()
      .toBuffer();
    for (const c of cases) {
      const jpg = await sharp(png).jpeg({ quality: 95 }).withMetadata({ orientation: c.orientation }).toBuffer();
      const { data, info } = await sharp(jpg).rotate().raw().toBuffer({ resolveWithObject: true });
      expect([info.width, info.height], `orientation ${c.orientation}`).toEqual(c.out);
      const [x0, x1, y0, y1] = [info.width / 4, (3 * info.width) / 4, info.height / 4, (3 * info.height) / 4].map(Math.floor);
      const points = [[x0, y0], [x1, y0], [x0, y1], [x1, y1]];
      points.forEach(([x, y], i) => {
        const got = [...data.subarray((y * info.width + x) * 3, (y * info.width + x) * 3 + 3)];
        const want = rgb(colors[c.quadrants[i]]);
        got.forEach((v, k) => expect(Math.abs(v - want[k]), `orientation ${c.orientation} quadrant ${i}`).toBeLessThan(40));
      });
    }
  });
});

describe('errors', () => {
  it('formatMb matches the vectors', () => {
    for (const c of fixture<{ cases: { bytes: number; text: string }[] }>('format-mb.json').cases) expect(formatMb(c.bytes)).toBe(c.text);
  });

  it('apiError fills placeholders and leaves the catalogue alone', () => {
    expect(apiError('too_large', { mb: '2.9' }).message).toBe('That photo is over 2.9 MB. Use a smaller JPG.');
    expect(apiError('unsupported_format', { format: 'GIF' })).toEqual({ status: 415, code: 'unsupported', message: 'GIF files are not supported. Use a JPG, PNG or WebP.' });
    expect(API_ERRORS.too_large.message).toContain('{mb}');
  });
});

describe('trim', () => {
  it('the JavaScript trim() vectors hold (zod trims with it)', () => {
    for (const c of fixture<{ cases: { input: string; trimmed: string }[] }>('js-trim.json').cases) expect(c.input.trim()).toBe(c.trimmed);
  });
});

describe('flyerFilename', () => {
  it('slugs the title the same for both exporters', () => {
    expect(flyerFilename('Pool party 19/9', 7, 'png')).toBe('pool-party-199.png');
    expect(flyerFilename('Ñandú  ¡fiesta! · sábado', 3, 'jpg')).toBe('nandu-fiesta-sabado.jpg');
    expect(flyerFilename('¿¡·!?', 12, 'png')).toBe('flyer-12.png');
  });
});

describe('isHeic', () => {
  it('knows the iPhone brands by their bytes', () => {
    for (const brand of HEIC.brands) expect(isHeic(Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftyp' + brand)]))).toBe(true);
    expect(isHeic(Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypavif')]))).toBe(false);
    expect(isHeic(Buffer.from('ftypheic'))).toBe(false);
  });
});

describe('normalizeFlyerInput', () => {
  it('turns an empty hostel into chain-wide and lets the template column win', () => {
    const data = { ...SAMPLE_FLYERS[0].data, template: 'week' as const };
    expect(normalizeFlyerInput({ title: 't', hostel: '', template: 'activity', data, photoId: null })).toEqual({
      title: 't',
      hostel: null,
      template: 'activity',
      data: { ...data, template: 'activity' },
      photoId: null,
    });
  });
});
