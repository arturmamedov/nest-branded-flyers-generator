<?php

declare(strict_types=1);

namespace NestFlyers\Tests;

use NestFlyers\Bootstrap;
use NestFlyers\Http\ErrorCatalog;
use NestFlyers\Http\Request;
use NestFlyers\Http\Response;
use NestFlyers\Json;
use NestFlyers\Shared;
use NestFlyers\Tests\Support\FakeClock;
use NestFlyers\Tests\Support\Paths;
use NestFlyers\Tests\Support\TempDir;
use NestFlyers\Tests\Support\WriteHeader;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use stdClass;

/**
 * The whole PHP backend, composed as api.php composes it, on a temp app root
 * (schema/ and seed/ copied from the repo) and a temp data folder outside it,
 * driven request by request through Bootstrap::handle().
 */
final class BootstrapTest extends TestCase
{
    private const LOOPBACK = '127.0.0.1';

    private string $appRoot;
    private string $dataDir;
    private string $logDir;
    private string|false $previousLog;
    private ?Bootstrap $app = null;

    protected function setUp(): void
    {
        $this->appRoot = TempDir::create('app');
        $this->dataDir = TempDir::create('data');
        foreach (['schema', 'seed'] as $folder) {
            mkdir("$this->appRoot/$folder");
            foreach (glob(Paths::repo() . "/$folder/*.json") ?: [] as $file) {
                copy($file, "$this->appRoot/$folder/" . basename($file));
            }
        }
        // Everything the app logs lands here, and a test that expects no errors checks it stays empty.
        $this->logDir = TempDir::create('log');
        $this->previousLog = ini_get('error_log');
        ini_set('error_log', "$this->logDir/php-errors.log");
    }

    protected function tearDown(): void
    {
        $this->app = null; // closes the store before its folder goes
        ini_set('error_log', (string) $this->previousLog);
        foreach ([$this->appRoot, $this->dataDir, $this->logDir] as $dir) {
            TempDir::remove($dir);
        }
    }

    public function testWithoutConfigPhpEveryRequestIs503(): void
    {
        $app = Bootstrap::fromAppRoot($this->appRoot);
        $this->assertError($app->handle(self::request('GET', '/api/config')), 503, 'not_configured');
        $this->assertError($app->handle(self::request('POST', '/api/flyers', $this->input())), 503, 'not_configured');
        $this->assertError($app->handle(self::request('GET', '/api/nowhere', null, [], '203.0.113.9')), 503, 'not_configured');
        self::assertDirectoryDoesNotExist("$this->appRoot/data", 'nothing is created before the app is configured');
        self::assertSame('', $this->log());
    }

    public function testConfigPhpIsReadFromTheAppRoot(): void
    {
        $dataDir = var_export($this->dataDir, true);
        file_put_contents("$this->appRoot/config.php", "<?php\nreturn ['access' => ['allowIps' => ['127.0.0.1/32']], 'dataDir' => $dataDir];\n");
        $response = Bootstrap::fromAppRoot($this->appRoot)->handle(self::request('GET', '/api/hostels'));
        self::assertSame(200, $response->status, $response->body);
        self::assertFileExists("$this->dataDir/meta.json");
    }

    public function testConfigPhpInABackslashedAppRoot(): void
    {
        file_put_contents("$this->appRoot/config.php", "<?php\nreturn ['access' => ['allowPublic' => true]];\n");
        $response = Bootstrap::fromAppRoot(str_replace('/', '\\', $this->appRoot) . '\\')->handle(self::request('GET', '/api/hostels'));
        self::assertSame(200, $response->status, $response->body);
        self::assertFileExists("$this->appRoot/data/meta.json", 'the default data folder is under the app root');
    }

    public function testAnInvalidConfigIs503AndSaysWhyInTheLog(): void
    {
        $app = Bootstrap::fromAppRoot($this->appRoot, ['access' => ['allowIp' => ['127.0.0.1']], 'dataDir' => $this->dataDir]);
        $this->assertError($app->handle(self::request('GET', '/api/config')), 503, 'not_configured');
        self::assertStringContainsString('allowIp', $this->log());
        self::assertSame([], TempDir::files($this->dataDir));
    }

    public function testAConfigWithoutAnAccessRuleIs503(): void
    {
        $app = Bootstrap::fromAppRoot($this->appRoot, ['access' => ['allowIps' => [], 'basicAuth' => null, 'allowPublic' => false], 'dataDir' => $this->dataDir]);
        $this->assertError($app->handle(self::request('GET', '/api/hostels')), 503, 'not_configured');
        self::assertSame([], TempDir::files($this->dataDir));
    }

    public function testOutsidersNeverReachStorage(): void
    {
        $this->assertError($this->app()->handle(self::request('GET', '/api/hostels', null, [], '203.0.113.9')), 403, 'forbidden');
        self::assertSame([], TempDir::files($this->dataDir));
        self::assertSame(200, $this->app()->handle(self::request('GET', '/api/hostels', null, [], '::ffff:127.0.0.1'))->status);
    }

