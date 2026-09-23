<?php

declare(strict_types=1);

namespace NestFlyers\Tests\Http;

use NestFlyers\Http\ErrorCatalog;
use NestFlyers\Http\HttpError;
use NestFlyers\Http\Request;
use NestFlyers\Http\WriteGuard;
use NestFlyers\Shared;
use NestFlyers\Tests\Support\Paths;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

final class WriteGuardTest extends TestCase
{
    /** @return iterable<string, array{string, array<string, string>, bool}> */
    public static function requests(): iterable
    {
        yield 'GET needs nothing' => ['GET', [], true];
        yield 'HEAD needs nothing' => ['HEAD', [], true];
        yield 'OPTIONS needs nothing' => ['OPTIONS', [], true];
        yield 'POST without the header' => ['POST', [], false];
        yield 'PUT without the header' => ['PUT', [], false];
        yield 'DELETE without the header' => ['DELETE', [], false];
        yield 'PATCH without the header' => ['PATCH', [], false];
        yield 'POST with the header' => ['POST', ['x-nest-flyers' => '1'], true];
        yield 'DELETE with the header' => ['DELETE', ['x-nest-flyers' => '1'], true];
        yield 'another value is not enough' => ['POST', ['x-nest-flyers' => 'true'], false];
        yield 'a repeated header is not enough' => ['POST', ['x-nest-flyers' => '1, 1'], false];
    }

    /** @param array<string, string> $headers */
    #[DataProvider('requests')]
    public function testGuard(string $method, array $headers, bool $passes): void
    {
        $errors = ErrorCatalog::fromShared(Shared::fromFile(Paths::schema('shared.json')));
        try {
            (new WriteGuard($errors))->check(new Request($method, '/api/flyers', [], $headers));
            self::assertTrue($passes, 'the write was let through');
        } catch (HttpError $e) {
            self::assertFalse($passes, 'the request was refused');
            self::assertSame(403, $e->status);
            self::assertSame('forbidden', $e->errorCode);
            self::assertSame($errors->make('forbidden')->getMessage(), $e->getMessage());
        }
    }
}
