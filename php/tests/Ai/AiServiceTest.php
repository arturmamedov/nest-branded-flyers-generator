<?php

declare(strict_types=1);

namespace NestFlyers\Tests\Ai;

use LogicException;
use NestFlyers\Ai\Actor;
use NestFlyers\Ai\AiBundle;
use NestFlyers\Ai\AiConfig;
use NestFlyers\Ai\AiPictures;
use NestFlyers\Ai\AiPolicy;
use NestFlyers\Ai\AiService;
use NestFlyers\Ai\ConfigAiPolicy;
use NestFlyers\Ai\FakeProvider;
use NestFlyers\Ai\HttpClient;
use NestFlyers\Ai\HttpClientFactory;
use NestFlyers\Ai\HttpResponse;
use NestFlyers\Ai\LlmCall;
use NestFlyers\Ai\LlmFailure;
use NestFlyers\Ai\LlmProvider;
use NestFlyers\Ai\LlmResult;
use NestFlyers\Ai\LlmUsage;
use NestFlyers\Ai\OpenAiProvider;
use NestFlyers\Ai\ProviderConfig;
use NestFlyers\Domain\AiUsageRepository;
use NestFlyers\Domain\HostelRepository;
use NestFlyers\Domain\Lock;
use NestFlyers\Http\ErrorCatalog;
use NestFlyers\Http\HttpError;
use NestFlyers\Image\StoredImage;
use NestFlyers\Json;
use NestFlyers\Shared;
use NestFlyers\Storage\Json\JsonRepositories;
use NestFlyers\Tests\Support\FakeClock;
use NestFlyers\Tests\Support\JsonAssert;
use NestFlyers\Tests\Support\MemoryAiPictures;
use NestFlyers\Tests\Support\MemoryAiUsage;
use NestFlyers\Tests\Support\Paths;
use NestFlyers\Tests\Support\TempDir;
use NestFlyers\Validation\SchemaNormalizer;
use NestFlyers\Validation\SchemaValidator;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use RuntimeException;
use stdClass;

/**
 * The rules of a generation (docs/api-contract.md, "The AI assistant"), the twin of tests/unit/ai-service.test.ts case
 * for case: the checks and their order, what counts against a feature's daily limit and when the day ends, what the
 * ledger keeps.
 * The provider is the fake, the ledger in memory: the driver is proved by the repository contract, the HTTP shapes by
 * ApiTest and the contract suite.
 */
final class AiServiceTest extends TestCase
{
    private const LIMIT = 3;
    private const INPUT_MAX = 4000;
    private const ASSUMPTIONS_MAX = 12;
    private const FEATURES = ['flyer', 'share', 'photo'];
    /** A prepared picture's bytes: the service never decodes them, and neither the ledger nor the log may hold them. */
    private const BYTES = 'the prepared picture: not what a ledger or a log should ever hold';

    private Shared $shared;
    private ErrorCatalog $errors;
    private AiBundle $bundle;
    private stdClass $example;
    private Actor $actor;
    private FakeClock $clock;
    private MemoryAiUsage $usage;
    private MemoryAiPictures $pictures;
    private string $logDir;
    private string|false $previousLog;
    private ?string $storeDir = null;

    protected function setUp(): void
    {
        $this->shared = Shared::fromFile(Paths::schema('shared.json'));
        $this->errors = ErrorCatalog::fromShared($this->shared);
        $this->bundle = AiBundle::fromFile(Paths::schema('ai.json'), new SchemaValidator(new SchemaNormalizer()));
        $this->example = $this->bundle->examples[0];
        $this->actor = new Actor('anonymous');
        $this->clock = new FakeClock();
        $this->usage = new MemoryAiUsage();
        $this->pictures = new MemoryAiPictures();
        // What the service logs lands here, so a test can read it (and the run stays quiet).
        $this->logDir = TempDir::create('ai-log');
        $this->previousLog = ini_get('error_log');
        ini_set('error_log', "$this->logDir/php-errors.log");
    }

    protected function tearDown(): void
    {
        ini_set('error_log', (string) $this->previousLog);
        TempDir::remove($this->logDir);
        if ($this->storeDir !== null) {
            TempDir::remove($this->storeDir);
        }
    }

    public function testTheSharedFactsAreTheOwnersCap(): void
    {
        self::assertSame(self::LIMIT, $this->shared->ai()['dailyLimit']);
        self::assertSame(self::INPUT_MAX, $this->shared->ai()['inputMax']);
        self::assertSame(self::ASSUMPTIONS_MAX, $this->shared->ai()['assumptionsMax']);
        self::assertSame(self::FEATURES, $this->shared->ai()['features']);
        // The used-up sentence names what ran out: every feature has a noun for it, written once in src/shared/ai.ts.
        self::assertSame(self::FEATURES, array_keys($this->shared->ai()['featureNouns']));
    }

    public function testOffWithoutAProviderStatusSaysSoAndBothFeaturesAnswerAiOff(): void
    {
        $service = $this->service(['provider' => null, 'policy' => $this->policy(['provider' => null])]);
        self::assertSame(['enabled' => false], $service->status($this->actor));
        $this->failsWith(fn () => $service->flyer($this->actor, $this->idea()), 'ai_off');
        $this->failsWith(fn () => $service->share($this->actor, $this->shareBody()), 'ai_off');
    }

    // The owner's answer (2026-10-05): none until named. A provider and its key run nothing by themselves.
    public function testOffWhenNoFeatureIsNamedStatusSaysSoAndBothFeaturesAnswerAiOff(): void
    {
        $service = $this->service(['policy' => $this->policy(['provider' => 'fake', 'features' => []])]);
        self::assertSame(['enabled' => false], $service->status($this->actor));
        $this->failsWith(fn () => $service->flyer($this->actor, $this->idea()), 'ai_off');
        $this->failsWith(fn () => $service->share($this->actor, $this->shareBody()), 'ai_off');
        self::assertSame([], $this->usage->records);
    }

