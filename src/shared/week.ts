import { splitBigSub, splitDot, tidyDot } from './chips.js';
import type { FlyerData, FlyerText, WeekRow } from './schema.js';

/* The This week template's rules (handoff §2, §6): its limits, the row taken
   from a saved Activity flyer, and what a row prints. No zod here, so the
   renderer and the editor can import it without bundling the schema;
   schema.ts takes its week limits from this file, as it takes the crop's
   from photo.ts. */

/** At most five rows: 5 × 122 + 4 × 15 = 670 px is what fits above the ask (handoff §2). */
export const WEEK_ROWS_MAX = 5;

/** Each row field's longest value, in code points, as zod and the PHP validator count them. */
export const WEEK_ROW_LIMITS = { day: 30, name: 80, time: 20, cost: 30, shortName: 60 } as const;

/** Cut to a limit by code points, as the limits count: a UTF-16 cut can leave half of a surrogate pair, which PHP
    refuses. (An emoji built of several code points, a flag say, can still lose its tail: it saves, and staff see it.) */
const clamp = (value: string, max: number) => Array.from(value).slice(0, max).join('').trim();

/** An event's whole name from its headline, "Two hours" + "of fun waves." → "Two hours of fun waves":
    §6 — a row's name is the whole name, never headline2 alone ("of fun waves"). */
export function eventName(text: Pick<FlyerText, 'headline1' | 'headline2'>): string {
  return [text.headline1, text.headline2].join(' ').replace(/\s+/g, ' ').trim().replace(/\.$/, '').trim();
}

/** A row taken from a saved Activity flyer, as the prototype reads its records: day and time from
    WHEN, the whole name, the first part of COST. A copy the editor keeps editing, never a live link,
    cut to the row's limits so it always saves. WHEN and COST are found by key: labels are free text. */
export function rowFromActivity(data: Pick<FlyerData, 'text' | 'chips'>, title: string): WeekRow {
  const chip = (key: 'when' | 'cost') => data.chips.find((c) => c.key === key)?.value ?? '';
  const [day = '', time = ''] = splitDot(chip('when'));
  const [cost = ''] = splitDot(chip('cost'));
  return {
    day: clamp(day, WEEK_ROW_LIMITS.day),
    name: clamp(eventName(data.text) || title, WEEK_ROW_LIMITS.name),
    time: clamp(time, WEEK_ROW_LIMITS.time),
    cost: clamp(cost, WEEK_ROW_LIMITS.cost),
  };
}

/** A row prints its short name instead of its name when it has one; an empty or blank one is none. */
export const usesShortName = (row: WeekRow): boolean => !!row.shortName?.trim();

/** The event name a row prints. */
export const printedName = (row: WeekRow): string => (usesShortName(row) ? row.shortName! : row.name);

/** One row as it prints: no field keeps a stray `·`, and the price takes up to two lines under the
    time, its first part then the rest (the COST chip's big and small line; the owner's call, 2026-09-29). */
export interface PrintedRow {
  day: string;
  name: string;
  time: string;
  cost: string[];
}

function printedRow(row: WeekRow): PrintedRow {
  const { big, sub } = splitBigSub(row.cost);
  return { day: tidyDot(row.day), name: tidyDot(printedName(row)), time: tidyDot(row.time), cost: [big, sub].filter(Boolean) };
}

const hasContent = (p: PrintedRow) => !!(p.day || p.name || p.time || p.cost.length);

/** Whether a row prints at all: one with nothing in it is left out, never an empty box. */
export const isPrintable = (row: WeekRow): boolean => hasContent(printedRow(row));

/** The rows as they print, in order; slot i is the i-th printed row. */
export const printedRows = (week: WeekRow[]): PrintedRow[] => week.map(printedRow).filter(hasContent);
