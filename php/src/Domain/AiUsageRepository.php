<?php

declare(strict_types=1);

namespace NestFlyers\Domain;

/**
 * The AI ledger ($defs.aiUsage, docs/json-storage.md "The AI ledger"): one append-only record per generation that
 * reached a provider. Each feature's daily limit is counted from a day's `ok` records for the actor, under that
 * feature's name; there is no other counter.
 * Node's twin also lists every record, for its copy tool; PHP has no copy tool, so it needs no more than these two.
 */
interface AiUsageRepository
{
    /**
     * @param array{at:string, day:string, actorId:string, feature:string, provider:string, model:string,
     *     tokens:array{input:int, output:int}|null, ok:bool, input:string, output:?string} $entry
     */
    public function record(array $entry): void;

    /**
     * The actor's generations that counted on this Canary Islands day (YYYY-MM-DD), under each feature's name. A
     * feature with none is absent: read it as 0. One read answers every feature, so api/config reads the ledger once
     * however many features run.
     *
     * @return array<string, int>
     */
    public function countOk(string $actorId, string $day): array;
}