    public function testConfig(): void
    {
        $shared = Shared::fromFile(Paths::schema('shared.json'));
        $config = $this->ok($this->app()->handle(self::request('GET', '/api/config')));
        self::assertSame('php', $config->backend);
        self::assertSame('json', $config->storage);
        self::assertSame(['client'], $config->exporters);
        self::assertSame($shared->maxPhotoEdge(), $config->limits->maxPhotoEdge);
        self::assertIsInt($config->limits->maxUploadBytes);
        self::assertGreaterThan(0, $config->limits->maxUploadBytes);
        self::assertLessThanOrEqual($shared->maxUploadBytes(), $config->limits->maxUploadBytes);
        foreach (['php', 'upload_max_filesize', 'post_max_size', 'memory_limit', 'imageProcessor', 'formats'] as $key) {
            self::assertObjectHasProperty($key, $config->server);
        }
        self::assertSame(PHP_VERSION, $config->server->php);
    }

    public function testWithoutAnAiBlockTheAiIsOffAndTheStoreGetsNoLedger(): void
    {
        self::assertEquals((object) ['enabled' => false], $this->ok($this->app()->handle(self::request('GET', '/api/config')))->ai);
        $this->assertError($this->app()->handle(self::request('POST', '/api/ai/flyer', (object) ['text' => 'Yoga at 9'])), 404, 'not_found');
        self::assertDirectoryDoesNotExist("$this->dataDir/ai-usage");
    }

    // The owner's answer (2026-10-05): none until named. A provider, even keyed, runs nothing by itself.
    public function testAProviderWithNoFeatureNamedIsNoAiAndTheStoreGetsNoLedger(): void
    {
        $app = Bootstrap::fromAppRoot($this->appRoot, $this->config() + ['ai' => ['provider' => 'fake']], new FakeClock());
        self::assertEquals((object) ['enabled' => false], $this->ok($app->handle(self::request('GET', '/api/config')))->ai);
        foreach (self::features() as [$feature]) {
            self::assertSame($this->message('ai_off'), $this->assertError($app->handle(self::request('POST', "/api/ai/$feature", $this->aiBody($feature))), 404, 'not_found')->message);
        }
        self::assertDirectoryDoesNotExist("$this->dataDir/ai-usage");
    }

    // Off reads nothing: a site with a provider and no feature named serves whatever state schema/ai.json is in, as
    // one with no key does. The twin of tests/unit/ai-composition.test.ts ("builds no service and reads no bundle").
    public function testWithNoFeatureNamedTheAiBundleIsNeverRead(): void
    {
        unlink("$this->appRoot/schema/ai.json");
        $app = Bootstrap::fromAppRoot($this->appRoot, $this->config() + ['ai' => ['provider' => 'fake']], new FakeClock());
        self::assertEquals((object) ['enabled' => false], $this->ok($app->handle(self::request('GET', '/api/config')))->ai);
        self::assertSame($this->message('ai_off'), $this->assertError($app->handle(self::request('POST', '/api/ai/share', $this->aiBody('share'))), 404, 'not_found')->message);
    }

    /** @return iterable<string, array{string}> every feature the app has (schema/shared.json), each switched off in turn */
    public static function features(): iterable
    {
        foreach (Shared::fromFile(Paths::schema('shared.json'))->ai()['features'] as $feature) {
            yield $feature => [$feature];
        }
    }

    // The twin of tests/unit/ai-app.test.ts: the whole app, as config.php sets the AI up, one feature off at a time.
    #[DataProvider('features')]
    public function testASiteThatNamesEveryFeatureButOneAnswersAiOffOnThatRouteAndSpendsNothing(string $off): void
    {
        $app = Bootstrap::fromAppRoot($this->appRoot, $this->config() + ['ai' => $this->fakeAi(self::allBut($off))], new FakeClock());
        $route = "/api/ai/$off";
        self::assertSame($this->message('ai_off'), $this->assertError($app->handle($this->good($off)), 404, 'not_found')->message);
        self::assertSame($this->message('ai_off'), $this->assertError($app->handle(self::request('POST', $route, $this->aiBody($off))), 404, 'not_found')->message);
        // Off comes before the body's shape, as it does with the whole AI off: a body that says nothing is ai_off too.
        self::assertSame($this->message('ai_off'), $this->assertError($app->handle(self::request('POST', $route, new stdClass())), 404, 'not_found')->message);
        $this->assertError($app->handle(self::request('POST', $route, $this->aiBody($off), [], self::LOOPBACK, [])), 403, 'forbidden');
        $this->assertError($app->handle(self::request('POST', $route, '{"text": ', [], self::LOOPBACK, [])), 400, 'invalid');
        self::assertDirectoryDoesNotExist("$this->dataDir/ai-usage");
        self::assertEquals(self::on(self::allBut($off)), $this->ok($app->handle(self::request('GET', '/api/config')))->ai);
    }

