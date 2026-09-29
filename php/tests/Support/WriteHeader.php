<?php

declare(strict_types=1);

namespace NestFlyers\Tests\Support;

use NestFlyers\Shared;

/**
 * The write guard's header on a test request, read from schema/shared.json
 * (src/shared/writeGuard.ts), so a fixture never hand-copies it. The name is
 * lower-cased, as Request::fromGlobals() stores every header name.
 * WriteGuardTest spells the header out instead: it pins the rule itself.
 */
final class WriteHeader
{
    /** @return array<string, string> */
    public static function headers(): array
    {
        $guard = Shared::fromFile(Paths::schema('shared.json'))->writeGuard();
        return [strtolower($guard['header']) => $guard['value']];
    }
}
