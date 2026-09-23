<?php

declare(strict_types=1);

namespace NestFlyers\Domain;

/**
 * Stored photos. A photo is array{id:int, path:string, width:int, height:int, createdAt:string};
 * path is "uploads/YYYY/MM/<16 hex>.jpg|png", relative to the uploads folder's parent.
 */
interface PhotoRepository
{
    /** @return array{id:int, path:string, width:int, height:int, createdAt:string} */
    public function insert(string $path, int $width, int $height): array;

    /** @return array{id:int, path:string, width:int, height:int, createdAt:string}|null */
    public function get(int $id): ?array;
}
