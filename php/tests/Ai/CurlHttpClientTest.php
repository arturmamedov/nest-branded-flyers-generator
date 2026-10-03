<?php

declare(strict_types=1);

namespace NestFlyers\Tests\Ai;

use NestFlyers\Ai\CurlHttpClient;
use NestFlyers\Ai\LlmFailure;
use NestFlyers\Json;
use NestFlyers\Tests\Support\TempDir;
use PHPUnit\Framework\Attributes\RequiresPhpExtension;
use PHPUnit\Framework\TestCase;

/**
 * The real HTTP seam (the twin of fetchJson's tests in tests/unit/ai-providers.test.ts), against local listeners only:
 * no test reaches a provider.
 */
#[RequiresPhpExtension('curl')]
final class CurlHttpClientTest extends TestCase
{
    /** @var resource|null */
    private $server = null;
    private ?string $root = null;

    protected function tearDown(): void
    {
        if (is_resource($this->server)) {
            proc_terminate($this->server);
            proc_close($this->server);
        }
        if ($this->root !== null) {
            TempDir::remove($this->root);
        }
    }

    public function testItGivesUpAfterTimeoutMsWithATimeoutFailure(): void
    {
        // The kernel completes the handshake for a listening socket, so the request goes out; nobody ever answers.
        $socket = stream_socket_server('tcp://127.0.0.1:0');
        self::assertIsResource($socket);
        try {
            $started = hrtime(true);
            $failure = self::failure(fn () => (new CurlHttpClient())->postJson('http://' . stream_socket_get_name($socket, false) . '/', [], '{}', 200));
            self::assertSame(LlmFailure::TIMEOUT, $failure->reason, $failure->getMessage());
            self::assertStringContainsString('127.0.0.1', $failure->getMessage());
            self::assertLessThan(5_000, (hrtime(true) - $started) / 1e6, 'it gave up near the limit');
        } finally {
            fclose($socket);
        }
    }

    public function testAPortNobodyListensOnIsANetworkFailure(): void
    {
        $port = self::freePort();
        $failure = self::failure(fn () => (new CurlHttpClient())->postJson("http://127.0.0.1:$port/", [], '{}', 5_000));
        self::assertSame(LlmFailure::NETWORK, $failure->reason, $failure->getMessage());
    }

    public function testItHandsBackTheStatusAndTheBodyWhateverTheStatus(): void
    {
        $base = $this->serve();
        $answer = (new CurlHttpClient())->postJson("{$base}echo", ['Authorization' => 'Bearer k', 'Content-Type' => 'application/json'], '{"a":1}', 5_000);
        self::assertSame(418, $answer->status);
        self::assertEquals((object) ['got' => (object) ['a' => 1], 'auth' => 'Bearer k', 'type' => 'application/json'], Json::decode($answer->text));
    }

    public function testABodyThatIsNotUtf8ComesBackAsValidText(): void
    {
        $base = $this->serve();
        $answer = (new CurlHttpClient())->postJson("{$base}latin1", [], '{}', 5_000);
        self::assertSame(200, $answer->status);
        self::assertSame("caf\u{FFFD}", $answer->text, 'as fetch().text() decodes it');
    }

    /** php -S on a free port with a router that echoes the request, or answers a Latin-1 byte. */
    private function serve(): string
    {
        $this->root = TempDir::create('curl');
        file_put_contents("$this->root/router.php", <<<'PHP'
            <?php
            if ($_SERVER['REQUEST_URI'] === '/latin1') {
                echo "caf\xE9";
                return true;
            }
            http_response_code(418);
            header('Content-Type: application/json');
            echo json_encode([
                'got' => json_decode((string) file_get_contents('php://input')),
                'auth' => $_SERVER['HTTP_AUTHORIZATION'] ?? null,
                'type' => $_SERVER['CONTENT_TYPE'] ?? null,
            ]);
            return true;
            PHP);
        $port = self::freePort();
        $log = "$this->root/server.log";
        $this->server = proc_open([PHP_BINARY, '-S', "127.0.0.1:$port", "$this->root/router.php"], [1 => ['file', $log, 'a'], 2 => ['file', $log, 'a']], $pipes);
        self::assertIsResource($this->server);
        $deadline = microtime(true) + 10;
        while (($probe = @fsockopen('127.0.0.1', $port, $errno, $error, 0.2)) === false) {
            if (microtime(true) > $deadline) {
                self::fail('php -S did not start: ' . (string) @file_get_contents($log));
            }
            usleep(50_000);
        }
        fclose($probe);
        return "http://127.0.0.1:$port/";
    }

    private static function freePort(): int
    {
        $socket = stream_socket_server('tcp://127.0.0.1:0');
        self::assertIsResource($socket);
        $port = (int) substr((string) strrchr((string) stream_socket_get_name($socket, false), ':'), 1);
        fclose($socket);
        return $port;
    }

    private static function failure(callable $call): LlmFailure
    {
        try {
            $call();
        } catch (LlmFailure $e) {
            return $e;
        }
        self::fail('No failure');
    }
}
