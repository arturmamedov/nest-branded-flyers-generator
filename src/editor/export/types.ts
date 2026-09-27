import type { CanvasId } from '../../shared/layout';

export type ExportFormat = 'png' | 'jpg';

/** What to download: a saved flyer, as an image of one output canvas. */
export interface ExportRequest {
  id: number;
  format: ExportFormat;
  canvas: CanvasId;
}

/** The export seam: the same saved flyer, downloaded at its canvas's exact size.
    Both implementations render with the one <Flyer> and prepareFlyer(). */
export interface FlyerExporter {
  export(request: ExportRequest): Promise<{ blob: Blob; filename: string }>;
}
