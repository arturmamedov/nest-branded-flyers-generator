import { z } from 'zod';
import { FLYER_LABELS, LABEL_SLUGS, knownLabels, labelNames, storedLabels, tidyLabels } from '../../src/shared/labels.js';
import { SiteFlyerSchema, type SiteCall } from '../site.js';

/* The two halves of `npm run flyers:labels` (labels.ts runs them), with no file and no command line here, so a test
   drives them on a stand-in for a site.

   - describeFlyers: every flyer of a site, as much of it as says what kind it is. Reads only.
   - applyLabels: a table of labels, written by someone who read that description (Artur's answer, 2026-10-14:
     "Classify the flyers, I trust you": the session reads each flyer and chooses, with no keyword rules), put on the
     site's flyers through its API, as the editor would. It fills flyers that carry none and never changes one. */

/** A flyer as a site sends it, its data unparsed: the site may run another release than this checkout, and a PUT
    hands its data back as it came, with the labels added. */
const RawPayloadSchema = z.object({
  flyer: z.object({
    title: z.string(),
    hostel: z.string().nullable(),
    template: z.string(),
    data: z.record(z.string(), z.unknown()),
    photoId: z.number().nullable(),
    updatedAt: z.string(),
  }),
});

/** What a save answers, as far as the check after it reads. */
const SavedSchema = z.object({ flyer: z.object({ data: z.object({ labels: z.array(z.string()).optional() }) }) });

/** The table a session writes: a site's flyers by id, each with its name as it was read (a flyer renamed since is
    another flyer) and the labels chosen for it. Strict, so a misspelt key is an error. */
export const LabelTableSchema = z.strictObject({
  /** The app root the ids are of: a table is one site's. */
  site: z.string().min(1),
  flyers: z.array(z.strictObject({ id: z.number().int().positive(), title: z.string(), labels: z.array(z.string()) })),
});
export type LabelTable = z.infer<typeof LabelTableSchema>;

export interface DescribedFlyer {
  id: number;
  template: string;
  hostel: string | null;
  title: string;
  updatedAt: string;
  /** Its headline's lines, its Spanish line, a week flyer's row names, and the start of its caption: what it is about. */
  headline: string;
  spanish: string;
  rows: string[];
  caption: string;
  /** The labels it carries today, by slug. */
  labels: string[];
}

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

/** Every flyer of the site, newest first as its library lists them. */
export async function describeFlyers(call: SiteCall): Promise<DescribedFlyer[]> {
  const list = await call('GET', 'api/flyers', z.array(SiteFlyerSchema));
  const flyers: DescribedFlyer[] = [];
  for (const item of list) {
    const { flyer } = await call('GET', `api/flyers/${item.id}`, RawPayloadSchema);
    const lines = (flyer.data.text ?? {}) as Record<string, unknown>;
    const week = Array.isArray(flyer.data.week) ? (flyer.data.week as Record<string, unknown>[]) : [];
    flyers.push({
      id: item.id,
      template: flyer.template,
      hostel: flyer.hostel,
      title: flyer.title,
      updatedAt: flyer.updatedAt,
      headline: [text(lines.headline1), text(lines.headline2)].filter(Boolean).join(' / '),
      spanish: text(lines.headlineEs),
      rows: week.map((row) => text(row?.name)).filter(Boolean),
      caption: text(flyer.data.share).replace(/\s+/g, ' ').slice(0, 200),
      labels: storedLabels(flyer.data),
    });
  }
  return flyers;
}

/** What became of one row of the table. */
export interface LabelOutcome {
  id: number;
  title: string;
  /** `labelled`: written. `would`: a dry run would write it. The rest say why nothing was written. */
  result: 'labelled' | 'would' | 'has-labels' | 'not-listed' | 'renamed' | 'moved' | 'nothing-to-add' | 'failed';
  labels: string[];
  note: string;
}

/** Why a table cannot be used on this site at all, or null: it is another site's, or it names a label that is not
    on this checkout's list (only the owner adds one). Said before anything is read. */
