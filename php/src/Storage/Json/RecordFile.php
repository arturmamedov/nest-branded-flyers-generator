<?php

declare(strict_types=1);

namespace NestFlyers\Storage\Json;

use NestFlyers\Domain\IdGenerator;
use NestFlyers\Domain\JsonFiles;
use RuntimeException;
use stdClass;

/**
 * One of the store's list files (hostels.json, doodles.json, photos.json,
 * flyers/index.json): a JSON array of records with integer ids, plus the id
 * counter those records draw from. Doesn't lock; the repository holds the Lock.
 */
final class RecordFile
{
    /**
     * @param string $path relative to the store, from Shared::storageFiles()
     * @param string $entity the meta.json counter this file's ids come from ("hostel", "doodle", "photo", "flyer")
     */
    public function __construct(
        private readonly JsonFiles $files,
        private readonly string $path,
        private readonly IdGenerator $ids,
        private readonly string $entity,
    ) {
    }

    /**
     * The records as stored, in file order (which readers must not rely on). A missing file is an empty list:
     * the store creates every file on first use, so this only happens after someone deletes one by hand.
     * @return list<stdClass>
     */
    public function read(): array
    {
        $records = $this->files->read($this->path) ?? [];
        if (!is_array($records)) {
            throw new RuntimeException("{$this->path} is damaged: expected a JSON array of records.");
        }
        foreach ($records as $record) {
            if (!$record instanceof stdClass || !is_int($record->id ?? null)) {
                throw new RuntimeException("{$this->path} is damaged: every record needs an integer id.");
            }
        }
        return $records;
    }

    /**
     * Replaces the file. Records go out by id so the file reads (and diffs) the same whoever wrote it last.
     * @param list<array<string, mixed>> $records each already in the schema's key order, with an int 'id'
     */
    public function write(array $records): void
    {
        usort($records, static fn (array $a, array $b): int => $a['id'] <=> $b['id']);
        $this->files->write($this->path, $records);
    }

    /**
     * A new id from the counter. The counter alone never reuses an id; skipping ids already present protects the
     * records when meta.json has been restored from an older backup than the data (a flyer's own file would be
     * overwritten otherwise, hence $taken).
     * @param list<stdClass|array<string, mixed>> $records the file's current records
     * @param (callable(int): bool)|null $taken an extra "is this id in use?" check
     */
    public function newId(array $records, ?callable $taken = null): int
    {
        $used = [];
        foreach ($records as $record) {
            $used[is_array($record) ? $record['id'] : $record->id] = true;
        }
        // The highest id in the file raises the counter in a single write, so a
        // counter left far behind never costs one meta.json rewrite per id
        // while the store-wide write lock is held.
        $id = $this->ids->next($this->entity, $used === [] ? 0 : (int) max(array_keys($used)));
        while ($taken !== null && $taken($id)) {
            $id = $this->ids->next($this->entity);
        }
        return $id;
    }
}
