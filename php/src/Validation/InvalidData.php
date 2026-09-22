<?php

declare(strict_types=1);

namespace NestFlyers\Validation;

use RuntimeException;

/**
 * A value that failed its schema. `fields` maps each bad field's dotted path
 * (`data.chips.0.label`, or `_` for the value itself) to a message, the way
 * the Node server's zod errors are reported. The HTTP layer turns it into
 * 400 `invalid`; the Seeder logs it.
 */
final class InvalidData extends RuntimeException
{
    /** @param array<string, string> $fields */
    public function __construct(public readonly array $fields)
    {
        // The message is for logs: every field, readable on one line.
        $list = [];
        foreach ($fields as $path => $message) {
            $list[] = "$path: $message";
        }
        parent::__construct(implode('; ', $list));
    }
}
