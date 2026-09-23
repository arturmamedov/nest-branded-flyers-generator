<?php

declare(strict_types=1);

namespace NestFlyers\Tests\Image;

use NestFlyers\Image\ImageProcessor;
use NestFlyers\Image\ImagickImageProcessor;

/** Runs only where the imagick extension is loaded (not on the dev machine, nor on most shared hosts). */
final class ImagickImageProcessorTest extends ImageProcessorContractTestCase
{
    protected function createProcessor(): ImageProcessor
    {
        if (!extension_loaded('imagick')) {
            self::markTestSkipped('The imagick extension is not loaded.');
        }
        return new ImagickImageProcessor();
    }

    protected function expectedName(): string
    {
        return 'imagick';
    }
}