    /** @return iterable<string, array{string}> every feature the app has (schema/shared.json), each switched off in turn */
    public static function features(): iterable
    {
        foreach (Shared::fromFile(Paths::schema('shared.json'))->ai()['features'] as $feature) {
            yield $feature => [$feature];
        }
    }

    #[DataProvider('features')]
    public function testAFeatureTheSiteDoesNotNameAnswersAiOffBeforeItsBodyIsReadAndNothingIsAskedCountedOrRecorded(string $off): void
    {
        $neverAsked = new class () implements LlmProvider {
            public function name(): string
            {
                return 'fake';
            }

            public function complete(LlmCall $call): LlmResult
            {
                throw new RuntimeException('the provider was asked');
            }
        };
        $untouched = new class () implements AiUsageRepository {
            public function record(array $entry): void
            {
                throw new RuntimeException('the ledger was written');
            }

            public function countDay(string $actorId, string $day): array
            {
                throw new RuntimeException('the ledger was counted');
            }
        };
        $service = $this->service(['provider' => $neverAsked, 'usage' => $untouched, 'policy' => $this->policy(['provider' => 'fake', 'features' => $this->allBut($off)])]);
        $this->failsWith(fn () => $this->call($service, $off), 'ai_off');
        $this->failsWith(fn () => $this->call($service, $off, new stdClass()), 'ai_off');
    }

    #[DataProvider('features')]
    public function testTheFeaturesTheSiteNamesRunEachCountsAgainstItsOwnLimitLeavesTheOthersAloneAndIsRecordedUnderItsOwnName(string $off): void
    {
        $named = $this->allBut($off);
        $service = $this->service(['policy' => $this->policy(['provider' => 'fake', 'features' => $named])]);
        foreach ($named as $feature) {
            $this->call($service, $feature);
            $last = $this->usage->records[array_key_last($this->usage->records)];
            self::assertSame([$feature, true], [$last['feature'], $last['ok']]);
        }
        // Each one spent one of its own, and none of another's.
        self::assertSame($this->on(array_fill_keys($named, self::LIMIT - 1), $named), $service->status($this->actor));
    }

    public function testAnActorThePolicyExcludesIsRefusedAndShownNothing(): void
    {
        $guests = new class () implements AiPolicy {
            public function runs(string $feature): bool
            {
                return true;
            }

            public function mayUse(Actor $actor): bool
            {
                return false;
            }

            public function dailyLimit(Actor $actor, string $feature): int
            {
                return 3;
            }

            public function dailyTries(Actor $actor, string $feature): ?int
            {
                return null;
            }
        };
        $service = $this->service(['policy' => $guests]);
        self::assertSame(['enabled' => false], $service->status($this->actor));
        $this->failsWith(fn () => $service->flyer($this->actor, $this->idea()), 'ai_forbidden');
    }

    public function testTheBodyIsCheckedBeforeAnythingIsSpent(): void
    {
        $service = $this->service();
        $e = $this->failsWith(fn () => $service->flyer($this->actor, (object) ['text' => '   ']), 'ai_input', ['max' => self::INPUT_MAX]);
        self::assertArrayHasKey('text', $e->fields ?? []);
        $this->failsWith(fn () => $service->flyer($this->actor, (object) ['text' => str_repeat('x', self::INPUT_MAX + 1)]), 'ai_input', ['max' => self::INPUT_MAX]);
        $this->failsWith(fn () => $service->flyer($this->actor, null), 'ai_input', ['max' => self::INPUT_MAX]);
        $this->failsWith(fn () => $service->share($this->actor, (object) ['hostel' => null, 'template' => 'activity']), 'ai_input', ['max' => self::INPUT_MAX]);
        $this->failsWith(fn () => $service->flyer($this->actor, (object) ['text' => 'Yoga', 'hostel' => 'no-such-nest']), 'unknown_hostel');
        $this->failsWith(fn () => $service->share($this->actor, $this->shareBody(['hostel' => 'no-such-nest'])), 'unknown_hostel');
        self::assertSame([], $this->usage->records);
    }

    public function testAnIdeaBecomesTheBriefTheAssumptionsAndWhatIsLeftWithOneLedgerRecord(): void
    {
        $service = $this->service();
        $result = $service->flyer($this->actor, $this->idea());
        JsonAssert::same((object) ['brief' => $this->example->answer->brief, 'assumptions' => $this->example->answer->assumptions, 'remaining' => self::LIMIT - 1], $result);
        self::assertSame(['brief', 'assumptions', 'remaining'], array_keys($result));
        self::assertSame($this->on(['flyer' => self::LIMIT - 1]), $service->status($this->actor));
        self::assertSame([[
            'at' => $this->clock->now(),
            'day' => '2026-09-18',
            'actorId' => 'anonymous',
            'feature' => 'flyer',
            'provider' => 'fake',
            'model' => 'fake-1',
            'tokens' => ['input' => 10, 'output' => 20],
            'ok' => true,
            'input' => $this->example->text,
            'output' => Json::encode($this->example->answer),
        ]], $this->usage->records);
    }

    public function testTheHostelTheStaffMemberChoseWinsOverTheModels(): void
    {
        $chosen = $this->otherHostel();
        $result = $this->service()->flyer($this->actor, $this->idea(hostel: $chosen));
        self::assertSame($chosen, $result['brief']->hostel);
    }

    public function testAHostelTheModelMadeUpBecomesChainWideWithAnAssumptionFirstAndStillCounts(): void
    {
        $result = $this->service()->flyer($this->actor, $this->idea('[[fake:unknown-hostel]]'));
        self::assertNull($result['brief']->hostel);
        self::assertSame('hostel', $result['assumptions'][0]->field);
        self::assertStringContainsString('no-such-nest', $result['assumptions'][0]->note);
        JsonAssert::same($this->example->answer->assumptions, array_slice($result['assumptions'], 1));
        self::assertSame(['flyer' => 1], $this->usage->countDay('anonymous', '2026-09-18')['ok']);
    }

