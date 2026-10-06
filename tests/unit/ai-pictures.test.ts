import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAiService } from '../../server/ai/composition.js';
import { createFileAiPictures } from '../../server/ai/pictures.js';
import { createApp } from '../../server/app.js';
import { loadAiSettings } from '../../server/config.js';
import { createSqliteRepositories } from '../../server/storage/sqlite/index.js';
import { AI_FEATURES, AI_PICTURE_DAYS, AI_SHARED, aiDay } from '../../src/shared/ai.js';
import { AI_PICTURE_PATH, STORAGE_FILES } from '../../src/shared/storage.js';
import { FakeClock } from '../storage/repositories.contract.js';

/* What a site keeps of a picture read (the owner's answer, 2026-10-06: "Keep the picture for 30 days too"): the
   prepared picture, in the data folder, never served, under the Canary day it was read on. With no cron on a shared
   host the app deletes what is past its days itself, inside a request every visit makes (GET api/config), at most
   once a day, whether or not the AI is on. php/tests/Ai/FileAiPicturesTest.php and BootstrapTest hold PHP to the same. */

const DAY_MS = 24 * 60 * 60 * 1000;
const dirs: string[] = [];
const dataDir = () => {
  const dir = mkdtempSync(join(tmpdir(), 'nest-flyers-ai-pictures-'));
  dirs.push(dir);
  return dir;
};
afterEach(() => {
  vi.restoreAllMocks();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const kept = (root: string) => (existsSync(join(root, STORAGE_FILES.aiPicturesDir)) ? readdirSync(join(root, STORAGE_FILES.aiPicturesDir)).sort() : null);
/** A day's folder with one picture in it, as a read on that day leaves it. */
const aDay = (root: string, day: string) => {
  mkdirSync(join(root, STORAGE_FILES.aiPicturesDir, day), { recursive: true });
  writeFileSync(join(root, STORAGE_FILES.aiPicturesDir, day, '0123456789abcdef.jpg'), 'a picture');
};

describe('the kept pictures', () => {
  it('thirty days, in a folder of the data folder: shared facts', () => {
    expect(AI_PICTURE_DAYS).toBe(30);
    expect(AI_SHARED.pictureDays).toBe(AI_PICTURE_DAYS);
    expect(STORAGE_FILES.aiPicturesDir).toBe('ai-pictures');
  });

  it('keeps a picture under its day, with a name nobody can guess, and answers where', () => {
    const root = dataDir();
    const pictures = createFileAiPictures(root);
    const path = pictures.keep('2026-10-07', { bytes: Buffer.from('jpeg bytes'), ext: 'jpg' });
    expect(path).toMatch(AI_PICTURE_PATH);
    expect(path).toMatch(/^ai-pictures\/2026-10-07\/[0-9a-f]{16}\.jpg$/);
    expect(readFileSync(join(root, path), 'utf8')).toBe('jpeg bytes');
    const png = pictures.keep('2026-10-07', { bytes: Buffer.from('png bytes'), ext: 'png' });
    expect(png).toMatch(/\.png$/);
    expect(png).not.toBe(path);
  });

  it('a disk that cannot take the picture is an error, so a read stops before anything is spent', () => {
    const root = dataDir();
    writeFileSync(join(root, STORAGE_FILES.aiPicturesDir), 'a file where the folder belongs');
    expect(() => createFileAiPictures(root).keep('2026-10-07', { bytes: Buffer.from('x'), ext: 'jpg' })).toThrow();
  });

  it('deletes a day’s pictures once that day is more than thirty days back, and nothing else', () => {
    const root = dataDir();
    for (const day of ['2026-09-01', '2026-09-06', '2026-09-07', '2026-10-07']) aDay(root, day);
    mkdirSync(join(root, STORAGE_FILES.aiPicturesDir, 'not-a-day'));
    writeFileSync(join(root, STORAGE_FILES.aiPicturesDir, '2026-01-01.txt'), 'not a day’s folder either');
    writeFileSync(join(root, 'meta.json'), '{}');

    createFileAiPictures(root).sweep('2026-10-07');
    // 7 September is thirty days before 7 October: kept. The 6th is thirty-one: gone.
    expect(kept(root)).toEqual(['.swept', '2026-01-01.txt', '2026-09-07', '2026-10-07', 'not-a-day']);
    expect(readdirSync(join(root, STORAGE_FILES.aiPicturesDir, '2026-09-07'))).toEqual(['0123456789abcdef.jpg']);
    expect(readdirSync(root).sort()).toEqual(['ai-pictures', 'meta.json']);
  });

  it('sweeps at most once a day, whichever process asks: the folder remembers the day', () => {
    const root = dataDir();
    aDay(root, '2026-10-07');
    const first = createFileAiPictures(root);
    first.sweep('2026-10-07');
    expect(readFileSync(join(root, STORAGE_FILES.aiPicturesDir, '.swept'), 'utf8')).toBe('2026-10-07');
    // Something old turns up later the same day (a backup put back): it waits for tomorrow's sweep.
    aDay(root, '2026-01-01');
    first.sweep('2026-10-07');
    createFileAiPictures(root).sweep('2026-10-07');
    expect(kept(root)).toContain('2026-01-01');
    createFileAiPictures(root).sweep('2026-10-08');
    expect(kept(root)).toEqual(['.swept', '2026-10-07']);
  });

  it('a site that never read a picture gets no folder from a sweep', () => {
    const root = dataDir();
    createFileAiPictures(root).sweep('2026-10-07');
    expect(kept(root)).toBeNull();
  });

  it('a sweep that fails says so once in the log and never throws: it runs inside a request every visit makes', () => {
    const root = dataDir();
    writeFileSync(join(root, STORAGE_FILES.aiPicturesDir), 'a file where the folder belongs');
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const pictures = createFileAiPictures(root);
    expect(() => pictures.sweep('2026-10-07')).not.toThrow();
    pictures.sweep('2026-10-07');
    expect(logged).toHaveBeenCalledTimes(1);
    expect(String(logged.mock.calls[0][0])).toContain('ai-pictures');
  });
});

describe.each([
  ['with the AI off', {}],
  ['with the AI on', { AI_PROVIDER: 'fake', AI_FEATURES: AI_FEATURES.join(',') }],
])('GET api/config, %s', (_name, env) => {
  it('deletes the pictures past their thirty days, counted on the injected clock’s Canary day', async () => {
    const root = dataDir();
    const clock = new FakeClock();
    const repos = createSqliteRepositories({ file: ':memory:' });
    try {
      const ai = createAiService(loadAiSettings(env), { hostels: repos.hostels, usage: repos.aiUsage, clock });
      const app = createApp({ repos, storage: 'sqlite', uploadsDir: join(root, 'uploads'), buildId: 'test', ai, clock, aiPictures: createFileAiPictures(root) });
      const read = aiDay(clock.now());
      aDay(root, read);

      await request(app).get('/api/config').expect(200);
      expect(kept(root)).toEqual(['.swept', read]);
      clock.tick(AI_PICTURE_DAYS * DAY_MS);
      await request(app).get('/api/config').expect(200);
      expect(kept(root), 'thirty days on, it is still kept').toEqual(['.swept', read]);
      clock.tick(DAY_MS);
      await request(app).get('/api/config').expect(200);
      expect(kept(root), 'a day later it is gone').toEqual(['.swept']);
      // Only api/config sweeps: it is the one read that deletes.
      aDay(root, read);
      clock.tick(DAY_MS);
      await request(app).get('/api/hostels').expect(200);
      expect(kept(root)).toEqual(['.swept', read]);
    } finally {
      await repos.close();
    }
  });
});
