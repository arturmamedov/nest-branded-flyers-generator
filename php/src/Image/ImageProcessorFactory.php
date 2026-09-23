<?php

declare(strict_types=1);

namespace NestFlyers\Image;

use InvalidArgumentException;
use RuntimeException;

/** Picks the image processor config.php asks for ('imageProcessor': auto | gd | imagick). */
final class ImageProcessorFactory
{
    /**
     * auto prefers GD (on nearly every host, and what the contract suite runs), then
     * imagick. Asking for a library the host lacks fails here, with a message that
     * says what to change, rather than as an undefined-function error mid-upload.
     *
     * @param (callable(string): bool)|null $extensionLoaded extension_loaded, replaceable in tests
     * @throws RuntimeException when the chosen library (or, for auto, both) is missing
     * @throws InvalidArgumentException for any other choice
     */
    public static function create(string $choice, ?callable $extensionLoaded = null): ImageProcessor
    {
        $loaded = $extensionLoaded ?? 'extension_loaded';
        $gd = static fn (): ImageProcessor => new GdImageProcessor();
        $imagick = static fn (): ImageProcessor => new ImagickImageProcessor();
        return match ($choice) {
            'auto' => match (true) {
                $loaded('gd') => $gd(),
                $loaded('imagick') => $imagick(),
                default => throw new RuntimeException(
                    'Photos need the gd or the imagick PHP extension, and neither is loaded. Enable gd in the host\'s PHP settings.',
                ),
            },
            'gd' => $loaded('gd') ? $gd() : throw new RuntimeException(
                'config.php sets imageProcessor to "gd", but the gd PHP extension is not loaded. Enable it, or use "auto".',
            ),
            'imagick' => $loaded('imagick') ? $imagick() : throw new RuntimeException(
                'config.php sets imageProcessor to "imagick", but the imagick PHP extension is not loaded. Enable it, or use "auto".',
            ),
            default => throw new InvalidArgumentException(
                "imageProcessor must be \"auto\", \"gd\" or \"imagick\" (got \"$choice\").",
            ),
        };
    }
}
