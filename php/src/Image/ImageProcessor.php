<?php

declare(strict_types=1);

namespace NestFlyers\Image;

/**
 * Turns an accepted upload into the stored photo, the way the Node server's
 * sharp pipeline does: EXIF orientation applied, long edge ≤ $maxEdge (never
 * enlarged, short edge rounded half up — tests/fixtures/fit-long-edge.json),
 * metadata stripped, PNG when the image has an alpha channel, else JPEG at
 * $jpegQuality. ImageProcessorContractTestCase holds every implementation to it.
 */
interface ImageProcessor
{
    /** 'gd' | 'imagick', for /api/config diagnostics. */
    public function name(): string;

    /** Returns null when the bytes can't be decoded (the caller answers 415 unreadable). */
    public function process(string $bytes, ImageInfo $info, int $maxEdge, int $jpegQuality): ?StoredImage;

    /**
     * An upper estimate of the PHP memory (what memory_limit counts) that
     * process() needs for this image at its peak, on top of what the caller
     * already holds (the upload's bytes). PhotoService compares it with the free
     * memory_limit before decoding, so a huge photo gets a clear 413 instead of a
     * fatal "Allowed memory size exhausted". Only the processor knows its own
     * allocations: GD's pixels count against memory_limit, ImageMagick's don't.
     */
    public function peakMemoryBytes(ImageInfo $info, int $maxEdge): int;
}
