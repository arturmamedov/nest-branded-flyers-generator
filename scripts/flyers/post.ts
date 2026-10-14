import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { flyerFromBrief } from '../../src/shared/brief.js';
import { lintFlyer } from '../../src/shared/copyRules.js';
import { AiExampleSchema, FlyerInputSchema, FlyerSavedSchema, HostelSchema, type AiExample } from '../../src/shared/schema.js';
import { flyersTarget, type RemoteSite } from '../env.js';
import { SiteFlyerSchema, issues, siteCaller, siteFirstLook, siteKeeps } from '../site.js';

/* npm run flyers:post -- <example files or folders…> [--to <app root>] [--dry-run]

   Saves a flyer from each brief on a deployment, through its API, as the editor would: the server stamps it, checks
   it and picks the id, so a flyer a manager saves meanwhile is never overwritten. Text only: photos are added in the
   editor. Each file is a record of docs/ai-flyers/examples (README there): the staff text as sent, and the brief
   written from it. A brief already on the site is skipped, so a folder can be sent again. */

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]']);

function exampleFiles(paths: string[]): string[] {
  return paths.flatMap((p) =>
    statSync(p).isDirectory()
      ? readdirSync(p)
          .filter((f) => f.endsWith('.json'))
          .sort()
          .map((f) => join(p, f))
      : [p],
  );
}

function site(to: string | undefined): RemoteSite {
  if (to) return { baseUrl: to.endsWith('/') ? to : `${to}/`, source: 'environment' };
  const target = flyersTarget();
  if (!target) throw new Error('No site: set FLYERS_BASE_URL in .env (the app root, e.g. https://nestpass.ai/activities/), or pass --to <url>.');
  return target;
}

async function main() {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    allowPositionals: true,
    options: { to: { type: 'string' }, 'dry-run': { type: 'boolean' } },
  });
  if (positionals.length === 0) throw new Error('Usage: npm run flyers:post -- <example files or folders…> [--to <url>] [--dry-run]');
  const target = site(values.to);
  const dry = values['dry-run'] ?? false;
  const remote = !LOOPBACK.has(new URL(target.baseUrl).hostname);
  console.log(`Site ${target.baseUrl}${values.to ? ' (--to)' : ` (FLYERS_BASE_URL from ${target.source})`}${dry ? ' — dry run, nothing is saved' : ''}`);

  // The write header, the site's login and the API's own words for a refusal: scripts/site.ts, shared with ai:smoke.
  const call = siteCaller(target);

  const hostels = await call('GET', 'api/hostels', z.array(HostelSchema));
  const onSite = await call('GET', 'api/flyers', z.array(SiteFlyerSchema));
  // A release older than the share text, or than labels, drops them without a word (unknown keys are stripped), so
  // a saved flyer is asked first (siteKeeps).
  const keepsShare = await siteKeeps(call, 'share', onSite);
  const keepsLabels = await siteKeeps(call, 'labels', onSite);
  // The look the site starts a new flyer in, as its editor does (M6): the first it names.
  const look = await siteFirstLook(call);
  let failed = 0;

  for (const file of exampleFiles(positionals)) {
    const label = file.replace(/\\/g, '/');
    try {
      // The file's shape is AiExampleSchema (src/shared/schema.ts): the same files feed the AI assistant's few-shot.
      const example: AiExample = AiExampleSchema.parse(JSON.parse(readFileSync(file, 'utf8')));
      const { brief } = example;
      const before = example.posted?.find((p) => p.site === target.baseUrl);
      if (before) {
        console.log(`· ${label}: already saved here as #${before.id} (${before.at})`);
        continue;
      }
      // Hostel names come only from the owner: a slug the site doesn't know stops the brief, never guessed.
      const hostel = brief.hostel === null ? null : hostels.find((h) => h.slug === brief.hostel);
      if (hostel === undefined) throw new Error(`no hostel "${brief.hostel}" on this site (${hostels.map((h) => h.slug).join(', ')})`);
      const input = flyerFromBrief(brief, hostel?.name ?? null, new Date(), look);
      const checked = FlyerInputSchema.safeParse(input);
      if (!checked.success) throw new Error(issues(checked.error));
      const same = onSite.find((f) => f.title === input.title && f.hostel === input.hostel);
      if (same) {
        console.log(`· ${label}: “${input.title}” is already on the site as #${same.id}`);
        continue;
      }
      if (input.data.share && keepsShare === false) {
        throw new Error('this site runs a release older than the share text, and would drop it: upload the current release (npm run build:php, docs/deploy.md) first');
      }
      if (input.data.labels.length > 0 && keepsLabels === false) {
        throw new Error('this site runs a release from before labels, and would drop them: upload the current release (npm run build:php, docs/deploy.md) first');
      }
      for (const lint of lintFlyer(input.data)) console.log(`  ! ${label}: ${lint.message}`);
      if (dry) {
        console.log(`· ${label}: would save “${input.title}” (${input.template}, ${hostel?.name ?? 'chain-wide'})`);
        continue;
      }
      const saved = await call('POST', 'api/flyers', FlyerSavedSchema, input);
      onSite.push({ id: saved.id, title: saved.flyer.title, hostel: saved.flyer.hostel, updatedAt: saved.flyer.updatedAt });
      console.log(`✓ ${label}: saved “${saved.flyer.title}” as #${saved.id} — ${target.baseUrl}#/flyers/${saved.id}`);
      if (remote) {
        const posted = [...(example.posted ?? []), { site: target.baseUrl, id: saved.id, at: saved.flyer.createdAt }];
        writeFileSync(file, `${JSON.stringify({ ...example, posted }, null, 2)}\n`);
      }
    } catch (e) {
      failed++;
      console.error(`✗ ${label}: ${e instanceof z.ZodError ? issues(e) : e instanceof Error ? e.message : String(e)}`);
    }
  }
  if (failed) {
    console.error(`${failed} brief(s) not saved.`);
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
