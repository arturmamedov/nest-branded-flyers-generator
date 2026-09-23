<?php

declare(strict_types=1);

namespace NestFlyers\Storage\Json;

use InvalidArgumentException;
use NestFlyers\Domain\IdGenerator;
use NestFlyers\Domain\JsonFiles;
use NestFlyers\Domain\Lock;
use NestFlyers\Domain\SeedState;
use NestFlyers\Http\ErrorCatalog;
use NestFlyers\Shared;
use RuntimeException;
use stdClass;

/**
 * The store's meta.json ($defs.meta in schema/storage.schema.json): the format
 * version and applied migrations that say which app versions may read the
 * folder, the id counters, and the applied seed file's hash.
 *
 * The Node JSON driver reads and writes the same folder format, so the
 * version checks are what keep an older build from mangling a newer store.
 */
final class JsonStore implements IdGenerator, SeedState
{
    /** meta.json's counters, in the schema's key order. */
    private const ENTITIES = ['hostel', 'doodle', 'photo', 'flyer'];

    /** The Shared::storageFiles() entries that hold record lists, created empty with a fresh store. */
    private const LIST_FILES = ['hostels', 'doodles', 'photos', 'flyerIndex'];

    private readonly string $metaFile;

    public function __construct(
        private readonly JsonFiles $files,
        private readonly Lock $lock,
        private readonly Shared $shared,
        private readonly ErrorCatalog $errors,
    ) {
        $this->metaFile = $shared->storageFiles()['meta'];
    }

    /**
     * Creates a fresh store on first use, or checks this build can read the existing one.
     * @throws \NestFlyers\Http\HttpError storage_too_new: a newer formatVersion or a migration this build doesn't know
     * @throws RuntimeException a damaged meta.json, or an older store this build has no migration for
     */
    public function open(): void
    {
        // Every request opens the store, so the common case takes only the shared lock.
        $meta = $this->lock->shared(fn (): mixed => $this->files->read($this->metaFile));
        // Missing (or a bare `null`, which the checks below refuse): look again under the exclusive lock, since
        // another request may have created the store in between.
        $meta ??= $this->lock->exclusive(
            fn (): mixed => $this->files->exists($this->metaFile) ? $this->files->read($this->metaFile) : $this->create(),
        );
        $this->refuseNewer($meta);
        $this->refuseOlder($this->validMeta($meta));
    }

    /** Hands out the counter's next value and saves it before returning, so an id is never handed out twice. */
    public function next(string $entity, int $atLeast = 0): int
    {
        if (!in_array($entity, self::ENTITIES, true)) {
            throw new InvalidArgumentException("No id counter for \"$entity\"");
        }
        // Re-entrant: repositories call this inside their own exclusive(); called alone, it is still safe.
        return $this->lock->exclusive(function () use ($entity, $atLeast): int {
            $meta = $this->meta();
            // One write, whatever the gap: a counter behind the records catches up at once.
            $id = max($meta->counters->{$entity}, $atLeast) + 1;
            $meta->counters->{$entity} = $id;
            $this->writeMeta($meta);
            return $id;
        });
    }

    public function seedHash(): ?string
    {
        return $this->lock->shared(fn (): ?string => $this->meta()->seedHash);
    }

    public function recordSeedHash(string $hash): void
    {
        $this->lock->exclusive(function () use ($hash): void {
            $meta = $this->meta();
            $meta->seedHash = $hash;
            $this->writeMeta($meta);
        });
    }

    /** Record files first and meta.json last: a store with a meta.json is complete. */
    private function create(): mixed
    {
        $names = $this->shared->storageFiles();
        foreach (self::LIST_FILES as $key) {
            if (!$this->files->exists($names[$key])) {
                $this->files->write($names[$key], []);
            }
        }
        // A fresh store is already in the latest shape, so every migration this build knows counts as applied.
        $this->writeMeta((object) [
            'formatVersion' => $this->shared->storageFormatVersion(),
            'migrations' => $this->shared->storageMigrations(),
            'counters' => (object) array_fill_keys(self::ENTITIES, 0),
            'seedHash' => null,
        ]);
        return $this->files->read($this->metaFile);
    }

    /** Checked before the shape: a newer format may have changed it, and the answer should still be "update the app". */
    private function refuseNewer(mixed $meta): void
    {
        if (!$meta instanceof stdClass) {
            return;
        }
        if (is_int($meta->formatVersion ?? null) && $meta->formatVersion > $this->shared->storageFormatVersion()) {
            throw $this->errors->make('storage_too_new');
        }
        $known = $this->shared->storageMigrations();
        foreach (is_array($meta->migrations ?? null) ? $meta->migrations : [] as $migration) {
            if (!in_array($migration, $known, true)) {
                throw $this->errors->make('storage_too_new');
            }
        }
    }

    /**
     * An older store needs its migrations applied before use. None exist yet (Shared::storageMigrations() is
     * empty); when one is added to src/shared/storage.ts, PHP must implement it, and until then this refuses the
     * store loudly rather than serve data in a shape the code no longer expects.
     */
    private function refuseOlder(stdClass $meta): void
    {
        $pending = array_values(array_diff($this->shared->storageMigrations(), $meta->migrations));
        if ($meta->formatVersion < $this->shared->storageFormatVersion() || $pending !== []) {
            throw new RuntimeException(sprintf(
                '%s is format %d with migrations [%s]; this build needs format %d and has no PHP implementation for [%s].',
                $this->metaFile,
                $meta->formatVersion,
                implode(', ', $meta->migrations),
                $this->shared->storageFormatVersion(),
                implode(', ', $pending),
            ));
        }
    }

    private function meta(): stdClass
    {
        return $this->validMeta($this->files->read($this->metaFile));
    }

    /** The shape $defs.meta promises, checked so a hand-edited file fails with its name rather than a TypeError. */
    private function validMeta(mixed $meta): stdClass
    {
        $problem = match (true) {
            !$meta instanceof stdClass => 'missing, or not a JSON object',
            !is_int($meta->formatVersion ?? null) || $meta->formatVersion < 1 => 'formatVersion must be a positive integer',
            !is_array($meta->migrations ?? null) || array_filter($meta->migrations, 'is_string') !== $meta->migrations
                => 'migrations must be a list of ids',
            !($meta->counters ?? null) instanceof stdClass => 'counters must be an object',
            !property_exists($meta, 'seedHash') || !(is_string($meta->seedHash) || $meta->seedHash === null)
                => 'seedHash must be a string or null',
            default => $this->counterProblem($meta->counters),
        };
        if ($problem !== null) {
            throw new RuntimeException("{$this->metaFile} is damaged: $problem.");
        }
        return $meta;
    }

    private function counterProblem(stdClass $counters): ?string
    {
        foreach (self::ENTITIES as $entity) {
            $counter = $counters->{$entity} ?? null;
            if (!is_int($counter) || $counter < 0) {
                return "counters.$entity must be a non-negative integer";
            }
        }
        return null;
    }

    /** Rebuilt in the schema's key order, so the file is the same whichever driver last wrote it. */
    private function writeMeta(stdClass $meta): void
    {
        $counters = [];
        foreach (self::ENTITIES as $entity) {
            $counters[$entity] = $meta->counters->{$entity};
        }
        $this->files->write($this->metaFile, [
            'formatVersion' => $meta->formatVersion,
            'migrations' => array_values($meta->migrations),
            'counters' => $counters,
            'seedHash' => $meta->seedHash,
        ]);
    }
}
