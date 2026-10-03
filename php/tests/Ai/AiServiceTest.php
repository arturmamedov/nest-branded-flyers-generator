<?php

declare(strict_types=1);

namespace NestFlyers\Tests\Ai;

use LogicException;
use NestFlyers\Ai\Actor;
use NestFlyers\Ai\AiBundle;
use NestFlyers\Ai\AiConfig;
use NestFlyers\Ai\AiPolicy;
use NestFlyers\Ai\AiService;
use NestFlyers\Ai\ConfigAiPolicy;
use NestFlyers\Ai\FakeProvider;
use NestFlyers\Ai\HttpClient;
use NestFlyers\Ai\HttpResponse;
use NestFlyers\Ai\LlmCall;
use NestFlyers\Ai\LlmProvider;
use NestFlyers\Ai\LlmResult;
use NestFlyers\Ai\OpenAiProvider;
use NestFlyers\Ai\ProviderConfig;
use NestFlyers\Domain\AiUsageRepository;
use NestFlyers\Domain\HostelRepository;
use NestFlyers\Domain\Lock;
use NestFlyers\Http\ErrorCatalog;
use NestFlyers\Http\HttpError;
use NestFlyers\Json;
use NestFlyers\Shared;
use NestFlyers\Storage\Json\JsonRepositories;
use NestFlyers\Tests\Support\FakeClock;
use NestFlyers\Tests\Support\JsonAssert;
use NestFlyers\Tests\Support\MemoryAiUsage;
use NestFlyers\Tests\Support\Paths;
use NestFlyers\Tests\Support\TempDir;
use NestFlyers\Validation\SchemaNormalizer;
use NestFlyers\Validation\SchemaValidator;
use PHPUnit\Framework\TestCase;
use stdClass;

/**
 * The rules of a generation (docs/api-contract.md, "The AI assistant"), the twin of tests/unit/ai-service.test.ts case
 * for case: the checks and their order, what counts against the cap and when the cap resets, what the ledger keeps.
 * The provider is the fake, the ledger in memory: the driver is proved by the repository contract, the HTTP shapes by
 * ApiTest and the contract suite.
 */
final class AiServiceTest extends TestCase
{
    private const LIMIT = 3;
    private const INPUT_MAX = 4000;

