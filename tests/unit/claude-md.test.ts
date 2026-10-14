import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { APP_ROOT } from '../../server/paths.js';

/* CLAUDE.md is a map that every session reads first (docs/reports/faster-sessions.md): the full text is in
   docs/architecture.md, docs/design-decisions.md and docs/status.md, reached by its links. A link to a section that
   was renamed would send a session nowhere, and a map that grows back is the 1,260 lines it was. */

const MAX_LINES = 250;

const read = (file: string) => readFileSync(join(APP_ROOT, file), 'utf8');
const claudeMd = read('CLAUDE.md');

/** The anchors GitHub (and VS Code's preview) give a file's headings: lower case, punctuation dropped, spaces as
    hyphens, a repeated heading numbered. */
function anchors(markdown: string): Set<string> {
  const seen = new Map<string, number>();
  const out = new Set<string>();
  let fenced = false;
  for (const line of markdown.split('\n')) {
    if (line.startsWith('```')) fenced = !fenced;
    const heading = !fenced && /^#{1,6} (.+)$/.exec(line);
    if (!heading) continue;
    const slug = heading[1].trim().toLowerCase().replace(/[^\p{L}\p{N} _-]/gu, '').replace(/ /g, '-');
    const n = seen.get(slug) ?? 0;
    seen.set(slug, n + 1);
    out.add(n === 0 ? slug : `${slug}-${n}`);
  }
  return out;
}

/** Every local link of CLAUDE.md, `[words](path#anchor)`, and every `docs/….md` it names in backticks. */
function targets(markdown: string): { path: string; anchor: string | null }[] {
  const links = [...markdown.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)].map((m) => m[1]).filter((t) => !/^[a-z]+:/i.test(t));
  const named = [...markdown.matchAll(/`(docs\/[^`\s]+?\.md(?:#[^`\s]*)?)`/g)].map((m) => m[1]);
  return [...links, ...named].map((target) => {
    const [path, anchor] = target.split('#');
    return { path: path || 'CLAUDE.md', anchor: anchor ?? null };
  });
}

describe('CLAUDE.md', () => {
  it(`stays a map: ${MAX_LINES} lines at most`, () => {
    expect(claudeMd.trimEnd().split('\n').length).toBeLessThanOrEqual(MAX_LINES);
  });

  it('links to files that exist', () => {
    const missing = targets(claudeMd).filter(({ path }) => !existsSync(join(APP_ROOT, path)));
    expect(missing.map(({ path }) => path)).toEqual([]);
  });

  it('links to sections that exist', () => {
    const broken = targets(claudeMd)
      .filter(({ path, anchor }) => anchor !== null && existsSync(join(APP_ROOT, path)))
      .filter(({ path, anchor }) => !anchors(read(path)).has(anchor!))
      .map(({ path, anchor }) => `${path}#${anchor}`);
    expect(broken).toEqual([]);
  });

  it('reads anchors as GitHub makes them', () => {
    expect([...anchors('# A\n## The WHEN chip and the Spanish line\n## Toasts\n## Toasts\n```\n# not a heading\n```')]).toEqual([
      'a',
      'the-when-chip-and-the-spanish-line',
      'toasts',
      'toasts-1',
    ]);
  });
});
