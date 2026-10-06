<?php

declare(strict_types=1);

namespace NestFlyers\Ai;

/**
 * What a generation sends: the prompt (PromptBuilder), the model to ask, the JSON Schema the answer must fit, and the
 * two limits.
 */
final class LlmCall
{
    /**
     * @param string $model the model asked for: the feature's own (AiConfig::$models). One provider and one key
     *        serve every model.
     * @param list<array{role:string, content:string|list<array<string, mixed>>}> $messages the turns, user and
     *        assistant, the staff text last. A turn's content is its text, or parts when it carries a picture, the
     *        picture first: `['type' => 'text', 'text' => …]` and `['type' => 'image', 'mediaType' => …, 'data' =>
     *        <base64>, 'width' => …, 'height' => …]` (LlmPart in server/ai/provider.ts). The size in pixels is for
     *        the ledger and the fake; no adapter sends it. A text turn goes out as the string it is.
     * @param mixed $schema the shared JSON Schema from schema/ai.json (a Json::decode tree); each adapter turns it
     *        into its provider's dialect (ProviderSchema)
     * @param string $schemaName OpenAI's name for the format (Shared::ai()['schemaNames']); the fake reads the feature off it
     */
    public function __construct(
        public readonly string $model,
        public readonly string $system,
        public readonly array $messages,
        public readonly mixed $schema,
        public readonly string $schemaName,
        public readonly int $maxOutputTokens,
        public readonly int $timeoutMs,
    ) {
    }

    /** The last turn's text: the staff member's idea, or the flyer's fields (`textOf(messages.at(-1))` in Node). */
    public function lastTurn(): string
    {
        return $this->messages === [] ? '' : self::textOf($this->messages[array_key_last($this->messages)]['content']);
    }

    /**
     * The text of a turn: the string, or its text parts joined. What the fake reads its markers from.
     *
     * @param string|list<array<string, mixed>> $content
     */
    public static function textOf(string|array $content): string
    {
        if (is_string($content)) {
            return $content;
        }
        $texts = [];
        foreach ($content as $part) {
            if ($part['type'] === 'text') {
                $texts[] = $part['text'];
            }
        }
        return implode("\n", $texts);
    }
}
