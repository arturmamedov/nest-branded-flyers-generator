<?php

declare(strict_types=1);

namespace NestFlyers\Domain;

/**
 * Hostels, keyed by slug. A hostel is
 * array{id:int, slug:string, name:string, island:string, logoPath:?string, sortOrder:int|float}.
 */
interface HostelRepository
{
    /**
     * By sortOrder, then name in code-point order (strcmp), then id.
     * @return list<array{id:int, slug:string, name:string, island:string, logoPath:?string, sortOrder:int|float}>
     */
    public function list(): array;

    /** @return array{id:int, slug:string, name:string, island:string, logoPath:?string, sortOrder:int|float}|null */
    public function bySlug(string $slug): ?array;

    /**
     * By slug: keeps the id and updates name, island, logoPath and sortOrder; never deletes.
     * @param array{slug:string, name:string, island:string, logoPath:?string, sortOrder:int|float} $hostel
     */
    public function upsert(array $hostel): void;
}
