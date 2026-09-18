import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import express, { type ErrorRequestHandler, type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import type { ViteDevServer } from 'vite';
import { z } from 'zod';
import { formatMb } from '../src/shared/errors.js';
import { flyerFilename } from '../src/shared/filename.js';
import { MAX_PHOTO_EDGE, MAX_UPLOAD_BYTES } from '../src/shared/limits.js';
import { normalizeFlyerInput } from '../src/shared/normalize.js';
import {
  FlyerInputSchema,
  type ApiConfig,
  type Doodle,
  type FlyerInput,
  type FlyerPayload,
  type FlyerRecord,
  type PhotoInfo,
} from '../src/shared/schema.js';
import type { StoredDoodle, StoredPhoto } from '../src/shared/storage.js';
import type { StorageDriver } from './config.js';
import { HttpError } from './errors.js';
import { ASSETS_DIR, DIST_DIR } from './paths.js';
import { processPhoto } from './services/photos.js';
import { renderKey, type Renderer } from './services/renderer.js';
import type { AppRepositories } from './storage/types.js';

export { HttpError };

export interface AppDeps {
  repos: AppRepositories;
  storage: StorageDriver;
  /** Where photos are written and served from (`uploads/…` paths resolve inside it). */
  uploadsDir: string;
  /** Present only where server-side export exists; without it /api/render is not registered. */
  renderer?: Renderer;
  vite?: ViteDevServer;
  /** Changes with every renderer build, so a deploy invalidates cached renders. */
  buildId: string;
}

const idParam = (req: Request) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError('no_such_flyer');
  return id;
};

function zodFields(err: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of err.issues) out[i.path.join('.') || '_'] = i.message;
  return out;
}

/** Stored paths have no leading slash; the API hands them out as URLs relative to the app root. */
const toPhotoInfo = (p: StoredPhoto): PhotoInfo => ({ id: p.id, url: p.path, width: p.width, height: p.height });
const toDoodle = (d: StoredDoodle): Doodle => ({ id: d.id, slug: d.slug, label: d.label, url: d.path, kind: d.kind, builtin: d.builtin });