    public function testItKeepsToTheAssumptionsTheContractAllowsItsOwnNoteFirstAndOnAFullListTheModelsLastGoes(): void
    {
        // One short of the limit, then full: the note joins the first, and takes the last one's place in the second.
        foreach ([self::ASSUMPTIONS_MAX - 1, self::ASSUMPTIONS_MAX] as $n) {
            $made = [];
            for ($i = 1; $i <= $n; $i++) {
                $made[] = (object) ['field' => 'cost', 'note' => "Assumption $i"];
            }
            $brief = Json::decode(Json::encode($this->example->answer->brief));
            $brief->hostel = $this->shared->ai()['fake']['unknownHostel'];
            $raw = Json::encode((object) ['brief' => $brief, 'assumptions' => $made]);
            $usage = new MemoryAiUsage();
            $result = $this->service(['provider' => $this->answering($raw), 'usage' => $usage])->flyer($this->actor, $this->idea());

            self::assertCount(self::ASSUMPTIONS_MAX, $result['assumptions'], "$n from the model");
            self::assertSame('hostel', $result['assumptions'][0]->field);
            self::assertStringContainsString('no-such-nest', $result['assumptions'][0]->note);
            JsonAssert::same(array_slice($made, 0, self::ASSUMPTIONS_MAX - 1), array_slice($result['assumptions'], 1));
            self::assertNull($result['brief']->hostel);
            // What leaves the service still fits the answer's schema, so the route's contract holds.
            (new SchemaValidator(new SchemaNormalizer()))->validate((object) ['brief' => $result['brief'], 'assumptions' => $result['assumptions']], $this->bundle->schemas['flyerAnswer']);
            // The ledger keeps everything the model wrote, the dropped one included.
            self::assertSame([true, $raw], [$usage->records[0]['ok'], $usage->records[0]['output']]);
        }
    }

    public function testAFlyerTheModelLeftWithoutItsShareTextIsAiFailedAndChargesNothing(): void
    {
        // One generation is a whole flyer: the share text is part of every answer.
        $brief = Json::decode(Json::encode($this->example->answer->brief));
        unset($brief->share);
        $raw = Json::encode((object) ['brief' => $brief, 'assumptions' => []]);
        $service = $this->service(['provider' => $this->answering($raw)]);
        $this->failsWith(fn () => $service->flyer($this->actor, $this->idea()), 'ai_failed');
        self::assertCount(1, $this->usage->records);
        self::assertSame([false, 'flyer', $raw], [$this->usage->records[0]['ok'], $this->usage->records[0]['feature'], $this->usage->records[0]['output']]);
        self::assertSame($this->on(), $service->status($this->actor));
        self::assertStringContainsString('share', $this->log());
    }

    public function testAFlyerTheModelLeftWithoutItsLabelsOrWithOneOffTheListIsAiFailedAndChargesNothing(): void
    {
        $unlabelled = Json::decode(Json::encode($this->example->answer->brief));
        unset($unlabelled->labels);
        $madeUp = Json::decode(Json::encode($this->example->answer->brief));
        $madeUp->labels = ['a-label-the-model-made-up'];
        foreach ([$unlabelled, $madeUp] as $brief) {
            $raw = Json::encode((object) ['brief' => $brief, 'assumptions' => []]);
            $service = $this->service(['provider' => $this->answering($raw)]);
            $this->failsWith(fn () => $service->flyer($this->actor, $this->idea()), 'ai_failed');
            // The ledger is one for both tries: the last record is this one's.
            $record = $this->usage->records[array_key_last($this->usage->records)];
            self::assertSame([false, 'flyer', $raw], [$record['ok'], $record['feature'], $record['output']]);
            self::assertSame($this->on(), $service->status($this->actor));
            self::assertStringContainsString('labels', $this->log());
        }
    }

    public function testTheLabelsTheModelChoseAreAnsweredAsItChoseThem(): void
    {
        $result = $this->service()->flyer($this->actor, $this->idea());
        self::assertSame($this->example->answer->brief->labels, $result['brief']->labels);
        self::assertNotSame([], $result['brief']->labels, 'the first example carries a label, so this proves something');
    }

    public function testAnAnswerThatFailsTheSchemaIsAiFailedRecordedAndChargesNothing(): void
    {
        $service = $this->service();
        $this->failsWith(fn () => $service->flyer($this->actor, $this->idea('[[fake:invalid]]')), 'ai_failed');
        self::assertCount(1, $this->usage->records);
        self::assertSame([false, 'flyer', Json::encode(['brief' => 42, 'assumptions' => []])], [$this->usage->records[0]['ok'], $this->usage->records[0]['feature'], $this->usage->records[0]['output']]);
        self::assertSame($this->on(), $service->status($this->actor));
        self::assertStringContainsString('the answer failed its schema', $this->log());
    }

    public function testATimeoutAndARefusalAreAiFailedRecordingWhatIsKnown(): void
    {
        $service = $this->service();
        $this->failsWith(fn () => $service->flyer($this->actor, $this->idea('[[fake:timeout]]')), 'ai_failed');
        $this->failsWith(fn () => $service->flyer($this->actor, $this->idea('[[fake:refused]]')), 'ai_failed');
        self::assertSame(
            [[false, null, null], [false, null, null]],
            array_map(static fn (array $r): array => [$r['ok'], $r['tokens'], $r['output']], $this->usage->records),
        );
    }

