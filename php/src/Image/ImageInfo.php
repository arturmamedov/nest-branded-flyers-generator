<?php

declare(strict_types=1);

namespace NestFlyers\Image;

/** What ImageSniffer read from an upload's bytes, before decoding it. */
final class ImageInfo
{
    public function __construct(
        /** 'jpeg' | 'png' | 'webp' */
        public readonly string $format,
        public readonly int $width,
        public readonly int $height,
        /** An alpha channel, as sharp's hasAlpha: PNG colour type 4/6 or tRNS, WebP VP8X/VP8L alpha. Opaque RGBA counts. */
        public readonly bool $hasAlpha,
        /** EXIF orientation 1–8 (1 when absent or unreadable). */
        public readonly int $orientation,
    ) {
    }
}
