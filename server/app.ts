import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import express, { type ErrorRequestHandler, type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import type { ViteDevServer } from 'vite';
import { z } from 'zod';
import { FlyerInputSchema, type FlyerPayload } from '../src/shared/schema.js';
import type { DB } from './db/open.js';
import { ASSETS_DIR, DIST_DIR, type DataPaths } from './paths.js';
import { listDoodles } from './repos/doodles.js';
import { archiveFlyer, createFlyer, getFlyer, listFlyers, updateFlyer } from './repos/flyers.js';
import { hostelById, hostelBySlug, listHostels } from './repos/hostels.js';
import { insertPhoto, photoById, photoPath } from './repos/photos.js';
import { MAX_PHOTO_BYTES, PhotoError, processPhoto } from './services/photos.js';
import { renderKey, type Renderer } from './services/renderer.js';

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fields?: Record<string, string>,
  ) {
    super(message);
  }
}

export interface AppDeps {
  db: DB;
  data: DataPaths;
  renderer?: Renderer;
  vite?: ViteDevServer;
  /** Changes with every renderer build, so a deploy invalidates cached renders. */
  buildId: string;
}

const idParam = (req: Request) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(404, 'not_found', 'No such flyer.');
  return id;
};

function zodFields(err: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of err.issues) out[i.path.join('.') || '_'] = i.message;
  return out;
}

export function createApp(deps: AppDeps) {
  const { db, data } = deps;
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback');

  const api = express.Router();
  api.use(express.json({ limit: '1mb' }));

  // No login by design, so block cross-site writes: a custom header cannot be
  // sent from another origin without a CORS preflight we never grant.
  api.use((req, _res, next) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.get('X-Nest-Flyers') !== '1') {
      return next(new HttpError(403, 'forbidden', 'Missing X-Nest-Flyers header.'));
    }
    next();
  });

  api.get('/hostels', (_req, res) => {
    res.json(listHostels(db));
  });

  api.get('/doodles', (_req, res) => {
    res.json(listDoodles(db));
  });

  api.get('/flyers', (req, res) => {
    const hostel = typeof req.query.hostel === 'string' ? req.query.hostel : undefined;
    const template = typeof req.query.template === 'string' ? req.query.template : undefined;
    res.json(listFlyers(db, { hostel, template }));
  });

  const parseInput = (body: unknown) => {
    const parsed = FlyerInputSchema.safeParse(body);
    if (!parsed.success) throw new HttpError(400, 'invalid', 'Some fields are not valid.', zodFields(parsed.error));
    const input = parsed.data;
    const hostel = input.hostel ? hostelBySlug(db, input.hostel) : null;
    if (input.hostel && !hostel) throw new HttpError(400, 'invalid', 'Unknown hostel.', { hostel: 'Unknown hostel' });
    if (input.photoId != null && !photoById(db, input.photoId)) {
      throw new HttpError(400, 'invalid', 'Unknown photo.', { photoId: 'Unknown photo' });
    }
    return { input, hostelId: hostel?.id ?? null };
  };

  api.post('/flyers', (req, res) => {
    const { input, hostelId } = parseInput(req.body);
    const id = createFlyer(db, input, hostelId);
    res.status(201).json({ id, flyer: getFlyer(db, id) });
  });

  api.get('/flyers/:id', (req, res) => {
    const flyer = getFlyer(db, idParam(req));
    if (!flyer) throw new HttpError(404, 'not_found', 'No such flyer.');
    const payload: FlyerPayload = {
      flyer,
      hostel: flyer.hostel ? hostelBySlug(db, flyer.hostel) : null,
      photo: photoById(db, flyer.photoId),
    };
    res.json(payload);
  });

  api.put('/flyers/:id', (req, res) => {
    const id = idParam(req);
    const { input, hostelId } = parseInput(req.body);
    if (!updateFlyer(db, id, input, hostelId)) throw new HttpError(404, 'not_found', 'No such flyer.');
    deps.renderer?.invalidate(id);
    res.json({ id, flyer: getFlyer(db, id) });
  });

  api.delete('/flyers/:id', (req, res) => {
    const id = idParam(req);
    if (!archiveFlyer(db, id)) throw new HttpError(404, 'not_found', 'No such flyer.');
    deps.renderer?.invalidate(id);
    res.status(204).end();
  });

  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_PHOTO_BYTES, files: 1 } });
  api.post('/photos', upload.single('photo'), async (req, res) => {
    if (!req.file) throw new HttpError(400, 'invalid', 'Attach the photo as the "photo" field.');
    const stored = await processPhoto(req.file.buffer, data.root);
    res.status(201).json(insertPhoto(db, stored));
  });

  api.post('/render/:id', async (req, res) => {
    const id = idParam(req);
    const format = (req.body?.format ?? 'png') as string;
    if (format !== 'png' && format !== 'jpg') throw new HttpError(400, 'invalid', 'format must be png or jpg.');
    if (!deps.renderer) throw new HttpError(503, 'unavailable', 'Export is not available on this server.');
    const flyer = getFlyer(db, id);
    if (!flyer) throw new HttpError(404, 'not_found', 'No such flyer.');
    const hostel = flyer.hostel ? hostelBySlug(db, flyer.hostel) : null;
    const key = renderKey([flyer.template, flyer.data, hostel, photoPath(db, flyer.photoId), deps.buildId]);
    const { file, cached } = await deps.renderer.render(id, format, key);
    const name = (flyer.title.normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').toLowerCase() || `flyer-${id}`);
    res.set('X-Render-Cache', cached ? 'hit' : 'miss');
    res.download(file, `${name}.${format}`);
  });

  api.use((_req, _res, next) => next(new HttpError(404, 'not_found', 'No such endpoint.')));

  app.use('/api', api);

  // Flyer art and logos (built-ins) and staff uploads.
  app.use('/assets', express.static(ASSETS_DIR, { maxAge: '1h', fallthrough: false }));
  app.use('/uploads', express.static(data.uploads, { maxAge: '7d', immutable: true, fallthrough: false }));

  if (deps.vite) {
    app.use(deps.vite.middlewares);
  } else if (existsSync(DIST_DIR)) {
    app.use(express.static(DIST_DIR, { index: 'index.html' }));
  }

  const onError: ErrorRequestHandler = (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError || err instanceof PhotoError) {
      const fields = err instanceof HttpError ? err.fields : undefined;
      return res.status(err.status).json({ error: { code: err.code, message: err.message, fields } });
    }
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: { code: 'too_large', message: 'That photo is over 15 MB. Use a smaller JPG.' } });
    }
    const status = (err as { status?: number })?.status;
    if (status === 404) return res.status(404).json({ error: { code: 'not_found', message: 'Not found.' } });
    if (status === 400) return res.status(400).json({ error: { code: 'invalid', message: 'Malformed request.' } });
    console.error(err);
    res.status(500).json({ error: { code: 'server_error', message: 'Something went wrong on the server.' } });
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
