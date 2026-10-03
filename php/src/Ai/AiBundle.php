<?php

declare(strict_types=1);

namespace NestFlyers\Ai;

use JsonException;
use NestFlyers\Json;
use NestFlyers\Validation\InvalidData;
use NestFlyers\Validation\SchemaValidator;
use RuntimeException;
use stdClass;

/**
 * schema/ai.json, as `npm run gen` writes it from src/shared/ and ai/prompts/: the prompts (with their limits), the
 * few-shot examples, and the schemas the answers and the requests are held to. Checked when it is read, as
 * AiBundleSchema.parse checks it in server/ai/bundle.ts, so a stale or broken release fails loudly instead of sending a
 * provider half a prompt. Read only when the AI is on.
 */
final class AiBundle
{
    private const SCHEMAS = ['flyerAnswer', 'shareAnswer', 'flyerRequest', 'shareRequest'];

    /**
     * @param array{flyer:string, share:string} $prompts
     * @param list<stdClass> $examples {text, answer}, each answer as AiFlyerAnswerSchema.parse() leaves it
     * @param array{flyerAnswer:stdClass, shareAnswer:stdClass, flyerRequest:stdClass, shareRequest:stdClass} $schemas
     */
    private function __construct(
        public readonly array $prompts,
        public readonly array $examples,
        public readonly array $schemas,
    ) {
    }

    /** @throws RuntimeException naming the file and what is wrong with it */
    public static function fromFile(string $path, SchemaValidator $validator): self
    {
        $json = @file_get_contents($path);
        if ($json === false) {
            throw new RuntimeException("Missing $path: the release is incomplete.");
        }
        try {
            $bundle = Json::decode($json);
        } catch (JsonException $e) {
            throw new RuntimeException("$path is not valid JSON: {$e->getMessage()}", 0, $e);
        }
        $damaged = static fn (string $what): RuntimeException => new RuntimeException("$path is damaged: $what; run npm run gen and upload the release whole.");

        $prompts = $bundle->prompts ?? null;
        if (!$prompts instanceof stdClass || !self::text($prompts->flyer ?? null) || !self::text($prompts->share ?? null)) {
            throw $damaged('prompts.flyer and prompts.share must be non-empty strings');
        }
        $schemas = [];
        foreach (self::SCHEMAS as $name) {
            $schema = $bundle->schemas->{$name} ?? null;
            if (!$schema instanceof stdClass) {
                throw $damaged("schemas.$name must be a JSON Schema object");
            }
            $schemas[$name] = $schema;
        }
        if (!is_array($bundle->examples ?? null)) {
            throw $damaged('examples must be a list');
        }
        $examples = [];
        foreach ($bundle->examples as $i => $example) {
            if (!$example instanceof stdClass || !is_string($example->text ?? null) || !property_exists($example, 'answer')) {
                throw $damaged("examples.$i must be {text, answer}");
            }
            try {
                $answer = $validator->validate($example->answer, $schemas['flyerAnswer']);
            } catch (InvalidData $e) {
                throw $damaged("examples.$i.answer fails the flyer answer's schema (" . implode(', ', array_keys($e->fields)) . ')');
            }
            $examples[] = (object) ['text' => $example->text, 'answer' => $answer];
        }
        return new self(['flyer' => $prompts->flyer, 'share' => $prompts->share], $examples, $schemas);
    }

    private static function text(mixed $value): bool
    {
        return is_string($value) && $value !== '';
    }
}
