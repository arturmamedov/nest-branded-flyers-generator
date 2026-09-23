<?php

declare(strict_types=1);

namespace NestFlyers\Domain;

/** Which version of seed/hostels.json a store has applied (the JSON store keeps it in meta.json). */
interface SeedState
{
    public function seedHash(): ?string;

    public function recordSeedHash(string $hash): void;
}
