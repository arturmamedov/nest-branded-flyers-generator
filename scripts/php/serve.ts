import { spawn } from 'node:child_process';
import { closeSync, copyFileSync, existsSync, mkdtempSync, openSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer, type AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { requirePhp } from './phpBin.js';
import { phpString, stagePhp, toPosix } from './stage.js';

/* A PHP stage served by `php -S` + router.php, for the contract suite and the
   smoke test. The ini flags make it a small shared host (2 MB uploads, 128 MB
   memory) in a non-UTC timezone, so limits, the post_max_size overflow and
   UTC timestamps are proven the way a host will see them. display_errors is
   left as the machine's php.ini has it (on, under Laragon) to prove the
   backend's own defence against warnings leaking into JSON. */

export const SERVE_INI: Readonly<Record<string, string>> = {
  upload_max_filesize: '2M',
  post_max_size: '3M',
  memory_limit: '128M',
  output_buffering: '4096',
  'date.timezone': 'Pacific/Kiritimati',
  // A test switches a running stage's access rule by rewriting config.php; OPcache could serve the old one.
  'opcache.enable_cli': '0',
};

export interface PhpServerOptions {
  /** The stage to serve (stagePhp's output, with a config.php). */
  stage: string;
  /** Defaults to requirePhp(): PHP_BIN, checked against >= 8.1. */
  phpBin?: string;
  /** Defaults to a free loopback port. */
  port?: number;
  /** Merged over SERVE_INI. */
  ini?: Readonly<Record<string, string>>;
  /** A throwaway folder under os.tmpdir() that stop() deletes, usually the one holding the stage and its data. */
  tempRoot?: string;
  /** Where php -S writes its log. Next to the stage, never inside it: a stage is exactly what ships. */
  logFile?: string;
}

export interface PhpServer {
  /** http://127.0.0.1:<port>/ (ends with '/', as the contract client expects). */
  baseUrl: string;
  logFile: string;
  /** Settles when php -S exits, for whatever reason. */
  exited: Promise<void>;
  /** Kills php -S, waits for it to exit, then deletes tempRoot (with retries: Windows keeps handles a moment). */
  stop(): Promise<void>;
}

const READY_TIMEOUT_MS = 20_000;
const POLL_MS = 100;

/** Throws unless `path` lies strictly inside os.tmpdir(). Test stages and their
    config.php live there only: Laragon's Apache serves the repo, and a loopback
    test config must never land in a release. */
export function assertInTmp(path: string, what: string): void {
  const rel = relative(resolve(tmpdir()), resolve(path));
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) throw new Error(`${what} must be inside ${tmpdir()} (got ${path}).`);
}

/** A free loopback port: listen on 0, read it, close. */
export function freePort(): Promise<number> {
  return new Promise((done, fail) => {
    const probe = createServer();
    probe.once('error', fail);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address() as AddressInfo;
      probe.close(() => done(port));
    });
  });
}

/** The end of a log, for error messages. */
function logTail(file: string, bytes = 4000): string {
  try {
    const text = readFileSync(file, 'utf8');
    return text.length > bytes ? '…' + text.slice(-bytes) : text || '(empty log)';
  } catch {
    return '(no log)';
  }
}

/** The access rule a test stage runs under. php -S reads config.php on every request, so a running stage can switch.
    - loopback-ips: the default. Loopback may use the API through allowIps, so the IP rule is exercised and
      allowPublic appears only in the local Laragon deploy.
    - basic: a staff login and nothing else, so loopback is challenged like anyone.
    - excluded-ips: an IP rule that does not include loopback (TEST-NET-1), and no login.
    - sample: config.sample.php copied as it ships: a config.php with no rule, the likeliest state on deploy night.
    - none: no config.php at all. */
export type AccessPosture =
  | { kind: 'loopback-ips' }
  | { kind: 'basic'; user: string; passwordHash: string }
  | { kind: 'excluded-ips' }
  | { kind: 'sample' }
  | { kind: 'none' };

/** An address range no test machine has: TEST-NET-1 (RFC 5737). */
export const EXCLUDED_RANGE = '192.0.2.0/24';

