<?php

declare(strict_types=1);

namespace NestFlyers\Tests\Http;

use LogicException;
use NestFlyers\Http\Request;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/**
 * The app root is the folder of api.php, whether that is the domain root or a
 * subfolder, and only a SCRIPT_NAME ending in api.php is trusted to say where
 * it is (router.php pins it for php -S; Apache sets it after the rewrite).
 */
final class RequestAppPathTest extends TestCase
{
    /** @return iterable<string, array{string, string, string}> */
    public static function paths(): iterable
    {
        yield 'domain root' => ['/api/flyers/7', '/api.php', '/api/flyers/7'];
        yield 'domain root, query string dropped' => ['/api/flyers?hostel=duque-nest&template=', '/api.php', '/api/flyers'];
        yield 'subfolder stripped' => ['/sub/api/flyers/7', '/sub/api.php', '/api/flyers/7'];
        yield 'nested subfolder stripped' => ['/nest/flyers/api/hostels?x=1', '/nest/flyers/api.php', '/api/hostels'];
        // Still encoded: the router matches the encoded path (as Express does)
        // and decodes only the captured parameters.
        yield 'percent-encoding is left to the router' => ['/sub/api/flyers/%37', '/sub/api.php', '/api/flyers/%37'];
        yield 'space in the subfolder' => ['/my%20nest/api/config', '/my nest/api.php', '/api/config'];
        yield 'the front controller itself' => ['/sub/api.php', '/sub/api.php', '/api.php'];
        yield 'a path outside the subfolder is left alone' => ['/other/api/config', '/sub/api.php', '/other/api/config'];
        yield 'a prefix that is not a whole folder is left alone' => ['/subway/api/config', '/sub/api.php', '/subway/api/config'];
        yield 'the root' => ['/', '/api.php', '/'];
        yield 'an empty URI' => ['', '/api.php', '/'];
    }

    #[DataProvider('paths')]
    public function testAppPath(string $uri, string $scriptName, string $expected): void
    {
        self::assertSame($expected, Request::appPath($uri, $scriptName));
    }

    /** @return iterable<string, array{string}> */
    public static function untrusted(): iterable
    {
        yield 'a static page' => ['/index.html'];
        yield 'the API path itself (php -S without the router pin)' => ['/api/flyers/7'];
        yield 'the router script' => ['/router.php'];
        yield 'a name that merely ends in api.php' => ['/notapi.php'];
        yield 'empty' => [''];
    }

    #[DataProvider('untrusted')]
    public function testOnlyAnApiPhpScriptNameIsTrusted(string $scriptName): void
    {
        $this->expectException(LogicException::class);
        Request::appPath('/api/flyers/7', $scriptName);
    }
}
