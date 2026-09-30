import { weekTitle } from './defaults.js';
import type { FlyerData } from './schema.js';
import { clamp, eventName } from './week.js';

/* What a flyer is called in the library: its title when staff give one, else a name worked out from the flyer.
   No zod here, like week.ts: the editor imports it, and schema.ts takes the title's limit from this file. */

/** The longest title, in code points, as zod and the PHP validator count them. */
export const TITLE_MAX = 80;

const DAY_MONTH = { day: 'numeric', month: 'short' } as const satisfies Intl.DateTimeFormatOptions;

/** The library's one date format, en-GB: a card's "30 Sept, 12:00", and the "30 Sept" of an untitled week flyer's name. */
export function libraryDate(date: Date, time = false): string {
  return date.toLocaleString('en-GB', time ? { ...DAY_MONTH, hour: '2-digit', minute: '2-digit' } : DAY_MONTH);
}

/** An untitled flyer's name. A week flyer whose title still reads the defaults would be "What’s on this week" like
    every other, so it is named for its hostel and the day instead (the owner's call, 2026-09-30); the Spanish line
    doesn't name a flyer, so only the English lines count. The editor passes the day of the first save, which
    writes the name into the field. */
export function libraryName(data: Pick<FlyerData, 'template' | 'text'>, hostelName: string | null, date: Date): string {
  const defaultWeek = data.template === 'week' && eventName(data.text) === eventName(weekTitle(null));
  const name = defaultWeek
    ? ['This week', hostelName, libraryDate(date)].filter(Boolean).join(' · ')
    : eventName(data.text) || 'Untitled flyer';
  return clamp(name, TITLE_MAX);
}

const COPY = ' (copy)';

/** A duplicate's title: the original's, cut to leave room for " (copy)". */
export const copyTitle = (title: string) => `${clamp(title, TITLE_MAX - COPY.length)}${COPY}`;
