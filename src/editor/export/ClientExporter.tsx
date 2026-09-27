import { createRef } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { Flyer } from '../../flyer/Flyer';
import { prepareFlyer } from '../../flyer/ready';
import { flyerFilename } from '../../shared/filename';
import { CANVASES } from '../../shared/layout';
import { EXPORT_JPEG_QUALITY } from '../../shared/limits';
import { api } from '../api';
import type { ExportRequest, FlyerExporter } from './types';

/* In the browser, for backends without a server renderer. The saved flyer is
   mounted offscreen at its canvas's size (never display:none — it has to lay out),
   prepared exactly as the export page prepares it, then captured with
   modern-screenshot, the library the spike approved (docs/spikes/client-export.md).
   tests/render/fidelity.spec.ts holds it to the server export. */
export class ClientExporter implements FlyerExporter {
  async export({ id, format, canvas: target }: ExportRequest) {
    const { flyer, hostel, photo } = await api.flyer(id);
    const size = CANVASES[target];
    const host = document.createElement('div');
    host.setAttribute('aria-hidden', 'true');
    host.style.cssText = 'position:fixed;left:-20000px;top:0;pointer-events:none';
    document.body.appendChild(host);
    const root = createRoot(host);
    const ref = createRef<HTMLDivElement>();
    try {
      flushSync(() => root.render(<Flyer ref={ref} data={flyer.data} canvas={target} hostel={hostel} photo={photo} />));
      const el = ref.current;
      if (!el) throw new Error('The flyer did not mount for export.');
      await prepareFlyer(el);
      const { domToCanvas } = await import('modern-screenshot');
      const canvas = await domToCanvas(el, { scale: 1 });
      if (canvas.width !== size.width || canvas.height !== size.height) {
        throw new Error(`The export came out ${canvas.width} × ${canvas.height} instead of ${size.width} × ${size.height}.`);
      }
      const blob = await new Promise<Blob | null>((done) =>
        format === 'jpg' ? canvas.toBlob(done, 'image/jpeg', EXPORT_JPEG_QUALITY / 100) : canvas.toBlob(done, 'image/png'),
      );
      if (!blob) throw new Error('The browser could not encode the image.');
      return { blob, filename: flyerFilename(flyer.title, id, format, target) };
    } finally {
      root.unmount();
      host.remove();
    }
  }
}
