import type { Chip, ChipKey } from './schema.js';

/* The `·` convention: a middle dot inside a chip value splits the big line
   from the sub line. "Saturday 19/9 · 15:00" → big "Saturday 19/9", sub "15:00".
   It is how a receptionist writes two facts in one field without a form. */

export interface DerivedChip {
  key: ChipKey;
  label: string;
  big: string;
  sub: string;
}

export const DEFAULT_CHIP_ORDER: ChipKey[] = ['when', 'where', 'cost'];

/** A chip value's longest form, in code points, as zod and the PHP validator count them: two facts round a `·`.
    schema.ts takes it for the flyer and for a brief alike, and the AI's prompt lists it. */
export const CHIP_VALUE_MAX = 90;

/** The label beside it ("When"). */
export const CHIP_LABEL_MAX = 12;

export function splitDot(value: string): string[] {
  return String(value || '')
    .split('·')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Segments back into one line, the way the flyer prints them. */
export const joinDot = (parts: string[]): string => parts.join(' · ');

/** A value with no stray `·`: no empty segment, no dangling dot, even spacing. */
export const tidyDot = (value: string): string => joinDot(splitDot(value));

/** The convention's two lines: the first segment big, the rest small. */
export function splitBigSub(value: string): { big: string; sub: string } {
  const parts = splitDot(value);
  return { big: parts.shift() || '', sub: joinDot(parts) };
}

/** One chip, derived. WHERE puts the hostel on the big line and drops a
    segment that repeats it; with no hostel the first segment is the big line. */
export function deriveChip(chip: Chip, hostelName: string | null): DerivedChip {
  if (chip.key !== 'where') return { key: chip.key, label: chip.label, ...splitBigSub(chip.value) };
  const hostel = (hostelName || '').trim();
  const parts = splitDot(chip.value).filter((s) => s.toLowerCase() !== hostel.toLowerCase());
  const big = hostel || parts.shift() || '';
  return { key: chip.key, label: chip.label, big, sub: joinDot(parts) };
}

/** Chips in print order. A chip with nothing to say collapses — no empty box. */
export function deriveChips(
  chips: Chip[],
  hostelName: string | null,
  order: ChipKey[] = DEFAULT_CHIP_ORDER,
): DerivedChip[] {
  const out: DerivedChip[] = [];
  for (const key of order) {
    const chip = chips.find((c) => c.key === key);
    if (!chip) continue;
    const derived = deriveChip(chip, hostelName);
    if (derived.big) out.push(derived);
  }
  return out;
}