    // The owner's answer (2026-10-06): every feature its own daily limit. One used up leaves the others alone.
    public function testEachFeatureStopsAtItsOwnLimitLeavesTheOthersAloneAndStartsAgainAtMidnightInTheCanaryIslands(): void
    {
        $service = $this->service();
        for ($i = 0; $i < self::LIMIT; $i++) {
            $service->flyer($this->actor, $this->idea());
        }
        $this->failsWith(fn () => $service->flyer($this->actor, $this->idea()), 'ai_quota', $this->usedUp('flyer', self::LIMIT));
        self::assertSame($this->on(['flyer' => 0]), $service->status($this->actor));
        // The share text has its own count: the flyers did not touch it.
        self::assertSame(self::LIMIT - 1, $service->share($this->actor, $this->shareBody())['remaining']);
        self::assertSame($this->on(['flyer' => 0, 'share' => self::LIMIT - 1]), $service->status($this->actor));
        for ($i = 1; $i < self::LIMIT; $i++) {
            $service->share($this->actor, $this->shareBody());
        }
        $this->failsWith(fn () => $service->share($this->actor, $this->shareBody()), 'ai_quota', $this->usedUp('share', self::LIMIT));
        // 10:00Z on 18 September is 11:00 WEST; thirteen hours on, it is 00:00 on the 19th there.
        $this->clock->tick(13 * 3600 * 1000);
        self::assertSame($this->on(), $service->status($this->actor));
        self::assertSame(self::LIMIT - 1, $service->flyer($this->actor, $this->idea())['remaining']);
    }

    // The owner's answers (2026-10-05, 2026-10-06): the limit is the site's own setting, and a feature may have its own.
    public function testAFeatureStopsAtTheNumberTheSiteGivesItAndSaysThatNumberAndWhatRanOut(): void
    {
        $own = ['share' => 1];
        $service = $this->service(['policy' => $this->policy(['provider' => 'fake', 'dailyLimits' => $own])]);
        self::assertSame($this->on([], null, $own), $service->status($this->actor));
        self::assertSame(0, $service->share($this->actor, $this->shareBody())['remaining']);
        $this->failsWith(fn () => $service->share($this->actor, $this->shareBody()), 'ai_quota', $this->usedUp('share', 1));
        // The flyer keeps the default, and its own count.
        self::assertSame(self::LIMIT - 1, $service->flyer($this->actor, $this->idea())['remaining']);
        self::assertSame($this->on(['share' => 0, 'flyer' => self::LIMIT - 1], null, $own), $service->status($this->actor));
    }

    public function testItCountsPerActor(): void
    {
        $service = $this->service();
        for ($i = 0; $i < self::LIMIT; $i++) {
            $service->flyer($this->actor, $this->idea());
        }
        self::assertSame($this->on(), $service->status(new Actor('someone-else')));
    }

    // A record a later release wrote, met after going back to this one. While one limit covered every feature, every ok
    // record of the day counted against it. Now such a record is counted under its own name, which no feature here has.
    public function testARecordOfAFeatureItDoesNotKnowCountsAgainstNoFeatureItRuns(): void
    {
        $service = $this->service();
        $service->flyer($this->actor, $this->idea());
        for ($i = 0; $i < self::LIMIT; $i++) {
            $this->usage->records[] = ['feature' => 'a-later-feature'] + $this->usage->records[0];
        }
        self::assertSame($this->on(['flyer' => self::LIMIT - 1]), $service->status($this->actor));
        self::assertSame(self::LIMIT - 2, $service->flyer($this->actor, $this->idea())['remaining']);
        self::assertSame(self::LIMIT - 1, $service->share($this->actor, $this->shareBody())['remaining']);
    }

    // api/config asks on every page load: every feature's count comes from one read of the ledger.
    public function testStatusReadsTheLedgerOnceHoweverManyFeaturesRun(): void
    {
        $counting = new class () implements AiUsageRepository {
            public int $reads = 0;

            public function record(array $entry): void
            {
            }

            public function countDay(string $actorId, string $day): array
            {
                $this->reads++;
                return ['ok' => [], 'tried' => []];
            }
        };
        self::assertSame($this->on(), $this->service(['usage' => $counting])->status($this->actor));
        self::assertSame(1, $counting->reads);
    }

    public function testItWritesAShareTextFromTheFlyersFieldsCountsItAndKeepsWhatTheModelWasGiven(): void
    {
        $result = $this->service()->share($this->actor, $this->shareBody());
        self::assertSame(['share' => $this->example->answer->brief->share, 'remaining' => self::LIMIT - 1], $result);
        self::assertSame(['share', true], [$this->usage->records[0]['feature'], $this->usage->records[0]['ok']]);
        self::assertStringContainsString("The flyer's fields:", $this->usage->records[0]['input']);
        self::assertStringContainsString('Pool party', $this->usage->records[0]['input']);
    }

    // The owner's answer (2026-10-06): "A model per feature, now". One provider and one key; the call names the model.
    public function testEachFeaturesCallAsksThatFeaturesOwnModelAndTheLedgerNamesItWhenNoAnswerCame(): void
    {
        $noAnswer = new class () implements LlmProvider {
            /** @var list<string> */
            public array $asked = [];

            public function name(): string
            {
                return 'fake';
            }

            public function complete(LlmCall $call): LlmResult
            {
                $this->asked[] = $call->model;
                throw new LlmFailure(LlmFailure::TIMEOUT, 'no answer');
            }
        };
        $service = $this->service(['provider' => $noAnswer, 'models' => self::models(['share' => 'model-b'])]);
        $this->failsWith(fn () => $service->flyer($this->actor, $this->idea()), 'ai_failed');
        $this->failsWith(fn () => $service->share($this->actor, $this->shareBody()), 'ai_failed');
        self::assertSame(['fake-1', 'model-b'], $noAnswer->asked);
        self::assertSame([['flyer', 'fake-1', false], ['share', 'model-b', false]], array_map(static fn (array $r): array => [$r['feature'], $r['model'], $r['ok']], $this->usage->records));
        self::assertSame(2, substr_count($this->log(), "\n"), 'each failure is one log line');
    }

