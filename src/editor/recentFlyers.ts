/* The flyers this browser opened last (2026-10-15; Artur's ask: "the most recent open flyer and order for any user it
   own most recent flyers for make it easier to find them", and his answers in docs/reports/recent-flyers.md). The
   last RECENT_MAX go first in the library, the last opened on top, each with a line that says when. Opened is the
   editor (a flyer loaded, a new one first saved) and a card's ways out that worked. Per browser, never flyer data
   (prefs.ts). No React and no DOM here, so the rule is tested by itself (tests/unit/recent-flyers.test.ts). */

/** Where they are remembered, next to the library's filters. */
export const RECENT_PREF = 'library.recent';

/** How many go first: the last 5 (his answer). A colleague's new flyer is at most 6th. */
export const RECENT_MAX = 5;

/** A flyer opened, and when (ms since the epoch, this browser's clock). */
export interface Recent {
  id: number;
  at: number;
}

interface Store {
  get: (key: string) => string | null;
  set: (key: string, value: string) => void;
}

const isRecent = (r: unknown): r is Recent => {
  const { id, at } = (r ?? {}) as Partial<Recent>;
  return Number.isInteger(id) && id! > 0 && Number.isFinite(at);
};

/** What is stored, read loosely: what is damaged is left out, a flyer counts once (its latest), at most RECENT_MAX. */
export function recentFrom(stored: string | null): Recent[] {
  let list: unknown;
  try {
    list = JSON.parse(stored ?? '');
  } catch {
    return [];
  }
  if (!Array.isArray(list)) return [];
  const recent: Recent[] = [];
  for (const r of list) if (isRecent(r) && !recent.some((x) => x.id === r.id)) recent.push({ id: r.id, at: r.at });
  return recent.slice(0, RECENT_MAX);
}

/** The list with a flyer opened at `at`: on top, once, the oldest falling off. */
export const withOpened = (recent: readonly Recent[], id: number, at: number): Recent[] => [{ id, at }, ...recent.filter((r) => r.id !== id)].slice(0, RECENT_MAX);

/** Notes a flyer opened, over what this browser holds now (another tab may have opened one since). */
export function rememberOpened(store: Store, id: number, at: number) {
  store.set(RECENT_PREF, JSON.stringify(withOpened(recentFrom(store.get(RECENT_PREF)), id, at)));
}

/** Takes an archived flyer off the list, so it holds no place there. */
export function forgetFlyer(store: Store, id: number) {
  const recent = recentFrom(store.get(RECENT_PREF));
  if (recent.some((r) => r.id === id)) store.set(RECENT_PREF, JSON.stringify(recent.filter((r) => r.id !== id)));
}

/** The library's order: the recent flyers it holds first, the last opened on top, then the rest in the list's own
    order (newest first). A search keeps this order within each of its ranks (its sort is stable). `openedAt` is
    when each of those was opened, for its line. */
export function byRecent<T extends { id: number }>(items: readonly T[], recent: readonly Recent[]): { items: T[]; openedAt: Map<number, number> } {
  const byId = new Map(items.map((item) => [item.id, item]));
  const first = recent.filter((r) => byId.has(r.id));
  const openedAt = new Map(first.map((r) => [r.id, r.at]));
  return { items: [...first.map((r) => byId.get(r.id)!), ...items.filter((item) => !openedAt.has(item.id))], openedAt };
}

const dayOf = (t: number) => {
  const d = new Date(t);
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000;
};

/** The card's line: minutes and hours today, then yesterday, then days, by this browser's calendar. */
export function openedAgo(at: number, now: number): string {
  const minutes = Math.floor((now - at) / 60_000);
  if (minutes < 1) return 'Opened just now';
  const days = dayOf(now) - dayOf(at);
  if (days === 0) return minutes < 60 ? `Opened ${minutes} min ago` : `Opened ${Math.floor(minutes / 60)} h ago`;
  return days === 1 ? 'Opened yesterday' : `Opened ${days} days ago`;
}
