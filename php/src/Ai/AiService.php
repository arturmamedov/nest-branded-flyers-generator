<?php

declare(strict_types=1);

namespace NestFlyers\Ai;

use NestFlyers\Domain\AiUsageRepository;
use NestFlyers\Domain\Clock;
use NestFlyers\Domain\HostelRepository;
use NestFlyers\Http\ErrorCatalog;
use NestFlyers\Http\HttpError;
use NestFlyers\Image\StoredImage;
use NestFlyers\Shared;
use NestFlyers\Validation\InvalidData;
use NestFlyers\Validation\JsTrim;
use NestFlyers\Validation\SchemaValidator;
use stdClass;
use Throwable;

/**
 * A generation, end to end (docs/api-contract.md, "The AI assistant"): the checks in their order, the prompt, the
 * provider, the answer held to its schema, the ledger record, what is left. The twin of server/ai/service.ts. It owns no
 * HTTP (the routes pass the actor and the body and send what comes back) and no storage detail (the ledger is a
 * repository). The provider is never called while the store's lock is held: the count comes first and lets go, the
 * record comes after.
 */
final class AiService
{
    private readonly AiDay $day;
    private readonly PromptBuilder $prompts;
    /** @var array{inputMax:int, assumptionsMax:int, maxOutputTokens:int, features:list<string>, featureNouns:array<string, string>, schemaNames:array{flyer:string, share:string}} */
    private readonly array $facts;

    /**
     * @param LlmProvider|null $provider null when the AI is off: every feature then answers ai_off
     * @param int $timeoutMs the provider call's limit (config.php's ai.timeoutMs, or the shared default)
     */
    public function __construct(
        private readonly ?LlmProvider $provider,
        private readonly AiPolicy $policy,
        private readonly AiBundle $bundle,
        private readonly HostelRepository $hostels,
        private readonly AiUsageRepository $usage,
        private readonly Clock $clock,
        /** Where a picture read keeps its picture, before the provider is asked. */
        private readonly AiPictures $pictures,
        private readonly int $timeoutMs,
        /** @var array<string, string> the model each feature's calls name (AiConfig::$models) */
        private readonly array $models,
        Shared $shared,
        private readonly ErrorCatalog $errors,
        private readonly SchemaValidator $validator,
    ) {
        $this->facts = $shared->ai();
        $this->day = new AiDay($this->facts['dayZone']);
        $this->prompts = new PromptBuilder($bundle->prompts, $bundle->examples, $this->day, $this->facts['pictureAsk']);
    }

    /**
     * The `ai` block of api/config for this actor: nothing beyond `enabled: false` when they get no AI, or when the
     * ledger cannot be read (one log line then says why); else the features that run, each with its own limit and
     * what is left of it today, so the editor shows only those. One read of the ledger answers every feature's count.
     *
     * @return array{enabled:false}|array{enabled:true, features:list<array{name:string, limit:int, remaining:int}>}
     */
    public function status(Actor $actor): array
    {
        $features = $this->running();
        if ($this->provider === null || $features === [] || !$this->policy->mayUse($actor)) {
            return ['enabled' => false];
        }
        try {
            $used = $this->usage->countOk($actor->id, $this->day->day($this->clock->now()));
        } catch (Throwable $e) {
            // The editor renders nothing without api/config, so the AI's own storage never decides whether the app
            // loads: a ledger that cannot be read hides the AI. The generation routes are not softened.
            error_log("Nest flyers: AI: the ledger cannot be read, so the AI is hidden: {$e->getMessage()}");
            return ['enabled' => false];
        }
        return [
            'enabled' => true,
            'features' => array_map(function (string $name) use ($actor, $used): array {
                $limit = $this->policy->dailyLimit($actor, $name);
                return ['name' => $name, 'limit' => $limit, 'remaining' => max(0, $limit - ($used[$name] ?? 0))];
            }, $features),
        ];
    }

