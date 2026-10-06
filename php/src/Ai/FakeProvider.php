<?php

declare(strict_types=1);

namespace NestFlyers\Ai;

use NestFlyers\Json;
use stdClass;

/**
 * The provider the tests and a demo run on: deterministic answers from the bundle's first example, never the network.
 * The last user turn steers it: a marker in its text (Shared::ai()['fake']['markers']), or on a picture read, which
 * has no typed text, the picture's width (…['pictureWidths']). So the contract suite can ask for every failure over
 * HTTP. The twin of server/ai/providers/fake.ts; docs/api-contract.md names the markers and the widths.
 */
final class FakeProvider implements LlmProvider
{
    /** @var array{model:string, unknownHostel:string, markers:array{invalid:string, unknownHostel:string, timeout:string, refused:string}, pictureWidths:array{invalid:int, timeout:int, refused:int, noWords:int}} */
    private readonly array $fake;
    /** @var array{flyer:string, share:string, photo:string} the answer formats' names: the feature is read off them */
    private readonly array $schemaNames;

    /**
     * @param list<stdClass> $examples the bundle's few-shot examples ({text, answer})
     * @param array<string, mixed> $ai Shared::ai()
     */
    public function __construct(
        private readonly array $examples,
        array $ai,
    ) {
        $this->fake = $ai['fake'];
        $this->schemaNames = $ai['schemaNames'];
    }

    public function name(): string
    {
        return 'fake';
    }

    public function complete(LlmCall $call): LlmResult
    {
        $feature = match ($call->schemaName) {
            $this->schemaNames['photo'] => 'photo',
            $this->schemaNames['share'] => 'share',
            default => 'flyer',
        };
        $text = $call->lastTurn();
        $width = $call->lastPictureWidth();
        $markers = $this->fake['markers'];
        $widths = $this->fake['pictureWidths'];
        // Whether this call asks for that answer: by a marker in its text, or on a read by its picture's width.
        $asked = static fn (string $what): bool => $feature === 'photo' ? $width === $widths[$what] : str_contains($text, $markers[$what]);
        if ($asked('timeout')) {
            throw new LlmFailure(LlmFailure::TIMEOUT, 'The fake provider timed out, as asked');
        }
        if ($asked('refused')) {
            throw new LlmFailure(LlmFailure::REFUSED, 'The fake provider refused, as asked');
        }

        $example = $this->examples[0] ?? throw new LlmFailure(LlmFailure::PROVIDER, 'The bundle holds no example to answer with');
        // A deep copy: the answer may be changed below, and the bundle's own example must not be.
        $answer = Json::decode(Json::encode($example->answer));
        $json = match (true) {
            // The words the first example's flyer is made from: a read followed by Generate gives that example's flyer.
            $feature === 'photo' => (object) ['text' => $asked('invalid') ? 42 : ($width === $widths['noWords'] ? '' : $example->text)],
            $asked('invalid') => $feature === 'share' ? (object) ['share' => 42] : (object) ['brief' => 42, 'assumptions' => []],
            $feature === 'share' => (object) ['share' => $answer->brief->share ?? ''],
            str_contains($text, $markers['unknownHostel']) => self::withHostel($answer, $this->fake['unknownHostel']),
            default => $answer,
        };
        return new LlmResult($json, Json::encode($json), new LlmUsage(10, 20), $this->fake['model']);
    }

    private static function withHostel(stdClass $answer, string $slug): stdClass
    {
        $answer->brief->hostel = $slug;
        return $answer;
    }
}
