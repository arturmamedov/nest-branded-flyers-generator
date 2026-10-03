<?php

declare(strict_types=1);

namespace NestFlyers\Tests\Support;

use NestFlyers\Json;
use PHPUnit\Framework\Assert;
use stdClass;

/**
 * Vitest's toEqual for JSON trees: the same keys and values whatever their order, but strict about types, so {} is
 * not [], 1 is not 1.0 and "1" is not 1 (assertEquals would let all three through).
 */
final class JsonAssert
{
    public static function same(mixed $expected, mixed $actual, string $message = ''): void
    {
        Assert::assertSame(Json::encode(self::sorted($expected), true), Json::encode(self::sorted($actual), true), $message);
    }

    /** Every object's keys in byte order, recursively; lists keep their order. */
    private static function sorted(mixed $value): mixed
    {
        if ($value instanceof stdClass || (is_array($value) && !array_is_list($value))) {
            $fields = (array) $value;
            ksort($fields, SORT_STRING);
            return (object) array_map(self::sorted(...), $fields);
        }
        return is_array($value) ? array_map(self::sorted(...), $value) : $value;
    }
}
