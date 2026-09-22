<?php

declare(strict_types=1);

namespace NestFlyers\Image;

use Imagick;
use ImagickException;
use ImagickPixel;

/**
 * The ImageMagick processor, for hosts that have imagick and pick it in
 * config.php. Same contract as GD (ImageProcessorContractTestCase), with a
 * better resampling filter. ImageMagick allocates outside PHP's memory_limit,
 * so PhotoService's guard is only conservative here; the host's policy.xml
 * limits still apply and surface as exceptions (a 500).
 */
final class ImagickImageProcessor implements ImageProcessor
{
    /** zlib level for PNG output, as GD and sharp use. */
    private const PNG_LEVEL = '6';

    public function name(): string
    {
        return 'imagick';
    }

    /**
     * ImageMagick keeps its pixels in its own memory, outside memory_limit (its
     * policy.xml limits apply there instead). PHP only holds the encoded result:
     * at most 4 bytes a pixel for PNG, under 1 for JPEG at quality 88.
     */
    public function peakMemoryBytes(ImageInfo $info, int $maxEdge): int
    {
        $out = Geometry::storedSize($info, $maxEdge);
        return $out['width'] * $out['height'] * ($info->hasAlpha ? 4 : 1);
    }

    public function process(string $bytes, ImageInfo $info, int $maxEdge, int $jpegQuality): ?StoredImage
    {
        if ($bytes === '') {
            return null;
        }
        $image = new Imagick();
        try {
            // ImageSniffer has already pinned the magic bytes to JPEG, PNG or WebP, so ImageMagick's own detection
            // lands on the same coder and none of its script-like formats (MVG, MSL) can be reached.
            $image->readImageBlob($bytes);
        } catch (ImagickException) {
            return null;
        }
        if ($image->getNumberImages() > 1) {
            $image->setIteratorIndex(0); // an animated WebP: keep the first frame, as sharp does
            $first = $image->getImage();
            $image->clear();
            $image = $first;
        }

        self::orient($image, $info->orientation);
        // Everything that isn't pixels goes: Exif (with GPS), XMP, IPTC, ICC profiles and comments.
        $image->stripImage();
        if ($image->getImageColorspace() === Imagick::COLORSPACE_CMYK) {
            $image->transformImageColorspace(Imagick::COLORSPACE_SRGB);
        }

        $fit = Geometry::fitLongEdge($image->getImageWidth(), $image->getImageHeight(), $maxEdge);
        if ($fit['width'] !== $image->getImageWidth() || $fit['height'] !== $image->getImageHeight()) {
            $image->resizeImage($fit['width'], $fit['height'], Imagick::FILTER_LANCZOS, 1);
        }

        $image->setImageDepth(8);
        if ($info->hasAlpha) {
            $image->setImageFormat('png');
            $image->setOption('png:compression-level', self::PNG_LEVEL);
        } else {
            $image->setImageFormat('jpeg');
            $image->setImageCompressionQuality($jpegQuality);
            $image->setInterlaceScheme(Imagick::INTERLACE_PLANE); // progressive, as sharp's mozjpeg and our GD path
        }
        $stored = new StoredImage(
            $image->getImageBlob(),
            $info->hasAlpha ? 'png' : 'jpg',
            $image->getImageWidth(),
            $image->getImageHeight(),
        );
        $image->clear();
        return $stored;
    }

    /** EXIF orientation 1–8 as sharp applies it (tests/fixtures/orientation.json). ImageMagick turns clockwise. */
    private static function orient(Imagick $image, int $orientation): void
    {
        $none = new ImagickPixel('none');
        match ($orientation) {
            2 => $image->flopImage(),
            3 => $image->rotateImage($none, 180),
            4 => $image->flipImage(),
            5 => $image->transposeImage(),
            6 => $image->rotateImage($none, 90),
            7 => $image->transverseImage(),
            8 => $image->rotateImage($none, 270),
            default => true,
        };
        // The pixels are upright now; say so, in case anything downstream still reads the tag.
        $image->setImageOrientation(Imagick::ORIENTATION_TOPLEFT);
    }
}
