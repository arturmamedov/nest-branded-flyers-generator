<?php

declare(strict_types=1);

namespace NestFlyers\Storage\Json;

use Closure;
use NestFlyers\Domain\Clock;
use NestFlyers\Domain\FlyerRepository;
use NestFlyers\Domain\HostelRepository;
use NestFlyers\Domain\JsonFiles;
use NestFlyers\Domain\Lock;
use NestFlyers\Domain\MissingReference;
use NestFlyers\Domain\PhotoRepository;
use stdClass;

/**
 * Flyers: one file per flyer (<flyerDir>/<id>.json, $defs.flyer) plus
 * flyers/index.json ($defs.flyerIndex), which the library lists from without
 * opening every flyer. The flyer's file is the truth; the index is written
 * after it, so a crash in between leaves the index one save behind (a stale or
 * missing list entry, put right by the flyer's next save), never an entry
 * pointing at a flyer that isn't there.
 */
final class JsonFlyerRepository implements FlyerRepository
{
    /** @var Closure(stdClass): stdClass */
    private readonly Closure $normalizeData;

    /**
     * @param callable(stdClass): stdClass $normalizeData applied to `data` on every read, as Node's
     *        FlyerDataSchema.parse is: a flyer saved by an older build gains today's defaults and loses dropped keys
     * @param string $flyerDir the folder of the flyer files, relative to the store (Shared::storageFiles()['flyerDir'])
     */
    public function __construct(
        private readonly JsonFiles $files,
        private readonly RecordFile $index,
        private readonly Lock $lock,
        private readonly Clock $clock,
        private readonly HostelRepository $hostels,
        private readonly PhotoRepository $photos,
        callable $normalizeData,
        private readonly string $flyerDir,
    ) {
        $this->normalizeData = Closure::fromCallable($normalizeData);
    }

    public function get(int $id): ?array
    {
        $flyer = $this->lock->shared(fn (): ?stdClass => $this->current($id));
        if ($flyer === null) {
            return null;
        }
        return [
            'id' => $flyer->id,
            'hostel' => $flyer->hostel,
            'template' => $flyer->template,
            'title' => $flyer->title,
            'data' => ($this->normalizeData)($flyer->data),
            'photoId' => $flyer->photoId,
            'createdAt' => $flyer->createdAt,
            'updatedAt' => $flyer->updatedAt,
        ];
    }

    public function list(?string $hostel, ?string $template): array
    {
        [$entries, $hostelNames] = $this->lock->shared(fn (): array => [$this->index->read(), $this->hostelNames()]);
        $items = [];
        foreach ($entries as $entry) {
            if ($entry->archived || !self::matches($entry, $hostel, $template)) {
                continue;
            }
            $items[] = [
                'id' => $entry->id,
                'title' => $entry->title,
                'template' => $entry->template,
                'hostel' => $entry->hostel,
                // Joined now, never stored in the index: renaming a hostel shows up in the library at once.
                'hostelName' => $entry->hostel === null ? null : ($hostelNames[$entry->hostel] ?? null),
                'updatedAt' => $entry->updatedAt,
            ];
        }
        // Timestamps are fixed-width UTC, so strcmp orders them by time.
        usort($items, static fn (array $a, array $b): int => strcmp($b['updatedAt'], $a['updatedAt']) ?: $b['id'] <=> $a['id']);
        return $items;
    }

    public function create(array $input): int
    {
        return $this->lock->exclusive(function () use ($input): int {
            $this->checkReferences($input);
            $entries = $this->index->read();
            $id = $this->index->newId($entries, fn (int $id): bool => $this->files->exists($this->path($id)));
            $now = $this->clock->now();
            $this->save(self::stored($id, $input, $now, $now, false), $entries);
            return $id;
        });
    }

    public function update(int $id, array $input): bool
    {
        return $this->lock->exclusive(function () use ($id, $input): bool {
            // References first, as the SQLite driver does: a bad slug throws even when the flyer is missing.
            $this->checkReferences($input);
            $current = $this->current($id);
            if ($current === null) {
                $this->repairIndex($id);
                return false;
            }
            $this->save(self::stored($id, $input, $current->createdAt, $this->clock->now(), false), $this->index->read());
            return true;
        });
    }

    public function archive(int $id): bool
    {
        return $this->lock->exclusive(function () use ($id): bool {
            $current = $this->current($id);
            if ($current === null) {
                $this->repairIndex($id);
                return false;
            }
            // Soft delete: everything stays on disk as stored (data not re-normalised), only hidden.
            $this->save(
                self::stored($id, (array) $current, $current->createdAt, $this->clock->now(), true),
                $this->index->read(),
            );
            return true;
        });
    }

