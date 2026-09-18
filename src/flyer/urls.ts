/* Every URL the app builds, resolved against the page's own address, so the
   same build works at a domain root or in a subfolder (Vite base './'). The
   results are absolute: CSS url()s and the client exporter's capture both
   need them. Stored paths ("uploads/…", "assets/…") have no leading slash;
   a legacy one with a slash is tolerated. */

const ABSOLUTE = /^[a-z][a-z0-9+.-]*:/i; // http:, https:, data:, blob:

export function assetUrl(path: string): string {
  if (ABSOLUTE.test(path)) return path;
  return new URL(path.replace(/^\/+/, ''), document.baseURI).href;
}

/** apiUrl('flyers/7') → <app root>/api/flyers/7 */
export function apiUrl(path: string): string {
  return assetUrl(`api/${path.replace(/^\/+/, '')}`);
}

/** A piece of built-in hand-drawn art (assets/art/<name>.png). */
export function artUrl(name: string): string {
  return assetUrl(`assets/art/${name}.png`);
}