    #[DataProvider('features')]
    public function testASiteRunsTheFeaturesItNamesEachSpendsOneOfItsOwnLeavesTheOthersAloneAndIsRecordedUnderItsName(string $off): void
    {
        $this->needsGd();
        $named = self::allBut($off);
        $app = Bootstrap::fromAppRoot($this->appRoot, $this->config() + ['ai' => $this->fakeAi($named)], new FakeClock());
        foreach ($named as $feature) {
            $result = $this->ok($app->handle($this->good($feature)));
            self::assertSame(2, $result->remaining);
        }
        $ledger = Json::decode((string) file_get_contents("$this->dataDir/ai-usage/2026-09.json"));
        self::assertSame($named, array_map(static fn (stdClass $record): string => $record->feature, $ledger));
        self::assertEquals(self::on($named, array_fill_keys($named, 2)), $this->ok($app->handle(self::request('GET', '/api/config')))->ai);
    }

    // The owner's answers (2026-10-05, 2026-10-06): the limit is a setting, 3 unless config.php says otherwise, and it
    // is each feature's own: 'dailyLimit' is every feature's number, 'dailyLimits' a feature's own.
    public function testASiteThatSetsItsOwnNumbersSaysThemInConfigAndAnswersAiQuotaInThatNumberAndByWhatRanOut(): void
    {
        $app = Bootstrap::fromAppRoot($this->appRoot, $this->config() + ['ai' => $this->fakeAi() + ['dailyLimit' => 2, 'dailyLimits' => ['share' => 1]]], new FakeClock());
        $shared = Shared::fromFile(Paths::schema('shared.json'));
        $all = $shared->ai()['features'];
        $own = array_fill_keys($all, 2);
        $own['share'] = 1;
        self::assertEquals(self::on($all, [], $own), $this->ok($app->handle(self::request('GET', '/api/config')))->ai);
        self::assertSame(0, $this->ok($app->handle(self::request('POST', '/api/ai/share', $this->aiBody('share'))))->remaining);
        $error = $this->assertError($app->handle(self::request('POST', '/api/ai/share', $this->aiBody('share'))), 429, 'ai_quota');
        self::assertSame(ErrorCatalog::fromShared($shared)->make('ai_quota', ['limit' => 1, 'what' => $shared->ai()['featureNouns']['share']])->getMessage(), $error->message);
        // The flyer is not stopped by the share text's limit: it has its own two.
        self::assertSame(1, $this->ok($app->handle(self::request('POST', '/api/ai/flyer', $this->aiBody('flyer'))))->remaining);
        self::assertEquals(self::on($all, ['flyer' => 1, 'share' => 0], $own), $this->ok($app->handle(self::request('GET', '/api/config')))->ai);
    }

    public function testTheFakeProviderCountsInTheStoreAndTheDayEndsAtCanaryMidnight(): void
    {
        $clock = new FakeClock();
        $app = Bootstrap::fromAppRoot($this->appRoot, $this->config() + ['ai' => $this->fakeAi()], $clock);
        $all = Shared::fromFile(Paths::schema('shared.json'))->ai()['features'];
        $ai = fn (): stdClass => $this->ok($app->handle(self::request('GET', '/api/config')))->ai;
        self::assertEquals(self::on($all), $ai());
        self::assertDirectoryDoesNotExist("$this->dataDir/ai-usage", 'reading the count wrote nothing');

        $result = $this->ok($app->handle(self::request('POST', '/api/ai/flyer', (object) ['text' => 'Yoga mañana a las 9 en la terraza'])));
        self::assertSame(2, $result->remaining);
        self::assertSame(['ai-usage/2026-09.json'], array_values(preg_grep('~^ai-usage/~', TempDir::files($this->dataDir)) ?: []));
        self::assertEquals(self::on($all, ['flyer' => 2]), $ai());

        // 10:00Z on 18 September is 11:00 WEST; thirteen hours on, it is midnight in the Canary Islands.
        $clock->tick(13 * 3600 * 1000 - 1);
        self::assertEquals(self::on($all, ['flyer' => 2]), $ai(), 'still the 18th there');
        $clock->tick(1);
        self::assertEquals(self::on($all), $ai());
        self::assertSame('', $this->log(), 'nothing was logged');
    }

    public function testALedgerFileThatCannotBeReadHidesTheAiAndLeavesTheAppUp(): void
    {
        // The editor loads api/config before anything else and renders nothing without it: a damaged ledger used to
        // answer 500 there, and so take the whole app down for the rest of the month.
        $app = Bootstrap::fromAppRoot($this->appRoot, $this->config() + ['ai' => $this->fakeAi()], new FakeClock());
        mkdir("$this->dataDir/ai-usage");
        file_put_contents("$this->dataDir/ai-usage/2026-09.json", '{ damaged');

        self::assertEquals((object) ['enabled' => false], $this->ok($app->handle(self::request('GET', '/api/config')))->ai);
        self::assertSame(200, $app->handle(self::request('GET', '/api/hostels'))->status);
        self::assertStringContainsString('AI: the ledger cannot be read, so the AI is hidden', $this->log());
        self::assertStringContainsString('2026-09.json is not valid JSON', $this->log());
    }

    /** @return iterable<string, array{array<string, mixed>}> */
    public static function aiOnAndOff(): iterable
    {
        yield 'with the AI off' => [[]];
        yield 'with the AI on' => [['ai' => ['provider' => 'fake', 'features' => Shared::fromFile(Paths::schema('shared.json'))->ai()['features']]]];
    }

