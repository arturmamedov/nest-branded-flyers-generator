import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Browser } from 'playwright';
import { CANVASES, type CanvasId } from '../../src/shared/layout.js';
import { EXPORT_JPEG_QUALITY } from '../../src/shared/limits.js';

/* Server-side export: the same render page the editor preview shares, loaded
   in headless Chromium at exactly the canvas's size, screenshotted once the
   fonts, images and fit passes have settled (handoff README §9). */

export type RenderFormat = 'png' | 'jpg';

export interface RenderJob {
  id: number;
  format: RenderFormat;
  canvas: CanvasId;
  /** Content hash of everything the image depends on (renderKey). */
  key: string;
}

export interface Renderer {
  render(job: RenderJob): Promise<{ file: string; cached: boolean }>;
  invalidate(id: number): void;
  close(): Promise<void>;
}

export function renderKey(parts: unknown[]): string {
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, 16);
}

export function createRenderer(opts: { origin: string; cacheDir: string; timeoutMs: number }): Renderer {
  mkdirSync(opts.cacheDir, { recursive: true });
  let browser: Promise<Browser> | null = null;
  let queue: Promise<unknown> = Promise.resolve();
  const inFlight = new Map<string, Promise<{ file: string; cached: boolean }>>();

  const getBrowser = () => {
    if (!browser) {
      browser = chromium.launch().then((b) => {
        b.on('disconnected', () => (browser = null));
        return b;
      });
      browser.catch(() => (browser = null));
    }
    return browser;
  };

  async function shoot({ id, format, canvas }: RenderJob, file: string): Promise<void> {
    const { width, height } = CANVASES[canvas];
    const b = await getBrowser();
    const context = await b.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
    try {
      const page = await context.newPage();
      await page.goto(`${opts.origin}/render.html?id=${id}&canvas=${canvas}`, { waitUntil: 'domcontentloaded', timeout: opts.timeoutMs });
      await page.waitForFunction(() => {
        const w = globalThis as { __FLYER_READY?: boolean; __FLYER_ERROR?: string };
        return w.__FLYER_READY || w.__FLYER_ERROR;
      }, null, {
        timeout: opts.timeoutMs,
      });
      const error = await page.evaluate(() => (globalThis as { __FLYER_ERROR?: string }).__FLYER_ERROR);
      if (error) throw new Error('Render page failed: ' + error);
      // A page that misread the canvas would still fill the clip (a story cut to 1440), so ask it what it drew.
      const drawn = await page.getAttribute('[data-flyer]', 'data-canvas');
      if (drawn !== canvas) throw new Error(`Render page drew ${drawn} instead of ${canvas}`);
      await page.screenshot({
        path: file,
        type: format === 'jpg' ? 'jpeg' : 'png',
        quality: format === 'jpg' ? EXPORT_JPEG_QUALITY : undefined,
        clip: { x: 0, y: 0, width, height },
        animations: 'disabled',
        caret: 'hide',
        scale: 'css',
      });
    } finally {
      await context.close();
    }
  }

  return {
    render(job) {
      // The id leads, so invalidate() finds every canvas and format of a flyer.
      const file = join(opts.cacheDir, `${job.id}-${job.canvas}-${job.key}.${job.format}`);
      if (existsSync(file)) return Promise.resolve({ file, cached: true });
      const existing = inFlight.get(file);
      if (existing) return existing; // a double-clicked Download renders once
      // Concurrency 1: one Chromium page at a time keeps a small VPS happy.
      const shot = queue.then(() => shoot(job, file)).then(() => ({ file, cached: false }));
      queue = shot.catch(() => undefined);
      inFlight.set(file, shot);
      shot.finally(() => inFlight.delete(file)).catch(() => undefined);
      return shot;
    },
    invalidate(id) {
      for (const f of readdirSync(opts.cacheDir)) if (f.startsWith(`${id}-`)) unlinkSync(join(opts.cacheDir, f));
    },
    async close() {
      if (browser) await (await browser).close().catch(() => undefined);
      browser = null;
    },
  };
}
