<?php

declare(strict_types=1);

namespace NestFlyers\Storage\Json;

use NestFlyers\Domain\Clock;
use NestFlyers\Domain\Lock;
use NestFlyers\Domain\PhotoRepository;
use stdClass;

/** Photo records in photos.json ($defs.photos); the image files themselves live in the uploads folder. */
final class JsonPhotoRepository implements PhotoRepository
{
    public function __construct(
        private readonly RecordFile $file,
        private readonly Lock $lock,
        private readonly Clock $clock,
    ) {
    }

    public function insert(string $path, int $width, int $height): array
    {
        return $this->lock->exclusive(function () use ($path, $width, $height): array {
            $photos = $this->all();
            $photo = self::record((object) [
                'id' => $this->file->newId($photos),
                'path' => $path,
                'width' => $width,
                'height' => $height,
                'createdAt' => $this->clock->now(),
            ]);
            $photos[] = $photo;
            $this->file->write($photos);
            return $photo;
        });
    }

    public function get(int $id): ?array
    {
        return $this->lock->shared(function () use ($id): ?array {
            foreach ($this->all() as $photo) {
                if ($photo['id'] === $id) {
                    return $photo;
                }
            }
            return null;
        });
    }

    /** @return list<array{id:int, path:string, width:int, height:int, createdAt:string}> */
    private function all(): array
    {
        return array_map(self::record(...), $this->file->read());
    }

    /**
     * The stored shape, in the schema's key order.
     * @return array{id:int, path:string, width:int, height:int, createdAt:string}
     */
    private static function record(stdClass $photo): array
    {
        return [
            'id' => $photo->id,
            'path' => $photo->path,
            'width' => $photo->width,
            'height' => $photo->height,
            'createdAt' => $photo->createdAt,
        ];
    }
}