/** config.php for a test stage, with the store outside the stage, as a host keeps it outside public_html. */
export function writeTestConfig(stage: string, dataDir: string, access: AccessPosture = { kind: 'loopback-ips' }): void {
  assertInTmp(stage, 'A test config.php');
  if (!isAbsolute(dataDir)) throw new Error(`writeTestConfig: dataDir must be absolute (got ${dataDir}).`);
  const file = join(stage, 'config.php');
  if (access.kind === 'none') {
    rmSync(file, { force: true });
    return;
  }
  if (access.kind === 'sample') {
    copyFileSync(join(stage, 'config.sample.php'), file);
    return;
  }
  const rule = (() => {
    switch (access.kind) {
      case 'loopback-ips':
        return `'allowIps' => ['127.0.0.1/32', '::1/128'],
        'basicAuth' => null,`;
      case 'basic':
        return `'allowIps' => [],
        'basicAuth' => ['user' => ${phpString(access.user)}, 'passwordHash' => ${phpString(access.passwordHash)}],`;
      case 'excluded-ips':
        return `'allowIps' => [${phpString(EXCLUDED_RANGE)}],
        'basicAuth' => null,`;
    }
  })();
  const source = `<?php

declare(strict_types=1);

// Test stage only (scripts/php/serve.ts); never shipped. Access posture: ${access.kind}.
return [
    'access' => [
        ${rule}
        'allowPublic' => false,
    ],
    'dataDir' => ${phpString(toPosix(resolve(dataDir)))},
    'storage' => 'json',
    'imageProcessor' => 'auto',
];
`;
  writeFileSync(file, source);
}

/** One readiness probe: null once api/config answers as the PHP backend, else what it said instead. */
async function probe(configUrl: string): Promise<string | null> {
  try {
    const res = await fetch(configUrl, { signal: AbortSignal.timeout(2_000) });
    const text = await res.text();
    try {
      if (res.ok && (JSON.parse(text) as { backend?: unknown }).backend === 'php') return null;
    } catch {
      // Not JSON: fall through and report it.
    }
    return `${res.status}: ${text.slice(0, 300)}`;
  } catch (e) {
    return (e as Error).message;
  }
}

