<?php

declare(strict_types=1);

namespace NestFlyers\Storage\Json;

use NestFlyers\Domain\HostelRepository;
use NestFlyers\Domain\Lock;
use stdClass;

/** Hostels in hostels.json ($defs.hostels). */
final class JsonHostelRepository implements HostelRepository
{
    public function __construct(
        private readonly RecordFile $file,
        private readonly Lock $lock,
    ) {
    }

    public function list(): array
    {
        $hostels = $this->lock->shared(fn (): array => $this->all());
        // strcmp compares UTF-8 bytes, which orders by code point: the same order as SQLite's BINARY collation and
        // JavaScript's <, so every driver lists the same way.
        usort($hostels, static fn (array $a, array $b): int => $a['sortOrder'] <=> $b['sortOrder']
            ?: strcmp($a['name'], $b['name'])
            ?: $a['id'] <=> $b['id']);
        return $hostels;
    }

    public function bySlug(string $slug): ?array
    {
        return $this->lock->shared(fn (): ?array => self::find($this->all(), $slug));
    }

    public function upsert(array $hostel): void
    {
        $this->lock->exclusive(function () use ($hostel): void {
            $hostels = $this->all();
            $existing = self::find($hostels, $hostel['slug']);
            if ($existing !== null) {
                // The slug is the stable key flyers are tagged by; the id never changes once handed out.
                $hostels = array_map(
                    static fn (array $h): array => $h['id'] === $existing['id'] ? self::record($existing['id'], $hostel) : $h,
                    $hostels,
                );
            } else {
                $hostels[] = self::record($this->file->newId($hostels), $hostel);
            }
            $this->file->write($hostels);
        });
    }

    /** @return list<array{id:int, slug:string, name:string, island:string, logoPath:?string, sortOrder:int|float}> */
    private function all(): array
    {
        return array_map(static fn (stdClass $h): array => self::record($h->id, (array) $h), $this->file->read());
    }

    /**
     * @param list<array{id:int, slug:string, name:string, island:string, logoPath:?string, sortOrder:int|float}> $hostels
     * @return array{id:int, slug:string, name:string, island:string, logoPath:?string, sortOrder:int|float}|null
     */
    private static function find(array $hostels, string $slug): ?array
    {
        foreach ($hostels as $hostel) {
            if ($hostel['slug'] === $slug) {
                return $hostel;
            }
        }
        return null;
    }

    /**
     * The stored shape, in the schema's key order.
     * @param array{slug:string, name:string, island:string, logoPath:?string, sortOrder:int|float} $fields
     * @return array{id:int, slug:string, name:string, island:string, logoPath:?string, sortOrder:int|float}
     */
    private static function record(int $id, array $fields): array
    {
        return [
            'id' => $id,
            'slug' => $fields['slug'],
            'name' => $fields['name'],
            'island' => $fields['island'],
            'logoPath' => $fields['logoPath'],
            'sortOrder' => $fields['sortOrder'],
        ];
    }
}