    // A picture → its words (the owner's answers, 2026-10-06: "Two calls: read, then write", "Stop at the words"). The
    // route has prepared the picture; the service counts, keeps it, asks the model and records.

    public function testAReadAnswersTheWordsAndWhatIsLeftKeepsThePictureAndRecordsOneLineThatNamesIt(): void
    {
        $service = $this->service();
        $result = $service->photo($this->actor, self::picture());
        self::assertSame(['text' => $this->example->text, 'remaining' => self::LIMIT - 1], $result);
        // Only the reads' count moved.
        self::assertSame($this->on(['photo' => self::LIMIT - 1]), $service->status($this->actor));

        $path = array_key_first($this->pictures->kept);
        self::assertMatchesRegularExpression('~^ai-pictures/2026-09-18/[0-9a-f]{16}\.jpg$~', (string) $path);
        self::assertSame(self::BYTES, $this->pictures->kept[$path]);
        self::assertSame([[
            'at' => $this->clock->now(),
            'day' => '2026-09-18',
            'actorId' => 'anonymous',
            'feature' => 'photo',
            'provider' => 'fake',
            'model' => 'fake-1',
            'tokens' => ['input' => 10, 'output' => 20],
            'ok' => true,
            'input' => "$path image/jpeg 640x480 " . strlen(self::BYTES) . ' bytes',
            'output' => Json::encode(['text' => $this->example->text]),
        ]], $this->usage->records);
    }

    public function testAReadSendsTheModelTheReadersRulesAndOneTurnThePictureAsItWasPreparedThenTheLineThatAsks(): void
    {
        $recorder = new class () implements LlmProvider {
            /** @var list<LlmCall> */
            public array $calls = [];

            public function name(): string
            {
                return 'fake';
            }

            public function complete(LlmCall $call): LlmResult
            {
                $this->calls[] = $call;
                return new LlmResult((object) ['text' => 'Yoga'], '{"text":"Yoga"}', null, 'stub-1');
            }
        };
        $service = $this->service(['provider' => $recorder, 'models' => self::models(['photo' => 'a-stronger-model'])]);
        $service->photo($this->actor, self::picture(extension: 'png'));
        self::assertCount(1, $recorder->calls);
        $call = $recorder->calls[0];
        self::assertSame(['a-stronger-model', $this->bundle->prompts['photo'], 'nest_picture_text'], [$call->model, $call->system, $call->schemaName]);
        self::assertSame($this->bundle->schemas['photoAnswer'], $call->schema);
        self::assertSame([[
            'role' => 'user',
            'content' => [
                ['type' => 'image', 'mediaType' => 'image/png', 'data' => base64_encode(self::BYTES), 'width' => 640, 'height' => 480],
                ['type' => 'text', 'text' => $this->shared->ai()['pictureAsk']],
            ],
        ]], $call->messages);
    }

    // The owner's answer: "It says so, no flyer; it counts". The provider was paid.
    public function testAPictureWithNoWordsAnswersAnEmptyTextAndCounts(): void
    {
        $service = $this->service();
        self::assertSame(['text' => '', 'remaining' => self::LIMIT - 1], $service->photo($this->actor, self::picture($this->widths()['noWords'])));
        self::assertSame(['photo', true, '{"text":""}'], [$this->usage->records[0]['feature'], $this->usage->records[0]['ok'], $this->usage->records[0]['output']]);
    }

    public function testTheWordsAreAnsweredTrimmedAReadOfSpacesAloneIsAPictureWithNoWords(): void
    {
        self::assertSame('Yoga at 9', $this->service(['provider' => $this->answering('{"text":"  Yoga at 9\n\n"}')])->photo($this->actor, self::picture())['text']);
        self::assertSame('', $this->service(['provider' => $this->answering('{"text":" \n "}')])->photo($this->actor, self::picture())['text']);
    }

    public function testWordsLongerThanTheIdeaBoxTakesAreAiFailedAndChargeNothing(): void
    {
        $service = $this->service(['provider' => $this->answering(Json::encode(['text' => str_repeat('x', self::INPUT_MAX + 1)]))]);
        $this->failsWith(fn () => $service->photo($this->actor, self::picture()), 'ai_failed');
        self::assertSame([['photo', false]], array_map(static fn (array $r): array => [$r['feature'], $r['ok']], $this->usage->records));
        self::assertSame($this->on(), $service->status($this->actor));
    }

    public function testAReadThatFailsIsAiFailedRecordedNotCountedAndItsPictureIsKept(): void
    {
        $service = $this->service();
        foreach (['invalid', 'timeout', 'refused'] as $steer) {
            $this->failsWith(fn () => $service->photo($this->actor, self::picture($this->widths()[$steer])), 'ai_failed');
        }
        self::assertSame(
            [['photo', false, '{"text":42}'], ['photo', false, null], ['photo', false, null]],
            array_map(static fn (array $r): array => [$r['feature'], $r['ok'], $r['output']], $this->usage->records),
        );
        // A failed read keeps its picture: those are the ones worth looking at.
        self::assertCount(3, $this->pictures->kept);
        foreach (array_keys($this->pictures->kept) as $i => $path) {
            self::assertStringStartsWith("$path ", $this->usage->records[$i]['input']);
        }
        self::assertSame($this->on(), $service->status($this->actor));
    }