    /**
     * An idea → a brief with its assumptions. A hostel the staff member chose wins over the model's; one the model
     * made up becomes chain-wide, said in the first assumption, which takes the model's last one's place on a full list.
     *
     * @return array{brief:stdClass, assumptions:list<stdClass>, remaining:int}
     * @throws HttpError ai_off, ai_forbidden, ai_input, unknown_hostel, ai_quota, ai_failed
     */
    public function flyer(Actor $actor, mixed $body): array
    {
        $this->admit($actor, 'flyer');
        $request = $this->parse($this->bundle->schemas['flyerRequest'], $body);
        $hostels = $this->hostels->list();
        $known = static fn (string $slug): bool => in_array($slug, array_column($hostels, 'slug'), true);
        $pinned = property_exists($request, 'hostel');
        if ($pinned && !$known($request->hostel)) {
            throw $this->errors->make('unknown_hostel');
        }
        [$now, $remaining] = $this->quota($actor, 'flyer');

        $prompt = $this->prompts->flyer($hostels, $now, $request);
        $answer = $this->generate('flyer', $actor, $now, $request->text, $prompt, $this->bundle->schemas['flyerAnswer']);
        $brief = $answer->brief;
        $assumptions = $answer->assumptions;
        if ($pinned) {
            $brief->hostel = $request->hostel;
        } elseif ($brief->hostel !== null && !$known($brief->hostel)) {
            array_unshift($assumptions, (object) ['field' => 'hostel', 'note' => "Unknown hostel \"{$brief->hostel}\": left for every hostel"]);
            // The answer keeps to its schema with the service's note in it: past the limit, the model's last one goes.
            $assumptions = array_slice($assumptions, 0, $this->facts['assumptionsMax']);
            $brief->hostel = null;
        }
        return ['brief' => $brief, 'assumptions' => $assumptions, 'remaining' => $remaining - 1];
    }

    /**
     * A flyer's fields → its share text.
     *
     * @return array{share:string, remaining:int}
     * @throws HttpError ai_off, ai_forbidden, ai_input, unknown_hostel, ai_quota, ai_failed
     */
    public function share(Actor $actor, mixed $body): array
    {
        $this->admit($actor, 'share');
        $request = $this->parse($this->bundle->schemas['shareRequest'], $body);
        $hostels = $this->hostels->list();
        if ($request->hostel !== null && !in_array($request->hostel, array_column($hostels, 'slug'), true)) {
            throw $this->errors->make('unknown_hostel');
        }
        [$now, $remaining] = $this->quota($actor, 'share');

        $prompt = $this->prompts->share($hostels, $now, $request);
        $input = $prompt->messages === [] ? '' : LlmCall::textOf($prompt->messages[array_key_last($prompt->messages)]['content']);
        $answer = $this->generate('share', $actor, $now, $input, $prompt, $this->bundle->schemas['shareAnswer']);
        return ['share' => $answer->share, 'remaining' => $remaining - 1];
    }

    /**
     * The features that run on this site, in the app's own order: none means the AI is off.
     *
     * @return list<string>
     */
    private function running(): array
    {
        return array_values(array_filter($this->facts['features'], fn (string $feature): bool => $this->policy->runs($feature)));
    }

    /**
     * Off before anything else, then the policy: the order the contract names. A feature the site does not run is off
     * as the whole AI is, so nothing of the request is read, counted or recorded. Every feature's method starts here;
     * the picture read's route also asks first, in front of its upload's checks.
     *
     * @throws HttpError ai_off, ai_forbidden
     */
    public function admit(Actor $actor, string $feature): void
    {
        if ($this->provider === null || !$this->policy->runs($feature)) {
            throw $this->errors->make('ai_off');
        }
        if (!$this->policy->mayUse($actor)) {
            throw $this->errors->make('ai_forbidden');
        }
    }

    /** The body as the route's schema says, or ai_input with each bad field named. */
    private function parse(stdClass $schema, mixed $body): stdClass
    {
        try {
            return $this->validator->validate($body, $schema);
        } catch (InvalidData $e) {
            throw $this->errors->make('ai_input', ['max' => $this->facts['inputMax']], $e->fields);
        }
    }

