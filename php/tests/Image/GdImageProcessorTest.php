<?php

declare(strict_types=1);

namespace NestFlyers\Tests\Image;

use NestFlyers\Image\GdImageProcessor;
use NestFlyers\Image\ImageProcessor;

final class GdImageProcessorTest extends ImageProcessorContractTestCase
{
    protected function createProcessor(): ImageProcessor
    {
        return new GdImageProcessor();
    }

    protected function expectedName(): string
    {
        return 'gd';
    }
}