    public function testTheReadsStopAtTheirOwnLimitByItsNameKeepNothingMoreAndLeaveTheFlyersAlone(): void
    {
        $own = ['photo' => 1];
        $service = $this->service(['policy' => $this->policy(['provider' => 'fake', 'dailyLimits' => $own])]);
        self::assertSame(0, $service->photo($this->actor, self::picture())['remaining']);
        $this->failsWith(fn () => $service->photo($this->actor, self::picture()), 'ai_quota', $this->usedUp('photo', 1));
        self::assertCount(1, $this->pictures->kept);
        self::assertSame(self::LIMIT - 1, $service->flyer($this->actor, $this->idea())['remaining']);
        self::assertSame($this->on(['photo' => 0, 'flyer' => self::LIMIT - 1], self::FEATURES, $own), $service->status($this->actor));
    }

    public function testADiskThatCannotKeepThePictureStopsTheReadBeforeTheProviderIsAskedNothingIsSpentOrRecorded(): void
    {
        $neverAsked = new class () implements LlmProvider {
            public function name(): string
            {
                return 'fake';
            }

            public function complete(LlmCall $call): LlmResult
            {
                throw new LogicException('the provider was asked');
            }
        };
        $service = $this->service(['provider' => $neverAsked, 'pictures' => new MemoryAiPictures(full: true)]);
        try {
            $service->photo($this->actor, self::picture());
            self::fail('The read went on');
        } catch (RuntimeException $e) {
            self::assertStringContainsString('No space left', $e->getMessage());
        }
        self::assertSame([], $this->usage->records);
    }

    public function testThePicturesBytesNeverReachTheLedgerOrTheLog(): void
    {
        $service = $this->service();
        $service->photo($this->actor, self::picture());
        foreach (['invalid', 'timeout'] as $steer) {
            $this->failsWith(fn () => $service->photo($this->actor, self::picture($this->widths()[$steer])), 'ai_failed');
        }
        $said = Json::encode($this->usage->records) . $this->log();
        self::assertSame(2, substr_count($this->log(), "\n"));
        self::assertStringNotContainsString(base64_encode(self::BYTES), $said);
        self::assertStringNotContainsString(self::BYTES, $said);
    }

    public function testTheKeyAProviderEchoesNeverReachesTheLogOrTheLedger(): void
    {
        $echo = new class () implements HttpClient {
            public function postJson(string $url, array $headers, string $body, int $timeoutMs): HttpResponse
            {
                return new HttpResponse(401, '{"error": {"message": "Incorrect API key provided: sk-live-secret-42"}}');
            }
        };
        $service = $this->service(['provider' => new OpenAiProvider(new ProviderConfig('sk-live-secret-42', null), $echo)]);
        $this->failsWith(fn () => $service->flyer($this->actor, $this->idea()), 'ai_failed');
        self::assertStringContainsString('OpenAI answered 401', $this->log());
        self::assertStringNotContainsString('sk-live-secret-42', $this->log());
        self::assertStringNotContainsString('sk-live-secret-42', Json::encode($this->usage->records));
    }

    public function testOnAHostWithoutCurlAGenerationIsAiFailedRecordedAndNamedInOneLogLine(): void
    {
        // It used to be an undefined function: a 500, a trace in the log and no ledger record.
        $noCurl = HttpClientFactory::create(static fn (string $extension): bool => false);
        $service = $this->service(['provider' => new OpenAiProvider(new ProviderConfig('sk-live-secret-42', null), $noCurl)]);
        $this->failsWith(fn () => $service->flyer($this->actor, $this->idea()), 'ai_failed');
        self::assertCount(1, $this->usage->records);
        self::assertSame([false, null, null], [$this->usage->records[0]['ok'], $this->usage->records[0]['tokens'], $this->usage->records[0]['output']]);
        self::assertStringContainsString('network: PHP has no curl extension', $this->log());
        self::assertSame(1, substr_count($this->log(), "\n"), 'one line, no trace');
        self::assertStringNotContainsString('sk-live-secret-42', $this->log() . Json::encode($this->usage->records));
        self::assertSame($this->on(), $service->status($this->actor), 'nothing was counted');
    }

    public function testTheProviderIsNeverCalledUnderTheStoresLock(): void
    {
        // On the real JSON store: a lock held by this request would make exclusive() throw (no upgrade from shared)
        // or, from another request, wait for the whole provider call.
        $this->storeDir = TempDir::create('ai-store');
        $repos = JsonRepositories::open($this->storeDir, $this->shared, $this->clock, $this->errors);
        foreach (self::seedHostels() as $hostel) {
            $repos->hostels->upsert($hostel);
        }
        $probe = new class (new FakeProvider($this->bundle->examples, $this->shared->ai()), $repos->lock) implements LlmProvider {
            public int $calls = 0;

            public function __construct(private readonly LlmProvider $inner, private readonly Lock $lock)
            {
            }

            public function name(): string
            {
                return $this->inner->name();
            }

            public function complete(LlmCall $call): LlmResult
            {
                $this->calls++;
                return $this->lock->exclusive(fn (): LlmResult => $this->inner->complete($call));
            }
        };
        $service = $this->service(['provider' => $probe, 'hostels' => $repos->hostels, 'usage' => $repos->aiUsage]);
        self::assertSame(self::LIMIT - 1, $service->flyer($this->actor, $this->idea())['remaining']);
        self::assertSame(self::LIMIT - 1, $service->share($this->actor, $this->shareBody())['remaining']);
        self::assertSame(2, $probe->calls);
        self::assertSame(['flyer' => 1, 'share' => 1], $repos->aiUsage->countDay('anonymous', '2026-09-18')['ok']);
    }

    public function testALedgerThatCannotBeReadHidesTheAiAndTheLogSaysWhy(): void
    {
        // api/config carries status(), and the editor renders nothing without api/config: the AI's own storage must
        // never decide whether the app loads (the twin of status() in server/ai/service.ts).
        $broken = new class () implements AiUsageRepository {
            public function record(array $entry): void
            {
            }

            public function countDay(string $actorId, string $day): array
            {
                throw new RuntimeException('ai-usage/2026-09.json is damaged: expected a JSON array of ledger records.');
            }
        };
        self::assertSame(['enabled' => false], $this->service(['usage' => $broken])->status($this->actor));
        self::assertStringContainsString(
            'Nest flyers: AI: the ledger cannot be read, so the AI is hidden: ai-usage/2026-09.json is damaged',
            $this->log(),
        );
        self::assertSame(1, substr_count($this->log(), "\n"), 'one line');
    }

