export type ExportFormat = 'png' | 'jpg';

/** The export seam: the same saved flyer, downloaded as a 1080 × 1920 image.
    Both implementations render with the one <Flyer> and prepareFlyer(). */
export interface FlyerExporter {
  export(id: number, format: ExportFormat): Promise<{ blob: Blob; filename: string }>;
}