    // The owner's answer (2026-10-06): "Keep the picture for 30 days too". A shared host has no cron, so a request
    // every visit makes deletes what is past its days: GET api/config, whether or not the AI is on.
    /** @param array<string, mixed> $ai */
    #[DataProvider('aiOnAndOff')]
    public function testApiConfigDeletesThePicturesPastTheirThirtyDaysCountedOnTheClocksCanaryDay(array $ai): void
    {
        $clock = new FakeClock();
        $app = Bootstrap::fromAppRoot($this->appRoot, $this->config() + $ai, $clock);
        $day = 24 * 3600 * 1000;
        $read = '2026-09-18'; // the fake clock's first day, in the Canary Islands too
        $aDay = function () use ($read): void {
            mkdir("$this->dataDir/ai-pictures/$read", 0775, true);
            file_put_contents("$this->dataDir/ai-pictures/$read/0123456789abcdef.jpg", 'a picture');
        };
        $kept = fn (): array => array_values(preg_grep('~^ai-pictures/~', TempDir::files($this->dataDir)) ?: []);
        $aDay();

        $this->ok($app->handle(self::request('GET', '/api/config')));
        self::assertSame(['ai-pictures/.swept', "ai-pictures/$read/0123456789abcdef.jpg"], $kept());
        $clock->tick(30 * $day);
        $this->ok($app->handle(self::request('GET', '/api/config')));
        self::assertSame(['ai-pictures/.swept', "ai-pictures/$read/0123456789abcdef.jpg"], $kept(), 'thirty days on, it is still kept');
        $clock->tick($day);
        $this->ok($app->handle(self::request('GET', '/api/config')));
        self::assertSame(['ai-pictures/.swept'], $kept(), 'a day later it is gone');
        // Only api/config sweeps: it is the one read that deletes.
        $aDay();
        $clock->tick($day);
        self::assertSame(200, $app->handle(self::request('GET', '/api/hostels'))->status);
        self::assertSame(['ai-pictures/.swept', "ai-pictures/$read/0123456789abcdef.jpg"], $kept());
        self::assertSame('', $this->log(), 'nothing was logged');
    }

    // POST api/ai/photo through the whole backend (docs/api-contract.md): the one AI route that takes a file. The twin
    // of the "POST api/ai/photo" block in tests/unit/ai-app.test.ts.

    public function testAPictureReadAnswersItsWordsKeepsThePictureAsItWasPreparedAndNamesItInTheLedger(): void
    {
        $this->needsGd();
        $app = Bootstrap::fromAppRoot($this->appRoot, $this->config() + ['ai' => $this->fakeAi(['photo'])], new FakeClock());
        $example = Json::decode((string) file_get_contents(Paths::schema('ai.json')))->examples[0];
        $result = $this->ok($app->handle($this->good('photo')));
        self::assertEquals((object) ['text' => $example->text, 'remaining' => 2], $result);

        $kept = array_values(preg_grep('~^ai-pictures/2026-09-18/[0-9a-f]{16}\.jpg$~', TempDir::files($this->dataDir)) ?: []);
        self::assertCount(1, $kept, implode(', ', TempDir::files($this->dataDir)));
        $bytes = (string) file_get_contents("$this->dataDir/$kept[0]");
        self::assertSame([64, 48, IMAGETYPE_JPEG], array_slice((array) getimagesizefromstring($bytes), 0, 3));
        $ledger = Json::decode((string) file_get_contents("$this->dataDir/ai-usage/2026-09.json"));
        self::assertSame(['photo', true, "$kept[0] image/jpeg 64x48 " . strlen($bytes) . ' bytes'], [$ledger[0]->feature, $ledger[0]->ok, $ledger[0]->input]);
        // Nothing was uploaded: the read never writes where photos are served from.
        self::assertDirectoryDoesNotExist("$this->appRoot/uploads");
        self::assertSame('', $this->log(), 'nothing was logged');
    }

    public function testThePictureReadsSwitchIsAskedBeforeAnyOfThePhotosChecks(): void
    {
        $app = Bootstrap::fromAppRoot($this->appRoot, $this->config() + ['ai' => $this->fakeAi(['flyer'])], new FakeClock());
        // Were the file looked at first, these would be unreadable and no_photo_field.
        self::assertSame($this->message('ai_off'), $this->assertError($app->handle($this->picture('not an image')), 404, 'not_found')->message);
        self::assertSame($this->message('ai_off'), $this->assertError($app->handle($this->picture(null)), 404, 'not_found')->message);
        // And the write guard is in front of both.
        $this->assertError($app->handle($this->picture('not an image', [])), 403, 'forbidden');
    }

