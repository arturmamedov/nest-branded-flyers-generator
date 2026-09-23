import { apiUrl } from '../../flyer/urls';
import { flyerFilename } from '../../shared/filename';
import { errorFrom } from '../api';
import type { ExportFormat, FlyerExporter } from './types';

/** Headless Chromium on the server (Node only): POST /api/render/:id. */
export class ServerExporter implements FlyerExporter {
  async export(id: number, format: ExportFormat) {
    const res = await fetch(apiUrl(`render/${id}`), {
      method: 'POST',
      headers: { 'X-Nest-Flyers': '1', 'Content-Type': 'application/json' },
      body: JSON.stringify({ format }),
    });
    if (!res.ok) throw await errorFrom(res, 'Export failed');
    const disposition = res.headers.get('Content-Disposition') || '';
    const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? flyerFilename('', id, format);
    return { blob: await res.blob(), filename };
  }
}
