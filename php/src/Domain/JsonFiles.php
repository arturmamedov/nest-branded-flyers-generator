<?php

declare(strict_types=1);

namespace NestFlyers\Domain;

/**
 * JSON documents under one folder, by relative path ("flyers/7.json"). Reads
 * decode to stdClass/array trees (never associative arrays, so {} survives a
 * round trip). Writes are atomic. Neither locks: the caller holds the Lock.
 */
interface JsonFiles
{
    /** The decoded document, or null when the file does not exist. */
    public function read(string $relativePath): mixed;

    /** Encodes first (throwing on failure, so nothing is half-written), then replaces the file atomically. */
    public function write(string $relativePath, mixed $value): void;

    public function exists(string $relativePath): bool;
}