    public function testThePictureReadMakesThePhotoRoutesChecksBeforeTheLimitAndTheProviderARefusedPictureSpendsAndKeepsNothing(): void
    {
        $this->needsGd();
        $app = Bootstrap::fromAppRoot($this->appRoot, $this->config() + ['ai' => $this->fakeAi(['photo']) + ['dailyLimits' => ['photo' => 1]]], new FakeClock());
        self::assertSame($this->message('no_photo_field'), $this->assertError($app->handle(self::request('POST', '/api/ai/photo', $this->aiBody('photo'))), 400, 'invalid')->message);
        self::assertSame($this->message('unreadable'), $this->assertError($app->handle($this->picture('not an image')), 415, 'unsupported')->message);
        self::assertDirectoryDoesNotExist("$this->dataDir/ai-pictures");
        self::assertSame(0, $this->ok($app->handle($this->good('photo')))->remaining);
        // The limit is reached: a picture that would be refused is still refused for what it is, as the order says.
        self::assertSame($this->message('unreadable'), $this->assertError($app->handle($this->picture('not an image')), 415, 'unsupported')->message);
        $this->assertError($app->handle($this->good('photo')), 429, 'ai_quota');
        self::assertCount(1, preg_grep('~^ai-pictures/2026-09-18/~', TempDir::files($this->dataDir)) ?: []);
        self::assertCount(1, Json::decode((string) file_get_contents("$this->dataDir/ai-usage/2026-09.json")));
    }

    public function testATinyPictureIsNeverEnlargedSoItsWidthReachesTheFakeNoWordsIsAnEmptyTextThatCounts(): void
    {
        $this->needsGd();
        $app = Bootstrap::fromAppRoot($this->appRoot, $this->config() + ['ai' => $this->fakeAi(['photo'])], new FakeClock());
        $width = Shared::fromFile(Paths::schema('shared.json'))->ai()['fake']['pictureWidths']['noWords'];
        self::assertEquals((object) ['text' => '', 'remaining' => 2], $this->ok($app->handle($this->picture(self::png($width, 8)))));
    }

    public function testHostelsAndDoodlesAreSeededFromTheSeedFile(): void
    {
        $seed = Json::decode((string) file_get_contents(Paths::seed('hostels.json')));
        $expected = $seed->hostels;
        usort($expected, static fn (stdClass $a, stdClass $b): int => [$a->sort_order, $a->name] <=> [$b->sort_order, $b->name]);

        $hostels = $this->ok($this->app()->handle(self::request('GET', '/api/hostels')));
        self::assertSame(
            array_map(static fn (stdClass $h): array => [$h->slug, $h->name, $h->island, $h->logo_path, $h->sort_order], $expected),
            array_map(static fn (stdClass $h): array => [$h->slug, $h->name, $h->island, $h->logoPath, $h->sortOrder], $hostels),
        );

        $doodles = $this->ok($this->app()->handle(self::request('GET', '/api/doodles')));
        self::assertCount(count($seed->doodles), $doodles);
        $paths = array_column(array_map(static fn (stdClass $d): array => (array) $d, $seed->doodles), 'path', 'slug');
        foreach ($doodles as $doodle) {
            self::assertSame(['id', 'slug', 'label', 'url', 'kind', 'builtin'], array_keys((array) $doodle));
            self::assertSame($paths[$doodle->slug], $doodle->url);
            self::assertTrue($doodle->builtin);
        }
    }

    public function testAFlyerFromCreateToArchive(): void
    {
        $app = $this->app();
        $created = $this->ok($app->handle(self::request('POST', '/api/flyers', $this->input())), 201);
        $id = $created->id;
        self::assertSame($id, $created->flyer->id);
        self::assertSame('duque-nest', $created->flyer->hostel);
        self::assertSame($created->flyer->createdAt, $created->flyer->updatedAt);
        self::assertMatchesRegularExpression('/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z\z/', $created->flyer->createdAt);

        $payload = $this->ok($app->handle(self::request('GET', "/api/flyers/$id")));
        self::assertEquals($created->flyer, $payload->flyer);
        self::assertSame('duque-nest', $payload->hostel->slug);
        self::assertNull($payload->photo);

        $input = $this->input();
        $input->title = 'Pool party, moved';
        $input->hostel = '';
        $updated = $this->ok($app->handle(self::request('PUT', "/api/flyers/$id", $input)));
        self::assertSame('Pool party, moved', $updated->flyer->title);
        self::assertNull($updated->flyer->hostel);
        self::assertSame($created->flyer->createdAt, $updated->flyer->createdAt);

        $list = $this->ok($app->handle(self::request('GET', '/api/flyers', null, ['hostel' => 'none'])));
        self::assertSame([$id], array_column(array_map(static fn (stdClass $f): array => (array) $f, $list), 'id'));
        self::assertSame([], $this->ok($app->handle(self::request('GET', '/api/flyers', null, ['hostel' => 'duque-nest']))));

        $deleted = $app->handle(self::request('DELETE', "/api/flyers/$id"));
        self::assertSame(204, $deleted->status);
        self::assertSame('', $deleted->body);
        $this->assertError($app->handle(self::request('GET', "/api/flyers/$id")), 404, 'not_found');
        self::assertSame([], $this->ok($app->handle(self::request('GET', '/api/flyers'))));
    }

