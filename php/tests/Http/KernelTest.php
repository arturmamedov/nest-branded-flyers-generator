<?php

declare(strict_types=1);

namespace NestFlyers\Tests\Http;

use NestFlyers\Http\AccessGuard;
use NestFlyers\Http\AccessRule;
use NestFlyers\Http\ErrorCatalog;
use NestFlyers\Http\Kernel;
use NestFlyers\Http\Request;
use NestFlyers\Http\Response;
use NestFlyers\Http\Router;
use NestFlyers\Http\WriteGuard;
use NestFlyers\Json;
use NestFlyers\Shared;
use NestFlyers\Tests\Support\Paths;
use NestFlyers\Tests\Support\TempDir;
use PHPUnit\Framework\TestCase;
use RuntimeException;
use stdClass;

/** The order of checks (docs/api-contract.md): access, boot, parse, guard, route, handler. */
final class KernelTest extends TestCase
{
    private ErrorCatalog $errors;
    private int $boots = 0;
    /** @var list<array{params: array<string, string>, body: mixed}> */
    private array $calls = [];
    private ?string $logDir = null;
    private string|false $previousLog = false;

    protected function setUp(): void
    {
        $this->errors = ErrorCatalog::fromShared(Shared::fromFile(Paths::schema('shared.json')));
    }

    protected function tearDown(): void
    {
        if ($this->logDir !== null) {
            ini_set('error_log', (string) $this->previousLog);
            TempDir::remove($this->logDir);
        }
    }

    public function testAccessComesFirst(): void
    {
        $kernel = $this->kernel(AccessRule::none());
        foreach ([self::json('POST', '/api/flyers', '{"title": '), self::plain('GET', '/api/nowhere'), self::plain('DELETE', '/api/flyers/1')] as $request) {
            $this->assertError($kernel->handle($request), 503, 'not_configured');
        }
        self::assertSame(0, $this->boots, 'storage is never opened for a request that is not let in');
    }

    public function testMalformedJsonComesBeforeTheWriteGuard(): void
    {
        $response = $this->kernel()->handle(self::json('POST', '/api/flyers', '{"title": ', []));
        $this->assertError($response, 400, 'invalid', $this->errors->make('malformed')->getMessage());
        $this->assertError($this->kernel()->handle(self::json('PUT', '/api/flyers/abc', '{"title": ')), 400, 'invalid');
    }

    public function testTheWriteGuardComesBeforeRouting(): void
    {
        $kernel = $this->kernel();
        $this->assertError($kernel->handle(self::json('POST', '/api/nowhere', '{}', [])), 403, 'forbidden');
        $this->assertError($kernel->handle(self::plain('DELETE', '/api/flyers/1')), 403, 'forbidden');
        self::assertSame([], $this->calls);
    }

    public function testUnknownPathsAndMethodsAre404(): void
    {
        $kernel = $this->kernel();
        $this->assertError($kernel->handle(self::plain('GET', '/api/nowhere')), 404, 'not_found', $this->errors->make('no_such_endpoint')->getMessage());
        $this->assertError($kernel->handle(self::json('PATCH', '/api/flyers/1', '{}')), 404, 'not_found');
        $this->assertError($kernel->handle(self::plain('OPTIONS', '/api/flyers/1')), 404, 'not_found');
        $this->assertError($kernel->handle(self::json('POST', '/api/render/1', '{"format":"png"}')), 404, 'not_found');
        $this->assertError($kernel->handle(self::plain('GET', '/index.html')), 404, 'not_found');
    }

    public function testTheHandlerGetsParamsAndTheParsedBody(): void
    {
        $response = $this->kernel()->handle(self::json('PUT', '/api/flyers/7', '{"title":"x","data":{}}'));
        self::assertSame(200, $response->status);
        self::assertSame(['id' => '7'], $this->calls[0]['params']);
        self::assertInstanceOf(stdClass::class, $this->calls[0]['body']);
        self::assertInstanceOf(stdClass::class, $this->calls[0]['body']->data);
    }

    public function testABodyThatIsNotJsonReachesTheHandlerAsNull(): void
    {
        $headers = ['x-nest-flyers' => '1', 'content-type' => 'text/plain', 'content-length' => '3'];
        $request = new Request('POST', '/api/flyers', [], $headers, 'abc', [], ['REMOTE_ADDR' => '127.0.0.1']);
        self::assertSame(200, $this->kernel()->handle($request)->status);
        self::assertNull($this->calls[0]['body']);
    }

