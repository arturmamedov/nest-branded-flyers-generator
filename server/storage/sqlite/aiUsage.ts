import { checkedAiUsage, type StoredAiUsage } from '../../../src/shared/storage.js';
import type { DB } from '../../db/open.js';
import type { AiUsageCounts, AiUsageRepository } from '../types.js';

/* The AI ledger in SQLite (migration 3, `ai_usage`): one row per generation attempted, appended, never edited.
   The row id orders all(); the quota reads the (actor_id, day, ok) index, then groups the day's few rows by feature. */

interface AiUsageRow {
  at: string;
  day: string;
  actor_id: string;
  feature: string;
  provider: string;
  model: string;
  input_tokens: number | null;
  output_tokens: number | null;
  ok: number;
  input: string;
  output: string | null;
}

const COLUMNS = 'at, day, actor_id, feature, provider, model, input_tokens, output_tokens, ok, input, output';

const toRecord = (r: AiUsageRow): StoredAiUsage => ({
  at: r.at,
  day: r.day,
  actorId: r.actor_id,
  feature: r.feature as StoredAiUsage['feature'],
  provider: r.provider,
  model: r.model,
  tokens: r.input_tokens === null || r.output_tokens === null ? null : { input: r.input_tokens, output: r.output_tokens },
  ok: r.ok === 1,
  input: r.input,
  output: r.output,
});

export class SqliteAiUsageRepository implements AiUsageRepository {
  constructor(private db: DB) {}

  async record(entry: StoredAiUsage) {
    // The same check as the JSON driver's: a column would take 12.5, and the two stores must refuse alike.
    const e = checkedAiUsage(entry);
    this.db
      .prepare(
        `INSERT INTO ai_usage (${COLUMNS})
         VALUES (@at, @day, @actorId, @feature, @provider, @model, @inputTokens, @outputTokens, @ok, @input, @output)`,
      )
      .run({
        at: e.at,
        day: e.day,
        actorId: e.actorId,
        feature: e.feature,
        provider: e.provider,
        model: e.model,
        inputTokens: e.tokens?.input ?? null,
        outputTokens: e.tokens?.output ?? null,
        ok: e.ok ? 1 : 0,
        input: e.input,
        output: e.output,
      });
  }

  async countOk(actorId: string, day: string) {
    const rows = this.db.prepare('SELECT feature, COUNT(*) AS n FROM ai_usage WHERE actor_id = ? AND day = ? AND ok = 1 GROUP BY feature').all(actorId, day) as { feature: string; n: number }[];
    return Object.fromEntries(rows.map((r) => [r.feature, r.n])) as AiUsageCounts;
  }

  async all() {
    return (this.db.prepare(`SELECT ${COLUMNS} FROM ai_usage ORDER BY id`).all() as AiUsageRow[]).map(toRecord);
  }
}
