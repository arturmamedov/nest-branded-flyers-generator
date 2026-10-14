import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { labelNames } from '../../src/shared/labels.js';
import { flyersTarget, type RemoteSite } from '../env.js';
import { appRoot, issues, siteAt, siteCaller } from '../site.js';
import { LabelTableSchema, applyLabels, describeFlyers, tableProblem } from './labelTable.js';

/* npm run flyers:labels -- [--to <app root>] [--out <file.json>]
   npm run flyers:labels -- [--to <app root>] --apply <table.json> [--write]

   The labels of the flyers a site already has (the owner's ask, 2026-10-13: "for now just the evident ones"; his
   answer of the next day: "Classify the flyers, I trust you"). Two steps, through the site's API, as the editor
   would:

   1. With no table it prints every flyer of the site, as much as says what kind it is, and writes nothing. `--out`
      keeps that as a file, for whoever chooses the labels to read.
   2. `--apply` takes the table written from it: a site's flyers by id, each with the labels chosen. It says what it
      would do and writes nothing; with `--write` it does it. It fills flyers that carry no label, oldest first, and
      never changes one that has any. Each flyer it fills moves to the top of the library with today's date, as after
      any save.

   The rules are labelTable.ts's. The site is FLYERS_BASE_URL in .env, or `--to`. */

function site(to: string | undefined): RemoteSite {
  const flyers = flyersTarget();
  if (to !== undefined) {
    const root = appRoot(to);
    if (root === null) throw new Error(`--to takes a site's address (https://…), not “${to}”.`);
    // The login in .env is the site's that .env names: another address goes without it (scripts/site.ts).
    return siteAt(root, flyers);
  }
  if (!flyers) throw new Error('No site: set FLYERS_BASE_URL in .env (the app root, e.g. https://nestpass.ai/activities/), or pass --to <url>.');
  return flyers;
}

async function main() {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    allowPositionals: true,
    options: { to: { type: 'string' }, out: { type: 'string' }, apply: { type: 'string' }, write: { type: 'boolean' } },
  });
  if (positionals.length > 0 || (values.write && values.apply === undefined) || (values.out !== undefined && values.apply !== undefined)) {
    throw new Error('Usage: npm run flyers:labels -- [--to <url>] [--out <file.json>]   or   -- [--to <url>] --apply <table.json> [--write]');
  }
  const target = site(values.to);
  const call = siteCaller(target);

  if (values.apply === undefined) {
    const flyers = await describeFlyers(call);
    console.log(`Site ${target.baseUrl}: ${flyers.length} flyer(s), newest first. Nothing is written.`);
    for (const f of flyers) {
      const about = [f.headline, f.rows.length ? `rows: ${f.rows.join('; ')}` : '', f.spanish].filter(Boolean).join(' | ');
      console.log(`#${f.id} [${f.template}] ${f.hostel ?? 'chain-wide'} | ${f.title} | ${about}${f.labels.length ? ` | labels: ${labelNames(f.labels).join(', ') || f.labels.join(', ')}` : ''}`);
    }
    if (values.out !== undefined) {
      writeFileSync(values.out, `${JSON.stringify({ site: target.baseUrl, readAt: new Date().toISOString(), flyers }, null, 2)}\n`);
      console.log(`Kept as ${values.out}.`);
    }
    return;
  }

  const table = LabelTableSchema.parse(JSON.parse(readFileSync(values.apply, 'utf8')));
  const problem = tableProblem(table, target.baseUrl);
  if (problem) throw new Error(`${values.apply}: ${problem}`);
  const dry = !values.write;
  console.log(`Site ${target.baseUrl}${dry ? ': a dry run, nothing is written (add --write to do it)' : ': writing. Each flyer it labels moves to the top of the library with today’s date.'}`);
  const outcomes = await applyLabels(call, table, { dry });
  for (const o of outcomes) {
    const mark = o.result === 'labelled' ? '✓' : o.result === 'failed' ? '✗' : '·';
    const said = o.result === 'labelled' ? `labelled ${o.note}` : o.result === 'would' ? `would label ${o.note}` : o.note;
    console.log(`${mark} #${o.id} ${o.title}: ${said}`);
  }
  const count = (result: string) => outcomes.filter((o) => o.result === result).length;
  console.log(`${count(dry ? 'would' : 'labelled')} ${dry ? 'to label' : 'labelled'}, ${outcomes.length - count('would') - count('labelled') - count('failed')} left as they are, ${count('failed')} failed.`);
  if (count('failed') > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e instanceof z.ZodError ? issues(e) : e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