    /**
     * Puts one index row back in step with the flyer's own file. The file is
     * written first and the index second, so a crash (or a disk that fills up)
     * in between can leave a row saying "not archived" for a flyer that is.
     * The flyer itself can never repair that afterwards — it is archived, so
     * update() and archive() both refuse it — hence this runs exactly there,
     * inside the same exclusive lock, and the next write of either kind clears
     * the ghost from the library. Costs nothing when the row is already right.
     */
    private function repairIndex(int $id): void
    {
        $stored = $this->files->read($this->path($id));
        $index = [];
        $changed = false;
        foreach ($this->index->read() as $entry) {
            if ($entry->id !== $id) {
                $index[] = self::entry((array) $entry);
                continue;
            }
            if (!$stored instanceof stdClass) {
                $changed = true; // no flyer file at all: the row goes
                continue;
            }
            // Both rebuilt the same way: an array against a stdClass is never
            // equal in PHP, which would rewrite the index on every call.
            $fixed = self::entry((array) $stored);
            $changed = $changed || $fixed !== self::entry((array) $entry);
            $index[] = $fixed;
        }
        if ($changed) {
            $this->index->write($index);
        }
    }

    /** The stored flyer, or null when it is missing or archived. */
    private function current(int $id): ?stdClass
    {
        if ($id < 1) {
            return null;
        }
        $flyer = $this->files->read($this->path($id));
        return $flyer instanceof stdClass && $flyer->archived === false ? $flyer : null;
    }

    private function path(int $id): string
    {
        return "{$this->flyerDir}/$id.json";
    }

    /**
     * The flyer's own file first, then its index entry (see the class comment).
     * @param array{id:int, hostel:?string, template:string, title:string, data:stdClass, photoId:?int, createdAt:string, updatedAt:string, archived:bool} $flyer
     * @param list<stdClass> $entries the index as read under the same exclusive lock
     */
    private function save(array $flyer, array $entries): void
    {
        $this->files->write($this->path($flyer['id']), $flyer);
        $index = [];
        foreach ($entries as $entry) {
            if ($entry->id !== $flyer['id']) {
                $index[] = self::entry((array) $entry);
            }
        }
        $index[] = self::entry($flyer);
        $this->index->write($index);
    }

    /** @param array{title:string, hostel:?string, template:string, data:stdClass, photoId:?int} $input */
    private function checkReferences(array $input): void
    {
        if ($input['hostel'] !== null && $this->hostels->bySlug($input['hostel']) === null) {
            throw new MissingReference("Unknown hostel {$input['hostel']}");
        }
        if ($input['photoId'] !== null && $this->photos->get($input['photoId']) === null) {
            throw new MissingReference("Unknown photo {$input['photoId']}");
        }
    }

    /** @return array<string, string> hostel name by slug */
    private function hostelNames(): array
    {
        return array_column($this->hostels->list(), 'name', 'slug');
    }

    private static function matches(stdClass $entry, ?string $hostel, ?string $template): bool
    {
        $hostelOk = match ($hostel) {
            null, '' => true,
            'none' => $entry->hostel === null, // chain-wide flyers
            default => $entry->hostel === $hostel,
        };
        return $hostelOk && ($template === null || $template === '' || $entry->template === $template);
    }

    /**
     * A flyer file's record, in the schema's key order.
     * @param array{title:string, hostel:?string, template:string, data:stdClass, photoId:?int} $input
     * @return array{id:int, hostel:?string, template:string, title:string, data:stdClass, photoId:?int, createdAt:string, updatedAt:string, archived:bool}
     */
    private static function stored(int $id, array $input, string $createdAt, string $updatedAt, bool $archived): array
    {
        return [
            'id' => $id,
            'hostel' => $input['hostel'],
            'template' => $input['template'],
            'title' => $input['title'],
            'data' => $input['data'],
            'photoId' => $input['photoId'],
            'createdAt' => $createdAt,
            'updatedAt' => $updatedAt,
            'archived' => $archived,
        ];
    }

    /**
     * An index entry, in the schema's key order.
     * @param array<string, mixed> $flyer a stored flyer or an existing entry
     * @return array{id:int, title:string, template:string, hostel:?string, updatedAt:string, archived:bool}
     */
    private static function entry(array $flyer): array
    {
        return [
            'id' => $flyer['id'],
            'title' => $flyer['title'],
            'template' => $flyer['template'],
            'hostel' => $flyer['hostel'],
            'updatedAt' => $flyer['updatedAt'],
            'archived' => $flyer['archived'],
        ];
    }
}
