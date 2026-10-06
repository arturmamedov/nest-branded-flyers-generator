import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { AI_PICTURE_DAYS } from '../../src/shared/ai.js';
import { STORAGE_FILES } from '../../src/shared/storage.js';

/* What a site keeps of a picture read (the owner's answer, 2026-10-06: "Keep the picture for 30 days too"): the
   picture as the model was sent it, so a misread can be looked at. It lives in the data folder, which is never
   served, under the Canary day it was read on, and is no part of the library: no backup and no copy carries it. A
   shared host has no cron, so the app deletes what is past its days itself (`sweep`). PHP's Ai\FileAiPictures is the
   twin; the ledger's record names the kept file (docs/json-storage.md). */

export interface AiPictures {
  /** Keeps a prepared picture under its day and answers where, relative to the data folder
      (`ai-pictures/2026-10-07/<16 hex>.jpg`). It throws when the disk cannot take it: the read then stops before the
      provider is asked, so nothing is spent on a picture nobody could look at afterwards. */
  keep(day: string, picture: { bytes: Buffer; ext: 'jpg' | 'png' }): string;
  /** Deletes every day's pictures kept longer than AI_PICTURE_DAYS, counted back from `today`. It does so at most
      once a day and never throws: it runs inside GET api/config, which every visit makes. */
  sweep(today: string): void;
}

/** The kept pictures in memory, for a run that must leave nothing behind: the tests, and the smoke script's direct
    read, whose ledger is in memory too. Nothing ages in a run that short, so its sweep does nothing. */
export function createMemoryAiPictures(): AiPictures & { kept: Map<string, Buffer> } {
  const kept = new Map<string, Buffer>();
  return {
    kept,
    keep(day, picture) {
      const path = `${STORAGE_FILES.aiPicturesDir}/${day}/${randomBytes(8).toString('hex')}.${picture.ext}`;
      kept.set(path, picture.bytes);
      return path;
    },
    sweep() {},
  };
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** The day `days` before this one, both `YYYY-MM-DD`: plain calendar arithmetic, no zone in it. */
function daysBefore(day: string, days: number): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d - days)).toISOString().slice(0, 10);
}

/** Deletes a day's folder and what it holds. A link is unlinked, never followed. */
const removeFolder = (path: string) => rmSync(path, { recursive: true, force: true });

/** `remove` deletes one day's folder; the tests hand in one that fails. */
export function createFileAiPictures(dataRoot: string, remove: (path: string) => void = removeFolder): AiPictures {
  const dir = join(dataRoot, STORAGE_FILES.aiPicturesDir);
  let swept: string | null = null;
  let failed: string | null = null;

  return {
    keep(day, picture) {
      mkdirSync(join(dir, day), { recursive: true });
      const name = `${randomBytes(8).toString('hex')}.${picture.ext}`;
      writeFileSync(join(dir, day, name), picture.bytes);
      return `${STORAGE_FILES.aiPicturesDir}/${day}/${name}`;
    },

    sweep(today) {
      if (swept === today) return;
      try {
        // No folder: this site never read a picture, and a sweep must not be what makes one.
        if (existsSync(dir)) {
          const marker = join(dir, STORAGE_FILES.aiPicturesSwept);
          if (!existsSync(marker) || readFileSync(marker, 'utf8') !== today) {
            const oldest = daysBefore(today, AI_PICTURE_DAYS);
            const stuck: string[] = [];
            // Only a day's folder is ever deleted: whatever else someone put here is theirs, and a link is no folder.
            for (const entry of readdirSync(dir, { withFileTypes: true })) {
              if (!entry.isDirectory() || !DAY.test(entry.name) || entry.name >= oldest) continue;
              // One day that will not go must not keep the others, or the marker: the next try is tomorrow's.
              try {
                remove(join(dir, entry.name));
              } catch (e) {
                stuck.push(`${entry.name} (${e instanceof Error ? e.message : String(e)})`);
              }
            }
            writeFileSync(marker, today);
            if (stuck.length > 0) console.error(`AI: the kept pictures in ${STORAGE_FILES.aiPicturesDir}/ could not all be cleaned up: ${stuck.join('; ')}`);
          }
        }
        swept = today;
        failed = null;
      } catch (e) {
        const reason = e instanceof Error ? e.message : String(e);
        if (reason !== failed) console.error(`AI: the kept pictures in ${STORAGE_FILES.aiPicturesDir}/ could not be cleaned up: ${reason}`);
        failed = reason;
      }
    },
  };
}
