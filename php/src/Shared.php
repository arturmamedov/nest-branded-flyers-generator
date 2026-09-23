<?php

declare(strict_types=1);

namespace NestFlyers;

use RuntimeException;

/**
 * The facts PHP shares with the Node server and the editor, read from the
 * generated schema/shared.json (source of truth: src/shared/*.ts, `npm run gen`).
 * Never hand-copy one of these into PHP.
 */
final class Shared
{
    /** @param array<string, mixed> $data */
    private function __construct(private readonly array $data)
    {
    }

    public static function fromFile(string $path): self
    {
        $json = @file_get_contents($path);
        if ($json === false) {
            throw new RuntimeException("Missing $path — the release is incomplete.");
        }
        return new self(json_decode($json, true, 512, JSON_THROW_ON_ERROR));
    }

    public function maxUploadBytes(): int
    {
        return $this->data['limits']['maxUploadBytes'];
    }

    public function maxPhotoEdge(): int
    {
        return $this->data['limits']['maxPhotoEdge'];
    }

    public function photoJpegQuality(): int
    {
        return $this->data['limits']['photoJpegQuality'];
    }

    /** @return list<string> */
    public function acceptedPhotoTypes(): array
    {
        return $this->data['limits']['acceptedPhotoTypes'];
    }

    /** @return array{ftypOffset:int, brandOffset:int, minBytes:int, brands:list<string>} */
    public function heic(): array
    {
        return $this->data['heic'];
    }

    /** @return array<string, array{status:int, code:string, message:string, fields?:array<string,string>}> */
    public function errors(): array
    {
        return $this->data['errors'];
    }

    public function storageFormatVersion(): int
    {
        return $this->data['storage']['formatVersion'];
    }

    /** @return list<string> */
    public function storageMigrations(): array
    {
        return $this->data['storage']['migrations'];
    }

    public function uploadsDir(): string
    {
        return $this->data['storage']['uploadsDir'];
    }

    /** The stored photo path pattern, as a PCRE ready for preg_match. */
    public function photoPathPattern(): string
    {
        return '~' . $this->data['storage']['photoPath'] . '~';
    }

    /** @return array{meta:string, hostels:string, doodles:string, photos:string, flyerIndex:string, flyerDir:string, lock:string} */
    public function storageFiles(): array
    {
        return $this->data['storage']['files'];
    }
}
