<?php

declare(strict_types=1);

namespace NestFlyers\Ai;

use Closure;
use stdClass;

/**
 * One shared JSON Schema (schema/ai.json, generated from src/shared/schema.ts), two providers' dialects of it: the twin
 * of server/ai/providerSchema.ts, held to tests/fixtures/ai-provider-schema.json. OpenAI's strict mode wants every
 * property in `required`, an optional one as a null union, and nothing open; Anthropic takes optional properties but
 * refuses length limits, which move into the description so the model still knows them. Both lose `$schema` and the
 * `x-*` keywords zod adds for PHP. The answer is validated against the original schema afterwards, limits included.
 *
 * Schemas and answers are Json::decode() trees (objects are stdClass, so {} stays {}); every result is a new tree and
 * the input is never changed.
 */
final class ProviderSchema
{
    /** The limits Anthropic refuses, and the words that replace each in the description. */
    private const LIMIT_NOTES = [
        'minLength' => ['At least %s character', 'At least %s characters'],
        'maxLength' => ['At most %s character', 'At most %s characters'],
        'minItems' => ['At least %s item', 'At least %s items'],
        'maxItems' => ['At most %s item', 'At most %s items'],
        'minimum' => ['At least %s', 'At least %s'],
        'maximum' => ['At most %s', 'At most %s'],
    ];

    private function __construct()
    {
    }

    /** The schema as `text.format` (`strict: true`) on the Responses API takes it. */
    public static function toOpenAi(mixed $schema): mixed
    {
        return self::walk($schema, static function (stdClass $node): stdClass {
            if (!($node->properties ?? null) instanceof stdClass) {
                return $node;
            }
            $required = is_array($node->required ?? null) ? $node->required : [];
            $properties = new stdClass();
            foreach (get_object_vars($node->properties) as $name => $property) {
                $properties->{$name} = in_array($name, $required, true) ? $property : self::nullable($property);
            }
            $out = clone $node;
            $out->properties = $properties;
            $out->required = array_keys(get_object_vars($properties));
            $out->additionalProperties = false;
            return $out;
        });
    }

    /** The schema as `output_config.format` on the Messages API takes it. */
    public static function toAnthropic(mixed $schema): mixed
    {
        return self::walk($schema, static function (stdClass $node): stdClass {
            $out = new stdClass();
            $notes = [];
            foreach (get_object_vars($node) as $key => $value) {
                if (isset(self::LIMIT_NOTES[$key]) && (is_int($value) || is_float($value))) {
                    $notes[] = sprintf(self::LIMIT_NOTES[$key][$value == 1 ? 0 : 1], self::number($value)) . '.';
                } else {
                    $out->{$key} = $value;
                }
            }
            if ($notes !== []) {
                $words = is_string($out->description ?? null) && $out->description !== '' ? [$out->description] : [];
                $out->description = implode(' ', [...$words, ...$notes]);
            }
            if (($out->properties ?? null) instanceof stdClass) {
                $out->additionalProperties = false;
            }
            return $out;
        });
    }

    /**
     * An OpenAI answer read back against the original schema: a null where the key was optional means the key is
     * absent, and goes; a null where the key was required stays, for the validator to refuse.
     */
    public static function dropNulls(mixed $value, mixed $schema): mixed
    {
        $s = self::valueSchema($schema);
        if (is_array($value)) {
            return array_map(static fn (mixed $item): mixed => self::dropNulls($item, $s?->items ?? null), $value);
        }
        if (!$value instanceof stdClass || $s === null || !($s->properties ?? null) instanceof stdClass) {
            return $value;
        }
        $required = is_array($s->required ?? null) ? $s->required : [];
        $out = new stdClass();
        foreach (get_object_vars($value) as $key => $v) {
            if ($v === null && !in_array($key, $required, true)) {
                continue;
            }
            $out->{$key} = self::dropNulls($v, $s->properties->{$key} ?? null);
        }
        return $out;
    }

    /**
     * Walks a schema, rewriting every node with $rewrite after its children (properties, items, anyOf branches) are
     * done. Dropping `$schema` and `x-*` happens on the way down, on a copy.
     *
     * @param Closure(stdClass): stdClass $rewrite
     */
    private static function walk(mixed $node, Closure $rewrite): mixed
    {
        if (!$node instanceof stdClass) {
            return $node;
        }
        $out = new stdClass();
        foreach (get_object_vars($node) as $key => $value) {
            if ($key !== '$schema' && !str_starts_with((string) $key, 'x-')) {
                $out->{$key} = $value;
            }
        }
        if (($out->properties ?? null) instanceof stdClass) {
            $properties = new stdClass();
            foreach (get_object_vars($out->properties) as $name => $property) {
                $properties->{$name} = self::walk($property, $rewrite);
            }
            $out->properties = $properties;
        }
        if (property_exists($out, 'items')) {
            $out->items = self::walk($out->items, $rewrite);
        }
        if (is_array($out->anyOf ?? null)) {
            $out->anyOf = array_map(static fn (mixed $branch): mixed => self::walk($branch, $rewrite), $out->anyOf);
        }
        return $rewrite($out);
    }

    /** An optional property as strict mode takes it: required, and null for "absent". */
    private static function nullable(mixed $property): mixed
    {
        return self::allowsNull($property) ? $property : (object) ['anyOf' => [$property, (object) ['type' => 'null']]];
    }

    private static function allowsNull(mixed $property): bool
    {
        if (!$property instanceof stdClass || !is_array($property->anyOf ?? null)) {
            return false;
        }
        foreach ($property->anyOf as $branch) {
            if ($branch instanceof stdClass && ($branch->type ?? null) === 'null') {
                return true;
            }
        }
        return false;
    }

    /** The branch of a nullable property that describes its value. */
    private static function valueSchema(mixed $schema): ?stdClass
    {
        if (!$schema instanceof stdClass) {
            return null;
        }
        if (is_array($schema->anyOf ?? null)) {
            foreach ($schema->anyOf as $branch) {
                if ($branch instanceof stdClass && ($branch->type ?? null) !== 'null') {
                    return $branch;
                }
            }
            return null;
        }
        return $schema;
    }

    /** A number as JavaScript's template literal prints it: 0.25, -2, 12. */
    private static function number(int|float $n): string
    {
        return is_float($n) && floor($n) === $n && abs($n) < 1e15 ? (string) (int) $n : (string) $n;
    }
}