    public function testAnEmptyJsonBodyReachesTheHandlerAsAnEmptyObject(): void
    {
        $this->kernel()->handle(self::json('POST', '/api/flyers', ''));
        self::assertEquals(new stdClass(), $this->calls[0]['body']);
    }

    public function testBootRunsOnEveryAdmittedRequest(): void
    {
        $kernel = $this->kernel();
        $kernel->handle(self::plain('GET', '/api/hostels'));
        $kernel->handle(self::plain('GET', '/api/nowhere'));
        self::assertSame(2, $this->boots, 'the seed check runs even when nothing matches');
    }

    public function testHeadIsServedByGetRoutes(): void
    {
        $response = $this->kernel()->handle(self::plain('HEAD', '/api/hostels'));
        self::assertSame(200, $response->status);
    }

    public function testAnHttpErrorFromAHandlerIsItsOwnAnswer(): void
    {
        $response = $this->kernel()->handle(self::plain('GET', '/api/flyers/404'));
        $this->assertError($response, 404, 'not_found', $this->errors->make('no_such_flyer')->getMessage());
    }

    public function testAStorageErrorWhileBootingIsAnswered(): void
    {
        $kernel = new Kernel(
            $this->errors,
            new AccessGuard(AccessRule::fromArray(['allowPublic' => true]), $this->errors),
            new WriteGuard($this->errors),
            fn (): Router => throw $this->errors->make('storage_too_new'),
        );
        $this->assertError($kernel->handle(self::plain('GET', '/api/hostels')), 500, 'server_error', $this->errors->make('storage_too_new')->getMessage());
    }

    public function testAnyOtherThrowableIsALoggedServerError(): void
    {
        $log = $this->captureErrorLog();
        $response = $this->kernel()->handle(self::plain('GET', '/api/boom'));
        $this->assertError($response, 500, 'server_error', $this->errors->make('server_error')->getMessage());
        self::assertStringContainsString('the disk is on fire', (string) file_get_contents($log));
    }

    private function kernel(?AccessRule $rule = null): Kernel
    {
        $router = new Router();
        $record = function (Request $request, array $params, mixed $body): Response {
            $this->calls[] = ['params' => $params, 'body' => $body];
            return Response::json(['ok' => true]);
        };
        $router->add('GET', '/api/hostels', $record);
        $router->add('POST', '/api/flyers', $record);
        $router->add('PUT', '/api/flyers/{id}', $record);
        $router->add('DELETE', '/api/flyers/{id}', $record);
        $router->add('GET', '/api/flyers/{id}', fn (): Response => throw $this->errors->make('no_such_flyer'));
        $router->add('GET', '/api/boom', static fn (): Response => throw new RuntimeException('the disk is on fire'));

        return new Kernel(
            $this->errors,
            new AccessGuard($rule ?? AccessRule::fromArray(['allowIps' => ['127.0.0.1']]), $this->errors),
            new WriteGuard($this->errors),
            function () use ($router): Router {
                $this->boots++;
                return $router;
            },
        );
    }

    /** @param array<string, string> $headers */
    private static function json(string $method, string $path, string $body, array $headers = ['x-nest-flyers' => '1']): Request
    {
        $headers += ['content-type' => 'application/json', 'content-length' => (string) strlen($body)];
        return new Request($method, $path, [], $headers, $body, [], ['REMOTE_ADDR' => '127.0.0.1']);
    }

    /** A request without a body, from the allowed address (and without the write header). */
    private static function plain(string $method, string $path): Request
    {
        return new Request($method, $path, [], [], '', [], ['REMOTE_ADDR' => '127.0.0.1']);
    }

    private function assertError(Response $response, int $status, string $code, ?string $message = null): void
    {
        self::assertSame($status, $response->status, $response->body);
        self::assertStringStartsWith('application/json', $response->headers['Content-Type'] ?? '');
        $error = Json::decode($response->body)->error;
        self::assertSame($code, $error->code);
        if ($message !== null) {
            self::assertSame($message, $error->message);
        }
    }

    /** Points error_log at a temp file for this test, so the expected log line is checked instead of printed. */
    private function captureErrorLog(): string
    {
        $this->logDir = TempDir::create('kernel-log');
        $this->previousLog = ini_get('error_log');
        $log = $this->logDir . '/php-errors.log';
        ini_set('error_log', $log);
        return $log;
    }
}
