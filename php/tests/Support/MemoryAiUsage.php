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

    public function countOk(string $actorId, string $day): array
    {
        $counts = [];
        foreach ($this->records as $r) {
            if ($r['ok'] && $r['actorId'] === $actorId && $r['day'] === $day) {
                $counts[$r['feature']] = ($counts[$r['feature']] ?? 0) + 1;
            }
        }
        return $counts;
    }
}
