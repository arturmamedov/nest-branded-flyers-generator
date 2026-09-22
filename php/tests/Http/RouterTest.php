<?php

declare(strict_types=1);

namespace NestFlyers\Tests\Http;

use Closure;
use InvalidArgumentException;
use NestFlyers\Http\Request;
use NestFlyers\Http\Response;
use NestFlyers\Http\Router;
use PHPUnit\Framework\TestCase;

/** Matching as Express 5 does for the Node server: see Router's docblock. */
final class RouterTest extends TestCase
{
    private Router $router;

    protected function setUp(): void
    {
        $this->router = new Router();
        $this->router->add('GET', '/api/hostels', self::named('hostels'));
        $this->router->add('GET', '/api/flyers', self::named('list'));
        $this->router->add('POST', '/api/flyers', self::named('create'));
        $this->router->add('GET', '/api/flyers/{id}', self::named('get'));
        $this->router->add('PUT', '/api/flyers/{id}', self::named('update'));
        $this->router->add('get', '/api/things/{kind}/{id}', self::named('thing'));
    }

    public function testLiteralPaths(): void
    {
        self::assertSame('hostels', $this->matched('GET', '/api/hostels'));
        self::assertSame('list', $this->matched('GET', '/api/flyers'));
        self::assertSame('create', $this->matched('POST', '/api/flyers'));
    }

    public function testParams(): void
    {
        $match = $this->router->match('GET', '/api/flyers/42');
        self::assertNotNull($match);
        self::assertSame(['id' => '42'], $match['params']);
        self::assertSame(['kind' => 'art', 'id' => 'x-1'], $this->router->match('GET', '/api/things/art/x-1')['params'] ?? null);
        // Params are whatever the segment holds; the handler judges them (idParam → 404).
        self::assertSame(['id' => 'abc'], $this->router->match('PUT', '/api/flyers/abc')['params'] ?? null);
        self::assertSame(['id' => '-3'], $this->router->match('GET', '/api/flyers/-3')['params'] ?? null);
    }

    public function testAParamIsOneNonEmptySegment(): void
    {
        self::assertNull($this->router->match('GET', '/api/flyers/1/2'));
        // "/api/flyers/" is the list with a trailing slash, not a flyer with an empty id.
        self::assertSame('list', $this->matched('GET', '/api/flyers/'));
    }

    public function testTrailingSlashAndCaseAreForgivenLikeExpress(): void
    {
        self::assertSame('hostels', $this->matched('GET', '/api/hostels/'));
        self::assertSame('hostels', $this->matched('GET', '/API/Hostels'));
        self::assertSame(['id' => 'AbC'], $this->router->match('GET', '/Api/Flyers/AbC')['params'] ?? null, 'params keep their case');
        self::assertNull($this->router->match('GET', '/api/hostels//'));
        self::assertNull($this->router->match('GET', "/api/hostels\n"));
    }

    public function testWrongMethodOrUnknownPathIsNull(): void
    {
        self::assertNull($this->router->match('DELETE', '/api/hostels'));
        self::assertNull($this->router->match('PATCH', '/api/flyers/1'));
        self::assertNull($this->router->match('OPTIONS', '/api/flyers'));
        self::assertNull($this->router->match('GET', '/api/nowhere'));
        self::assertNull($this->router->match('GET', '/api/hostelsx'));
        self::assertNull($this->router->match('GET', '/x/api/hostels'));
        self::assertNull($this->router->match('GET', '/'));
    }

    public function testHeadIsAnsweredByGetRoutes(): void
    {
        self::assertSame('hostels', $this->matched('HEAD', '/api/hostels'));
        self::assertSame('get', $this->matched('head', '/api/flyers/7'));
        self::assertNull($this->router->match('HEAD', '/api/nowhere'));
    }

    public function testMethodsAreCaseInsensitive(): void
    {
        self::assertSame('thing', $this->matched('GET', '/api/things/a/b'));
        self::assertSame('create', $this->matched('post', '/api/flyers'));
    }

    public function testTheFirstMatchingRouteWins(): void
    {
        $this->router->add('GET', '/api/flyers/{other}', self::named('shadowed'));
        self::assertSame('get', $this->matched('GET', '/api/flyers/7'));
    }

    public function testRegexCharactersInLiteralsAreLiteral(): void
    {
        $this->router->add('GET', '/api/v1.0/x', self::named('dotted'));
        self::assertSame('dotted', $this->matched('GET', '/api/v1.0/x'));
        self::assertNull($this->router->match('GET', '/api/v1x0/x'));
    }

    public function testMatchesTheEncodedPathAndDecodesOnlyTheParameters(): void
    {
        $this->router->add('GET', '/api/flyers/{id}', self::named('flyer'));

        // Express matches the raw path, so an encoded route name is not the route.
        self::assertNull($this->router->match('GET', '/api/flyer%73/1'), 'no percent-encoded aliases of a route');
        self::assertNull($this->router->match('GET', '/api/flyers%2f1'), '%2F is not a path separator');

        // The parameter itself arrives decoded, as Express's decode_param gives it.
        self::assertSame(['id' => '1/2'], $this->router->match('GET', '/api/flyers/1%2F2')['params']);
        self::assertSame(['id' => '7'], $this->router->match('GET', '/api/flyers/7')['params']);
    }

    public function testPatternsMustBeAbsolute(): void
    {
        $this->expectException(InvalidArgumentException::class);
        $this->router->add('GET', 'api/hostels', self::named('relative'));
    }

    private function matched(string $method, string $path): ?string
    {
        $match = $this->router->match($method, $path);
        return $match === null ? null : ($match['handler'])(new Request($method, $path), $match['params'], null)->body;
    }

    /** A handler that answers with its own name, so a test can tell which route matched. */
    private static function named(string $name): Closure
    {
        return static fn (): Response => new Response(200, [], $name);
    }
}
