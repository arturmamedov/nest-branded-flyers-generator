<?php

declare(strict_types=1);

namespace NestFlyers\Tests\Diagnostics;

use NestFlyers\Diagnostics\ReleaseCheck;

/** The app's own reader of release.json (api/config's server.release). */
final class ReleaseCheckTest extends ReleaseCheckContractTestCase
{
    protected function verdict(string $appRoot): array
    {
        return ReleaseCheck::run($appRoot);
    }
}