    /**
     * What a release meets in a library a newer one wrote, after a limit was raised (the tag went from 12 to 24
     * characters in the editor's UX round, Part 4; docs/deploy.md, "Rolling back"). A read shapes the flyer and checks
     * no length, so it opens with its copy whole; a save is held to the limit, so it is refused, by the line's
     * name, until the line is shortened. The newer release's flyer is stood in for by one past today's limit.
     */
    public function testAFlyerStoredWithALineLongerThanItsLimitOpensAndItsSaveIsRefusedUntilTheLineIsShortened(): void
    {
        $app = $this->app();
        $id = $this->ok($app->handle(self::request('POST', '/api/flyers', $this->input())), 201)->id;
        $limit = Json::decode((string) file_get_contents(Paths::schema('flyer.schema.json')))->properties->data->properties->text->properties->tag->maxLength;
        $long = str_repeat('W', $limit + 1);

        $file = "$this->dataDir/flyers/$id.json";
        $stored = Json::decode((string) file_get_contents($file));
        $stored->data->text->tag = $long;
        file_put_contents($file, Json::encode($stored));

        $opened = $this->ok($app->handle(self::request('GET', "/api/flyers/$id")));
        self::assertSame($long, $opened->flyer->data->text->tag);
        self::assertSame([$id], array_column(array_map(static fn (stdClass $f): array => (array) $f, $this->ok($app->handle(self::request('GET', '/api/flyers')))), 'id'));

        $input = $this->input();
        $input->data->text->tag = $long;
        $error = $this->assertError($app->handle(self::request('PUT', "/api/flyers/$id", $input)), 400, 'invalid');
        self::assertSame(['data.text.tag'], array_keys((array) $error->fields));

        $input->data->text->tag = str_repeat('W', $limit);
        self::assertSame($input->data->text->tag, $this->ok($app->handle(self::request('PUT', "/api/flyers/$id", $input)))->flyer->data->text->tag);
    }

    /**
     * A flyer a release from before looks saved has no look at all (docs/deploy.md, "Rolling back"). A read fills the
     * first look (FIRST_LOOK in src/shared/looks.ts), as it fills every defaulted key: the store keeps what it was given.
     */
    public function testAFlyerStoredBeforeLooksOpensInTheFirstLook(): void
    {
        $app = $this->app();
        $id = $this->ok($app->handle(self::request('POST', '/api/flyers', $this->input())), 201)->id;

        $file = "$this->dataDir/flyers/$id.json";
        $stored = Json::decode((string) file_get_contents($file));
        unset($stored->data->look);
        file_put_contents($file, Json::encode($stored));

        self::assertSame('hand-drawn', $this->ok($app->handle(self::request('GET', "/api/flyers/$id")))->flyer->data->look ?? null);
    }

    /**
     * What a release that knows looks meets in a library a later one wrote, in a look it does not have
     * (docs/deploy.md, "Rolling back"; the owner's answer 15). A read shapes the flyer and checks no enum, so it opens
     * with its look as stored, and the editor draws it hand-drawn (lookOf, src/shared/looks.ts); a save is held to
     * the looks this release has, so it is refused, by the field's name, until the look is one of them.
     */
    public function testAFlyerStoredInALookThisReleaseDoesNotKnowOpensAndItsSaveIsRefused(): void
    {
        $app = $this->app();
        $id = $this->ok($app->handle(self::request('POST', '/api/flyers', $this->input())), 201)->id;

        $file = "$this->dataDir/flyers/$id.json";
        $stored = Json::decode((string) file_get_contents($file));
        $stored->data->look = 'a-later-look';
        file_put_contents($file, Json::encode($stored));

        $opened = $this->ok($app->handle(self::request('GET', "/api/flyers/$id")));
        self::assertSame('a-later-look', $opened->flyer->data->look ?? null);
        self::assertSame([$id], array_column(array_map(static fn (stdClass $f): array => (array) $f, $this->ok($app->handle(self::request('GET', '/api/flyers')))), 'id'));

        $input = $this->input();
        $input->data->look = 'a-later-look';
        $error = $this->assertError($app->handle(self::request('PUT', "/api/flyers/$id", $input)), 400, 'invalid');
        self::assertSame(['data.look'], array_keys((array) $error->fields));

        $input->data->look = 'hand-drawn';
        self::assertSame('hand-drawn', $this->ok($app->handle(self::request('PUT', "/api/flyers/$id", $input)))->flyer->data->look ?? null);
    }

    public function testApiConfigListsTheLooksConfigPhpNamesAndWithoutThemTheFirstAlone(): void
    {
        $ids = Shared::fromFile(Paths::schema('shared.json'))->looks()['ids'];
        self::assertSame([$ids[0]], $this->ok($this->app()->handle(self::request('GET', '/api/config')))->looks);
        $named = Bootstrap::fromAppRoot($this->appRoot, $this->config() + ['looks' => $ids]);
        self::assertSame($ids, $this->ok($named->handle(self::request('GET', '/api/config')))->looks);
    }

    public function testALookThisReleaseDoesNotHaveInConfigPhpIs503AndTheLogNamesTheSettingNotTheValue(): void
    {
        // Refused like any bad setting (M3): the whole file, 503 until it is fixed, and the log says why.
        $app = Bootstrap::fromAppRoot($this->appRoot, $this->config() + ['looks' => ['hand-drawn', 'a-later-look']]);
        $this->assertError($app->handle(self::request('GET', '/api/config')), 503, 'not_configured');
        self::assertStringContainsString('looks must be null or a list of: hand-drawn', $this->log());
        self::assertStringNotContainsString('a-later-look', $this->log());
    }

