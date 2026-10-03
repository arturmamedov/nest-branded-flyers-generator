<?php

declare(strict_types=1);

namespace NestFlyers\Tests\Ai;

use NestFlyers\Ai\ProviderSchema;
use NestFlyers\Json;
use NestFlyers\Tests\Support\JsonAssert;
use NestFlyers\Tests\Support\Paths;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/** One shared JSON Schema, two providers' dialects (tests/fixtures/ai-provider-schema.json, replayed by Vitest too). */
final class ProviderSchemaTest extends TestCase
{
    private static function fixture(): object
    {
        return Json::decode((string) file_get_contents(Paths::fixture('ai-provider-schema.json')));
    }

    /** @return array<string, array{mixed, mixed, mixed}> */
    public static function schemas(): array
    {
        $cases = [];
        foreach (self::fixture()->cases as $case) {
            $cases[$case->name] = [$case->input, $case->openai, $case->anthropic];
        }
        return $cases;
    }

    #[DataProvider('schemas')]
    public function testOpenAiStrictMode(mixed $input, mixed $openai): void
    {
        JsonAssert::same($openai, ProviderSchema::toOpenAi($input));
    }

    #[DataProvider('schemas')]
    public function testAnthropic(mixed $input, mixed $openai, mixed $anthropic): void
    {
        JsonAssert::same($anthropic, ProviderSchema::toAnthropic($input));
    }

    #[DataProvider('schemas')]
    public function testTheInputIsLeftUntouched(mixed $input): void
    {
        $before = Json::encode($input);
        ProviderSchema::toOpenAi($input);
        ProviderSchema::toAnthropic($input);
        self::assertSame($before, Json::encode($input));
    }

    /** @return array<string, array{mixed, mixed, mixed}> */
    public static function nulls(): array
    {
        $fixture = self::fixture();
        $inputs = [];
        foreach ($fixture->cases as $case) {
            $inputs[$case->name] = $case->input;
        }
        $cases = [];
        foreach ($fixture->dropNulls as $case) {
            $cases[$case->name] = [$case->in, $inputs[$case->case], $case->out];
        }
        return $cases;
    }

    #[DataProvider('nulls')]
    public function testDropNulls(mixed $in, mixed $schema, mixed $out): void
    {
        JsonAssert::same($out, ProviderSchema::dropNulls($in, $schema));
    }
}
