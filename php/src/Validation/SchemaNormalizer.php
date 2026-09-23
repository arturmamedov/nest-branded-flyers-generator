<?php

declare(strict_types=1);

namespace NestFlyers\Validation;

use LogicException;
use stdClass;

/**
 * Turns an already-valid value into exactly what zod's parse() returns for the
 * same schema, driven by the generated JSON Schema (schema/*.schema.json) so
 * the rules are never hand-copied into PHP:
 * - absent keys that have a `default` get a fresh copy of it;
 * - unknown keys are dropped at every level, except where `additionalProperties`
 *   is a schema (a zod record such as data.overrides): those keys are kept and
 *   their values shaped by that schema;
 * - keys come out in `properties` order, the order zod writes them in;
 * - arrays are shaped item by item, `anyOf` [X, null] follows the branch that
 *   fits the value;
 * - a zero float becomes int 0, because JSON.stringify writes -0 as 0 and PHP
 *   would write "-0"; an integral float where the schema says `integer`
 *   becomes an int (JSON's 1.0 is JavaScript's 1).
 *
 * It also applies the `x-nest-trim` flag (trimFlagged), which the validator
 * must do before checking lengths, as zod's .trim() does.
 *
 * Every result is a new tree: objects are never shared with the input or the
 * schema, so callers may change what they get back.
 */
final class SchemaNormalizer
{
    /**
     * Keywords that would change the output's shape in ways this walker does
     * not follow. The generated schemas don't use them today; if a schema
     * change brings one in, fail loudly instead of silently mis-shaping data.
     */
    private const UNSUPPORTED = [
        '$ref', '$dynamicRef', 'allOf', 'oneOf', 'if', 'patternProperties', 'prefixItems', 'unevaluatedProperties',
    ];

    /** Doubles hold every integer up to 2^53 exactly; past that an int cast would invent digits. */
    private const MAX_SAFE_INTEGER = 9007199254740991;

    /**
     * @param mixed $value a Json::decode() tree (stdClass objects, list arrays) that passed validation
     * @param object $schema the decoded JSON Schema describing it
     * @return mixed the shaped copy
     */
    public function normalize(mixed $value, object $schema): mixed
    {
        return $this->shape($value, $schema);
    }

    /**
     * A copy of $value with every string whose schema carries `x-nest-trim`
     * trimmed the way JavaScript's trim() does. Nothing else changes: unknown
     * keys stay, so validation still sees the body as it was sent.
     */
    public function trimFlagged(mixed $value, object $schema): mixed
    {
        return $this->trim($value, $schema);
    }

    /**
     * Dotted paths of every INF or NAN the schema actually declares (JSON can
     * carry 1e400, PHP decodes it to INF, and JSON Schema cannot refuse it —
     * zod's z.number() does). Keys the schema drops are not looked at, exactly
     * as zod never validates what z.object() strips, so a junk key carrying
     * 1e400 is no more an error here than it is on the Node server.
     *
     * @return list<string>
     */
    public function nonFinitePaths(mixed $value, object $schema): array
    {
        $paths = [];
        $this->findNonFinite($value, $schema, [], $paths);
        return $paths;
    }

    /**
     * @param list<string|int> $path
     * @param list<string> $paths
     */
    private function findNonFinite(mixed $value, mixed $schema, array $path, array &$paths): void
    {
        if (is_float($value) && !is_finite($value)) {
            $paths[] = SchemaValidator::dotted($path);
            return;
        }
        if (!is_object($schema)) {
            return; // a boolean schema declares nothing to descend into
        }
        if (property_exists($schema, 'anyOf')) {
            $this->findNonFinite($value, self::branch($schema->anyOf, $value), $path, $paths);
            return;
        }
        if ($value instanceof stdClass) {
            $declared = self::declared($schema);
            $extra = $schema->additionalProperties ?? false;
            foreach (get_object_vars($value) as $key => $item) {
                $known = array_key_exists($key, $declared);
                if (!$known && $extra === false) {
                    continue; // stripped, so never reported
                }
                $this->findNonFinite($item, $known ? $declared[$key] : $extra, [...$path, $key], $paths);
            }
            return;
        }
        if (is_array($value) && property_exists($schema, 'items')) {
            foreach ($value as $index => $item) {
                $this->findNonFinite($item, $schema->items, [...$path, $index], $paths);
            }
        }
    }

    private function shape(mixed $value, mixed $schema): mixed
    {
        if (!is_object($schema)) {
            return self::copy($value); // a boolean schema says nothing about shape
        }
        self::assertSupported($schema);
        if (property_exists($schema, 'anyOf')) {
            return $this->shape($value, self::branch($schema->anyOf, $value));
        }
        if ($value instanceof stdClass) {
            return self::describesObject($schema) ? $this->shapeObject($value, $schema) : self::copy($value);
        }
        if (is_array($value)) {
            return property_exists($schema, 'items')
                ? array_map(fn (mixed $item): mixed => $this->shape($item, $schema->items), $value)
                : self::copy($value);
        }
        if (is_float($value)) {
            return self::number($value, $schema);
        }
        return $value;
    }