    /**
     * The feature's own daily limit, counted on the day of this instant; the same instant stamps the ledger. What the
     * other features used of theirs does not count here, and the refusal names what ran out.
     *
     * @return array{string, int} the instant, and the generations of this feature left before this one
     */
    private function quota(Actor $actor, string $feature): array
    {
        $now = $this->clock->now();
        $limit = $this->policy->dailyLimit($actor, $feature);
        $used = $this->usage->countOk($actor->id, $this->day->day($now))[$feature] ?? 0;
        if ($used >= $limit) {
            throw $this->errors->make('ai_quota', ['limit' => $limit, 'what' => $this->facts['featureNouns'][$feature]]);
        }
        return [$now, $limit - $used];
    }

    /**
     * A picture → the words it shows about an event, for the staff member to check in "Your idea": the read stops
     * there, and the flyer is a second call they make (the owner's answers, 2026-10-06). The route has made the photo's
     * own checks and prepared the picture (Photos\PhotoIntake). The picture is kept before the provider is asked, so a
     * failed read keeps it and a disk that cannot take it stops the read with nothing spent. A read the provider
     * answered counts, its words or none: an empty text is a picture with no words.
     *
     * @return array{text:string, remaining:int}
     * @throws HttpError ai_off, ai_forbidden, ai_quota, ai_failed
     */
    public function photo(Actor $actor, StoredImage $picture): array
    {
        $this->admit($actor, 'photo');
        [$now, $remaining] = $this->quota($actor, 'photo');
        $kept = $this->pictures->keep($this->day->day($now), $picture->bytes, $picture->extension);
        $mediaType = $picture->extension === 'png' ? 'image/png' : 'image/jpeg';
        // The ledger names the kept picture, and never holds it.
        $input = "$kept $mediaType {$picture->width}x{$picture->height} " . strlen($picture->bytes) . ' bytes';
        $part = ['type' => 'image', 'mediaType' => $mediaType, 'data' => base64_encode($picture->bytes), 'width' => $picture->width, 'height' => $picture->height];
        $answer = $this->generate('photo', $actor, $now, $input, $this->prompts->photo($part), $this->bundle->schemas['photoAnswer']);
        return ['text' => JsTrim::trim($answer->text), 'remaining' => $remaining - 1];
    }

    /**
     * The provider call and its ledger record. A failure, or an answer that fails its schema, is recorded `ok: false`
     * with what the model wrote, and answered ai_failed: nothing is charged. A good answer is recorded `ok: true`, which
     * is what counts, and returned as the validator shapes it.
     */
    private function generate(string $feature, Actor $actor, string $now, string $input, Prompt $prompt, stdClass $schema): stdClass
    {
        $provider = $this->provider ?? throw $this->errors->make('ai_off');
        $model = $this->models[$feature];
        $record = function (bool $ok, ?LlmResult $result, ?string $output) use ($feature, $actor, $now, $input, $provider, $model): void {
            $usage = $result?->usage;
            $this->usage->record([
                'at' => $now,
                'day' => $this->day->day($now),
                'actorId' => $actor->id,
                'feature' => $feature,
                'provider' => $provider->name(),
                'model' => $result?->model ?? $model,
                'tokens' => $usage === null ? null : ['input' => $usage->input, 'output' => $usage->output],
                'ok' => $ok,
                'input' => $input,
                'output' => $output,
            ]);
        };

        $call = new LlmCall($model, $prompt->system, $prompt->messages, $schema, $this->facts['schemaNames'][$feature], $this->facts['maxOutputTokens'], $this->timeoutMs);
        try {
            $result = $provider->complete($call);
        } catch (LlmFailure $e) {
            error_log("Nest flyers: AI $feature ({$provider->name()} $model): {$e->reason}: {$e->getMessage()}");
            $record(false, null, $e->raw);
            throw $this->errors->make('ai_failed');
        }
        try {
            $answer = $this->validator->validate($result->json, $schema);
        } catch (InvalidData $e) {
            $issues = implode('; ', array_map(static fn (string $path, string $message): string => "$path: $message", array_keys($e->fields), $e->fields));
            error_log("Nest flyers: AI $feature ({$provider->name()} {$result->model}): the answer failed its schema: $issues");
            $record(false, $result, $result->raw);
            throw $this->errors->make('ai_failed');
        }
        $record(true, $result, $result->raw);
        return $answer;
    }
}
