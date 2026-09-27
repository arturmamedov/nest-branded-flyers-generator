import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { backupDeployment } from '../../scripts/php/backup-deploy.js';
import { resetDeployData } from '../../scripts/php/reset-deploy.js';
import { restoreDeployment } from '../../scripts/php/restore-deploy.js';
import { startStage, writeTestConfig, type ServedStage } from '../../scripts/php/serve.js';
import { FIXTURE_PHOTOS_DIR } from '../../server/paths.js';
import { FlyerSavedSchema, FlyerListItemSchema, PhotoInfoSchema, type PhotoInfo } from '../../src/shared/schema.js';
import { SAMPLE_FLYERS } from '../../src/shared/samples.js';

/* "Copy data/ and uploads/ back" as a rehearsed fact rather than a sentence:
   a PHP deployment makes a flyer and stores a photo, deploy:backup copies the
   library out, deploy:reset wipes it (the app re-seeds an empty one), and
   deploy:restore puts it back. The flyer must list again and the photo must
   come back byte for byte, through the app, not just on disk. */

const SAMPLE = SAMPLE_FLYERS.find((s) => s.photo)!;

let served: ServedStage;
const sha256 = (bytes: ArrayBuffer | Buffer) => createHash('sha256').update(new Uint8Array(bytes)).digest('hex');
const at = (path: string) => new URL(path, served.server.baseUrl);
const WRITE = { 'X-Nest-Flyers': '1' };

beforeAll(async () => {
  served = await startStage({ prefix: 'nest-flyers-drill-' });
});
afterAll(() => served?.server.stop());

async function flyerTitles(): Promise<string[]> {
  const res = await fetch(at('api/flyers'));
  expect(res.status).toBe(200);
  return FlyerListItemSchema.array().parse(await res.json()).map((f) => f.title);
}

describe('back up, wipe, restore', () => {
  it('refuses a deployment whose library is not in data/, where a backup would silently be empty', () => {
    // startStage keeps the store outside the stage, as a host keeps it outside public_html.
    expect(() => backupDeployment(served.stage, join(served.root, 'backups'))).toThrow(/not in data\//);
  });

  it('brings back the flyer and the photo', async () => {
    writeTestConfig(served.stage, join(served.stage, 'data'));

    const form = new FormData();
    form.append('photo', new Blob([new Uint8Array(readFileSync(join(FIXTURE_PHOTOS_DIR, SAMPLE.photo!)))]), SAMPLE.photo!);
    const uploaded = await fetch(at('api/photos'), { method: 'POST', headers: WRITE, body: form });
    expect(uploaded.status, await uploaded.clone().text()).toBe(201);
    const photo: PhotoInfo = PhotoInfoSchema.parse(await uploaded.json());
    const photoBytes = sha256(await (await fetch(at(photo.url))).arrayBuffer());

    const title = `Restore drill ${Date.now().toString(36)}`;
    const created = await fetch(at('api/flyers'), {
      method: 'POST',
      headers: { ...WRITE, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, hostel: SAMPLE.hostel, template: 'activity', data: SAMPLE.data, photoId: photo.id }),
    });
    expect(created.status, await created.clone().text()).toBe(201);
    const { id } = FlyerSavedSchema.parse(await created.json());

    const backup = backupDeployment(served.stage, join(served.root, 'backups'));
    expect(JSON.parse(readFileSync(join(backup, 'backup.json'), 'utf8'))).toMatchObject({ flyers: 1, photos: 1, config: true });

    resetDeployData(served.stage);
    expect(await flyerTitles()).toEqual([]); // the app re-seeded an empty library
    expect((await fetch(at(photo.url))).status).toBe(404);

    restoreDeployment(backup, served.stage);
    expect(await flyerTitles()).toEqual([title]);
    const again = await fetch(at(`api/flyers/${id}`));
    expect(again.status).toBe(200);
    expect((await again.json()).photo).toEqual(photo);
    const restoredPhoto = await fetch(at(photo.url));
    expect(restoredPhoto.status).toBe(200);
    expect(sha256(await restoredPhoto.arrayBuffer())).toBe(photoBytes);

    // A second restore would now replace real work: it has to be asked for.
    expect(() => restoreDeployment(backup, served.stage)).toThrow(/already holds 1 flyers, 1 photos/);
    expect(() => restoreDeployment(backup, served.stage, { force: true })).not.toThrow();
    expect(await flyerTitles()).toEqual([title]);
  });
});
