<?php

declare(strict_types=1);

namespace NestFlyers\Ai;

/**
 * The provider seam (docs/prompts/ai-assistant.md): one method, one shape in, one shape out, a typed failure. Three
 * implementations: OpenAiProvider and AnthropicProvider over HTTPS, and FakeProvider, which the tests run on. Which one
 * runs is config.php's `ai` block (LlmProviderFactory), never code. The twin of server/ai/provider.ts.
 */
interface LlmProvider
{
    /** 'openai' | 'anthropic' | 'fake', for the ledger. */
    public function name(): string;

    /** @throws LlmFailure when no usable answer came */
    public function complete(LlmCall $call): LlmResult;
}
