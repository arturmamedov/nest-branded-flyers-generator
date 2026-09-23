<?php

declare(strict_types=1);

namespace NestFlyers\Storage\Json;

use NestFlyers\Domain\DoodleRepository;
use NestFlyers\Domain\Lock;
use stdClass;

/** Doodles in doodles.json ($defs.doodles). */
final class JsonDoodleRepository implements DoodleRepository
{
    public function __construct(
        private readonly RecordFile $file,
        private readonly Lock $lock,
    ) {
    }

    public function list(): array
    {
        $doodles = $this->lock->shared(fn (): array => $this->all());
        // Built-ins first; strings by code point (strcmp), as every driver orders them.
        usort($doodles, static fn (array $a, array $b): int => $b['builtin'] <=> $a['builtin']
            ?: strcmp($a['kind'], $b['kind'])
            ?: strcmp($a['label'], $b['label'])
            ?: $a['id'] <=> $b['id']);
        return $doodles;
    }

    public function upsert(array $doodle): void
    {
        $this->lock->exclusive(function () use ($doodle): void {
            $doodles = $this->all();
            $existing = null;
            foreach ($doodles as $d) {
                if ($d['slug'] === $doodle['slug']) {
                    $existing = $d;
                    break;
                }
            }
            if ($existing !== null) {
                // builtin is fixed when the doodle is first stored: re-seeding never turns a staff upload into a
                // built-in, or a built-in back into an upload.
                $updated = self::record($existing['id'], ['builtin' => $existing['builtin']] + $doodle);
                $doodles = array_map(static fn (array $d): array => $d['id'] === $existing['id'] ? $updated : $d, $doodles);
            } else {
                $doodles[] = self::record($this->file->newId($doodles), $doodle);
            }
            $this->file->write($doodles);
        });
    }

    /** @return list<array{id:int, slug:string, label:string, path:string, kind:string, builtin:bool}> */
    private function all(): array
    {
        return array_map(static fn (stdClass $d): array => self::record($d->id, (array) $d), $this->file->read());
    }

    /**
     * The stored shape, in the schema's key order.
     * @param array{slug:string, label:string, path:string, kind:string, builtin:bool} $fields
     * @return array{id:int, slug:string, label:string, path:string, kind:string, builtin:bool}
     */
    private static function record(int $id, array $fields): array
    {
        return [
            'id' => $id,
            'slug' => $fields['slug'],
            'label' => $fields['label'],
            'path' => $fields['path'],
            'kind' => $fields['kind'],
            'builtin' => $fields['builtin'],
        ];
    }
}
