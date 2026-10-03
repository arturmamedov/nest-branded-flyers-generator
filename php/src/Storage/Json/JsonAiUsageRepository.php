<?php

declare(strict_types=1);

namespace NestFlyers\Storage\Json;

use NestFlyers\Domain\AiUsageRepository;
use NestFlyers\Domain\JsonFiles;
use NestFlyers\Domain\Lock;
use RuntimeException;
use stdClass;

/**
 * The AI ledger in the JSON store: `<dir>/YYYY-MM.json`, the month of the record's day ($defs.aiUsage), appended under
 * the store's lock. A month's file appears on its first append, so a read never writes, and a store from before the
 * ledger needs no migration: nothing refers to a record, there is no id and no counter in meta.json. The twin of
 * server/storage/json/aiUsage.ts.
 */
final class JsonAiUsageRepository implements AiUsageRepository
{
    /** @param string $dir the ledger's folder, relative to the store (Shared::storageFiles()['aiUsageDir']) */
    public function __construct(
        private readonly JsonFiles $files,
        private readonly Lock $lock,
        private readonly string $dir,
    ) {
    }

    public function record(array $entry): void
    {
        $this->lock->exclusive(function () use ($entry): void {
            $file = $this->file($entry['day']);
            $records = array_map(static fn (stdClass $r): array => self::stored((array) $r), $this->read($file));
            $records[] = self::stored($entry);
            $this->files->write($file, $records);
        });
    }

    public function countOk(string $actorId, string $day): int
    {
        $records = $this->lock->shared(fn (): array => $this->read($this->file($day)));
        return count(array_filter(
            $records,
            static fn (stdClass $r): bool => ($r->ok ?? null) === true && ($r->actorId ?? null) === $actorId && ($r->day ?? null) === $day,
        ));
    }

    /** The month's file: the first seven characters of the Canary day. */
    private function file(string $day): string
    {
        return $this->dir . '/' . substr($day, 0, 7) . '.json';
    }

    /** @return list<stdClass> the month's records, or none when its file does not exist yet */
    private function read(string $file): array
    {
        $records = $this->files->read($file) ?? [];
        if (!is_array($records) || array_filter($records, static fn (mixed $r): bool => !$r instanceof stdClass) !== []) {
            throw new RuntimeException("$file is damaged: expected a JSON array of ledger records.");
        }
        return $records;
    }

    /**
     * The stored shape, in the schema's key order, so the file is the same whichever driver wrote it.
     * @param array<string, mixed> $e
     * @return array<string, mixed>
     */
    private static function stored(array $e): array
    {
        $tokens = $e['tokens'] ?? null;
        return [
            'at' => $e['at'],
            'day' => $e['day'],
            'actorId' => $e['actorId'],
            'feature' => $e['feature'],
            'provider' => $e['provider'],
            'model' => $e['model'],
            'tokens' => $tokens === null ? null : ['input' => ((array) $tokens)['input'], 'output' => ((array) $tokens)['output']],
            'ok' => $e['ok'],
            'input' => $e['input'],
            'output' => $e['output'],
        ];
    }
}
