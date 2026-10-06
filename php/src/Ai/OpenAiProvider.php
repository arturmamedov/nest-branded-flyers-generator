<?php

declare(strict_types=1);

namespace NestFlyers\Ai;

use NestFlyers\Json;
use stdClass;

/**
 * OpenAI over the Responses API (docs read 2026-10-02): the system text as `instructions`, the turns as `input`, the
 * schema as `text.format` in strict mode, `store: false` so staff text is not kept on OpenAI's side, and the effort
 * knob as `reasoning.effort` when set. The answer is the `output_text` of the message item; a `refusal` item, an
 * `incomplete` status or a `failed` one is a typed failure. The twin of server/ai/providers/openai.ts;
 * tests/fixtures/ai-openai.json pins both.
 */
final class OpenAiProvider implements LlmProvider
{
    public const URL = 'https://api.openai.com/v1/responses';

    public function __construct(
        private readonly ProviderConfig $config,
        private readonly HttpClient $http,
    ) {
    }

    public function name(): string
    {
        return 'openai';
    }

    public function model(): string
    {
        return $this->config->model;
    }

    public function complete(LlmCall $call): LlmResult
    {
        $body = [
            'model' => $this->config->model,
            'instructions' => $call->system,
            'input' => array_map(
                static fn (array $m): array => ['role' => $m['role'], 'content' => is_string($m['content']) ? $m['content'] : array_map(self::sent(...), $m['content'])],
                $call->messages,
            ),
            'text' => ['format' => ['type' => 'json_schema', 'name' => $call->schemaName, 'schema' => ProviderSchema::toOpenAi($call->schema), 'strict' => true]],
            'max_output_tokens' => $call->maxOutputTokens,
            'store' => false,
        ];
        if ($this->config->effort !== null && $this->config->effort !== '') {
            $body['reasoning'] = ['effort' => $this->config->effort];
        }

        $key = $this->config->apiKey;
        $res = $this->http->postJson(self::URL, ['Authorization' => "Bearer $key", 'Content-Type' => 'application/json'], Json::encode($body), $call->timeoutMs);
        $data = ProviderAnswer::body('OpenAI', $res, $key);
        if (($data->status ?? null) === 'failed') {
            $why = ProviderAnswer::message($data->error ?? null) ?? 'no reason given';
            throw new LlmFailure(LlmFailure::PROVIDER, ProviderAnswer::redact("OpenAI failed the request: $why", $key));
        }

        $content = self::messageContent($data->output ?? null);
        $refusal = self::part($content, 'refusal');
        if ($refusal !== null) {
            $said = is_string($refusal->refusal ?? null) ? $refusal->refusal : '';
            throw new LlmFailure(LlmFailure::REFUSED, ProviderAnswer::redact("OpenAI refused: $said", $key));
        }
        $text = self::part($content, 'output_text')?->text ?? null;
        $text = is_string($text) ? $text : null;
        if (($data->status ?? null) === 'incomplete') {
            $reason = $data->incomplete_details->reason ?? null;
            $reason = is_string($reason) ? $reason : 'no reason given';
            throw new LlmFailure(LlmFailure::CUT, "OpenAI stopped early ($reason)", $text === null ? null : ProviderAnswer::redact($text, $key));
        }
        if ($text === null) {
            throw new LlmFailure(LlmFailure::BAD_OUTPUT, 'OpenAI answered without a message', ProviderAnswer::redact($res->text, $key));
        }
        return new LlmResult(
            // A null where the schema had an optional key is strict mode's "absent": it goes before validation.
            ProviderSchema::dropNulls(ProviderAnswer::answerJson($text, $key), $call->schema),
            $text,
            ProviderAnswer::usage($data->usage->input_tokens ?? null, $data->usage->output_tokens ?? null),
            is_string($data->model ?? null) ? $data->model : $this->config->model,
        );
    }

    /**
     * A part of a user turn (docs read 2026-10-06): a picture is an `input_image` whose `image_url` is a data URL, at
     * `high` detail so small print is read; text is an `input_text`.
     *
     * @param array<string, mixed> $part
     * @return array<string, string>
     */
    private static function sent(array $part): array
    {
        return $part['type'] === 'image'
            ? ['type' => 'input_image', 'image_url' => "data:{$part['mediaType']};base64,{$part['data']}", 'detail' => 'high']
            : ['type' => 'input_text', 'text' => $part['text']];
    }

    /**
     * The content parts of the first `message` item.
     *
     * @return list<mixed>
     */
    private static function messageContent(mixed $output): array
    {
        foreach (is_array($output) ? $output : [] as $item) {
            if ($item instanceof stdClass && ($item->type ?? null) === 'message') {
                return is_array($item->content ?? null) ? $item->content : [];
            }
        }
        return [];
    }

    /** @param list<mixed> $content */
    private static function part(array $content, string $type): ?stdClass
    {
        foreach ($content as $part) {
            if ($part instanceof stdClass && ($part->type ?? null) === $type) {
                return $part;
            }
        }
        return null;
    }
}
