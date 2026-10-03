<?php

declare(strict_types=1);

namespace NestFlyers\Ai;

/** What PromptBuilder makes: the system text and the turns, the staff member's text or the flyer's fields last. */
final class Prompt
{
    /** @param list<array{role:string, content:string}> $messages */
    public function __construct(
        public readonly string $system,
        public readonly array $messages,
    ) {
    }
}
