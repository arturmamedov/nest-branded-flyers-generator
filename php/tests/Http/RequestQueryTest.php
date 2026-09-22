<?php

declare(strict_types=1);

namespace NestFlyers\Tests\Http;

use NestFlyers\Http\Request;
use PHPUnit\Framework\TestCase;

/**
 * The query string as Express's default parser leaves it for the API
 * (server/app.ts only uses a parameter when it is a string), so both backends
 * filter the flyer list the same way.
 */
final class RequestQueryTest extends TestCase
{
    public function testOneValuePerName(): void
    {
        self::assertSame(['hostel' => 'duque-nest', 'template' => 'activity'], Request::parseQuery('hostel=duque-nest&template=activity'));
        self::assertSame([], Request::parseQuery(''));
        self::assertSame(['hostel' => ''], Request::parseQuery('hostel='), 'an empty value means no filter, as on Node');
        self::assertSame(['hostel' => ''], Request::parseQuery('hostel'));
    }

    public function testDecodesNamesAndValuesLikeAQueryString(): void
    {
        self::assertSame(['hostel' => 'duque nest'], Request::parseQuery('hostel=duque+nest'));
        self::assertSame(['hostel' => 'a/b'], Request::parseQuery('hostel=a%2Fb'));
        self::assertSame(['a b' => 'c'], Request::parseQuery('a%20b=c'));
    }

    public function testARepeatedNameFiltersNothing(): void
    {
        // Express turns it into an array, which server/app.ts then ignores.
        self::assertSame([], Request::parseQuery('hostel=duque-nest&hostel=other'));
        self::assertSame(['template' => 'week'], Request::parseQuery('hostel=a&template=week&hostel=b'));
    }

    public function testABracketedNameIsJustAName(): void
    {
        // PHP's own $_GET would make this an array under "hostel"; Express keeps
        // the literal name, so neither backend filters by it.
        self::assertSame(['hostel[]' => 'duque-nest'], Request::parseQuery('hostel[]=duque-nest'));
    }
}
