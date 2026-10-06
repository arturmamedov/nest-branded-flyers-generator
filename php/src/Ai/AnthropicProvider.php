<?php

declare(strict_types=1);

namespace NestFlyers\Ai;

use NestFlyers\Json;
use stdClass;

/**
 * Anthropic over the Messages API (docs read 2026-10-02): the system text as `system`, the turns as `messages`, the
 * schema as `output_config.format` (GA, no beta header), and the effort knob as `output_config.effort` when set (Haiku
 * 4.5 refuses it: leave `effort` unset there). The answer is the first `text` block; `stop_reason` says `refusal` or
 * `max_tokens` when there is none to trust. The twin of server/ai/providers/anthropic.ts;
 * tests/fixtures/ai-anthropic.json pins both.
 */
final class AnthropicProvider implements LlmProvider
{
    public const URL = 'https://api.anthropic.com/v1/messages';
    public const VERSION = '2023-06-01';

    public function __construct(
        private readonly ProviderConfig $config,
        private readonly HttpClient $http,
    ) {
    }

    public function name(): string
    {
        return 'anthropic';
    }

    public function complete(LlmCall $call): LlmResult
    {
        $outputConfig = ['format' => ['type' => 'json_schema', 'schema' => ProviderSchema::toAnthropic($call->schema)]];
        if ($this->config->effort !== null && $this->config->effort !== '') {
            $outputConfig['effort'] = $this->config->effort;
        }
        $body = [
            'model' => $call->model,
            'max_tokens' => $call->maxOutputTokens,
            'system' => $call->system,
            'messages' => array_map(
                static fn (array $m): array => ['role' => $m['role'], 'content' => is_string($m['content']) ? $m['content'] : array_map(self::block(...), $m['content'])],
                $call->messages,
            ),
            'output_config' => $outputConfig,
        ];

        $key = $this->config->apiKey;
        $headers = ['x-api-key' => $key, 'anthropic-version' => self::VERSION, 'Content-Type' => 'application/json'];
        $res = $this->http->postJson(self::URL, $headers, Json::encode($body), $call->timeoutMs);
        $data = ProviderAnswer::body('Anthropic', $res, $key);
        if (($data->type ?? null) === 'error') {
            $why = ProviderAnswer::message($data->error ?? null) ?? 'no reason given';
            throw new LlmFailure(LlmFailure::PROVIDER, ProviderAnswer::redact("Anthropic failed the request: $why", $key));
        }

        $text = self::firstText($data->content ?? null);
        $raw = $text === null ? null : ProviderAnswer::redact($text, $key);
        $stop = $data->stop_reason ?? null;
        if ($stop === 'refusal') {
            throw new LlmFailure(LlmFailure::REFUSED, 'Anthropic refused the request', $raw);
        }
        if ($stop === 'max_tokens') {
            throw new LlmFailure(LlmFailure::CUT, 'Anthropic stopped at max_tokens', $raw);
        }
        if ($text === null) {
            throw new LlmFailure(LlmFailure::BAD_OUTPUT, 'Anthropic answered without a text block', ProviderAnswer::redact($res->text, $key));
        }
        return new LlmResult(
            ProviderAnswer::answerJson($text, $key),
            $text,
            ProviderAnswer::usage($data->usage->input_tokens ?? null, $data->usage->output_tokens ?? null),
            is_string($data->model ?? null) ? $data->model : $call->model,
        );
    }

    /**
     * A part of a turn (docs read 2026-10-06): a picture is an `image` block with a `base64` source; text is a `text`
     * block.
     *
     * @param array<string, mixed> $part
     * @return array<string, mixed>
     */
    private static function block(array $part): array
    {
        return $part['type'] === 'image'
            ? ['type' => 'image', 'source' => ['type' => 'base64', 'media_type' => $part['mediaType'], 'data' => $part['data']]]
            : ['type' => 'text', 'text' => $part['text']];
    }

    /** The first `text` block's text; a thinking block before it is skipped. */
    private static function firstText(mixed $content): ?string
    {
        foreach (is_array($content) ? $content : [] as $block) {
            if ($block instanceof stdClass && ($block->type ?? null) === 'text') {
                return is_string($block->text ?? null) ? $block->text : null;
            }
        }
        return null;
    }
}
