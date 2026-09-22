import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { afterAll, describe, expect, inject, it } from 'vitest';
import { RELEASE_LAYOUT, type DeniedDir } from '../../scripts/php/layout.js';
import { config, url } from './client.js';

/* The PHP release on a public host (docs/prompts/php-shared-hosting.md,
   Security): no code, data or config is reachable over HTTP, folders don't
   list, and uploads/ never runs a script or serves anything but images.
   Driven by RELEASE_LAYOUT, so a newly denied entry is probed as soon as it is
   listed. In the php project this judges router.php under php -S; through
   CONTRACT_BASE_URL it judges the .htaccess rules on Apache. */

const isPhp = (await config()).backend === 'php';
const stageDir = inject('stageDir');

/** A file that really exists in each denied folder of a stage, so a 404 can't just mean "not there".
    data/meta.json exists only where the store lives in the web root (not in the test stage, whose store is outside). */
const PROBES: Record<DeniedDir, string> = {
  src: 'src/Bootstrap.php',
  vendor: 'vendor/autoload.php',
  seed: 'seed/hostels.json',
  schema: 'schema/shared.json',
  data: 'data/meta.json',
};

/** Spellings a case-insensitive file system (Windows, macOS hosts) maps onto the same file, and a percent-encoded
    one that must be decoded before any rule matches it. */
function variants(path: string): string[] {
  const [first, ...rest] = path.split('/');
  const letter = /[a-z]/.exec(path);
  return [
    path,
    [first.toUpperCase(), ...rest].join('/'),
    path.replace(/[a-z]/, (c) => c.toUpperCase()),
    letter ? path.replace(/[a-z]/, (c) => '%' + c.charCodeAt(0).toString(16)) : path,
  ].filter((v, i, all) => all.indexOf(v) === i);
}

async function get(path: string) {
  const res = await fetch(url(path));
  return { status: res.status, body: await res.text() };
}

async function expectDenied(path: string) {
  const { status, body } = await get(path);
  expect([403, 404], `GET ${path} answered ${status}`).toContain(status);
  expect(body, `GET ${path} leaked PHP source`).not.toContain('<?php');
}

describe.skipIf(!isPhp)('PHP release: nothing but the app is served', () => {
  const dirPaths = RELEASE_LAYOUT.deniedDirs.flatMap((dir) => [...variants(`${dir}/`), ...variants(PROBES[dir])]);
  it.each(dirPaths)('denies %s', expectDenied);

  const filePaths = RELEASE_LAYOUT.deniedFiles.flatMap((file) => variants(file));
  it.each(filePaths)('denies %s', expectDenied);

  it.each(['uploads/', 'assets/', 'assets/art/'])('does not list %s', async (path) => {
    const { status, body } = await get(path);
    expect(status === 200 && /Index of/i.test(body), `GET ${path} listed the folder`).toBe(false);
  });

  it.skipIf(!stageDir)('probes real files, so a 404 proves the rule', () => {
    for (const dir of RELEASE_LAYOUT.deniedDirs) {
      expect(existsSync(join(stageDir!, dir)), `${dir}/ exists in the stage`).toBe(true);
      if ((RELEASE_LAYOUT.writableDirs as readonly string[]).includes(dir)) continue;
      expect(existsSync(join(stageDir!, PROBES[dir])), `${PROBES[dir]} exists in the stage`).toBe(true);
    }
    // Every denied file too: a 404 for a file that is simply absent proves nothing.
    for (const file of RELEASE_LAYOUT.deniedFiles) {
      expect(existsSync(join(stageDir!, file)), `${file} exists in the stage`).toBe(true);
    }
  });
});

describe.skipIf(!isPhp || !stageDir)('PHP release: uploads/ never runs or serves a planted file', () => {
  const PAYLOAD = "<?php echo 'EXECUTED'; ?>\n";
  const tag = `contract-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const nested = `uploads/${tag}`;
  const names = [
    ...['php', 'phtml', 'php.png', 'svg', 'html', 'PHP'].map((ext) => `uploads/x-${tag}.${ext}`),
    `${nested}/x.php`, // photos live in uploads/YYYY/MM/, so the rules must reach into subfolders
  ];
  const planted: string[] = [];

  afterAll(() => {
    for (const file of planted) rmSync(file, { force: true });
    rmSync(join(stageDir!, nested), { recursive: true, force: true });
  });

  it.each(names)('refuses %s', async (path) => {
    const file = join(stageDir!, ...path.split('/'));
    mkdirSync(dirname(file), { recursive: true });
    planted.push(file);
    writeFileSync(file, PAYLOAD);
    const { status, body } = await get(path);
    expect([403, 404], `GET ${path} answered ${status}`).toContain(status);
    expect(body, `GET ${path} ran or served the script`).not.toContain('EXECUTED');
  });
});
