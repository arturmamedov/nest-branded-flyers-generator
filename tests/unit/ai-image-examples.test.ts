import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { namesItsFormat, readPicture } from '../../scripts/ai/smoke.js';
import { loadBundle } from '../../server/ai/bundle.js';
import { APP_ROOT } from '../../server/paths.js';
import { preparePhoto } from '../../server/services/photos.js';
import { AI_INPUT_MAX, AI_PICTURE_MAX_EDGE } from '../../src/shared/ai.js';
import { AiExampleSchema } from '../../src/shared/schema.js';
import { expectOwnersRules } from '../briefRules.js';

/* The picture reads' eval set (docs/ai-flyers/image-examples/): a case is `<date>-<hostel>-<name>.json` with its
   picture beside it under the same name. `source` is the words the picture prints, typed out: what a read should
   give. `brief` is the flyer those words should give. Each picture goes into git only after the owner has looked at
   it (2026-10-06: "Yes, shrunk and checked"), as the read would send it: no larger than the read's edge, without
   its metadata, and in the format the read sends. `npm run gen` does not read the folder: a picture is never a turn
   of the few-shot.
   A checkout with no case yet holds nothing to check. */

const DIR = join(APP_ROOT, 'docs', 'ai-flyers', 'image-examples');
const files = existsSync(DIR) ? readdirSync(DIR).sort() : [];
const cases = files.filter((f) => f.endsWith('.json'));
const PICTURE = /\.(png|jpe?g|webp)$/;

describe('the image examples', () => {
  it('holds nothing but cases and their pictures, each named by its date, its hostel and what it is', () => {
    for (const f of files) expect(f, 'a case is <date>-<hostel>-<name>.json, its picture the same name').toMatch(/^\d{4}-\d{2}-\d{2}-[a-z0-9]+(-[a-z0-9]+)+\.(json|png|jpe?g|webp)$/);
    // No picture without its case: a picture nobody typed out proves nothing, and may be one nobody looked at.
    for (const picture of files.filter((f) => PICTURE.test(f))) expect(cases, picture).toContain(picture.replace(PICTURE, '.json'));
  });

  it.each(cases)('%s is an example file whose words fit the idea box, with its one picture beside it', (file) => {
    const example = AiExampleSchema.parse(JSON.parse(readFileSync(join(DIR, file), 'utf8')));
    expect([...example.source].length).toBeLessThanOrEqual(AI_INPUT_MAX);
    const name = file.slice(0, -'.json'.length);
    expect(files.filter((f) => PICTURE.test(f) && f.replace(PICTURE, '') === name), 'one picture, under the same name').toHaveLength(1);
    // The smoke script finds it the same way: `npm run ai:smoke -- --photo <this file>`.
    expect(readPicture(join(DIR, file)).expected).toBe(example.source);
  });

  it.each(cases)('%s keeps its picture as a read would send it: no larger than the read’s edge, without metadata, in the read’s format', async (file) => {
    const { bytes, label } = readPicture(join(DIR, file));
    const meta = await sharp(bytes).metadata();
    expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBeLessThanOrEqual(AI_PICTURE_MAX_EDGE);
    expect([meta.exif, meta.orientation, meta.xmp, meta.iptc]).toEqual([undefined, undefined, undefined, undefined]);
    // And the server takes it as it is: nothing is shrunk or turned on the way to the model.
    const sent = await preparePhoto(bytes, AI_PICTURE_MAX_EDGE);
    expect([sent.width, sent.height]).toEqual([meta.width, meta.height]);
    // Nor is its format changed. A PNG without transparency goes out as a JPEG, so that JPEG is the case's picture,
    // under a name that says so: `npm run ai:smoke -- --photo … --save` writes it, and holds its name the same way.
    expect(`image/${meta.format}`, 'a case keeps the format a read sends').toBe(sent.mediaType);
    expect(namesItsFormat(label, sent), `${label} is sent as ${sent.mediaType}`).toBe(true);
  });

  // A case's brief is the flyer its words should give, so it follows the rules a flyer follows (tests/briefRules.ts).
  it.each(cases)('%s gives a flyer that follows the owner’s own: no full stop ending the title, no stand-in price, English first', (file) => {
    expectOwnersRules(AiExampleSchema.parse(JSON.parse(readFileSync(join(DIR, file), 'utf8'))).brief, file);
  });

  it('is not part of the few-shot: no case’s words are a turn of the bundle', () => {
    const turns = loadBundle().examples.map((e) => e.text);
    for (const file of cases) expect(turns, file).not.toContain(AiExampleSchema.parse(JSON.parse(readFileSync(join(DIR, file), 'utf8'))).source);
  });
});
