<?php

declare(strict_types=1);

namespace NestFlyers\Ai;

/** What a generation sends: the prompt (PromptBuilder), the JSON Schema the answer must fit, and the two limits. */
final class LlmCall
{
    /**
     * @param list<array{role:string, content:string}> $messages the turns, user and assistant, the staff text last
     * @param mixed $schema the shared JSON Schema from schema/ai.json (a Json::decode tree); each adapter turns it
     *        into its provider's dialect (ProviderSchema)
     * @param string $schemaName OpenAI's name for the format (Shared::ai()['schemaNames']); the fake reads the feature off it
     */
    public function __construct(
        public readonly string $system,
        public readonly array $messages,
        public readonly mixed $schema,
        public readonly string $schemaName,
        public readonly int $maxOutputTokens,
        public readonly int $timeoutMs,
    ) {
    }

    /** The last turn's text: the staff member's idea, or the flyer's fields (`messages.at(-1)` in Node). */
    public function lastTurn(): string
    {
        return $this->messages === [] ? '' : $this->messages[array_key_last($this->messages)]['content'];
    }
}
