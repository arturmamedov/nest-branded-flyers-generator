import { appendFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MANIFEST_FILE } from '../../scripts/php/layout.js';
import { writeManifest } from '../../scripts/php/manifest.js';
import { startStage, writeTestConfig, type ServedStage } from '../../scripts/php/serve.js';
import { stagePhp } from '../../scripts/php/stage.js';
import type { DeployedRelease, TagOutcome } from '../../scripts/php/tag-release.js';
import { HTACCESS_KEPT, updateDeployment } from '../../scripts/php/update-deploy.js';
import { FIXTURE_PHOTOS_DIR } from '../../server/paths.js';
import { SAMPLE_FLYERS } from '../../src/shared/samples.js';
import { FlyerListItemSchema, FlyerSavedSchema, PhotoInfoSchema, type PhotoInfo } from '../../src/shared/schema.js';
import { WRITE_HEADERS } from '../../src/shared/writeGuard.js';
import { sha256, snapshot } from './snapshot.js';

/* npm run deploy:update, rehearsed as the restore drill rehearses a backup: a served PHP deployment with a flyer and a
   photo in it gets a newer release put over it. The app must then name the new release with nothing missing or
   changed, and the library, the photos, config.php and a file nobody shipped must be exactly what they were. The
   build is a second stage with one file changed (a real build takes a minute and writes release/php), and the tag
   step is a recorder: no test tags this repository. */

const SAMPLE = SAMPLE_FLYERS.find((s) => s.photo)!;

let served: ServedStage;
const at = (path: string) => new URL(path, served.server.baseUrl);

beforeAll(async () => {
  served = await startStage({ prefix: 'nest-flyers-update-' });
});
afterAll(() => served?.server.stop());

/** A newer release of the same app, beside the stage: one shipped file differs, so its id does. */
function newerRelease(name: string): { dir: string; id: string } {
  const dir = stagePhp(join(served.root, name), { dist: false, vendor: 'shim' });
  appendFileSync(join(dir, 'robots.txt'), `\n# ${name}\n`);
  rmSync(join(dir, MANIFEST_FILE));
  return { dir, id: writeManifest(dir).id };
}

/** The tag step, recording what it was asked. */
function recorder() {
  const asked: { id: string; site: string }[] = [];
  const tag = (release: DeployedRelease, site: string): TagOutcome => {
    asked.push({ id: release.id, site });
    return { tag: `release/${release.id}`, commit: 'abc1234', made: true };
  };
  return { asked, tag };
}

async function release(): Promise<{ id: string; missing: string[]; changed: string[] }> {
  const config = (await (await fetch(at('api/config'))).json()) as { server: { release: { id: string; missing: string[]; changed: string[] } } };
  return config.server.release;
}