/** Serves `stage` with php -S and resolves once GET api/config answers as the PHP backend. */
export async function startPhpServer(options: PhpServerOptions): Promise<PhpServer> {
  const stage = resolve(options.stage);
  if (!existsSync(join(stage, 'router.php'))) throw new Error(`startPhpServer: ${stage} has no router.php; stage it with stagePhp first.`);
  if (options.tempRoot) assertInTmp(options.tempRoot, 'startPhpServer: tempRoot');
  const phpBin = options.phpBin ?? requirePhp();
  const port = options.port ?? (await freePort());
  const ini = { ...SERVE_INI, ...options.ini };
  const logFile = options.logFile ?? `${stage}.php-server.log`;
  const baseUrl = `http://127.0.0.1:${port}/`;

  const log = openSync(logFile, 'a');
  const args = [
    ...Object.entries(ini).flatMap(([key, value]) => ['-d', `${key}=${value}`]),
    '-S',
    `127.0.0.1:${port}`,
    '-t',
    stage,
    join(stage, 'router.php'),
  ];
  const child = spawn(phpBin, args, { cwd: stage, shell: false, windowsHide: true, stdio: ['ignore', log, log] });
  closeSync(log); // the child holds its own handle

  let exitReason: string | null = null;
  const exited = new Promise<void>((done) => {
    child.once('exit', (code, signal) => {
      exitReason ??= `exited with ${code ?? signal}`;
      done();
    });
    child.once('error', (e) => {
      exitReason = `could not start (${e.message})`;
      done();
    });
  });
  // A php -S outliving a crashed test run would hold its port and its temp folder.
  const killOnExit = () => child.kill();
  process.once('exit', killOnExit);

  let stopped: Promise<void> | null = null;
  const stop = () =>
    (stopped ??= (async () => {
      process.removeListener('exit', killOnExit);
      if (child.exitCode === null && child.signalCode === null && exitReason === null) child.kill();
      await exited;
      if (options.tempRoot) rmSync(options.tempRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    })());

  // The log is read before stop(), which may delete it along with tempRoot.
  const fail = async (why: string) => {
    const error = new Error(`${why}\n--- ${logFile}\n${logTail(logFile)}`);
    await stop();
    return error;
  };
  const deadline = Date.now() + READY_TIMEOUT_MS;
  for (;;) {
    const answer = await Promise.race([probe(baseUrl + 'api/config'), exited.then(() => 'exited')]);
    if (answer === null) break;
    if (exitReason !== null) throw await fail(`php -S ${exitReason} before it was ready.`);
    if (Date.now() > deadline) {
      throw await fail(`php -S did not answer GET api/config as the PHP backend within ${READY_TIMEOUT_MS / 1000} s (last answer: ${answer}).`);
    }
    await Promise.race([new Promise((done) => setTimeout(done, POLL_MS)), exited]);
  }
  return { baseUrl, logFile, exited, stop };
}

export interface ServedStage {
  /** The throwaway folder holding the stage and its store; stop() deletes it. */
  root: string;
  stage: string;
  dataDir: string;
  server: PhpServer;
}

/** A fresh stage in the temp dir (never in the repo, which Laragon's Apache serves), its store beside it, served in the
    loopback posture. Starting on loopback means "ready" proves the whole boot, seeding included; a test then switches
    the access rule with writeTestConfig. server.stop() deletes root. */
export async function startStage(options: { prefix: string; dist?: boolean; port?: number; phpBin?: string }): Promise<ServedStage> {
  const root = mkdtempSync(join(tmpdir(), options.prefix));
  try {
    const stage = stagePhp(join(root, 'stage'), { dist: options.dist ?? false, vendor: 'shim' });
    const dataDir = join(root, 'data');
    writeTestConfig(stage, dataDir);
    const server = await startPhpServer({ stage, port: options.port, phpBin: options.phpBin, tempRoot: root });
    return { root, stage, dataDir, server };
  } catch (e) {
    rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    throw e;
  }
}

/** Names the process that owns a temp stage, so a later run sweeps only stages nobody is serving. */
const STAGE_MARKER = 'server.json';

/**
 * Old smoke stages whose server was killed without a teardown (Playwright ends
 * its webServer with taskkill /F). A live stage must be left alone: rmSync is
 * not transactional, so "delete and see if it fails" would gut a running
 * server's store before hitting the one folder php.exe holds open. Each stage
 * therefore names its process in server.json, and only stages whose process is
 * gone — or that are older than an hour — are swept.
 */
function sweepStale(prefix: string): void {
  for (const name of readdirSync(tmpdir())) {
    if (!name.startsWith(prefix)) continue;
    const root = join(tmpdir(), name);
    if (isLive(root)) continue;
    try {
      rmSync(root, { recursive: true, force: true, maxRetries: 2, retryDelay: 100 });
    } catch (e) {
      console.warn(`Could not remove the old stage ${root}: ${(e as Error).message}`);
    }
  }
}

/** True while the process that made this stage is still running (or the stage is too young to judge). */
function isLive(root: string): boolean {
  try {
    const { pid } = JSON.parse(readFileSync(join(root, STAGE_MARKER), 'utf8')) as { pid: number };
    process.kill(pid, 0); // throws when the process is gone
    return true;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'EPERM') return true; // someone else's process: not ours to clear
    // No marker yet: another run may be staging right now, so judge by age.
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
      try {
        return Date.now() - statSync(root).mtimeMs < 60 * 60_000;
      } catch {
        return false;
      }
    }
    return false;
  }
}

/** `tsx scripts/php/serve.ts [--dist] [--port 8797]`: a fresh stage served until killed (Playwright's webServer). */
async function main(argv: string[]): Promise<void> {
  const { values } = parseArgs({ args: argv, options: { dist: { type: 'boolean', default: false }, port: { type: 'string' } } });
  const port = values.port === undefined ? undefined : Number(values.port);
  if (port !== undefined && !(Number.isInteger(port) && port > 0 && port < 65536)) throw new Error(`--port must be a TCP port (got ${values.port}).`);

  const prefix = 'nest-flyers-php-smoke-';
  sweepStale(prefix);
  const { root, server } = await startStage({ prefix, dist: values.dist ?? false, port });
  // Who owns this stage, so a later run's sweep can tell live from stale (until then, the sweep judges by age).
  writeFileSync(join(root, STAGE_MARKER), JSON.stringify({ pid: process.pid, started: new Date().toISOString() }));
  console.log(`PHP backend at ${server.baseUrl} (log: ${server.logFile})`);

  let stopping = false;
  const shutdown = () => {
    stopping = true;
    void server.stop().finally(() => process.exit(0));
  };
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGBREAK'] as const) process.once(signal, shutdown);
  // php -S keeps this process alive; if it dies on its own, say why and fail.
  void server.exited.then(() => {
    if (stopping) return;
    console.error(`php -S exited unexpectedly.\n${logTail(server.logFile)}`);
    void server.stop().finally(() => process.exit(1));
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main(process.argv.slice(2)).catch((e: unknown) => {
    console.error((e as Error).message);
    process.exit(1);
  });
}