    private function shapeObject(stdClass $value, object $schema): stdClass
    {
        $in = get_object_vars($value);
        $declared = self::declared($schema);
        $out = new stdClass();
        foreach ($declared as $key => $propertySchema) {
            if (array_key_exists($key, $in)) {
                $out->{$key} = $this->shape($in[$key], $propertySchema);
            } elseif (is_object($propertySchema) && property_exists($propertySchema, 'default')) {
                // zod 4 returns a default as is, without parsing it, so a copy is all it needs.
                $out->{$key} = self::copy($propertySchema->default);
            }
        }
        // Absent or false additionalProperties strips like zod's z.object(); a schema (a record) keeps the keys.
        $extra = $schema->additionalProperties ?? false;
        if ($extra !== false) {
            foreach ($in as $key => $item) {
                if (!array_key_exists($key, $declared)) {
                    $out->{$key} = $this->shape($item, $extra);
                }
            }
        }
        return $out;
    }

    private function trim(mixed $value, mixed $schema): mixed
    {
        if (!is_object($schema)) {
            return self::copy($value);
        }
        self::assertSupported($schema);
        if (property_exists($schema, 'anyOf')) {
            return $this->trim($value, self::branch($schema->anyOf, $value));
        }
        if (is_string($value)) {
            return ($schema->{'x-nest-trim'} ?? false) === true ? JsTrim::trim($value) : $value;
        }
        if ($value instanceof stdClass) {
            $declared = self::declared($schema);
            $extra = $schema->additionalProperties ?? true;
            $out = new stdClass();
            foreach (get_object_vars($value) as $key => $item) {
                $out->{$key} = $this->trim($item, array_key_exists($key, $declared) ? $declared[$key] : $extra);
            }
            return $out;
        }
        if (is_array($value)) {
            return property_exists($schema, 'items')
                ? array_map(fn (mixed $item): mixed => $this->trim($item, $schema->items), $value)
                : self::copy($value);
        }
        return $value;
    }

    /** @return array<string|int, mixed> the `properties` map (numeric names come back as int keys, as PHP arrays do) */
    private static function declared(object $schema): array
    {
        return isset($schema->properties) && is_object($schema->properties) ? get_object_vars($schema->properties) : [];
    }

    private static function describesObject(object $schema): bool
    {
        return property_exists($schema, 'properties')
            || property_exists($schema, 'additionalProperties')
            || in_array('object', self::types($schema), true);
    }

    /**
     * The first anyOf branch whose `type` admits the value, as zod's union
     * returns the first option that parses. The value is already valid, so one fits.
     * @param list<mixed> $branches
     */
    private static function branch(array $branches, mixed $value): mixed
    {
        $types = self::jsonTypes($value);
        foreach ($branches as $branch) {
            if ($branch === true) {
                return $branch;
            }
            if (is_object($branch)) {
                $allowed = self::types($branch);
                if ($allowed === [] || array_intersect($allowed, $types) !== []) {
                    return $branch;
                }
            }
        }
        return $branches[0] ?? true;
    }

    private static function number(float $value, object $schema): int|float
    {
        if ($value == 0.0) {
            return 0; // -0.0 too: they compare equal
        }
        if (in_array('integer', self::types($schema), true) && self::isSafeIntegral($value)) {
            return (int) $value;
        }
        return $value;
    }

    private static function isSafeIntegral(float $value): bool
    {
        return is_finite($value) && floor($value) === $value && abs($value) <= self::MAX_SAFE_INTEGER;
    }

    /** @return list<string> the schema's `type`, as a list (it may be a string or an array) */
    private static function types(object $schema): array
    {
        return property_exists($schema, 'type') ? array_values((array) $schema->type) : [];
    }

    /** @return list<string> every JSON Schema type name the value satisfies */
    private static function jsonTypes(mixed $value): array
    {
        return match (true) {
            $value === null => ['null'],
            is_bool($value) => ['boolean'],
            is_int($value) => ['integer', 'number'],
            is_float($value) => self::isSafeIntegral($value) ? ['integer', 'number'] : ['number'],
            is_string($value) => ['string'],
            is_array($value) => ['array'],
            default => ['object'],
        };
    }

    /** A deep copy that shares no objects with the original, with zero floats written as JavaScript would. */
    private static function copy(mixed $value): mixed
    {
        if ($value instanceof stdClass) {
            $out = new stdClass();
            foreach (get_object_vars($value) as $key => $item) {
                $out->{$key} = self::copy($item);
            }
            return $out;
        }
        if (is_array($value)) {
            return array_map(self::copy(...), $value);
        }
        if (is_float($value) && $value == 0.0) {
            return 0;
        }
        return $value;
    }

    private static function assertSupported(object $schema): void
    {
        foreach (self::UNSUPPORTED as $keyword) {
            if (property_exists($schema, $keyword)) {
                throw new LogicException("SchemaNormalizer does not follow '$keyword'; extend it before the schema uses it.");
            }
        }
    }
}
