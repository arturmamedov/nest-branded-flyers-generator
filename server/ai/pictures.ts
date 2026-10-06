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

/** What the folder remembers the last sweep's day in, so a new process (every PHP request is one) does not sweep again. */
const SWEPT = '.swept';
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** The day `days` before this one, both `YYYY-MM-DD`: plain calendar arithmetic, no zone in it. */
function daysBefore(day: string, days: number): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d - days)).toISOString().slice(0, 10);
}

export function createFileAiPictures(dataRoot: string): AiPictures {
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
          const marker = join(dir, SWEPT);
          if (!existsSync(marker) || readFileSync(marker, 'utf8') !== today) {
            const oldest = daysBefore(today, AI_PICTURE_DAYS);
            // Only a day's folder is ever deleted: whatever else someone put here is theirs.
            for (const entry of readdirSync(dir, { withFileTypes: true })) {
              if (entry.isDirectory() && DAY.test(entry.name) && entry.name < oldest) rmSync(join(dir, entry.name), { recursive: true, force: true });
            }
            writeFileSync(marker, today);
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
