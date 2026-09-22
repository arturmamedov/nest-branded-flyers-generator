<?php

declare(strict_types=1);

namespace NestFlyers\Image;

/**
 * Reads the EXIF orientation (tag 0x0112 in IFD0) from a JPEG's APP1 "Exif"
 * segment, in pure PHP. The exif extension is optional on shared hosts, and
 * exif_read_data warns on the malformed blocks phones and editors do write, so
 * this parser checks every offset against the data and gives up quietly: any
 * absent, malformed or out-of-range value means 1 (as shot), and it never warns.
 */
final class ExifOrientation
{
    private const TAG_ORIENTATION = 0x0112;
    private const TYPE_SHORT = 3;
    private const TYPE_LONG = 4;
    private const EXIF_HEADER = "Exif\0\0";

    /** Orientation 1–8 of a JPEG; 1 when the bytes carry none we can trust. */
    public static function fromJpeg(string $bytes): int
    {
        $length = strlen($bytes);
        if ($length < 4 || $bytes[0] !== "\xFF" || $bytes[1] !== "\xD8") {
            return 1;
        }
        $pos = 2;
        while ($pos + 4 <= $length) {
            if ($bytes[$pos] !== "\xFF") {
                return 1; // lost the marker chain: the file is damaged, so trust nothing in it
            }
            $marker = ord($bytes[$pos + 1]);
            if ($marker === 0xFF) {
                $pos++; // fill byte before the real marker
                continue;
            }
            if ($marker === 0xD8 || $marker === 0x01 || ($marker >= 0xD0 && $marker <= 0xD7)) {
                $pos += 2; // SOI, TEM and RSTn stand alone, with no length
                continue;
            }
            if ($marker === 0xDA || $marker === 0xD9) {
                return 1; // metadata only ever comes before the image data (SOS) or the end (EOI)
            }
            $segmentLength = self::u16be($bytes, $pos + 2);
            if ($segmentLength < 2 || $pos + 2 + $segmentLength > $length) {
                return 1;
            }
            // The first Exif APP1 decides, as in libexif (which sharp uses). XMP also lives in APP1: skip it.
            if ($marker === 0xE1 && $segmentLength >= 2 + strlen(self::EXIF_HEADER)
                && substr($bytes, $pos + 4, strlen(self::EXIF_HEADER)) === self::EXIF_HEADER) {
                $start = $pos + 4 + strlen(self::EXIF_HEADER);
                return self::fromTiff(substr($bytes, $start, $pos + 2 + $segmentLength - $start));
            }
            $pos += 2 + $segmentLength;
        }
        return 1;
    }

    /** The orientation in a TIFF structure's first IFD (the body of an Exif segment). */
    private static function fromTiff(string $tiff): int
    {
        $length = strlen($tiff);
        if ($length < 8) {
            return 1;
        }
        $order = substr($tiff, 0, 2);
        if ($order === 'II') {
            [$u16, $u32] = ['v', 'V'];
        } elseif ($order === 'MM') {
            [$u16, $u32] = ['n', 'N'];
        } else {
            return 1;
        }
        if (self::read($u16, $tiff, 2) !== 42) {
            return 1;
        }
        $ifd = self::read($u32, $tiff, 4);
        if ($ifd < 8 || $ifd + 2 > $length) {
            return 1;
        }
        $count = self::read($u16, $tiff, $ifd);
        for ($i = 0; $i < $count; $i++) {
            $entry = $ifd + 2 + 12 * $i;
            if ($entry + 12 > $length) {
                return 1;
            }
            if (self::read($u16, $tiff, $entry) !== self::TAG_ORIENTATION) {
                continue;
            }
            // A SHORT sits left-justified in the 4-byte value field. Some writers use LONG; accept both.
            $value = match (self::read($u16, $tiff, $entry + 2)) {
                self::TYPE_SHORT => self::read($u16, $tiff, $entry + 8),
                self::TYPE_LONG => self::read($u32, $tiff, $entry + 8),
                default => 0,
            };
            return self::read($u32, $tiff, $entry + 4) >= 1 && $value >= 1 && $value <= 8 ? $value : 1;
        }
        return 1;
    }

    /** Callers have already checked that the bytes exist, so unpack can't warn. */
    private static function read(string $format, string $data, int $offset): int
    {
        return unpack($format, $data, $offset)[1];
    }

    private static function u16be(string $data, int $offset): int
    {
        return (ord($data[$offset]) << 8) | ord($data[$offset + 1]);
    }
}
