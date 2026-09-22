<?php

declare(strict_types=1);

namespace NestFlyers\Tests\Support;

/**
 * Where the repo's shared files live, for tests only. Production code gets
 * every path from the composition root (Bootstrap::fromAppRoot); tests run
 * against the repo checkout, so they may derive it from this file's place.
 */
final class Paths
{
    /** The repo root: php/tests/Support → three levels up. Forward slashes, no trailing slash. */
    public static function repo(): string
    {
        return str_replace('\\', '/', dirname(__DIR__, 3));
    }

    /** <repo>/schema/<name>, e.g. Paths::schema('shared.json'). */
    public static function schema(string $name): string
    {
        return self::repo() . '/schema/' . $name;
    }

    /** <repo>/seed/<name>, e.g. Paths::seed('hostels.json'). */
    public static function seed(string $name): string
    {
        return self::repo() . '/seed/' . $name;
    }

    /** <repo>/tests/fixtures/<name>: the test vectors Vitest and PHPUnit share. */
    public static function fixture(string $name): string
    {
        return self::repo() . '/tests/fixtures/' . $name;
    }
}
