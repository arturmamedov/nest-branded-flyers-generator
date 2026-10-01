import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { APP_ROOT } from '../server/paths.js';

/* Settings for the Node-side scripts and the test configs: the environment
   first, then the repo's untracked .env. On Windows npm scripts run in cmd.exe,
   where `KEY=… npm run …` fails, and PowerShell has its own syntax, so .env is
   the one form that works in every shell. */

/** KEY=value lines, `#` comments. Values are taken verbatim, so Windows paths keep their backslashes. */
export function parseDotEnv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    out[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
  }
  return out;
}

function dotEnv(): Record<string, string> {
  const file = join(APP_ROOT, '.env');
  return existsSync(file) ? parseDotEnv(readFileSync(file, 'utf8')) : {};
}

/** Where a setting came from, so a run can say why it did what it did. */
export type EnvSource = 'environment' | '.env';

/** A setting from the environment, else from <repo>/.env; undefined when unset or empty. */
export function envSetting(name: string): { value: string; source: EnvSource } | undefined {
  const fromEnv = process.env[name]?.trim();
  if (fromEnv) return { value: fromEnv, source: 'environment' };
  const fromFile = dotEnv()[name];
  return fromFile ? { value: fromFile, source: '.env' } : undefined;
}

export const envValue = (name: string): string | undefined => envSetting(name)?.value;

export interface BasicAuth {
  user: string;
  password: string;
}

/** A deployment reached over HTTP: its app root, and its staff login when it is behind one. */
export interface RemoteSite {
  /** The deployment's app root, ending in '/'. */
  baseUrl: string;
  /** The staff login, for a deployment behind Basic auth. */
  basicAuth?: BasicAuth;
  /** Where <PREFIX>_BASE_URL came from: a value left in .env silently turns every local run into a remote one. */
  source: EnvSource;
}

/** The deployment named by <prefix>_BASE_URL, with <prefix>_BASIC_USER and _PASSWORD, or null when unset. */
function remoteSite(prefix: string): RemoteSite | null {
  const base = envSetting(`${prefix}_BASE_URL`);
  if (!base) return null;
  // fetch() refuses a URL that carries credentials (a TypeError on every request), so say where they go instead.
  const parsed = new URL(base.value);
  if (parsed.username || parsed.password) {
    throw new Error(`${prefix}_BASE_URL must not contain a user or password: set ${prefix}_BASIC_USER and ${prefix}_BASIC_PASSWORD.`);
  }
  const user = envValue(`${prefix}_BASIC_USER`);
  const password = envValue(`${prefix}_BASIC_PASSWORD`);
  if ((user === undefined) !== (password === undefined)) {
    throw new Error(`Set both ${prefix}_BASIC_USER and ${prefix}_BASIC_PASSWORD, or neither.`);
  }
  return {
    baseUrl: base.value.endsWith('/') ? base.value : `${base.value}/`,
    ...(user && password ? { basicAuth: { user, password } } : {}),
    source: base.source,
  };
}

/** The Authorization header for a Basic login. A credential in the URL is no alternative: fetch() refuses such a URL. */
export const basicAuthHeader = ({ user, password }: BasicAuth) => ({
  Authorization: `Basic ${Buffer.from(`${user}:${password}`, 'utf8').toString('base64')}`,
});

export interface ContractTarget extends RemoteSite {
  /** That deployment's folder on this machine, so security.test.ts can plant files in it. */
  deployDir?: string;
}

/** The deployment the contract suite and the smoke test run against (CONTRACT_BASE_URL), or null for the local backends. */
export function contractTarget(): ContractTarget | null {
  const site = remoteSite('CONTRACT');
  if (!site) return null;
  const deployDir = envValue('CONTRACT_DEPLOY_DIR');
  return { ...site, ...(deployDir ? { deployDir } : {}) };
}

/** Where `npm run flyers:post` sends flyers (FLYERS_BASE_URL), or null: then it needs --to. Its own setting, never
    CONTRACT_BASE_URL, which may name the same live site for a read-only check and must not start writing there. */
export const flyersTarget = (): RemoteSite | null => remoteSite('FLYERS');

/** One line for the start of a run: which deployment, and why. */
export function describeTarget(target: ContractTarget): string {
  const login = target.basicAuth ? `, signed in as "${target.basicAuth.user}"` : '';
  return `Remote target ${target.baseUrl} (CONTRACT_BASE_URL from ${target.source}${login}). Unset it to test the local backends.`;
}
