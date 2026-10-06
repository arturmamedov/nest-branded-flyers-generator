import { AiUsageFileSchema, checkedAiUsage, schemaProblems, type StoredAiUsage } from '../../../src/shared/storage.js';
import type { AiUsageDay, AiUsageRepository } from '../types.js';
import type { JsonFiles } from './files.js';
import type { JsonStore } from './store.js';

/**
 * The AI ledger in the JSON store: `<dir>/YYYY-MM.json`, the month of the record's day ($defs.aiUsage), appended
 * under the store's lock. A month's file appears on its first append, so a read never writes, and a store from before
 * the ledger needs no migration: nothing refers to a record, there is no id and no counter in meta.json. The twin of
 * php/src/Storage/Json/JsonAiUsageRepository.php.
 */
export class JsonAiUsageRepository implements AiUsageRepository {
  constructor(
    private readonly files: JsonFiles,
    private readonly store: JsonStore,
    /** The ledger's folder, relative to the store (STORAGE_FILES.aiUsageDir). */
    private readonly dir: string,
  ) {}

  async record(entry: StoredAiUsage): Promise<void> {
    // Checked before the lock: every read parses the month's file, so one bad record would close the whole month.
    const checked = checkedAiUsage(entry);
    await this.store.run(async () => {
      const file = this.file(checked.day);
      await this.files.write(file, [...(await this.read(file)), toRecord(checked)]);
    });
  }

  async countDay(actorId: string, day: string): Promise<AiUsageDay> {
    return this.store.run(async () => {
      const counts: AiUsageDay = { ok: {}, tried: {} };
      for (const r of await this.read(this.file(day))) {
        if (r.actorId !== actorId || r.day !== day) continue;
        counts.tried[r.feature] = (counts.tried[r.feature] ?? 0) + 1;
        if (r.ok) counts.ok[r.feature] = (counts.ok[r.feature] ?? 0) + 1;
      }
      return counts;
    });
  }

  async all(): Promise<StoredAiUsage[]> {
    return this.store.run(async () => {
      const months = (await this.files.names(this.dir)).filter((name) => /^\d{4}-\d{2}\.json$/.test(name)).sort();
      const records: StoredAiUsage[] = [];
      for (const month of months) records.push(...(await this.read(`${this.dir}/${month}`)));
      return records;
    });
  }

  /** The month's file: the first seven characters of the Canary day. */
  private file(day: string): string {
    return `${this.dir}/${day.slice(0, 7)}.json`;
  }

  /** The month's records, or none when its file does not exist yet; a file the schema refuses is named, as meta.json is. */
  private async read(file: string): Promise<StoredAiUsage[]> {
    const raw = await this.files.read(file);
    if (raw === null) return [];
    const parsed = AiUsageFileSchema.safeParse(raw);
    if (!parsed.success) throw new Error(`${file} is damaged: ${schemaProblems(parsed.error)}.`);
    return parsed.data;
  }
}

/** The stored shape, in the schema's key order, so the file is the same whichever driver wrote it. */
const toRecord = (e: StoredAiUsage): StoredAiUsage => ({
  at: e.at,
  day: e.day,
  actorId: e.actorId,
  feature: e.feature,
  provider: e.provider,
  model: e.model,
  tokens: e.tokens === null ? null : { input: e.tokens.input, output: e.tokens.output },
  ok: e.ok,
  input: e.input,
  output: e.output,
});
