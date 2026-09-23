import { AsyncLocalStorage } from 'node:async_hooks';
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { isCode } from './files.js';

/**
 * The store's lock, across every process on the machine: a lock *directory*,
 * because `mkdir` is the one filesystem operation that is atomic everywhere,
 * and Node has no `flock`.
 *
 * Differences from php/src/Storage/Json/FlockLock.php, which they are the twin
 * of, and which the data folder therefore tolerates only one of at a time
 * (docs/json-storage.md):
 *
 * - **One holder, reads included.** PHP takes `LOCK_SH` for reads so requests
 *   can read in parallel; a directory is either there or not, so every call
 *   here waits its turn. Operations are a few file reads long, so the cost is
 *   noise, and the guarantee is the stronger one.
 * - **Stale locks are broken.** The OS releases a `flock` when the process
 *   dies; a directory outlives the process that made it, so one older than
 *   {@link STALE_MS} is removed. A holder writes its own token inside and
 *   removes the directory only while that token is still its own, so breaking
 *   a lock cannot make two holders delete each other's.
 * - **Re-entrant per call chain**, not per process: an `AsyncLocalStorage`
 *   marks the chain that holds the lock, so `flyers.create()` can call
 *   `hostels.bySlug()` inside it while a concurrent request still waits.
 */

/** A lock this old belonged to a process that died (operations take milliseconds). */
const STALE_MS = 30_000;
/** Long enough for a queue of writes on a slow disk, short enough that staff see an error rather than a hung tab. */
const TIMEOUT_MS = 10_000;
const RETRY_MS = 20;

export interface LockOptions {
  staleMs?: number;
  timeoutMs?: number;
  retryMs?: number;
}

export class StoreLock {
  private readonly held = new AsyncLocalStorage<true>();
  /** In-process queue, so callers wait on a promise instead of spinning on mkdir. */
  private queue: Promise<unknown> = Promise.resolve();
  private readonly ownerFile: string;
  private readonly staleMs: number;
  private readonly timeoutMs: number;
  private readonly retryMs: number;

  /** @param dir the lock directory, created and removed around every call */
  constructor(
    private readonly dir: string,
    options: LockOptions = {},
  ) {
    this.ownerFile = join(dir, 'owner');
    this.staleMs = options.staleMs ?? STALE_MS;
    this.timeoutMs = options.timeoutMs ?? TIMEOUT_MS;
    this.retryMs = options.retryMs ?? RETRY_MS;
  }

  /** Runs fn with the store to itself. Nested calls in the same chain run straight away: the lock is already ours. */
  async run<T>(fn: () => T | Promise<T>): Promise<T> {
    if (this.held.getStore()) return fn();
    const ahead = this.queue;
    let done!: () => void;
    this.queue = new Promise<void>((resolve) => (done = resolve));
    await ahead.catch(() => {});
    try {
      const token = await this.acquire();
      try {
        return await this.held.run(true, fn);
      } finally {
        await this.release(token);
      }
    } finally {
      done();
    }
  }

  /** @returns this holder's token, which release() checks before removing the directory */
  private async acquire(): Promise<string> {
    await mkdir(dirname(this.dir), { recursive: true });
    const deadline = Date.now() + this.timeoutMs;
    for (;;) {
      try {
        await mkdir(this.dir);
        const token = randomBytes(8).toString('hex');
        await writeFile(this.ownerFile, token, 'utf8');
        return token;
      } catch (e) {
        if (!isCode(e, 'EEXIST')) throw e;
      }
      const gone = await this.breakIfStale();
      // Checked on every path: a lock that cannot be broken (another account's
      // directory, a handle that never clears) must time out, not spin forever.
      if (Date.now() >= deadline) {
        throw new Error(`Timed out after ${this.timeoutMs} ms waiting for the flyer store's lock (${this.dir}). Is another copy of the app busy with this data folder?`);
      }
      if (!gone) await delay(this.retryMs);
    }
  }

  /** Never throws: the write is already on disk, and a lock left behind is cleared by the stale timeout. */
  private async release(token: string): Promise<void> {
    try {
      if ((await this.owner()) !== token) return; // broken as stale and taken over: the directory is somebody else's now
      await rm(this.dir, { recursive: true, force: true, maxRetries: 5, retryDelay: this.retryMs });
    } catch {
      // Unlocking failed (an antivirus handle, a network hiccup). Reporting it
      // would turn a finished write into an error; the next waiter breaks it.
    }
  }

  /**
   * Clears a lock whose holder is gone.
   *
   * The directory is moved aside before it is deleted, so only one of several
   * waiters can win, and a holder that took the lock in the meantime keeps it:
   * the rename fails, or the token check catches it. Deleting in place would
   * let two waiters both "break" the same lock and then both hold the store.
   *
   * @returns true when the path is free, so mkdir is worth another try at once
   */
  private async breakIfStale(): Promise<boolean> {
    const before = await this.owner();
    let age: number;
    try {
      age = Date.now() - (await stat(this.dir)).mtimeMs;
    } catch (e) {
      if (isCode(e, 'ENOENT')) return true; // released while we looked
      throw e;
    }
    if (age < this.staleMs) return false;
    if ((await this.owner()) !== before) return false; // somebody took it over while we were judging
    const aside = `${this.dir}.stale-${randomBytes(8).toString('hex')}`;
    try {
      await rename(this.dir, aside);
    } catch (e) {
      return isCode(e, 'ENOENT'); // another waiter got there first, which is just as good
    }
    await rm(aside, { recursive: true, force: true, maxRetries: 5, retryDelay: this.retryMs }).catch(() => {});
    return true;
  }

  private async owner(): Promise<string | null> {
    try {
      return await readFile(this.ownerFile, 'utf8');
    } catch (e) {
      if (isCode(e, 'ENOENT')) return null;
      throw e;
    }
  }
}
