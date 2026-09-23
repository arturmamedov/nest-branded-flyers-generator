<?php

declare(strict_types=1);

namespace NestFlyers\Tests\Preflight;

use NestFlyers\Tests\Diagnostics\ReleaseCheckContractTestCase;
use NestFlyers\Tests\Support\Paths;

use function NestFlyersPreflight\releaseVerdict;

/** The preflight page's own reader of release.json, held to the app's verdicts (ReleaseCheckTest). */
final class PreflightReleaseCheckTest extends ReleaseCheckContractTestCase
{
    public static function setUpBeforeClass(): void
    {
        require_once Paths::repo() . '/php/preflight/nest-preflight.php';
    }

    protected function verdict(string $appRoot): array
    {
        return releaseVerdict($appRoot);
    }
}