    // ---- a feature's tries a day ----

    /** @return iterable<string, array{array<string, mixed>}> the days of tests/fixtures/ai-tries.json, which says how a day reads */
    public static function triesDays(): iterable
    {
        $vectors = json_decode((string) file_get_contents(Paths::fixture('ai-tries.json')), true, flags: JSON_THROW_ON_ERROR);
        foreach ($vectors['days'] as $day) {
            yield $day['name'] => [$day];
        }
    }

    public function testTheTriesAreBoundedForThePictureReadAloneThreeForEachReadOfItsLimit(): void
    {
        self::assertSame(['photo' => 3], $this->shared->ai()['triesPerLimit']);
        $policy = $this->policy(['provider' => 'fake', 'dailyLimits' => ['photo' => 2]]);
        $tries = [];
        foreach (self::FEATURES as $feature) {
            $tries[$feature] = $policy->dailyTries($this->actor, $feature);
        }
        self::assertSame(['flyer' => null, 'share' => null, 'photo' => 6], $tries);
    }

    /**
     * A feature's tries a day (the owner's answers, 2026-10-06). A failed read is free and keeps its picture, so on a
     * site with no lock nothing bounded them: the picture read alone gets a number of tries, failed ones included.
     * What is left of the reads is the smaller of reads left and tries left, and at none the answer is the used-up
     * sentence. The twin of the same table's replay in tests/unit/ai-service.test.ts.
     *
     * @param array{limits: array<string, int>, ledger: list<array{times:int, feature:string, ok:bool, actorId?:string, day?:string}>,
     *     steps: list<array{feature:string, works:bool, answer:string, left:int}>, kept:int, recorded:int} $day
     */
    #[DataProvider('triesDays')]
    public function testAFeaturesTriesADay(array $day): void
    {
        $service = $this->service(['policy' => $this->policy(['provider' => 'fake', 'dailyLimits' => $day['limits']])]);
        foreach ($day['ledger'] as $held) {
            for ($i = 0; $i < $held['times']; $i++) {
                $this->usage->records[] = [
                    'at' => $this->clock->now(),
                    'day' => $held['day'] ?? '2026-09-18',
                    'actorId' => $held['actorId'] ?? $this->actor->id,
                    'feature' => $held['feature'],
                    'provider' => 'fake',
                    'model' => 'fake-1',
                    'tokens' => null,
                    'ok' => $held['ok'],
                    'input' => "held before the day's steps",
                    'output' => null,
                ];
            }
        }
        $before = count($this->usage->records);
        $left = [];
        foreach ($day['steps'] as $i => $step) {
            $n = $i + 1;
            $call = fn (): array => $this->step($service, $step['feature'], $step['works']);
            if ($step['answer'] === 'ok') {
                self::assertSame($step['left'], $call()['remaining'], "step $n");
            } else {
                $limit = $day['limits'][$step['feature']] ?? self::LIMIT;
                $this->failsWith($call, $step['answer'], $step['answer'] === 'ai_quota' ? $this->usedUp($step['feature'], $limit) : []);
            }
            // Every other feature's count stands where it last stood.
            $left[$step['feature']] = $step['left'];
            self::assertSame($this->on($left, self::FEATURES, $day['limits']), $service->status($this->actor), "after step $n");
        }
        self::assertCount($day['kept'], $this->pictures->kept);
        self::assertSame($day['recorded'], count($this->usage->records) - $before);
    }

    // ---- helpers ----

    /**
     * One call of a feature, which the fake answers or fails.
     *
     * @return array<string, mixed>
     */
    private function step(AiService $service, string $feature, bool $works): array
    {
        return match ($feature) {
            'flyer' => $service->flyer($this->actor, $this->idea($works ? '' : '[[fake:invalid]]')),
            'share' => $service->share($this->actor, $this->shareBody($works ? [] : ['idea' => '[[fake:invalid]]'])),
            'photo' => $service->photo($this->actor, $works ? self::picture() : self::picture($this->widths()['invalid'])),
        };
    }

    /**
     * The service on the fake provider, the memory ledger and the seed's hostels, unless $with says otherwise
     * (`'provider' => null` is AI off).
     *
     * @param array{provider?: ?LlmProvider, policy?: AiPolicy, hostels?: HostelRepository, usage?: AiUsageRepository, models?: array<string, string>, pictures?: AiPictures} $with
     */
    private function service(array $with = []): AiService
    {
        return new AiService(
            array_key_exists('provider', $with) ? $with['provider'] : new FakeProvider($this->bundle->examples, $this->shared->ai()),
            $with['policy'] ?? $this->policy(['provider' => 'fake']),
            $this->bundle,
            $with['hostels'] ?? self::memoryHostels(),
            $with['usage'] ?? $this->usage,
            $this->clock,
            $with['pictures'] ?? $this->pictures,
            1000,
            $with['models'] ?? self::models(),
            $this->shared,
            $this->errors,
            new SchemaValidator(new SchemaNormalizer()),
        );
    }

    /**
     * A model for every feature: its own where $own names it, else the fake's.
     *
     * @param array<string, string> $own
     * @return array<string, string>
     */
    private static function models(array $own = []): array
    {
        $models = [];
        foreach (self::FEATURES as $feature) {
            $models[$feature] = $own[$feature] ?? 'fake-1';
        }
        return $models;
    }

