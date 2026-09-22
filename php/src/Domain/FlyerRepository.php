<?php

declare(strict_types=1);

namespace NestFlyers\Domain;

use stdClass;

/**
 * Flyers. Input (already validated and normalised by the HTTP layer) is
 * array{title:string, hostel:?string (slug), template:string, data:stdClass, photoId:?int}.
 * A record adds id, createdAt and updatedAt. `data` stays a stdClass tree end to
 * end, so empty objects ({}) survive. Drivers store exactly what they are given.
 */
interface FlyerRepository
{
    /**
     * null when missing or archived.
     * @return array{id:int, hostel:?string, template:string, title:string, data:stdClass, photoId:?int, createdAt:string, updatedAt:string}|null
     */
    public function get(int $id): ?array;

    /**
     * Not archived, newest first (updatedAt, then id, both descending), with the hostel's current name.
     * $hostel: a slug, 'none' for chain-wide, null or '' for all. $template: null or '' for all.
     * @return list<array{id:int, title:string, template:string, hostel:?string, hostelName:?string, updatedAt:string}>
     */
    public function list(?string $hostel, ?string $template): array;

    /**
     * createdAt = updatedAt = now. Throws MissingReference for an unknown hostel slug or photo id.
     * @param array{title:string, hostel:?string, template:string, data:stdClass, photoId:?int} $input
     */
    public function create(array $input): int;

    /**
     * false when missing or archived; keeps createdAt, bumps updatedAt.
     * @param array{title:string, hostel:?string, template:string, data:stdClass, photoId:?int} $input
     */
    public function update(int $id, array $input): bool;

    /** Soft delete: sets archived and bumps updatedAt. false when missing or already archived. */
    public function archive(int $id): bool;
}
