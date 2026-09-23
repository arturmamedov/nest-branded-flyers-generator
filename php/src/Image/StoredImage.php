<?php

declare(strict_types=1);

namespace NestFlyers\Image;

/** A normalised photo, ready to write: rotated upright, long edge capped, metadata stripped. */
final class StoredImage
{
    public function __construct(
        public readonly string $bytes,
        /** 'jpg' | 'png' */
        public readonly string $extension,
        public readonly int $width,
        public readonly int $height,
    ) {
    }
}