    /** A provider that answers every call with this JSON, whatever it is asked: for answers the fake has no marker for. */
    private function answering(string $raw): LlmProvider
    {
        return new class ($raw) implements LlmProvider {
            public function __construct(private readonly string $raw)
            {
            }

            public function name(): string
            {
                return 'fake';
            }

            public function complete(LlmCall $call): LlmResult
            {
                return new LlmResult(Json::decode($this->raw), $this->raw, new LlmUsage(10, 20), 'stub-1');
            }
        };
    }

    /**
     * The policy of a site with this `ai` block, which names every feature unless it says otherwise: what a test is
     * about, it takes away.
     *
     * @param array<string, mixed> $ai
     */
    private function policy(array $ai): AiPolicy
    {
        $facts = $this->shared->ai();
        return new ConfigAiPolicy(AiConfig::fromArray($ai + ['features' => $facts['features']], $facts), $facts['triesPerLimit']);
    }

    /** @return list<string> every feature the app has but this one */
    private function allBut(string $off): array
    {
        return array_values(array_diff($this->shared->ai()['features'], [$off]));
    }

    /**
     * api/config's `ai` block on a site that runs $named (every feature, unless said): each with its limit ($own,
     * else the default) and what is $left of it today (all of it, unless said).
     *
     * @param array<string, int> $left
     * @param list<string>|null $named
     * @param array<string, int> $own
     * @return array{enabled:true, features:list<array{name:string, limit:int, remaining:int}>}
     */
    private function on(array $left = [], ?array $named = null, array $own = []): array
    {
        $features = [];
        foreach ($named ?? $this->shared->ai()['features'] as $name) {
            $limit = $own[$name] ?? self::LIMIT;
            $features[] = ['name' => $name, 'limit' => $limit, 'remaining' => $left[$name] ?? $limit];
        }
        return ['enabled' => true, 'features' => $features];
    }

    /**
     * What the ai_quota sentence is filled with for one feature: its limit, and what its generations are called.
     *
     * @return array{limit:int, what:string}
     */
    private function usedUp(string $feature, int $limit): array
    {
        return ['limit' => $limit, 'what' => $this->shared->ai()['featureNouns'][$feature]];
    }

    /**
     * One feature's call, with its own good body unless the test hands in another.
     *
     * @return array<string, mixed>
     */
    private function call(AiService $service, string $feature, ?stdClass $body = null): array
    {
        return match ($feature) {
            'flyer' => $service->flyer($this->actor, $body ?? $this->idea()),
            'share' => $service->share($this->actor, $body ?? $this->shareBody()),
            // A read has no body to be wrong: the route makes the photo's checks before the service is asked.
            'photo' => $service->photo($this->actor, self::picture()),
        };
    }

    /** A picture as the route hands it over: prepared (Photos\PhotoIntake). Its width steers the fake. */
    private static function picture(int $width = 640, string $extension = 'jpg'): StoredImage
    {
        return new StoredImage(self::BYTES, $extension, $width, 480);
    }

    /** @return array{invalid:int, timeout:int, refused:int, noWords:int} the widths that steer the fake on a read */
    private function widths(): array
    {
        return $this->shared->ai()['fake']['pictureWidths'];
    }

    private function idea(string $marker = '', ?string $hostel = null): stdClass
    {
        $idea = (object) ['text' => $marker === '' ? $this->example->text : "{$this->example->text}\n$marker"];
        if ($hostel !== null) {
            $idea->hostel = $hostel;
        }
        return $idea;
    }

    /** @param array<string, mixed> $over */
    private function shareBody(array $over = []): stdClass
    {
        $sample = Json::decode((string) file_get_contents(Paths::seed('samples.json')))[0];
        return (object) ($over + ['hostel' => null, 'template' => 'activity', 'data' => $sample->data, 'idea' => 'Pool party']);
    }

    private function otherHostel(): string
    {
        foreach (self::seedHostels() as $hostel) {
            if ($hostel['slug'] !== $this->example->answer->brief->hostel) {
                return $hostel['slug'];
            }
        }
        throw new LogicException('The seed has one hostel');
    }

    /**
     * @param array<string, string|int> $vars
     * @param callable(): mixed $call
     */
    private function failsWith(callable $call, string $key, array $vars = []): HttpError
    {
        try {
            $call();
        } catch (HttpError $e) {
            $spec = $this->errors->make($key, $vars);
            self::assertSame([$spec->status, $spec->errorCode, $spec->getMessage()], [$e->status, $e->errorCode, $e->getMessage()], "expected $key");
            return $e;
        }
        self::fail("expected $key");
    }

    private function log(): string
    {
        $file = "$this->logDir/php-errors.log";
        return is_file($file) ? (string) file_get_contents($file) : '';
    }

    /** @return list<array{slug:string, name:string, island:string, logoPath:?string, sortOrder:int|float}> */
    private static function seedHostels(): array
    {
        $seed = Json::decode((string) file_get_contents(Paths::seed('hostels.json')));
        return array_map(
            static fn (stdClass $h): array => ['slug' => $h->slug, 'name' => $h->name, 'island' => $h->island, 'logoPath' => $h->logo_path, 'sortOrder' => $h->sort_order],
            $seed->hostels,
        );
    }

    private static function memoryHostels(): HostelRepository
    {
        $hostels = [];
        foreach (self::seedHostels() as $i => $hostel) {
            $hostels[] = ['id' => $i + 1] + $hostel;
        }
        return new class ($hostels) implements HostelRepository {
            /** @param list<array<string, mixed>> $hostels */
            public function __construct(private readonly array $hostels)
            {
            }

            public function list(): array
            {
                return $this->hostels;
            }

            public function bySlug(string $slug): ?array
            {
                foreach ($this->hostels as $hostel) {
                    if ($hostel['slug'] === $slug) {
                        return $hostel;
                    }
                }
                return null;
            }

            public function upsert(array $hostel): void
            {
                throw new LogicException('The AI never writes hostels');
            }
        };
    }
}