export function createApp(deps: AppDeps) {
  const { repos } = deps;
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback');

  const api = express.Router();
  api.use(express.json({ limit: '1mb' }));

  // No login by design, so block cross-site writes: a custom header cannot be
  // sent from another origin without a CORS preflight we never grant.
  api.use((req, _res, next) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.get('X-Nest-Flyers') !== '1') {
      return next(new HttpError('forbidden'));
    }
    next();
  });

  api.get('/config', (_req, res) => {
    const config: ApiConfig = {
      backend: 'node',
      storage: deps.storage,
      exporters: deps.renderer ? ['client', 'server'] : ['client'],
      limits: { maxUploadBytes: MAX_UPLOAD_BYTES, maxPhotoEdge: MAX_PHOTO_EDGE },
      server: { node: process.version },
    };
    res.json(config);
  });

  api.get('/hostels', async (_req, res) => {
    res.json(await repos.hostels.list());
  });

  api.get('/doodles', async (_req, res) => {
    res.json((await repos.doodles.list()).map(toDoodle));
  });

  api.get('/flyers', async (req, res) => {
    const hostel = typeof req.query.hostel === 'string' ? req.query.hostel : undefined;
    const template = typeof req.query.template === 'string' ? req.query.template : undefined;
    res.json(await repos.flyers.list({ hostel, template }));
  });

  const parseInput = async (body: unknown): Promise<FlyerInput> => {
    const parsed = FlyerInputSchema.safeParse(body);
    if (!parsed.success) throw new HttpError('invalid', undefined, zodFields(parsed.error));
    const input = normalizeFlyerInput(parsed.data);
    if (input.hostel != null && !(await repos.hostels.bySlug(input.hostel))) throw new HttpError('unknown_hostel');
    if (input.photoId != null && !(await repos.photos.get(input.photoId))) throw new HttpError('unknown_photo');
    return input;
  };

  const resolve = async (flyer: FlyerRecord) => {
    const photo = flyer.photoId == null ? null : await repos.photos.get(flyer.photoId);
    return { hostel: flyer.hostel ? await repos.hostels.bySlug(flyer.hostel) : null, photo };
  };

  const saved = async (id: number) => ({ id, flyer: await repos.flyers.get(id) });

  api.post('/flyers', async (req, res) => {
    const id = await repos.flyers.create(await parseInput(req.body));
    res.status(201).json(await saved(id));
  });

  api.get('/flyers/:id', async (req, res) => {
    const flyer = await repos.flyers.get(idParam(req));
    if (!flyer) throw new HttpError('no_such_flyer');
    const { hostel, photo } = await resolve(flyer);
    const payload: FlyerPayload = { flyer, hostel, photo: photo && toPhotoInfo(photo) };
    res.json(payload);
  });

  api.put('/flyers/:id', async (req, res) => {
    const id = idParam(req);
    if (!(await repos.flyers.update(id, await parseInput(req.body)))) throw new HttpError('no_such_flyer');
    deps.renderer?.invalidate(id);
    res.json(await saved(id));
  });

  api.delete('/flyers/:id', async (req, res) => {
    const id = idParam(req);
    if (!(await repos.flyers.archive(id))) throw new HttpError('no_such_flyer');
    deps.renderer?.invalidate(id);
    res.status(204).end();
  });

  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } });
  api.post('/photos', upload.single('photo'), async (req, res) => {
    if (!req.file) throw new HttpError('no_photo_field');
    const stored = await processPhoto(req.file.buffer, deps.uploadsDir);
    res.status(201).json(toPhotoInfo(await repos.photos.insert(stored)));
  });

  // Server-side export only exists where a renderer does (brief: /api/render
  // is absent on backends without one, so it falls through to 404).
  const renderer = deps.renderer;
  if (renderer) {
    api.post('/render/:id', async (req, res) => {
      const id = idParam(req);
      const format = (req.body?.format ?? 'png') as string;
      if (format !== 'png' && format !== 'jpg') throw new HttpError('bad_format');
      const flyer = await repos.flyers.get(id);
      if (!flyer) throw new HttpError('no_such_flyer');
      const { hostel, photo } = await resolve(flyer);
      const key = renderKey([flyer.template, flyer.data, hostel, photo?.path ?? null, deps.buildId]);
      const { file, cached } = await renderer.render(id, format, key);
      res.set('X-Render-Cache', cached ? 'hit' : 'miss');
      res.download(file, flyerFilename(flyer.title, id, format));
    });
  }

  api.use((_req, _res, next) => next(new HttpError('no_such_endpoint')));

  app.use('/api', api);

  // Flyer art and logos (built-ins) and staff uploads.
  app.use('/assets', express.static(ASSETS_DIR, { maxAge: '1h', fallthrough: false }));
  app.use('/uploads', express.static(deps.uploadsDir, { maxAge: '7d', immutable: true, fallthrough: false }));

  if (deps.vite) {
    app.use(deps.vite.middlewares);
  } else if (existsSync(DIST_DIR)) {
    app.use(express.static(DIST_DIR, { index: 'index.html' }));
  }

  const onError: ErrorRequestHandler = (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const send = (e: HttpError) => res.status(e.status).json({ error: { code: e.code, message: e.message, fields: e.fields } });
    if (err instanceof HttpError) return send(err);
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      return send(new HttpError('too_large', { mb: formatMb(MAX_UPLOAD_BYTES) }));
    }
    const status = (err as { status?: number })?.status;
    if (status === 404) return send(new HttpError('not_found'));
    if (status === 400) return send(new HttpError('malformed'));
    console.error(err);
    send(new HttpError('server_error'));
  };
  app.use(onError);

  return app;
}

/** Hash of the built render page: any renderer change busts the export cache. */
export function computeBuildId(isProd: boolean): string {
  const renderHtml = join(DIST_DIR, 'render.html');
  if (isProd && existsSync(renderHtml)) {
    return renderKey([readFileSync(renderHtml, 'utf8')]);
  }
  return 'dev-' + Date.now();
}
