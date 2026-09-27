import { CANVASES, type CanvasId } from './layout.js';

/** The download name, identical for server and client export: ASCII slug of the
    library title ("Pool party 19/9" → "pool-party-199"), or flyer-<id>, plus the
    canvas's suffix (none for the story, so its name is what it always was). */
export function flyerFilename(title: string, id: number, format: 'png' | 'jpg', canvas: CanvasId): string {
  const slug = title
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .toLowerCase();
  return `${slug || `flyer-${id}`}${CANVASES[canvas].fileSuffix}.${format}`;
}
