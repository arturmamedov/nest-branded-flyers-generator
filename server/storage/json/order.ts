/**
 * Text order for every list this driver returns: plain `<`, which compares
 * UTF-16 code units. For everything below U+10000 — hostel names, doodle
 * labels, ISO timestamps — that is the same order as PHP's `strcmp` (UTF-8
 * bytes) and SQLite's BINARY collation, so all three drivers list the same
 * way. Astral characters would sort differently; if one ever turns up in a
 * name, this is the one place to switch to a code-point comparison.
 */
export const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
