<?php

declare(strict_types=1);

namespace NestFlyers\Image;

use NestFlyers\Http\ErrorCatalog;
use NestFlyers\Http\HttpError;
use NestFlyers\Shared;

/**
 * Decides from an upload's bytes alone (never its name or Content-Type) whether
 * we keep it, and reads what the processors and the memory guard need before
 * anything is decoded. The answers mirror the Node server's sharp metadata:
 * HEIC first (the friendly iPhone message), then the format sharp would name,
 * then its hasAlpha and orientation.
 */
final class ImageSniffer
{
    private const PNG_SIGNATURE = "\x89PNG\r\n\x1a\n";

    /** Where libvips looks for an SVG root element. */
    private const SVG_WINDOW = 1024;

    public function __construct(
        private readonly Shared $shared,
        private readonly ErrorCatalog $errors,
    ) {
    }

    /**
     * @throws HttpError heic, unsupported_format ({format}: GIF, TIFF, SVG, HEIF) or unreadable
     */
    public function sniff(string $bytes): ImageInfo
    {
        if ($this->isHeic($bytes)) {
            throw $this->errors->make('heic');
        }
        $format = self::format($bytes);
        if ($format === null) {
            throw $this->errors->make('unreadable');
        }
        // The kept formats come from the shared list; sharp names them by their MIME subtype, as we do.
        if (!in_array("image/$format", $this->shared->acceptedPhotoTypes(), true)) {
            throw $this->errors->make('unsupported_format', ['format' => strtoupper($format)]);
        }

        // getimagesize reads only the header; the processor decodes later, after the memory guard.
        $size = @getimagesizefromstring($bytes);
        if ($size === false || $size[0] < 1 || $size[1] < 1) {
            throw $this->errors->make('unreadable');
        }
        return new ImageInfo(
            $format,
            $size[0],
            $size[1],
            match ($format) {
                'png' => self::pngHasAlpha($bytes),
                'webp' => self::webpHasAlpha($bytes),
                default => false,
            },
            $format === 'jpeg' ? ExifOrientation::fromJpeg($bytes) : 1,
        );
    }

    /** An ISO-BMFF file with an iPhone (HEIC/HEIF image) brand: isHeic() in src/shared/limits.ts. */
    private function isHeic(string $bytes): bool
    {
        $heic = $this->shared->heic();
        return strlen($bytes) >= $heic['minBytes']
            && substr($bytes, $heic['ftypOffset'], 4) === 'ftyp'
            && in_array(substr($bytes, $heic['brandOffset'], 4), $heic['brands'], true);
    }

    /** sharp's name for the format, or null when the bytes are no image at all. */
    private static function format(string $bytes): ?string
    {
        if (str_starts_with($bytes, "\xFF\xD8\xFF")) {
            return 'jpeg';
        }
        if (str_starts_with($bytes, self::PNG_SIGNATURE)) {
            return 'png';
        }
        if (strlen($bytes) >= 12 && str_starts_with($bytes, 'RIFF') && substr($bytes, 8, 4) === 'WEBP') {
            return 'webp';
        }
        if (str_starts_with($bytes, 'GIF87a') || str_starts_with($bytes, 'GIF89a')) {
            return 'gif';
        }
        if (str_starts_with($bytes, "II*\0") || str_starts_with($bytes, "MM\0*")) {
            return 'tiff';
        }
        // Any other ISO-BMFF image (AVIF, other HEIF brands): libvips reads them all as "heif".
        if (strlen($bytes) >= 12 && substr($bytes, 4, 4) === 'ftyp') {
            return 'heif';
        }
        return self::isSvg($bytes) ? 'svg' : null;
    }

    /** Markup that opens with a tag and has an <svg> root near the top (after an XML prolog, comments or a BOM). */
    private static function isSvg(string $bytes): bool
    {
        $head = substr($bytes, 0, self::SVG_WINDOW);
        if (str_starts_with($head, "\xEF\xBB\xBF")) {
            $head = substr($head, 3);
        }
        $head = ltrim($head, " \t\r\n\f\v");
        return str_starts_with($head, '<') && stripos($head, '<svg') !== false;
    }

    /**
     * sharp (libspng) gives a PNG an alpha channel for colour types 4 and 6 (grey
     * or RGB with alpha, even when every pixel is opaque) and for a tRNS chunk,
     * which the PNG spec puts before the first IDAT.
     */
    private static function pngHasAlpha(string $bytes): bool
    {
        $length = strlen($bytes);
        // Signature (8), IHDR length and type (8), width and height (8), bit depth (1): colour type is byte 25.
        if ($length < 26 || substr($bytes, 12, 4) !== 'IHDR') {
            return false;
        }
        $colourType = ord($bytes[25]);
        if ($colourType === 4 || $colourType === 6) {
            return true;
        }
        $pos = strlen(self::PNG_SIGNATURE);
        while ($pos + 8 <= $length) {
            $type = substr($bytes, $pos + 4, 4);
            if ($type === 'tRNS') {
                return true;
            }
            if ($type === 'IDAT' || $type === 'IEND') {
                return false;
            }
            // Chunk = length (4) + type (4) + data + CRC (4).
            $pos += 12 + unpack('N', $bytes, $pos)[1];
        }
        return false;
    }

    /**
     * libwebp's has_alpha, which sharp reports: the VP8X alpha flag (bit 4 of the
     * flags byte), or the VP8L header's alpha_is_used bit (bit 28 of the
     * little-endian word after the 0x2f signature). Plain lossy VP8 never has one.
     */
    private static function webpHasAlpha(string $bytes): bool
    {
        return match (substr($bytes, 12, 4)) {
            'VP8X' => strlen($bytes) > 20 && (ord($bytes[20]) & 0x10) !== 0,
            'VP8L' => strlen($bytes) >= 25 && ((unpack('V', $bytes, 21)[1] >> 28) & 1) === 1,
            default => false,
        };
    }
}