export function tableProblem(table: LabelTable, siteRoot: string): string | null {
  const same = URL.canParse(table.site) && URL.canParse(siteRoot) && new URL(table.site).href.replace(/\/$/, '') === new URL(siteRoot).href.replace(/\/$/, '');
  if (!same) return `this table is for ${table.site}, not for ${siteRoot}: a flyer's id is its own site's.`;
  const unknown = [...new Set(table.flyers.flatMap((f) => f.labels))].filter((slug) => !LABEL_SLUGS.includes(slug));
  if (unknown.length) return `not on the list of labels (src/shared/labels.ts): ${unknown.join(', ')}. The list is ${FLYER_LABELS.map((l) => l.slug).join(', ')}.`;
  const twice = table.flyers.map((f) => f.id).filter((id, i, ids) => ids.indexOf(id) !== i);
  if (twice.length) return `a flyer is in the table twice: #${[...new Set(twice)].join(', #')}.`;
  return null;
}

/** Puts the table's labels on the site's flyers that carry none, oldest first: each save gives a flyer today's date
    in the library, so the labelled ones keep their order among themselves. Nothing is written on a dry run. */
export async function applyLabels(call: SiteCall, table: LabelTable, { dry = false }: { dry?: boolean } = {}): Promise<LabelOutcome[]> {
  const list = await call('GET', 'api/flyers', z.array(SiteFlyerSchema));
  // A release from before labels answers 200 to a save and drops them without a word (unknown keys are stripped):
  // ask a saved flyer first. Every read fills today's defaults, so a site that knows the field returns it on any flyer.
  if (list.length > 0 && !('labels' in (await call('GET', `api/flyers/${list[0].id}`, RawPayloadSchema)).flyer.data)) {
    throw new Error('this site runs a release from before labels and would drop them: upload the current release first (npm run build:php, docs/deploy.md).');
  }
  const byId = new Map(list.map((item) => [item.id, item]));
  const oldestFirst = [...table.flyers].sort((a, b) => (byId.get(a.id)?.updatedAt ?? '').localeCompare(byId.get(b.id)?.updatedAt ?? '') || a.id - b.id);
  const outcomes: LabelOutcome[] = [];
  for (const row of oldestFirst) {
    const done = (result: LabelOutcome['result'], note: string) => outcomes.push({ id: row.id, title: row.title, result, labels: tidyLabels(row.labels), note });
    const item = byId.get(row.id);
    if (!item) {
      done('not-listed', 'not in the site’s library (archived, or another site’s id)');
      continue;
    }
    if (item.title !== row.title) {
      done('renamed', `it is called “${item.title}” on the site now: read the site again`);
      continue;
    }
    if (row.labels.length === 0) {
      done('nothing-to-add', 'no label chosen for it');
      continue;
    }
    try {
      // Read again right before the save: a flyer someone saved since the list was read is left to them.
      const { flyer } = await call('GET', `api/flyers/${row.id}`, RawPayloadSchema);
      if (flyer.updatedAt !== item.updatedAt || flyer.title !== row.title) {
        done('moved', 'saved by someone while this ran: left as it is');
        continue;
      }
      const has = knownLabels(storedLabels(flyer.data));
      if (has.length > 0) {
        done('has-labels', `already carries ${labelNames(has).join(', ')}: never changed`);
        continue;
      }
      // Its own labels that are off the list stay, after the new ones.
      const labels = tidyLabels([...row.labels, ...storedLabels(flyer.data)]);
      if (dry) {
        done('would', labelNames(labels).join(', '));
        continue;
      }
      const saved = await call('PUT', `api/flyers/${row.id}`, SavedSchema, {
        title: flyer.title,
        hostel: flyer.hostel,
        template: flyer.template,
        data: { ...flyer.data, labels },
        photoId: flyer.photoId,
      });
      // The same labels, in whatever order the site's own list puts them.
      const kept = saved.flyer.data.labels ?? [];
      if (kept.length !== labels.length || !labels.every((slug) => kept.includes(slug))) throw new Error(`the site saved ${JSON.stringify(kept)}, not ${JSON.stringify(labels)}`);
      done('labelled', labelNames(labels).join(', '));
    } catch (e) {
      done('failed', e instanceof Error ? e.message : String(e));
    }
  }
  return outcomes;
}