describe('a newer release over a deployment', () => {
  it('refuses a folder that is no deployment, before anything is backed up or built', () => {
    const folder = mkdtempSync(join(tmpdir(), 'nest-flyers-not-a-deployment-'));
    try {
      let built = 0;
      const build = () => {
        built++;
        return { dir: folder };
      };
      expect(() => updateDeployment(folder, { backupsInto: join(served.root, 'never'), build, tag: recorder().tag })).toThrow(/not a Nest flyers deployment/);
      expect(built).toBe(0);
      expect(existsSync(join(served.root, 'never'))).toBe(false);
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  it('refuses a "release" that holds a config.php: copying it would replace the copy’s own', () => {
    writeTestConfig(served.stage, join(served.stage, 'data'));
    const mine = readFileSync(join(served.stage, 'config.php'));
    const bad = newerRelease('with-config');
    writeFileSync(join(bad.dir, 'config.php'), '<?php return [];');
    expect(() => updateDeployment(served.stage, { backupsInto: join(served.root, 'backups-refused'), build: () => ({ dir: bad.dir }), tag: recorder().tag })).toThrow(
      /config\.php/,
    );
    expect(readFileSync(join(served.stage, 'config.php')).equals(mine)).toBe(true);
  });

  it('puts the release there and leaves the library, the photos, config.php and a file nobody shipped as they were', async () => {
    writeTestConfig(served.stage, join(served.stage, 'data'));

    const form = new FormData();
    form.append('photo', new Blob([new Uint8Array(readFileSync(join(FIXTURE_PHOTOS_DIR, SAMPLE.photo!)))]), SAMPLE.photo!);
    const uploaded = await fetch(at('api/photos'), { method: 'POST', headers: WRITE_HEADERS, body: form });
    expect(uploaded.status, await uploaded.clone().text()).toBe(201);
    const photo: PhotoInfo = PhotoInfoSchema.parse(await uploaded.json());
    const photoBytes = sha256(new Uint8Array(await (await fetch(at(photo.url))).arrayBuffer()));

    const title = `Update drill ${Date.now().toString(36)}`;
    const created = await fetch(at('api/flyers'), {
      method: 'POST',
      headers: { ...WRITE_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, hostel: SAMPLE.hostel, template: 'activity', data: SAMPLE.data, photoId: photo.id }),
    });
    expect(created.status, await created.clone().text()).toBe(201);
    const { id } = FlyerSavedSchema.parse(await created.json());

    // What a copy holds beside a release: a file of its owner's, and a root .htaccess with a block pasted in.
    writeFileSync(join(served.stage, 'keep-me.txt'), 'mine');
    appendFileSync(join(served.stage, '.htaccess'), '\n# a lock pasted by hand\n');
    const pasted = readFileSync(join(served.stage, '.htaccess'));

    const before = { release: await release(), data: snapshot(join(served.stage, 'data')), uploads: snapshot(join(served.stage, 'uploads')), config: readFileSync(join(served.stage, 'config.php')) };
    const newer = newerRelease('newer');
    expect(newer.id).not.toBe(before.release.id);
    const { asked, tag } = recorder();

    const result = updateDeployment(served.stage, { backupsInto: join(served.root, 'backups'), build: () => ({ dir: newer.dir }), tag });

    // The app names the new release, whole.
    expect(result.release.id).toBe(newer.id);
    expect(await release()).toMatchObject({ id: newer.id, missing: [], changed: [] });
    // Nothing of the copy's own moved.
    expect(snapshot(join(served.stage, 'data'))).toEqual(before.data);
    expect(snapshot(join(served.stage, 'uploads'))).toEqual(before.uploads);
    expect(readFileSync(join(served.stage, 'config.php')).equals(before.config)).toBe(true);
    expect(readFileSync(join(served.stage, 'keep-me.txt'), 'utf8')).toBe('mine');
    // And through the app: the flyer is listed, its photo comes back byte for byte.
    const listed = FlyerListItemSchema.array().parse(await (await fetch(at('api/flyers'))).json());
    expect(listed.map((f) => [f.id, f.title])).toEqual([[id, title]]);
    expect(sha256(new Uint8Array(await (await fetch(at(photo.url))).arrayBuffer()))).toBe(photoBytes);

    // The backup was taken first, and holds what the release replaced without saying: the pasted block.
    expect(JSON.parse(readFileSync(join(result.backup, 'backup.json'), 'utf8'))).toMatchObject({ flyers: 1, photos: 1, config: true, release: before.release.id });
    expect(result.htaccessKept).toBe(join(result.backup, HTACCESS_KEPT));
    expect(readFileSync(result.htaccessKept!).equals(pasted)).toBe(true);
    expect(readFileSync(join(served.stage, '.htaccess')).equals(readFileSync(join(newer.dir, '.htaccess')))).toBe(true);

    // The tag step ran once, for that release and this folder.
    expect(asked).toEqual([{ id: newer.id, site: served.stage }]);
    expect(result.tag).toMatchObject({ tag: `release/${newer.id}`, made: true });
    expect(result.tagRefused).toBeNull();
  });

  it('says why there is no tag, and does not fail: by then the copy is updated', async () => {
    const again = newerRelease('newer-again');
    const refusing = () => {
      throw new Error('Release x was built from a checkout with uncommitted changes (abc1234-dirty)');
    };
    const result = updateDeployment(served.stage, { backupsInto: join(served.root, 'backups-again'), build: () => ({ dir: again.dir }), tag: refusing });
    expect(result.tag).toBeNull();
    expect(result.tagRefused).toContain('uncommitted changes');
    expect((await release()).id).toBe(again.id);
    // Its .htaccess was the last release's own this time: nothing to keep.
    expect(result.htaccessKept).toBeNull();
  });
});
