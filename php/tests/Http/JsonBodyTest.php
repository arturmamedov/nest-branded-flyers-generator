<?php

declare(strict_types=1);

namespace NestFlyers\Tests\Http;

use NestFlyers\Http\ErrorCatalog;
use NestFlyers\Http\HttpError;
use NestFlyers\Http\JsonBody;
use NestFlyers\Http\Request;
use NestFlyers\Shared;
use NestFlyers\Tests\Support\Paths;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use stdClass;

/** What express.json() (body-parser 2, strict) leaves in req.body on the Node server. */
final class JsonBodyTest extends TestCase
{
    private static ErrorCatalog $errors;

    public static function setUpBeforeClass(): void
    {
        self::$errors = ErrorCatalog::fromShared(Shared::fromFile(Paths::schema('shared.json')));
    }

    public function testObjectsStayObjects(): void
    {
        $body = self::parse('{"title":"x","data":{"overrides":{},"week":[]}}');
        self::assertInstanceOf(stdClass::class, $body);
        self::assertInstanceOf(stdClass::class, $body->data->overrides, '{} survives as an object');
        self::assertSame([], $body->data->week);
    }

    public function testAnArrayIsKeptForTheValidatorToReportAtUnderscore(): void
    {
        self::assertSame([], self::parse('[]'));
        self::assertSame([1, 2], self::parse(" \r\n\t[1,2]"));
    }

    public function testAnEmptyJsonBodyIsAnEmptyObject(): void
    {
        self::assertEquals(new stdClass(), self::parse(''));
        self::assertEquals(new stdClass(), self::parse("\xEF\xBB\xBF"));
    }

    public function testALeadingBomIsDropped(): void
    {
        self::assertSame('x', self::parse("\xEF\xBB\xBF{\"title\":\"x\"}")->title);
    }

    public function testNonFiniteNumbersParseAndAreLeftToTheValidator(): void
    {
        self::assertInfinite(self::parse('{"x":1e400}')->x);
    }

    /** @return iterable<string, array{string}> */
    public static function malformed(): iterable
    {
        yield 'truncated' => ['{"title": '];
        yield 'a bare string' => ['"x"'];
        yield 'a bare number' => ['42'];
        yield 'a bare null' => ['null'];
        yield 'a bare boolean' => ['true'];
        yield 'whitespace only' => [" \n\t "];
        yield 'not JSON' => ['title=x'];
        yield 'trailing garbage' => ['{} x'];
        yield 'a non-JSON space before the object' => ["\u{00A0}{}"];
        yield 'a lone surrogate' => ['{"title":"\ud800"}'];
    }

    #[DataProvider('malformed')]
    public function testMalformedBodies(string $raw): void
    {
        try {
            self::parse($raw);
            self::fail('The body was accepted');
        } catch (HttpError $e) {
            self::assertSame(400, $e->status);
            self::assertSame(self::$errors->make('malformed')->getMessage(), $e->getMessage());
            self::assertNull($e->fields);
        }
    }

    public function testMediaTypeMustBeApplicationJson(): void
    {
        self::assertSame('x', self::parse('{"title":"x"}', 'Application/JSON; charset=utf-8')->title);
        self::assertNull(self::parse('{"title":"x"}', 'text/plain'), 'Node leaves req.body undefined');
        self::assertNull(self::parse('{"title":"x"}', 'application/vnd.api+json'));
        self::assertNull(self::parse('broken', 'multipart/form-data; boundary=x'), 'a photo upload is never parsed here');
        self::assertNull(self::parse('{"title":"x"}', null));
    }

    public function testNoBodyAtAll(): void
    {
        $headers = ['content-type' => 'application/json'];
        self::assertNull(JsonBody::parse(new Request('POST', '/api/flyers', [], $headers, '{"a":1}'), self::$errors), 'no length, no transfer-encoding');
        $chunked = $headers + ['transfer-encoding' => 'chunked'];
        self::assertSame(1, JsonBody::parse(new Request('POST', '/api/flyers', [], $chunked, '{"a":1}'), self::$errors)->a);
    }

    private static function parse(string $raw, ?string $contentType = 'application/json'): mixed
    {
        $headers = ['content-length' => (string) strlen($raw)];
        if ($contentType !== null) {
            $headers['content-type'] = $contentType;
        }
        return JsonBody::parse(new Request('POST', '/api/flyers', [], $headers, $raw), self::$errors);
    }
}
