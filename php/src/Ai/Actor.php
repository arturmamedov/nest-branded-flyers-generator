<?php

declare(strict_types=1);

namespace NestFlyers\Ai;

/** Who is asking; the ledger and the quota are keyed by the id. */
final class Actor
{
    public function __construct(public readonly string $id)
    {
    }
}
