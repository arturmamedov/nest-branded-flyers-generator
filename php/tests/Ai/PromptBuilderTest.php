<?php

declare(strict_types=1);

namespace NestFlyers\Tests\Ai;

use NestFlyers\Ai\AiDay;
use NestFlyers\Ai\PromptBuilder;
use NestFlyers\Json;
use NestFlyers\Shared;
use NestFlyers\Tests\Support\Paths;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use stdClass;

/**
 * The prompt both backends build from the bundle, the hostels and the day (tests/fixtures/ai-prompt.json, replayed by
 * Vitest too). Every byte is pinned: a provider sees the same request whichever backend made it.
 */
final class PromptBuilderTest extends TestCase
{
    private static function fixture(): stdClass
    {
        return Json::decode((string) file_get_contents(Paths::fixture('ai-prompt.json')));
    }

    /** The one line a picture read asks with: a shared fact (AI_PICTURE_ASK in src/shared/ai.ts). */
    private static function pictureAsk(): string
    {
        return Shared::fromFile(Paths::schema('shared.json'))->ai()['pictureAsk'];
    }

    /** @return array<string, array{stdClass}> */
    public static function cases(): array
    {
        $cases = [];
        foreach (self::fixture()->cases as $case) {
            $cases[$case->name] = [$case];
        }
        return $cases;
    }

    #[DataProvider('cases')]
    public function testThePromptIsTheOneNodeBuilds(stdClass $case): void
    {
        $v = self::fixture();
        $builder = new PromptBuilder((array) $v->bundle->prompts, $v->bundle->examples, new AiDay('Atlantic/Canary'), self::pictureAsk());
        $hostels = array_map(static fn (stdClass $h): array => (array) $h, $v->hostels);
        $prompt = match ($case->feature) {
            'flyer' => $builder->flyer($hostels, $v->now, $case->request),
            'share' => $builder->share($hostels, $v->now, $case->request),
            'photo' => $builder->photo((array) $case->request),
        };

        self::assertSame($case->system, $prompt->system);
        // A turn's parts are arrays in PHP (LlmCall): the vectors' objects, key for key.
        $content = static fn (mixed $c): mixed => is_array($c) ? array_map(static fn (stdClass $part): array => (array) $part, $c) : $c;
        self::assertSame(
            array_map(static fn (stdClass $m): array => ['role' => $m->role, 'content' => $content($m->content)], $case->messages),
            $prompt->messages,
        );
    }

    public function testAZeroIsAValueAndAnEmptyFieldIsLeftOut(): void
    {
        // JavaScript's truthiness: '0' prints, '' does not. PHP's empty() and a bare array_filter would drop both.
        $v = self::fixture();
        $builder = new PromptBuilder((array) $v->bundle->prompts, [], new AiDay('Atlantic/Canary'), self::pictureAsk());
        $data = (object) [
            'text' => (object) ['eyebrow' => '0', 'headline1' => '', 'headline2' => '0', 'headlineEs' => '', 'askEn' => '', 'askEs' => '', 'handle' => '', 'tag' => ''],
            'chips' => [(object) ['key' => 'cost', 'label' => 'Cost', 'value' => '0']],
            'extras' => ['0', ''],
            'week' => [],
        ];
        $facts = $builder->share([], $v->now, (object) ['hostel' => null, 'template' => 'activity', 'data' => $data])->messages[0]['content'];
        self::assertSame(
            "The flyer's fields:\nHostel: every hostel (chain-wide)\nTemplate: activity\nEyebrow: 0\nHeadline: 0\nCost: 0\nExtras: 0",
            $facts,
        );
    }
}