    public function testTheLibraryOutlivesTheRequest(): void
    {
        $id = $this->ok($this->app()->handle(self::request('POST', '/api/flyers', $this->input())), 201)->id;
        $this->app = null;
        $again = Bootstrap::fromAppRoot($this->appRoot, $this->config());
        self::assertSame($id, $this->ok($again->handle(self::request('GET', "/api/flyers/$id")))->flyer->id);
    }

    public function testAPhotoUpload(): void
    {
        if (!extension_loaded('gd')) {
            self::markTestSkipped('GD is not loaded');
        }
        $tmp = "$this->logDir/upload.png";
        $image = imagecreatetruecolor(40, 30);
        imagepng($image, $tmp);
        $files = ['photo' => ['name' => 'photo.png', 'type' => 'image/png', 'tmp_name' => $tmp, 'error' => UPLOAD_ERR_OK, 'size' => filesize($tmp)]];
        $request = new Request('POST', '/api/photos', [], WriteHeader::headers() + ['content-type' => 'multipart/form-data; boundary=x', 'content-length' => '500'], '', $files, ['REMOTE_ADDR' => self::LOOPBACK, 'CONTENT_LENGTH' => '500']);

        $photo = $this->ok($this->app()->handle($request), 201);
        self::assertSame(['id', 'url', 'width', 'height'], array_keys((array) $photo));
        self::assertMatchesRegularExpression(Shared::fromFile(Paths::schema('shared.json'))->photoPathPattern(), $photo->url);
        self::assertFileExists("$this->appRoot/$photo->url", 'photos land in <app root>/uploads');
        self::assertSame([40, 30], [$photo->width, $photo->height]);

        $input = $this->input();
        $input->photoId = $photo->id;
        $id = $this->ok($this->app()->handle(self::request('POST', '/api/flyers', $input)), 201)->id;
        self::assertEquals($photo, $this->ok($this->app()->handle(self::request('GET', "/api/flyers/$id")))->photo);
    }

    public function testWritesNeedTheHeader(): void
    {
        $this->assertError($this->app()->handle(self::request('POST', '/api/flyers', $this->input(), headers: [])), 403, 'forbidden');
        $this->assertError($this->app()->handle(self::request('DELETE', '/api/flyers/1', null, headers: [])), 403, 'forbidden');
        self::assertSame([], $this->ok($this->app()->handle(self::request('GET', '/api/flyers'))));
    }

    public function testUnknownEndpointsAre404(): void
    {
        $this->assertError($this->app()->handle(self::request('GET', '/api/nowhere')), 404, 'not_found');
        $this->assertError($this->app()->handle(self::request('POST', '/api/render/1', (object) ['format' => 'png'])), 404, 'not_found');
        $this->assertError($this->app()->handle(self::request('PATCH', '/api/flyers/1', new stdClass())), 404, 'not_found');
    }

    public function testMalformedJsonIs400EvenWithoutTheHeader(): void
    {
        $this->assertError($this->app()->handle(self::request('POST', '/api/flyers', '{"title": ', headers: [])), 400, 'invalid');
    }

    public function testValidationNamesTheFields(): void
    {
        $input = $this->input();
        $input->title = '';
        $error = $this->assertError($this->app()->handle(self::request('POST', '/api/flyers', $input)), 400, 'invalid');
        self::assertSame(['title'], array_keys((array) $error->fields));

        // A number JSON can carry but PHP and JavaScript cannot: 1e400 decodes to
        // INF. A sentinel keeps the replacement off photoCrop's "x":0.5.
        $input = $this->input();
        $input->data->doodles[0]->x = 4242424242;
        $raw = str_replace('"x":4242424242', '"x":1e400', Json::encode($input));
        self::assertStringContainsString('1e400', $raw);
        $error = $this->assertError($this->app()->handle(self::request('POST', '/api/flyers', $raw)), 400, 'invalid');
        self::assertSame(['data.doodles.0.x'], array_keys((array) $error->fields));
    }

    protected function assertPostConditions(): void
    {
        // The tests whose point is a line in the log check it themselves.
        if (!in_array($this->name(), ['testAnInvalidConfigIs503AndSaysWhyInTheLog', 'testALedgerFileThatCannotBeReadHidesTheAiAndLeavesTheAppUp', 'testALookThisReleaseDoesNotHaveInConfigPhpIs503AndTheLogNamesTheSettingNotTheValue'], true)) {
            self::assertSame('', $this->log(), 'nothing was logged');
        }
    }

    /** @return array<string, mixed> */
    private function config(): array
    {
        return ['access' => ['allowIps' => ['127.0.0.1/32', '::1/128']], 'dataDir' => $this->dataDir];
    }

    private function app(): Bootstrap
    {
        return $this->app ??= Bootstrap::fromAppRoot($this->appRoot, $this->config());
    }

    /**
     * config.php's `ai` block on the fake provider, naming these features: every one the app has, unless told.
     *
     * @param list<string>|null $features
     * @return array<string, mixed>
     */
    private function fakeAi(?array $features = null): array
    {
        return ['provider' => 'fake', 'features' => $features ?? Shared::fromFile(Paths::schema('shared.json'))->ai()['features']];
    }

