/* A flyer's labels: what kind of thing it is, for finding it again in the library (the owner's ask, 2026-10-13; his
   answers of that day and the next: several on a flyer, from a fixed list, and the word staff see is "Labels").
   Flyer data, saved with the flyer like the share text, and never ink: <Flyer> doesn't read them.
   No zod here, like share.ts: the editor imports it, and schema.ts takes the limits from this file. `npm run gen`
   writes the list to schema/shared.json for PHP (LABELS_SHARED), whose twin of the rules is Domain\FlyerLabels;
   tests/fixtures/flyer-labels.json holds both to one table.

   A label is held to a shape, never to this list, wherever a flyer is checked: Node checks a flyer against its
   rules on every read, so a label taken off the list would otherwise stop its flyers from opening. Such a label
   stays stored and is on no screen, and it shows again if it comes back to the list (his answer). */

export interface FlyerLabel {
  /** What is stored and what the library's filter asks for. Never changed once flyers carry it. */
  slug: string;
  /** What staff read. */
  name: string;
  /** What says a flyer is of this kind, where the name alone does not: one line. The AI assistant reads it beside
      the name when it picks a flyer's labels from this list (`npm run gen` writes the list into its prompt). */
  hint?: string;
}

/** The list, in the order every screen shows it. Only the owner adds to it, as with the hostels: his own six
    first (2026-10-13), then the seven he took from the flyers on the live site on 2026-10-14. A new one is a line
    here and a release. */
export const FLYER_LABELS: readonly FlyerLabel[] = [
  { slug: 'dinners', name: 'Dinners' },
  { slug: 'stretching', name: 'Stretching' },
  { slug: 'masca', name: 'Masca' },
  { slug: 'teide', name: 'Teide' },
  { slug: 'excursions', name: 'Excursions', hint: 'a trip out of the hostel' },
  // An organiser, and so the owner's answer of 2026-10-14: "An organiser only when named".
  { slug: 'tenerife-tours', name: 'Tenerife Tours', hint: 'the organiser Tenerife Tours, only where the text or the picture names it' },
  { slug: 'shows', name: 'Shows' },
  { slug: 'movie-nights', name: 'Movie nights' },
  { slug: 'beach', name: 'Beach' },
  { slug: 'games', name: 'Games' },
  { slug: 'dance', name: 'Dance' },
  { slug: 'workshops', name: 'Workshops' },
  { slug: 'whats-on', name: 'What’s on', hint: 'what is on in the city: concerts, festivals and other events that are not the hostel’s own' },
];

export const LABEL_SLUGS: readonly string[] = FLYER_LABELS.map((label) => label.slug);

/** The most a flyer carries. Roomy on purpose: raising a limit is the change an older release refuses. */
export const LABELS_MAX = 8;

/** A label's shape: lower-case words and numbers joined by single hyphens. */
export const LABEL_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const LABEL_SLUG_MAX = 40;

/** What the library's filter asks for to get the flyers that carry no label; no slug may be it. */
export const NO_LABEL = 'none';

/** The labels of a flyer that are on the list, in the list's order, once each: what every screen shows. */
export function knownLabels(labels: readonly string[], list: readonly string[] = LABEL_SLUGS): string[] {
  return list.filter((slug) => labels.includes(slug));
}

/** A flyer's labels as they are saved: the listed ones in the list's order, then the ones off the list as they were
    stored, each once. The order is the list's, never the order picked, so a label switched on and off again leaves
    the flyer as it was. */
export function tidyLabels(labels: readonly string[], list: readonly string[] = LABEL_SLUGS): string[] {
  const hidden = labels.filter((slug, i) => !list.includes(slug) && labels.indexOf(slug) === i);
  return [...knownLabels(labels, list), ...hidden];
}

/** The picker's press: the label on if it was off, off if it was on. A label off the list is not the picker's. */
export function toggleLabel(labels: readonly string[], slug: string, list: readonly string[] = LABEL_SLUGS): string[] {
  return tidyLabels(labels.includes(slug) ? labels.filter((label) => label !== slug) : [...labels, slug], list);
}

/** Whether a flyer with these labels is among the ones the library's filter asks for: a slug it carries, or
    NO_LABEL for a flyer on which staff see none. */
export function matchesLabel(labels: readonly string[], wanted: string, list: readonly string[] = LABEL_SLUGS): boolean {
  return wanted === NO_LABEL ? knownLabels(labels, list).length === 0 : labels.includes(wanted);
}

/** A stored flyer's labels, read loosely by the storage drivers, which list a flyer whatever its data holds: a flyer
    saved before labels has none, and a file edited by hand never stops the list. */
export function storedLabels(data: unknown): string[] {
  const labels = (data as { labels?: unknown } | null | undefined)?.labels;
  return Array.isArray(labels) ? labels.filter((label): label is string => typeof label === 'string') : [];
}

/** What staff read for a flyer's labels: the names of the listed ones, in the list's order. */
export function labelNames(labels: readonly string[]): string[] {
  return FLYER_LABELS.filter((label) => labels.includes(label.slug)).map((label) => label.name);
}

/** The block `npm run gen` writes to schema/shared.json; PHP reads it through Shared::labels(). */
export const LABELS_SHARED = {
  list: FLYER_LABELS,
  max: LABELS_MAX,
  slugMax: LABEL_SLUG_MAX,
  slug: LABEL_SLUG.source,
  none: NO_LABEL,
} as const;
