/** The download name, identical for server and client export: ASCII slug of the
    library title ("Pool party 19/9" → "pool-party-199"), or flyer-<id>. */
export function flyerFilename(title: string, id: number, format: 'png' | 'jpg'): string {
  const slug = title
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .toLowerCase();
  return `${slug || `flyer-${id}`}.${format}`;
}