    /** @return list<string> every feature the app has but this one */
    private static function allBut(string $off): array
    {
        return array_values(array_diff(Shared::fromFile(Paths::schema('shared.json'))->ai()['features'], [$off]));
    }

    /**
     * api/config's `ai` block, as decoded, on a site that runs $named: each with its limit ($own, else the default 3)
     * and what is $left of it today (all of it, unless said).
     *
     * @param list<string> $named
     * @param array<string, int> $left
     * @param array<string, int> $own
     */
    private static function on(array $named, array $left = [], array $own = []): stdClass
    {
        $features = [];
        foreach ($named as $name) {
            $limit = $own[$name] ?? 3;
            $features[] = (object) ['name' => $name, 'limit' => $limit, 'remaining' => $left[$name] ?? $limit];
        }
        return (object) ['enabled' => true, 'features' => $features];
    }

    /** A good JSON body for a feature's route, which is api/ai/<the feature's name>. The read takes a picture, not
     *  JSON: its row is what a caller who thought otherwise would send. */
    private function aiBody(string $feature): stdClass
    {
        return match ($feature) {
            'flyer' => (object) ['text' => 'Yoga mañana a las 9 en la terraza'],
            'share' => (object) ['hostel' => null, 'template' => 'activity', 'data' => $this->input()->data],
            'photo' => (object) ['picture' => 'not how a picture is sent'],
        };
    }

    /** A good request to a feature's route. */
    private function good(string $feature): Request
    {
        return $feature === 'photo' ? $this->picture(self::jpeg(64, 48)) : self::request('POST', "/api/ai/$feature", $this->aiBody($feature));
    }

    /**
     * POST api/ai/photo with these bytes in the field "photo", as PHP would hand the upload over; null sends the form
     * with no file in it.
     *
     * @param array<string, string>|null $headers
     */
    private function picture(?string $bytes, ?array $headers = null): Request
    {
        $files = [];
        if ($bytes !== null) {
            $tmp = "$this->logDir/picture-" . bin2hex(random_bytes(4));
            file_put_contents($tmp, $bytes);
            $files = ['photo' => ['name' => 'picture', 'type' => 'application/octet-stream', 'tmp_name' => $tmp, 'error' => UPLOAD_ERR_OK, 'size' => strlen($bytes)]];
        }
        $headers ??= WriteHeader::headers();
        return new Request('POST', '/api/ai/photo', [], $headers + ['content-type' => 'multipart/form-data; boundary=x', 'content-length' => '500'], '', $files, ['REMOTE_ADDR' => self::LOOPBACK, 'CONTENT_LENGTH' => '500']);
    }

    private function needsGd(): void
    {
        if (!extension_loaded('gd')) {
            self::markTestSkipped('GD is not loaded');
        }
    }

    private static function jpeg(int $width, int $height): string
    {
        ob_start();
        imagejpeg(imagecreatetruecolor($width, $height));
        return (string) ob_get_clean();
    }

    private static function png(int $width, int $height): string
    {
        ob_start();
        imagepng(imagecreatetruecolor($width, $height));
        return (string) ob_get_clean();
    }

    /** The catalogue's message for an error: ai_off and an unknown path share their status and code. */
    private function message(string $key): string
    {
        return ErrorCatalog::fromShared(Shared::fromFile(Paths::schema('shared.json')))->make($key)->getMessage();
    }

    /** The first sample flyer (seed/samples.json) as a request body. */
    private function input(): stdClass
    {
        $sample = Json::decode((string) file_get_contents(Paths::seed('samples.json')))[0];
        return (object) ['title' => $sample->title, 'hostel' => $sample->hostel, 'template' => $sample->template, 'data' => $sample->data, 'photoId' => null];
    }

    /**
     * @param array<string, string> $query
     * @param array<string, string> $headers
     */
    private static function request(string $method, string $path, mixed $json = null, array $query = [], string $ip = self::LOOPBACK, ?array $headers = null): Request
    {
        $headers ??= WriteHeader::headers();
        $body = '';
        if ($json !== null) {
            $body = is_string($json) ? $json : Json::encode($json);
            $headers += ['content-type' => 'application/json', 'content-length' => (string) strlen($body)];
        }
        return new Request($method, $path, $query, $headers, $body, [], ['REMOTE_ADDR' => $ip]);
    }

    private function ok(Response $response, int $status = 200): mixed
    {
        self::assertSame($status, $response->status, $response->body);
        self::assertStringStartsWith('application/json', $response->headers['Content-Type'] ?? '');
        return Json::decode($response->body);
    }

    private function assertError(Response $response, int $status, string $code): stdClass
    {
        self::assertSame($status, $response->status, $response->body);
        self::assertStringStartsWith('application/json', $response->headers['Content-Type'] ?? '');
        $error = Json::decode($response->body)->error;
        self::assertSame($code, $error->code);
        return $error;
    }

    private function log(): string
    {
        $file = "$this->logDir/php-errors.log";
        return is_file($file) ? (string) file_get_contents($file) : '';
    }
}
