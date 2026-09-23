<?php

declare(strict_types=1);

namespace NestFlyers\Validation;

use Opis\JsonSchema\CompliantValidator;
use Opis\JsonSchema\Errors\ErrorFormatter;
use Opis\JsonSchema\Errors\ValidationError;
use Opis\JsonSchema\Validator;
use stdClass;

/**
 * What zod's parse() does, for PHP, against a generated JSON Schema: the one
 * pipeline both the flyer API (FlyerValidator) and the seed file (Seeder) go through.
 *
 * 1. Numbers must be finite. JSON can carry 1e400, PHP decodes it to INF, and
 *    JSON Schema has no way to refuse it (zod does: z.number() rejects Infinity).
 * 2. Strings flagged `x-nest-trim` are trimmed as JavaScript does, before
 *    their lengths are checked.
 * 3. opis checks the schema, collecting every error, not just the first.
 * 4. The SchemaNormalizer shapes the valid value like zod's output.
 *
 * Errors come back as dotted paths (InvalidData::$fields), as the Node server
 * reports zod issues: `data.chips.0.label`, `_` for the value itself.
 */
final class SchemaValidator
{
    /** Enough to name every bad field a real request could have. */
    private const MAX_ERRORS = 100;

    /** opis wraps the errors under these, so the leaves below are the fields to report. */
    private const CONTAINERS = ['properties', 'items', 'additionalProperties', ''];

    /** opis's own message for these says nothing useful ("should match at least one schema"). */
    private const UNIONS = ['anyOf', 'oneOf'];

    private readonly Validator $opis;
    private readonly ErrorFormatter $formatter;

    public function __construct(private readonly SchemaNormalizer $normalizer)
    {
        // The compliant flavour switches off opis's extensions, above all its
        // default-filling, which would write into the caller's data; defaults
        // are the normaliser's job, in zod's key order.
        $this->opis = (new CompliantValidator())->setMaxErrors(self::MAX_ERRORS)->setStopAtFirstError(false);
        $this->formatter = new ErrorFormatter();
    }

    /**
     * @param mixed $value a Json::decode() tree
     * @param object $schema the decoded JSON Schema
     * @return mixed the trimmed, normalised copy; $value itself is never changed
     * @throws InvalidData naming every bad field
     */
    public function validate(mixed $value, object $schema): mixed
    {
        $trimmed = $this->normalizer->trimFlagged($value, $schema);
        // One answer names every bad field, as zod does: the non-finite numbers
        // the schema cannot refuse on its own, plus everything opis found.
        $fields = array_fill_keys($this->normalizer->nonFinitePaths($trimmed, $schema), 'Must be a finite number.');
        $error = $this->opis->validate($trimmed, $schema)->error();
        if ($error !== null) {
            $this->collect($error, $fields);
        }
        if ($fields !== []) {
            throw new InvalidData($fields);
        }
        return $this->normalizer->normalize($trimmed, $schema);
    }

    /**
     * `data.chips.0.label`; the value itself (an empty path) is `_`, as the Node server writes it.
     * @param list<string|int> $path
     */
    public static function dotted(array $path): string
    {
        return $path === [] ? '_' : implode('.', array_map('strval', $path));
    }

    /**
     * Walks opis's error tree down to the leaves that name a field. `required`
     * names the missing children (`parent.child`, as zod reports them); a union
     * is reported at its own path, since which branch was meant is anyone's guess.
     * The first message for a path wins.
     * @param array<string, string> $fields
     */
    private function collect(ValidationError $error, array &$fields): void
    {
        $keyword = $error->keyword();
        $subErrors = $error->subErrors();
        if (in_array($keyword, self::CONTAINERS, true) && $subErrors !== []) {
            foreach ($subErrors as $sub) {
                $this->collect($sub, $fields);
            }
            return;
        }
        $path = $error->data()->fullPath();
        if ($keyword === 'required') {
            foreach ($error->args()['missing'] ?? [] as $missing) {
                $fields[self::dotted([...$path, $missing])] ??= 'Required.';
            }
            return;
        }
        $fields[self::dotted($path)] ??= $this->message($error);
    }

    private function message(ValidationError $error): string
    {
        if (in_array($error->keyword(), self::UNIONS, true)) {
            // The first branch's own complaint ("must match the type: integer") reads better.
            while ($error->subErrors() !== []) {
                $error = $error->subErrors()[0];
            }
        }
        return $this->formatter->formatErrorMessage($error);
    }
}
