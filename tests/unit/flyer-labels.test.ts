import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  FLYER_LABELS,
  LABELS_MAX,
  LABELS_SHARED,
  LABEL_SLUG,
  LABEL_SLUGS,
  LABEL_SLUG_MAX,
  NO_LABEL,
  knownLabels,
  labelNames,
  matchesLabel,
  storedLabels,
  tidyLabels,
  toggleLabel,
} from '../../src/shared/labels.js';

/* A flyer's labels: the list, and the rules both backends and the editor apply to it. The vectors are
   tests/fixtures/flyer-labels.json, which PHPUnit replays against php/src/Domain/FlyerLabels.php. */

interface Vectors {
  list: string[];
  none: string;
  tidy: { why: string; labels: string[]; out: string[] }[];
  known: { why: string; labels: string[]; out: string[] }[];
  matches: { why: string; labels: string[]; wanted: string; out: boolean }[];
  stored: { why: string; data: unknown; out: string[] }[];
}
const root = join(import.meta.dirname, '../..');
const vectors = JSON.parse(readFileSync(join(root, 'tests/fixtures/flyer-labels.json'), 'utf8')) as Vectors;

describe('the rules for a flyer’s labels (the shared vectors)', () => {
  it('tidies what is saved: listed labels in the list’s order, then the others as stored, once each', () => {
    for (const c of vectors.tidy) expect(tidyLabels(c.labels, vectors.list), c.why).toEqual(c.out);
  });

  it('shows the listed ones alone', () => {
    for (const c of vectors.known) expect(knownLabels(c.labels, vectors.list), c.why).toEqual(c.out);
  });

  it('matches the library’s filter: a slug, or "none"', () => {
    expect(NO_LABEL).toBe(vectors.none);
    for (const c of vectors.matches) expect(matchesLabel(c.labels, c.wanted, vectors.list), c.why).toBe(c.out);
  });

  it('reads a stored flyer’s labels loosely: a file edited by hand never stops the list', () => {
    for (const c of vectors.stored) expect(storedLabels(c.data), c.why).toEqual(c.out);
  });
});

describe('toggleLabel', () => {
  const list = vectors.list;

  it('adds a label in the list’s order, and takes it off again', () => {
    expect(toggleLabel(['excursions'], 'masca', list)).toEqual(['masca', 'excursions']);
    expect(toggleLabel(['masca', 'excursions'], 'masca', list)).toEqual(['excursions']);
  });

  it('on and off again is the flyer as it was, so the editor reads "Saved"', () => {
    const saved = tidyLabels(['teide', 'old-one', 'dinners'], list);
    expect(toggleLabel(toggleLabel(saved, 'masca', list), 'masca', list)).toEqual(saved);
    expect(toggleLabel(toggleLabel(saved, 'teide', list), 'teide', list)).toEqual(saved);
  });

  it('keeps a label that is off the list: it is stored, never shown, and not the picker’s to drop', () => {
    expect(toggleLabel(['old-one'], 'teide', list)).toEqual(['teide', 'old-one']);
    expect(toggleLabel(['teide', 'old-one'], 'teide', list)).toEqual(['old-one']);
  });
});

describe('the list itself', () => {
  it('has slugs of the one shape, each once, and none of them is the filter’s "none"', () => {
    expect(FLYER_LABELS.length).toBeGreaterThan(0);
    for (const { slug } of FLYER_LABELS) {
      expect(slug, slug).toMatch(LABEL_SLUG);
      expect(slug.length, slug).toBeLessThanOrEqual(LABEL_SLUG_MAX);
      expect(slug, 'the filter’s own word').not.toBe(NO_LABEL);
    }
    expect(new Set(LABEL_SLUGS).size).toBe(FLYER_LABELS.length);
    expect(LABEL_SLUGS).toEqual(FLYER_LABELS.map((l) => l.slug));
  });

  it('names every label, each name once and as it is written (no space at either end)', () => {
    const names = FLYER_LABELS.map((l) => l.name);
    for (const name of names) expect(name.trim(), name).toBe(name);
    expect(names.every((n) => n.length > 0)).toBe(true);
    expect(new Set(names).size).toBe(names.length);
  });

  it('gives the names of a flyer’s labels, the listed ones, in the list’s order', () => {
    const [first, second] = FLYER_LABELS;
    expect(labelNames([second.slug, 'not-a-label', first.slug])).toEqual([first.name, second.name]);
    expect(labelNames([])).toEqual([]);
  });

  it('the shape refuses what is no slug', () => {
    for (const bad of ['', 'Dinners', 'movie nights', '-masca', 'masca-', 'a--b', 'cena_arepas', 'día']) expect(bad, bad).not.toMatch(LABEL_SLUG);
    for (const good of ['masca', 'tenerife-tours', 'week-42', 'a']) expect(good, good).toMatch(LABEL_SLUG);
  });
});

describe('what PHP is told (the labels block of schema/shared.json)', () => {
  it('is the list, its limits, the shape and the filter’s word', () => {
    const shared = JSON.parse(readFileSync(join(root, 'schema/shared.json'), 'utf8')) as { labels: unknown };
    expect(shared.labels).toEqual(JSON.parse(JSON.stringify(LABELS_SHARED)));
    expect(LABELS_SHARED).toEqual({ list: FLYER_LABELS, max: LABELS_MAX, slugMax: LABEL_SLUG_MAX, slug: LABEL_SLUG.source, none: NO_LABEL });
  });
});
