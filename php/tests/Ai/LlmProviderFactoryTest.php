<?php

declare(strict_types=1);

namespace NestFlyers\Tests\Ai;

use NestFlyers\Ai\AiBundle;
use NestFlyers\Ai\AiConfig;
use NestFlyers\Ai\AnthropicProvider;
use NestFlyers\Ai\CurlHttpClient;
use NestFlyers\Ai\FakeProvider;
use NestFlyers\Ai\LlmProvider;
use NestFlyers\Ai\LlmProviderFactory;
use NestFlyers\Ai\OpenAiProvider;
use NestFlyers\Shared;
use NestFlyers\Tests\Support\Paths;
use NestFlyers\Validation\SchemaNormalizer;
use NestFlyers\Validation\SchemaValidator;
use PHPUnit\Framework\TestCase;

/** config.php's `ai` block → the provider that runs, or none (createProvider in server/ai/composition.ts). */
final class LlmProviderFactoryTest extends TestCase
{
    public function testOffBuildsNothing(): void
    {
        self::assertNull(self::provider(null));
        self::assertNull(self::provider(['provider' => null]));
        self::assertNull(self::provider(['provider' => 'openai']), 'no key');
        self::assertNull(self::provider(['provider' => 'openai', 'apiKey' => 'k', 'enabled' => false]), 'switched off');
        self::assertNull(self::provider(['provider' => 'fake', 'enabled' => false]));
    }

    public function testTheFakeNeedsNoKey(): void
    {
        $fake = self::provider(['provider' => 'fake']);
        self::assertInstanceOf(FakeProvider::class, $fake);
        self::assertSame('fake-1', $fake->model());
    }

    public function testARealProviderWithItsKeyAndModel(): void
    {
        $openai = self::provider(['provider' => 'openai', 'apiKey' => 'sk-test']);
        self::assertInstanceOf(OpenAiProvider::class, $openai);
        self::assertSame('gpt-6-luna', $openai->model());
        $anthropic = self::provider(['provider' => 'anthropic', 'apiKey' => 'k', 'model' => 'claude-sonnet-5-5']);
        self::assertInstanceOf(AnthropicProvider::class, $anthropic);
        self::assertSame('claude-sonnet-5-5', $anthropic->model());
    }

    /** @param array<string, mixed>|null $ai */
    private static function provider(?array $ai): ?LlmProvider
    {
        $shared = Shared::fromFile(Paths::schema('shared.json'));
        $bundle = AiBundle::fromFile(Paths::schema('ai.json'), new SchemaValidator(new SchemaNormalizer()));
        return LlmProviderFactory::create(AiConfig::fromArray($ai, $shared->ai()), $bundle, $shared, new CurlHttpClient());
    }
}
