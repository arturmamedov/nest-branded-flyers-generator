import { randomBytes } from 'node:crypto';
import { mkdir, open, readdir, readFile, rename, rm, stat } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

/* JSON documents under one folder, replaced atomically: a reader (or a crash)
   sees the old file or the new one, never half of one. Never locks; the caller
   holds the store's lock (lock.ts).

   The twin of php/src/Storage/Json/AtomicJsonFiles.php — same folder, same
   bytes, so either backend can serve what the other wrote. */

/** Windows refuses to replace a file another process holds open (antivirus, the indexer, a backup tool), usually for a few ms. */
const RENAME_ATTEMPTS = 10;
const RENAME_RETRY_MS = 20;

/** String.prototype.toWellFormed(): ES2024 and in Node since 20, but the server's tsconfig `lib` is ES2023. */
const wellFormedString = (s: string): string => (s as unknown as { toWellFormed(): string }).toWellFormed();

/**
 * Lone UTF-16 surrogates, replaced by U+FFFD, in keys as well as values.
 * JSON.stringify would escape them (`"\ud800"`), and PHP's json_decode refuses
 * that, so a store Node wrote would stop being readable by the PHP backend.
 */
function wellFormed(value: unknown): unknown {
  if (typeof value === 'string') return wellFormedString(value);
  if (Array.isArray(value)) return value.map(wellFormed);
  if (value === null || typeof value !== 'object') return value;
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value)) out[wellFormedString(key)] = wellFormed(v);
  return out;
}

/** The store's file format, byte for byte what PHP writes (`NestFlyers\Json::encode($value, true)`): 4-space pretty JSON, one trailing newline. */
export function encodeStoreJson(value: unknown): string {
  return `${JSON.stringify(wellFormed(value), null, 4)}\n`;
}

export class JsonFiles {
  /** @param root the store's folder; created on the first write when missing */
  constructor(private readonly root: string) {}

  /** The document, or null when the file is not there. */
  async read(relativePath: string): Promise<unknown> {
    const path = this.path(relativePath);
    let json: string;
    try {
      json = await readFile(path, 'utf8');
    } catch (e) {
      if (isCode(e, 'ENOENT')) return null;
      throw e;
    }
    try {
      return JSON.parse(json) as unknown;
    } catch (e) {
      throw new Error(`${path} is not valid JSON: ${(e as Error).message}`, { cause: e });
    }
  }

  async write(relativePath: string, value: unknown): Promise<void> {
    // Encoded before anything touches the disk: a value that cannot be encoded throws here, and the old file stays
    // exactly as it was.
    const json = encodeStoreJson(value);
    const path = this.path(relativePath);
    const dir = dirname(path);
    await mkdir(dir, { recursive: true });

    // Same folder as the target, so the rename never crosses a filesystem (which would make it a copy). The leading
    // dot keeps it out of casual listings; the random part keeps concurrent writers apart.
    const temp = join(dir, `.${basename(path)}.${randomBytes(8).toString('hex')}.tmp`);
    try {
      await writeNew(temp, json);
      await replace(temp, path);
    } catch (e) {
      await rm(temp, { force: true }).catch(() => {});
      throw e;
    }
  }

  async exists(relativePath: string): Promise<boolean> {
    try {
      return (await stat(this.path(relativePath))).isFile();
    } catch (e) {
      if (isCode(e, 'ENOENT')) return false;
      throw e;
    }
  }

  /** The file names directly inside a folder of the store; empty when the folder is not there. */
  async names(relativeDir: string): Promise<string[]> {
    try {
      return await readdir(this.path(relativeDir));
    } catch (e) {
      if (isCode(e, 'ENOENT')) return [];
      throw e;
    }
  }

  /** An absolute path for a caller that needs one (the deny files the store writes next to its records). */
  path(relativePath: string): string {
    const relative = relativePath.replace(/\\/g, '/');
    // Paths are built by the store itself; refusing absolute and ".." paths keeps a bug from writing outside it.
    if (relative === '' || relative.startsWith('/') || /^[A-Za-z]:/.test(relative) || /(^|\/)\.\.?(\/|$)/.test(relative)) {
      throw new Error(`Not a path inside the store: ${relativePath}`);
    }
    return join(this.root, ...relative.split('/'));
  }
}

async function writeNew(path: string, contents: string): Promise<void> {
  // 'wx' fails if the name exists, so a temp name is never shared with another writer.
  const handle = await open(path, 'wx');
  try {
    await handle.writeFile(contents, 'utf8');
    // Best effort: flush to the disk before the rename makes the file live, so a power cut cannot leave an empty file
    // behind. Some network filesystems refuse fsync; the rename is still atomic without it.
    await handle.sync().catch(() => {});
  } finally {
    await handle.close();
  }
}

async function replace(temp: string, path: string): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await rename(temp, path);
      return;
    } catch (e) {
      if (attempt >= RENAME_ATTEMPTS) throw new Error(`Cannot replace ${path}: ${(e as Error).message}`, { cause: e });
      await delay(RENAME_RETRY_MS);
    }
  }
}

export const isCode = (e: unknown, code: string): boolean => (e as NodeJS.ErrnoException | null)?.code === code;
