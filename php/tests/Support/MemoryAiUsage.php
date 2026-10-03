<?php

declare(strict_types=1);

namespace NestFlyers\Tests\Support;

use NestFlyers\Domain\AiUsageRepository;

/** The AI ledger in memory, for tests of what sits above it (the driver is proved by RepositoryContractTestCase). */
final class MemoryAiUsage implements AiUsageRepository
{
    /** @var list<array<string, mixed>> */
    public array $records = [];

    public function record(array $entry): void
    {
        $this->records[] = $entry;
    }

    public function countOk(string $actorId, string $day): int
    {
        return count(array_filter($this->records, static fn (array $r): bool => $r['ok'] && $r['actorId'] === $actorId && $r['day'] === $day));
    }
}
