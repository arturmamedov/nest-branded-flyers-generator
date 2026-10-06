<?php

declare(strict_types=1);

namespace NestFlyers\Ai;

use NestFlyers\Json;
use stdClass;

/**
 * The provider the tests and a demo run on: deterministic answers from the bundle's first example, never the network.
 * The last user turn steers it (Shared::ai()['fake']['markers']), so the contract suite can ask for every failure
 * over HTTP. The twin of server/ai/providers/fake.ts; docs/api-contract.md names the markers.
 */
final class FakeProvider implements LlmProvider
{
    /** @var array{model:string, unknownHostel:string, markers:array{invalid:string, unknownHostel:string, timeout:string, refused:string}} */
    private readonly array $fake;
    private readonly string $shareSchema;

    /**
     * @param list<stdClass> $examples the bundle's few-shot examples ({text, answer})
     * @param array<string, mixed> $ai Shared::ai()
     */
    public function __construct(
        private readonly array $examples,
        array $ai,
    ) {
        $this->fake = $ai['fake'];
        $this->shareSchema = $ai['schemaNames']['share'];
    }

    public function name(): string
    {
        return 'fake';
    }

    public function complete(LlmCall $call): LlmResult
    {
        $text = $call->lastTurn();
        $markers = $this->fake['markers'];
        $asked = static fn (string $marker): bool => str_contains($text, $marker);
        if ($asked($markers['timeout'])) {
            throw new LlmFailure(LlmFailure::TIMEOUT, 'The fake provider timed out, as asked');
        }
        if ($asked($markers['refused'])) {
            throw new LlmFailure(LlmFailure::REFUSED, 'The fake provider refused, as asked');
        }

        $example = $this->examples[0] ?? throw new LlmFailure(LlmFailure::PROVIDER, 'The bundle holds no example to answer with');
        // A deep copy: the answer may be changed below, and the bundle's own example must not be.
        $answer = Json::decode(Json::encode($example->answer));
        $share = $call->schemaName === $this->shareSchema;
        $json = match (true) {
            $asked($markers['invalid']) => $share ? (object) ['share' => 42] : (object) ['brief' => 42, 'assumptions' => []],
            $share => (object) ['share' => $answer->brief->share ?? ''],
            $asked($markers['unknownHostel']) => self::withHostel($answer, $this->fake['unknownHostel']),
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
