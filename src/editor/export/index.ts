import type { ApiConfig } from '../../shared/schema';
import { ClientExporter } from './ClientExporter';
import { ServerExporter } from './ServerExporter';
import type { FlyerExporter } from './types';

export type { ExportFormat, FlyerExporter } from './types';

/** Server export where the backend has it (Node), else the browser (PHP). */
export function createExporter(config: Pick<ApiConfig, 'exporters'>): FlyerExporter {
  return config.exporters.includes('server') ? new ServerExporter() : new ClientExporter();
}
