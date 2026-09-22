<?php

declare(strict_types=1);

namespace NestFlyers\Domain;

/**
 * Doodles (hand-drawn art), keyed by slug. A doodle is
 * array{id:int, slug:string, label:string, path:string, kind:string, builtin:bool}.
 */
interface DoodleRepository
{
    /**
     * Built-ins first, then kind, then label (code-point order), then id.
     * @return list<array{id:int, slug:string, label:string, path:string, kind:string, builtin:bool}>
     */
    public function list(): array;

    /**
     * By slug: keeps the id, updates label, path and kind, never flips builtin.
     * @param array{slug:string, label:string, path:string, kind:string, builtin:bool} $doodle
     */
    public function upsert(array $doodle): void;
}
