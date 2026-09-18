import { createRef } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { Flyer } from '../../flyer/Flyer';
import { prepareFlyer } from '../../flyer/ready';
import { flyerFilename } from '../../shared/filename';
import { CANVAS } from '../../shared/layout';
import { EXPORT_JPEG_QUALITY } from '../../shared/limits';
import { api } from '../api';
import type { ExportFormat, FlyerExporter } from './types';

/* In the browser, for backends without a server renderer. The saved flyer is
   mounted offscreen at 1080 × 1920 (never display:none — it has to lay out),
   prepared exactly as the export page prepares it, then captured with
   modern-screenshot, the library the spike approved (docs/spikes/client-export.md).
   tests/render/fidelity.spec.ts holds it to the server export. */
export class ClientExporter implements FlyerExporter {
  async export(id: number, format: ExportFormat) {
    const { flyer, hostel, photo } = await api.flyer(id);
    const host = document.createElement('div');
    host.setAttribute('aria-hidden', 'true');
    host.style.cssText = 'position:fixed;left:-20000px;top:0;pointer-events:none';
    document.body.appendChild(host);
    const root = createRoot(host);
    const ref = createRef<HTMLDivElement>();
    try {
      flushSync(() => root.render(<Flyer ref={ref} data={flyer.data} hostel={hostel} photo={photo} />));
      const el = ref.current;
      if (!el) throw new Error('The flyer did not mount for export.');
      await prepareFlyer(el);
      const { domToCanvas } = await import('modern-screenshot');
      const canvas = await domToCanvas(el, { scale: 1 });
      if (canvas.width !== CANVAS.width || canvas.height !== CANVAS.height) {
        throw new Error(`The export came out ${canvas.width} × ${canvas.height} instead of ${CANVAS.width} × ${CANVAS.height}.`);
      }
      const blob = await new Promise<Blob | null>((done) =>
        format === 'jpg' ? canvas.toBlob(done, 'image/jpeg', EXPORT_JPEG_QUALITY / 100) : canvas.toBlob(done, 'image/png'),
      );
      if (!blob) throw new Error('The browser could not encode the image.');
      return { blob, filename: flyerFilename(flyer.title, id, format) };
    } finally {
      root.unmount();
      host.remove();
    }
  }
}
