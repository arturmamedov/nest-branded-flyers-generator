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
    /** @var array<string, mixed> Shared::ai() */
    private array $ai;

    protected function setUp(): void
    {
        $examples = Json::decode((string) file_get_contents(Paths::schema('ai.json')))->examples;
        $this->example = $examples[0];
        $this->ai = Shared::fromFile(Paths::schema('shared.json'))->ai();
        $this->fake = new FakeProvider($examples, $this->ai);
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

    // What the brief asks of it: a read followed by Generate gives that example's flyer.
    public function testAPictureReadGetsTheFirstExamplesTextTheWordsThatExamplesFlyerIsMadeFrom(): void
    {
        $answer = $this->fake->complete($this->read(640));
        JsonAssert::same((object) ['text' => $this->example->text], $answer->json);
        self::assertSame(Json::encode(['text' => $this->example->text]), $answer->raw);
        self::assertSame([10, 20, 'fake-1'], [$answer->usage?->input, $answer->usage?->output, $answer->model]);
        JsonAssert::same($this->example->answer, $this->fake->complete(self::call($this->example->text))->json);
    }

    public function testThePicturesWidthSteersItOnAReadWhichHasNoTypedTextToCarryAMarker(): void
    {
        $widths = $this->ai['fake']['pictureWidths'];
        JsonAssert::same((object) ['text' => 42], $this->fake->complete($this->read($widths['invalid']))->json);
        JsonAssert::same((object) ['text' => ''], $this->fake->complete($this->read($widths['noWords']))->json);
        foreach (['timeout', 'refused'] as $reason) {
            try {
                $this->fake->complete($this->read($widths[$reason]));
                self::fail("No failure for a picture {$widths[$reason]} px wide");
            } catch (LlmFailure $e) {
                self::assertSame($reason, $e->reason);
            }
        }
        // The height is no steer, and a width means nothing to the other features.
        JsonAssert::same((object) ['text' => $this->example->text], $this->fake->complete($this->read(640, $widths['timeout']))->json);
        JsonAssert::same($this->example->answer, $this->fake->complete($this->read($widths['timeout'], 8, 'nest_flyer_brief'))->json);
    }

    public function testAMarkerInAnEarlierTurnDoesNothing(): void
    {
        $call = new LlmCall('fake-1', '', [
            ['role' => 'user', 'content' => '[[fake:timeout]]'],
            ['role' => 'assistant', 'content' => '{}'],
            ['role' => 'user', 'content' => 'Yoga at 9'],
        ], new stdClass(), 'nest_flyer_brief', 1, 1);
        JsonAssert::same($this->example->answer, $this->fake->complete($call)->json);
    }

    public function testItNamesItself(): void
    {
        self::assertSame('fake', $this->fake->name());
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

    /** A picture read's call: one turn, a picture this wide and the line that asks for its words. */
    private function read(int $width, int $height = 8, string $schemaName = 'nest_picture_text'): LlmCall
    {
        $picture = ['type' => 'image', 'mediaType' => 'image/png', 'data' => 'AAAA', 'width' => $width, 'height' => $height];
        return new LlmCall('fake-1', '', [['role' => 'user', 'content' => [$picture, ['type' => 'text', 'text' => $this->ai['pictureAsk']]]]], new stdClass(), $schemaName, 1, 1);
    }

    private static function call(string $text, string $schemaName = 'nest_flyer_brief'): LlmCall
    {
        return new LlmCall('fake-1', '', [
            ['role' => 'user', 'content' => 'an example'],
            ['role' => 'assistant', 'content' => '{}'],
            ['role' => 'user', 'content' => $text],
        ], new stdClass(), $schemaName, 1, 1);
    }
}
