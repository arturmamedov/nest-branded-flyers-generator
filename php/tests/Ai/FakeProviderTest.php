<?php

declare(strict_types=1);

namespace NestFlyers\Tests\Ai;

use NestFlyers\Ai\FakeProvider;
use NestFlyers\Ai\LlmCall;
use NestFlyers\Ai\LlmFailure;
use NestFlyers\Json;
use NestFlyers\Shared;
use NestFlyers\Tests\Support\JsonAssert;
use NestFlyers\Tests\Support\Paths;
use PHPUnit\Framework\TestCase;
use stdClass;

/** The provider the contract suite runs on (the twin of the Node block in tests/unit/ai-providers.test.ts). */
final class FakeProviderTest extends TestCase
{
    private FakeProvider $fake;
    private stdClass $example;

    protected function setUp(): void
    {
        $examples = Json::decode((string) file_get_contents(Paths::schema('ai.json')))->examples;
        $this->example = $examples[0];
        $this->fake = new FakeProvider($examples, Shared::fromFile(Paths::schema('shared.json'))->ai());
    }

    public function testAFlyerCallGetsTheFirstExampleAndAShareCallItsShareText(): void
    {
        $flyer = $this->fake->complete(self::call('Yoga at 9'));
        JsonAssert::same($this->example->answer, $flyer->json);
        self::assertSame(Json::encode($this->example->answer), $flyer->raw);
        self::assertSame([10, 20], [$flyer->usage?->input, $flyer->usage?->output]);
        self::assertSame('fake-1', $flyer->model);

        $share = $this->fake->complete(self::call('fields', 'nest_share_text'));
        JsonAssert::same((object) ['share' => $this->example->answer->brief->share], $share->json);
    }

    public function testAMarkerInTheLastUserTurnSteersIt(): void
    {
        JsonAssert::same((object) ['brief' => 42, 'assumptions' => []], $this->fake->complete(self::call('Yoga [[fake:invalid]]'))->json);
        JsonAssert::same((object) ['share' => 42], $this->fake->complete(self::call('x [[fake:invalid]]', 'nest_share_text'))->json);
        $unknown = $this->fake->complete(self::call('Yoga [[fake:unknown-hostel]]'))->json;
        self::assertSame('no-such-nest', $unknown->brief->hostel);
        self::assertNotSame('no-such-nest', $this->example->answer->brief->hostel, 'the bundle\'s own example is left alone');
        self::assertSame('timeout', self::failure('[[fake:timeout]]')->reason);
        self::assertSame('refused', self::failure('[[fake:refused]]')->reason);
    }

    public function testAMarkerInAnEarlierTurnDoesNothing(): void
    {
        $call = new LlmCall('', [
            ['role' => 'user', 'content' => '[[fake:timeout]]'],
            ['role' => 'assistant', 'content' => '{}'],
            ['role' => 'user', 'content' => 'Yoga at 9'],
        ], new stdClass(), 'nest_flyer_brief', 1, 1);
        JsonAssert::same($this->example->answer, $this->fake->complete($call)->json);
    }

    public function testItNamesItself(): void
    {
        self::assertSame('fake', $this->fake->name());
        self::assertSame('fake-1', $this->fake->model());
    }

    private function failure(string $text): LlmFailure
    {
        try {
            $this->fake->complete(self::call($text));
        } catch (LlmFailure $e) {
            return $e;
        }
        self::fail("No failure for $text");
    }

    private static function call(string $text, string $schemaName = 'nest_flyer_brief'): LlmCall
    {
        return new LlmCall('', [
            ['role' => 'user', 'content' => 'an example'],
            ['role' => 'assistant', 'content' => '{}'],
            ['role' => 'user', 'content' => $text],
        ], new stdClass(), $schemaName, 1, 1);
    }
}