    private Shared $shared;
    private ErrorCatalog $errors;
    private AiBundle $bundle;
    private stdClass $example;
    private Actor $actor;
    private FakeClock $clock;
    private MemoryAiUsage $usage;
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
    }

    public function testOffWithoutAProviderStatusSaysSoAndBothFeaturesAnswerAiOff(): void
    {
        $service = $this->service(['provider' => null, 'policy' => $this->policy(['provider' => null])]);
        self::assertSame(['enabled' => false], $service->status($this->actor));
        $this->failsWith(fn () => $service->flyer($this->actor, $this->idea()), 'ai_off');
        $this->failsWith(fn () => $service->share($this->actor, $this->shareBody()), 'ai_off');
    }

    public function testAnActorThePolicyExcludesIsRefusedAndShownNothing(): void
    {
        $guests = new class () implements AiPolicy {
            public function enabled(): bool
            {
                return true;
            }

            public function mayUse(Actor $actor): bool
            {
                return false;
            }

            public function dailyLimit(Actor $actor): int
            {
                return 3;
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
        self::assertSame(['enabled' => true, 'limit' => self::LIMIT, 'remaining' => self::LIMIT - 1], $service->status($this->actor));
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
        self::assertSame(1, $this->usage->countOk('anonymous', '2026-09-18'));
    }

    public function testAnAnswerThatFailsTheSchemaIsAiFailedRecordedAndChargesNothing(): void
    {
        $service = $this->service();
        $this->failsWith(fn () => $service->flyer($this->actor, $this->idea('[[fake:invalid]]')), 'ai_failed');
        self::assertCount(1, $this->usage->records);
        self::assertSame([false, 'flyer', Json::encode(['brief' => 42, 'assumptions' => []])], [$this->usage->records[0]['ok'], $this->usage->records[0]['feature'], $this->usage->records[0]['output']]);
        self::assertSame(['enabled' => true, 'limit' => self::LIMIT, 'remaining' => self::LIMIT], $service->status($this->actor));
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

    public function testItStopsAtTheCapAndStartsAgainAtMidnightInTheCanaryIslands(): void
    {
        $service = $this->service();
        for ($i = 0; $i < self::LIMIT; $i++) {
            $service->flyer($this->actor, $this->idea());
        }
        $this->failsWith(fn () => $service->flyer($this->actor, $this->idea()), 'ai_quota', ['limit' => self::LIMIT]);
        $this->failsWith(fn () => $service->share($this->actor, $this->shareBody()), 'ai_quota', ['limit' => self::LIMIT]);
        self::assertSame(['enabled' => true, 'limit' => self::LIMIT, 'remaining' => 0], $service->status($this->actor));
        // 10:00Z on 18 September is 11:00 WEST; thirteen hours on, it is 00:00 on the 19th there.
        $this->clock->tick(13 * 3600 * 1000);
        self::assertSame(['enabled' => true, 'limit' => self::LIMIT, 'remaining' => self::LIMIT], $service->status($this->actor));
        self::assertSame(self::LIMIT - 1, $service->flyer($this->actor, $this->idea())['remaining']);
    }

    public function testItCountsPerActor(): void
    {
        $service = $this->service();
        for ($i = 0; $i < self::LIMIT; $i++) {
            $service->flyer($this->actor, $this->idea());
        }
        self::assertSame(['enabled' => true, 'limit' => self::LIMIT, 'remaining' => self::LIMIT], $service->status(new Actor('someone-else')));
    }

    public function testItWritesAShareTextFromTheFlyersFieldsCountsItAndKeepsWhatTheModelWasGiven(): void
    {
        $result = $this->service()->share($this->actor, $this->shareBody());
        self::assertSame(['share' => $this->example->answer->brief->share, 'remaining' => self::LIMIT - 1], $result);
        self::assertSame(['share', true], [$this->usage->records[0]['feature'], $this->usage->records[0]['ok']]);
        self::assertStringContainsString("The flyer's fields:", $this->usage->records[0]['input']);
        self::assertStringContainsString('Pool party', $this->usage->records[0]['input']);
    }

    public function testTheKeyAProviderEchoesNeverReachesTheLogOrTheLedger(): void
    {
        $echo = new class () implements HttpClient {
            public function postJson(string $url, array $headers, string $body, int $timeoutMs): HttpResponse
            {
                return new HttpResponse(401, '{"error": {"message": "Incorrect API key provided: sk-live-secret-42"}}');
            }
        };
        $service = $this->service(['provider' => new OpenAiProvider(new ProviderConfig('sk-live-secret-42', 'gpt-6-luna', null), $echo)]);
        $this->failsWith(fn () => $service->flyer($this->actor, $this->idea()), 'ai_failed');
        self::assertStringContainsString('OpenAI answered 401', $this->log());
        self::assertStringNotContainsString('sk-live-secret-42', $this->log());
        self::assertStringNotContainsString('sk-live-secret-42', Json::encode($this->usage->records));
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

            public function model(): string
            {
                return $this->inner->model();
            }

            public function complete(LlmCall $call): LlmResult
            {
                $this->calls++;
                return $this->lock->exclusive(fn (): LlmResult => $this->inner->complete($call));
            }
        };
        $service = $this->service(['provider' => $probe, 'hostels' => $repos->hostels, 'usage' => $repos->aiUsage]);
        self::assertSame(self::LIMIT - 1, $service->flyer($this->actor, $this->idea())['remaining']);
        self::assertSame(self::LIMIT - 2, $service->share($this->actor, $this->shareBody())['remaining']);
        self::assertSame(2, $probe->calls);
        self::assertSame(2, $repos->aiUsage->countOk('anonymous', '2026-09-18'));
    }

    // ---- helpers ----

    /**
     * The service on the fake provider, the memory ledger and the seed's hostels, unless $with says otherwise
     * (`'provider' => null` is AI off).
     *
     * @param array{provider?: ?LlmProvider, policy?: AiPolicy, hostels?: HostelRepository, usage?: AiUsageRepository} $with
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
            1000,
            $this->shared,
            $this->errors,
            new SchemaValidator(new SchemaNormalizer()),
        );
    }

    /** @param array<string, mixed> $ai */
    private function policy(array $ai): AiPolicy
    {
        return new ConfigAiPolicy(AiConfig::fromArray($ai, $this->shared->ai()), $this->shared->ai()['dailyLimit']);
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
