import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { filesNaming } from '../../scripts/build-php.js';
import { PROOF_LOOK_ID } from '../proof/id.js';

/* The proof look never ships (the owner's answer 14). build:php walks the whole release for its id and refuses a
   release that holds it anywhere: the client build, the schemas, the PHP, the vendor folder, a file in any format. */

describe('a release that names the proof look', () => {
  const made: string[] = [];
  afterEach(() => {
    for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it('is found by the walk, file by file, however deep and in whatever format', () => {
    const dir = mkdtempSync(join(tmpdir(), 'nest-flyers-release-'));
    made.push(dir);
    mkdirSync(join(dir, 'static', 'deep'), { recursive: true });
    writeFileSync(join(dir, 'index.html'), '<!doctype html><title>Nest Flyers</title>');
    writeFileSync(join(dir, 'static', 'deep', 'app.js'), `const looks=["hand-drawn","${PROOF_LOOK_ID}"];`);
    writeFileSync(join(dir, 'static', 'font.woff2'), Buffer.concat([Buffer.from([0, 1, 2, 255]), Buffer.from(PROOF_LOOK_ID), Buffer.from([0])]));
    expect(filesNaming(dir, PROOF_LOOK_ID)).toEqual(['static/deep/app.js', 'static/font.woff2']);
  });

  it('is not seen where nothing names it', () => {
    const dir = mkdtempSync(join(tmpdir(), 'nest-flyers-release-'));
    made.push(dir);
    writeFileSync(join(dir, 'index.html'), '<!doctype html><title>proof</title>');
    expect(filesNaming(dir, PROOF_LOOK_ID)).toEqual([]);
  });
});
