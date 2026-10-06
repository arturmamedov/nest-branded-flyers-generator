<?php

declare(strict_types=1);

namespace NestFlyers\Tests\Ai;

use NestFlyers\Ai\AnthropicProvider;
use NestFlyers\Ai\HttpClient;
use NestFlyers\Ai\HttpResponse;
use NestFlyers\Ai\LlmCall;
use NestFlyers\Ai\LlmFailure;
use NestFlyers\Ai\LlmProvider;
use NestFlyers\Ai\OpenAiProvider;
use NestFlyers\Ai\ProviderConfig;
use NestFlyers\Json;
use NestFlyers\Tests\Support\JsonAssert;
use NestFlyers\Tests\Support\Paths;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use stdClass;

/**
 * The HTTPS adapters against the vectors Vitest replays too (tests/fixtures/ai-openai.json, ai-anthropic.json): the
 * request each builds for one call, and what each recorded answer becomes. The HTTP seam is a recording stub;
 * CurlHttpClientTest proves the real one.
 */
final class ProvidersTest extends TestCase
{
    private const FILES = ['openai' => 'ai-openai.json', 'anthropic' => 'ai-anthropic.json'];

    private static function fixture(string $adapter): stdClass
    {
        return Json::decode((string) file_get_contents(Paths::fixture(self::FILES[$adapter])));
    }

    /** @return array<string, array{string, stdClass}> */
    public static function requests(): array
    {
        $cases = [];
        foreach (array_keys(self::FILES) as $adapter) {
            foreach (self::fixture($adapter)->requests as $request) {
                $cases["$adapter sends $request->name"] = [$adapter, $request];
            }
        }
        return $cases;
    }

    #[DataProvider('requests')]
    public function testTheRequest(string $adapter, stdClass $request): void
    {
        $v = self::fixture($adapter);
        $good = self::good($v);
        $http = self::stub($good->status, self::textOf($good));
        self::make($adapter, $request->config, $http)->complete(self::call($v, $request->call ?? 'call'));
        self::assertCount(1, $http->seen);
        self::assertSame($request->url, $http->seen[0]['url']);
        JsonAssert::same($request->headers, $http->seen[0]['headers']);
        JsonAssert::same($request->body, Json::decode($http->seen[0]['body']));
        self::assertSame($v->call->timeoutMs, $http->seen[0]['timeoutMs']);
    }

    /** @return array<string, array{string, stdClass}> */
    public static function answers(): array
    {
        $cases = [];
        foreach (array_keys(self::FILES) as $adapter) {
            foreach (self::fixture($adapter)->answers as $answer) {
                $cases["$adapter reads $answer->name"] = [$adapter, $answer];
            }
        }
        return $cases;
    }

    #[DataProvider('answers')]
    public function testTheAnswer(string $adapter, stdClass $answer): void
    {
        $v = self::fixture($adapter);
        $provider = self::make($adapter, $v->requests[0]->config, self::stub($answer->status, self::textOf($answer)));
        if (isset($answer->result)) {
            $result = $provider->complete(self::call($v));
            JsonAssert::same($answer->result, (object) [
                'json' => $result->json,
                'raw' => $result->raw,
                'usage' => $result->usage === null ? null : (object) ['input' => $result->usage->input, 'output' => $result->usage->output],
                'model' => $result->model,
            ]);
            return;
        }
        try {
            $provider->complete(self::call($v));
            self::fail("$answer->name: no failure");
        } catch (LlmFailure $e) {
            self::assertSame($answer->failure, $e->reason, $e->getMessage());
            // The key never leaves the adapter, whatever the provider echoed back.
            self::assertStringNotContainsString('test-key', $e->getMessage() . ' ' . ($e->raw ?? ''));
        }
    }

    /** @return array<string, array{string}> */
    public static function adapters(): array
    {
        return ['openai' => ['openai'], 'anthropic' => ['anthropic']];
    }

    #[DataProvider('adapters')]
    public function testItNamesItselfAndItsModelForTheLedger(string $adapter): void
    {
        $config = self::fixture($adapter)->requests[0]->config;
        $provider = self::make($adapter, $config, self::stub(200, ''));
        self::assertSame($adapter, $provider->name());
        self::assertSame($config->model, $provider->model());
    }

    private static function make(string $adapter, stdClass $config, HttpClient $http): LlmProvider
    {
        $settings = new ProviderConfig($config->apiKey, $config->model, $config->effort);
        return $adapter === 'openai' ? new OpenAiProvider($settings, $http) : new AnthropicProvider($settings, $http);
    }

    /** The fixture's `call`, or the one a request entry names (`picture`: a turn that carries a picture). */
    private static function call(stdClass $v, string $which = 'call'): LlmCall
    {
        $c = $v->$which;
        $parts = static fn (array $content): array => array_map(static fn (stdClass $part): array => (array) $part, $content);
        $messages = array_map(
            static fn (stdClass $m): array => ['role' => $m->role, 'content' => is_array($m->content) ? $parts($m->content) : $m->content],
            $c->messages,
        );
        return new LlmCall($c->system, $messages, $c->schema, $c->schemaName, $c->maxOutputTokens, $c->timeoutMs);
    }

    private static function good(stdClass $v): stdClass
    {
        foreach ($v->answers as $answer) {
            if (isset($answer->result)) {
                return $answer;
            }
        }
        self::fail('The fixture has no good answer');
    }

    private static function textOf(stdClass $answer): string
    {
        return $answer->text ?? Json::encode($answer->body);
    }

    /** A client that records what it is sent and answers with one canned response. */
    private static function stub(int $status, string $text): HttpClient
    {
        return new class ($status, $text) implements HttpClient {
            /** @var list<array{url:string, headers:array<string, string>, body:string, timeoutMs:int}> */
            public array $seen = [];

            public function __construct(private readonly int $status, private readonly string $text)
            {
            }

            public function postJson(string $url, array $headers, string $body, int $timeoutMs): HttpResponse
            {
                $this->seen[] = ['url' => $url, 'headers' => $headers, 'body' => $body, 'timeoutMs' => $timeoutMs];
                return new HttpResponse($this->status, $this->text);
            }
        };
    }
}
