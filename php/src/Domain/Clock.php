<?php

declare(strict_types=1);

namespace NestFlyers\Domain;

/** The time storage stamps records with. */
interface Clock
{
    /** UTC, milliseconds, Z — exactly JavaScript's toISOString(), e.g. 2026-09-18T12:31:27.522Z. */
    public function now(): string;
}
