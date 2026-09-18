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

export function splitDot(value: string): string[] {
  return String(value || '')
    .split('·')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** One chip, derived. WHERE puts the hostel on the big line and drops a
    segment that repeats it; with no hostel the first segment is the big line. */
export function deriveChip(chip: Chip, hostelName: string | null): DerivedChip {
  let parts = splitDot(chip.value);
  let big: string;
  if (chip.key === 'where') {
    const hostel = (hostelName || '').trim();
    parts = parts.filter((s) => s.toLowerCase() !== hostel.toLowerCase());
    big = hostel || parts.shift() || '';
  } else {
    big = parts.shift() || '';
  }
  return { key: chip.key, label: chip.label, big, sub: parts.join(' · ') };
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
