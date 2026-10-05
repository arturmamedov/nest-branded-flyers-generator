<?php

declare(strict_types=1);

namespace NestFlyers\Tests\Ai;

use NestFlyers\Ai\CurlHttpClient;
use NestFlyers\Ai\HttpClientFactory;
use NestFlyers\Ai\LlmFailure;
use PHPUnit\Framework\Attributes\RequiresPhpExtension;
use PHPUnit\Framework\TestCase;

/**
 * Which HTTP client the AI's providers get. A host without curl gets one whose every call is a typed failure, so a
 * generation there answers ai_failed and is recorded like any other, where it used to be an undefined function, a
 * 500 and a logged trace. Node needs no twin: fetch is built in.
 */
final class HttpClientFactoryTest extends TestCase
{
    public function testWithCurlItIsTheCurlClient(): void
    {
        self::assertInstanceOf(CurlHttpClient::class, HttpClientFactory::create(static fn (string $extension): bool => $extension === 'curl'));
    }

    #[RequiresPhpExtension('curl')]
    public function testItAsksTheHostWhenNobodyAnswersForIt(): void
    {
        self::assertInstanceOf(CurlHttpClient::class, HttpClientFactory::create());
    }

    public function testWithoutCurlEveryCallIsATypedFailureThatNamesCurlAndNothingOfTheRequest(): void
    {
        $client = HttpClientFactory::create(static fn (string $extension): bool => false);
        try {
            $client->postJson('https://api.openai.com/v1/responses', ['Authorization' => 'Bearer sk-live-secret-42'], '{"model":"gpt-6-luna"}', 25_000);
            self::fail('The call went through');
        } catch (LlmFailure $e) {
            self::assertSame(LlmFailure::NETWORK, $e->reason);
            self::assertStringContainsString('curl', $e->getMessage());
            self::assertStringNotContainsString('sk-live-secret-42', $e->getMessage());
            self::assertNull($e->raw);
        }
    }
}
