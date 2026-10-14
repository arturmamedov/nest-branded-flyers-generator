<?php

declare(strict_types=1);

namespace NestFlyers\Tests;

use InvalidArgumentException;
use NestFlyers\Config;
use NestFlyers\Shared;
use NestFlyers\SiteLooks;
use NestFlyers\Tests\Support\Paths;
use NestFlyers\Tests\Support\TempDir;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

final class ConfigTest extends TestCase
{
    /** A made-up app root: fromArray() never touches the filesystem. */
    private const ROOT = '/srv/www/nest-flyers';

    private ?string $appRoot = null;

    protected function tearDown(): void
    {
        if ($this->appRoot !== null) {
            TempDir::remove($this->appRoot);
        }
    }

    public function testAMissingFileIsNoConfig(): void
    {
        self::assertNull(Config::load($this->tempRoot(), self::shared()));
    }

    public function testTheFileIsLoaded(): void
    {
        $root = $this->tempRoot();
        file_put_contents("$root/config.php", "<?php\nreturn ['access' => ['allowIps' => ['10.0.0.0/8']], 'imageProcessor' => 'gd'];\n");
        $config = Config::load($root, self::shared());
        self::assertNotNull($config);
        self::assertTrue($config->access->allowsIp('10.1.2.3'));
        self::assertSame('gd', $config->imageProcessor);
        self::assertSame("$root/data", $config->dataDir);
    }

    public function testStrayOutputInTheFileIsSwallowed(): void
    {
        $root = $this->tempRoot();
        // A BOM and a blank line before "<?php", as a Windows editor might leave them.
        file_put_contents("$root/config.php", "\xEF\xBB\xBF\n<?php return ['access' => ['allowPublic' => true]];");
        $level = ob_get_level();
        $this->expectOutputString('');
        self::assertTrue(Config::load($root, self::shared())?->access->allowPublic);
        self::assertSame($level, ob_get_level());
    }

    /** @return iterable<string, array{string}> */
    public static function brokenFiles(): iterable
    {
        yield 'returns a string' => ["<?php return 'allowPublic';"];
        yield 'returns nothing' => ["<?php \$access = ['allowPublic' => true];"];
        yield 'returns a list' => ["<?php return ['10.0.0.0/8'];"];
        yield 'does not parse' => ["<?php return [;"];
        yield 'throws' => ["<?php throw new RuntimeException('no');"];
    }

    #[DataProvider('brokenFiles')]
    public function testABrokenFileIsInvalid(string $php): void
    {
        $root = $this->tempRoot();
        file_put_contents("$root/config.php", $php);
        $level = ob_get_level();
        try {
            Config::load($root, self::shared());
            self::fail('The file was accepted');
        } catch (InvalidArgumentException $e) {
            self::assertStringContainsString('config.php', $e->getMessage());
        }
        self::assertSame($level, ob_get_level(), 'no output buffer is left open');
    }

    public function testDefaults(): void
    {
        $config = Config::fromArray([], self::ROOT, self::shared());
        self::assertFalse($config->access->isConfigured(), 'no rule: the API answers 503');
        self::assertSame(self::ROOT . '/data', $config->dataDir);
        self::assertSame('json', $config->storage);
        self::assertSame('auto', $config->imageProcessor);
    }

    public function testTheSampleShapeIsValid(): void
    {
        $hash = password_hash('pw', PASSWORD_BCRYPT, ['cost' => 4]);
        $config = Config::fromArray([
            'access' => [
                'allowIps' => ['203.0.113.7/32', '2001:db8::/32'],
                'basicAuth' => ['user' => 'staff', 'passwordHash' => $hash],
                'allowPublic' => false,
            ],
            'dataDir' => null,
            'storage' => 'json',
            'imageProcessor' => 'imagick',
            'ai' => [
                'provider' => 'anthropic',
                'apiKey' => 'sk-ant-test',
                'features' => ['flyer', 'share'],
                'dailyLimit' => null,
                'dailyLimits' => null,
                'model' => null,
                'models' => null,
                'effort' => null,
                'timeoutMs' => null,
                'enabled' => true,
            ],
        ], self::ROOT, self::shared());
        self::assertTrue($config->access->isConfigured());
        self::assertSame(['user' => 'staff', 'passwordHash' => $hash], $config->access->basicAuth);
        self::assertCount(2, $config->access->allowIps);
        self::assertSame('imagick', $config->imageProcessor);
        self::assertTrue($config->ai->enabled);
        self::assertSame('claude-haiku-4-5', $config->ai->model);
        self::assertSame(['flyer', 'share'], $config->ai->features);
        self::assertSame(self::everyFeature(3), $config->ai->dailyLimits);
    }

    public function testConfigSamplePhpAsShippedIsValidAndLeavesTheAiOff(): void
    {
        $root = $this->tempRoot();
        copy(Paths::repo() . '/php/web/config.sample.php', "$root/config.php");
        $raw = require "$root/config.php";
        self::assertSame(['provider', 'apiKey', 'features', 'dailyLimit', 'dailyLimits', 'model', 'models', 'effort', 'timeoutMs', 'enabled'], array_keys($raw['ai'] ?? []), 'the sample shows every key');
        self::assertFalse(Config::load($root, self::shared())?->ai->enabled);
        // None until named: a site that copies the sample and adds its key runs nothing until it names a feature itself.
        self::assertSame([], $raw['ai']['features'], 'the sample names no feature');
        self::assertNull($raw['ai']['dailyLimit'], 'the sample sets no cap of its own');
        self::assertNull($raw['ai']['dailyLimits'], 'the sample gives no feature a number of its own');
        self::assertNull($raw['ai']['models'], 'the sample gives no feature a model of its own');
        // Shown, and left out: a release from before looks refuses the key, so a copied sample never blocks going back.
        self::assertArrayNotHasKey('looks', $raw);
        self::assertMatchesRegularExpression("~^\s*// 'looks' => \[~m", (string) file_get_contents(Paths::repo() . '/php/web/config.sample.php'));
        self::assertSame([self::shared()->looks()['ids'][0]], Config::load($root, self::shared())?->looks);
    }

    // ---- `looks` (SiteLooks): the PHP side of server/config.ts's namedLooks ----

    /**
     * tests/fixtures/looks-settings.json: the looks its rows are read against, and the rows config.php can spell.
     *
     * @return array{known: list<string>, rows: array<string, array<string, mixed>>}
     */
    private static function looksVectors(string $outcome): array
    {
        $vectors = json_decode((string) file_get_contents(Paths::fixture('looks-settings.json')), true, flags: JSON_THROW_ON_ERROR);
        $rows = [];
        foreach ($vectors[$outcome] as $row) {
            if (array_key_exists('php', $row)) {
                $rows[$row['name']] = $row;
            }
        }
        return ['known' => $vectors['known'], 'rows' => $rows];
    }

    /** @return iterable<string, array{mixed, list<string>, list<string>}> */
    public static function looksAccepted(): iterable
    {
        $vectors = self::looksVectors('accepted');
        foreach ($vectors['rows'] as $name => $row) {
            yield $name => [$row['php'], $vectors['known'], $row['looks']];
        }
    }

    /**
     * @param list<string> $known
     * @param list<string> $looks
     */
    #[DataProvider('looksAccepted')]
    public function testTheLooksASiteOffersAreTheOnesItNamesInItsOrder(mixed $named, array $known, array $looks): void
    {
        self::assertSame($looks, SiteLooks::fromConfig($named, $known));
    }

    /** @return iterable<string, array{mixed, list<string>}> */
    public static function looksRefused(): iterable
    {
        $vectors = self::looksVectors('refused');
        foreach ($vectors['rows'] as $name => $row) {
            yield $name => [$row['php'], $vectors['known']];
        }
    }

    /** @param list<string> $known */
    #[DataProvider('looksRefused')]
    public function testLooksNobodyWroteAreRefusedByTheSettingsName(mixed $named, array $known): void
    {
        $this->expectException(InvalidArgumentException::class);
        $this->expectExceptionMessage('looks must be null or a list of: hand-drawn, second, each once');
        SiteLooks::fromConfig($named, $known);
    }

    public function testASiteIsHeldToTheLooksThisReleaseHasAndWithoutTheKeyOffersTheFirstAlone(): void
    {
        $ids = self::shared()->looks()['ids'];
        self::assertSame([$ids[0]], Config::fromArray([], self::ROOT, self::shared())->looks);
        self::assertSame([$ids[0]], Config::fromArray(['looks' => null], self::ROOT, self::shared())->looks);
        self::assertSame($ids, Config::fromArray(['looks' => $ids], self::ROOT, self::shared())->looks);
        $this->expectException(InvalidArgumentException::class);
        $this->expectExceptionMessage('looks must be');
        Config::fromArray(['looks' => [$ids[0], 'a-later-look']], self::ROOT, self::shared());
    }

    // ---- the `ai` block (AiConfig): the PHP side of server/config.ts's loadAiSettings ----

    public function testWithoutAnAiBlockTheAiIsOff(): void
    {
        $ai = Config::fromArray([], self::ROOT, self::shared())->ai;
        self::assertSame([null, null, null, null, 25_000, false, []], [$ai->provider, $ai->apiKey, $ai->model, $ai->effort, $ai->timeoutMs, $ai->enabled, $ai->features]);
        self::assertSame(self::everyFeature(3), $ai->dailyLimits);
    }

    public function testTheFakeProviderNeedsNoKey(): void
    {
        $ai = Config::fromArray(['ai' => ['provider' => 'fake']], self::ROOT, self::shared())->ai;
        self::assertSame(['fake', null, 'fake-1', true], [$ai->provider, $ai->apiKey, $ai->model, $ai->enabled]);
    }

    public function testARealProviderIsOffUntilItHasAKeyAndTakesItsDefaultModel(): void
    {
        $keyless = Config::fromArray(['ai' => ['provider' => 'openai']], self::ROOT, self::shared())->ai;
        self::assertSame(['openai', null, 'gpt-6-luna', false], [$keyless->provider, $keyless->apiKey, $keyless->model, $keyless->enabled]);
        $blank = Config::fromArray(['ai' => ['provider' => 'openai', 'apiKey' => '', 'model' => '', 'effort' => '']], self::ROOT, self::shared())->ai;
        self::assertSame([null, 'gpt-6-luna', null, false], [$blank->apiKey, $blank->model, $blank->effort, $blank->enabled], "'' is unset, as Node's || reads it");
        $keyed = Config::fromArray(['ai' => ['provider' => 'openai', 'apiKey' => 'sk-test']], self::ROOT, self::shared())->ai;
        self::assertSame(['sk-test', 'gpt-6-luna', true], [$keyed->apiKey, $keyed->model, $keyed->enabled]);
        $anthropic = Config::fromArray(['ai' => ['provider' => 'anthropic', 'apiKey' => 'k']], self::ROOT, self::shared())->ai;
        self::assertSame(['claude-haiku-4-5', true], [$anthropic->model, $anthropic->enabled]);
    }

    public function testTheModelTheEffortAndTheTimeLimitCanBeSet(): void
    {
        $ai = Config::fromArray(['ai' => ['provider' => 'anthropic', 'apiKey' => 'k', 'model' => 'claude-sonnet-5-5', 'effort' => 'low', 'timeoutMs' => 9000]], self::ROOT, self::shared())->ai;
        self::assertSame(['anthropic', 'k', 'claude-sonnet-5-5', 'low', 9000, true], [$ai->provider, $ai->apiKey, $ai->model, $ai->effort, $ai->timeoutMs, $ai->enabled]);
    }

    public function testEnabledFalseSwitchesItOffEvenWithAKey(): void
    {
        $ai = Config::fromArray(['ai' => ['provider' => 'openai', 'apiKey' => 'k', 'enabled' => false]], self::ROOT, self::shared())->ai;
        self::assertFalse($ai->enabled);
    }

    // The owner's answer (2026-10-05): none until named. The switch keeps its meaning; what runs is a second fact.
    public function testAProviderAndItsKeyNameNoFeatureTheFeaturesKeyDoes(): void
    {
        $keyed = Config::fromArray(['ai' => ['provider' => 'openai', 'apiKey' => 'k']], self::ROOT, self::shared())->ai;
        self::assertSame([true, []], [$keyed->enabled, $keyed->features]);
        $named = Config::fromArray(['ai' => ['provider' => 'openai', 'apiKey' => 'k', 'features' => ['share']]], self::ROOT, self::shared())->ai;
        self::assertSame([true, ['share']], [$named->enabled, $named->features]);
    }

    /**
     * The rows of tests/fixtures/ai-settings.json that config.php can spell (a row without `php` is Node's alone).
     *
     * @return array<string, array<string, mixed>>
     */
    private static function settingsRows(string $setting, string $outcome): array
    {
        $vectors = json_decode((string) file_get_contents(Paths::fixture('ai-settings.json')), true, flags: JSON_THROW_ON_ERROR);
        $rows = [];
        foreach ($vectors[$setting][$outcome] as $row) {
            if (array_key_exists('php', $row)) {
                $rows[$row['name']] = $row;
            }
        }
        return $rows;
    }

    /** @return iterable<string, array{mixed, list<string>}> */
    public static function featuresAccepted(): iterable
    {
        foreach (self::settingsRows('features', 'accepted') as $name => $row) {
            yield $name => [$row['php'], $row['runs']];
        }
    }

    /** @param list<string> $runs */
    #[DataProvider('featuresAccepted')]
    public function testTheFeaturesThatRunAreTheOnesNamed(mixed $named, array $runs): void
    {
        self::assertSame($runs, Config::fromArray(['ai' => ['provider' => 'fake', 'features' => $named]], self::ROOT, self::shared())->ai->features);
    }

    /** @return iterable<string, array{mixed}> */
    public static function featuresRefused(): iterable
    {
        foreach (self::settingsRows('features', 'refused') as $name => $row) {
            yield $name => [$row['php']];
        }
    }

    #[DataProvider('featuresRefused')]
    public function testFeaturesNobodyWroteAreRefusedByTheSettingsNameWhetherOrNotTheAiIsOn(mixed $named): void
    {
        foreach ([['features' => $named], ['provider' => 'fake', 'features' => $named]] as $block) {
            try {
                Config::fromArray(['ai' => $block], self::ROOT, self::shared());
                self::fail('The block was accepted');
            } catch (InvalidArgumentException $e) {
                self::assertStringContainsString('ai.features', $e->getMessage());
            }
        }
    }

    /** @return iterable<string, array{mixed, int}> */
    public static function dailyLimitAccepted(): iterable
    {
        foreach (self::settingsRows('dailyLimit', 'accepted') as $name => $row) {
            yield $name => [$row['php'], $row['limit']];
        }
    }

    // The owner's answers: the limit is a setting, 3 by default, bounded in the code (2026-10-05), and it is every
    // feature's own number unless the feature has one of its own (2026-10-06).
    #[DataProvider('dailyLimitAccepted')]
    public function testTheSitesOwnNumberOrTheDefaultIsEveryFeaturesDailyLimit(mixed $set, int $limit): void
    {
        self::assertSame(self::everyFeature($limit), Config::fromArray(['ai' => ['provider' => 'fake', 'dailyLimit' => $set]], self::ROOT, self::shared())->ai->dailyLimits);
    }

    /** @return iterable<string, array{mixed}> */
    public static function dailyLimitRefused(): iterable
    {
        foreach (self::settingsRows('dailyLimit', 'refused') as $name => $row) {
            yield $name => [$row['php']];
        }
    }

    #[DataProvider('dailyLimitRefused')]
    public function testADailyCapOutOfBoundsIsRefusedByTheSettingsNameWhetherOrNotTheAiIsOn(mixed $set): void
    {
        foreach ([['dailyLimit' => $set], ['provider' => 'fake', 'dailyLimit' => $set]] as $block) {
            try {
                Config::fromArray(['ai' => $block], self::ROOT, self::shared());
                self::fail('The block was accepted');
            } catch (InvalidArgumentException $e) {
                self::assertStringContainsString('ai.dailyLimit', $e->getMessage());
            }
        }
    }

    public function testTheVectorsDefaultAndTheirMostAreTheSharedFacts(): void
    {
        $facts = self::shared()->ai();
        $limits = array_column(self::settingsRows('dailyLimit', 'accepted'), 'limit', 'name');
        self::assertSame($facts['dailyLimit'], $limits['not set: the default']);
        self::assertSame($facts['dailyLimitMax'], max($limits));
        self::assertContains($facts['dailyLimitMax'] + 1, array_column(self::settingsRows('dailyLimit', 'refused'), 'php'));
    }

    /**
     * A limit for every feature the app has: its own where $own names it, else $others.
     *
     * @param array<string, int> $own
     * @return array<string, int>
     */
    private static function everyFeature(int $others, array $own = []): array
    {
        $limits = [];
        foreach (self::shared()->ai()['features'] as $feature) {
            $limits[$feature] = $own[$feature] ?? $others;
        }
        return $limits;
    }

    /**
     * What a row of the per-feature limits sets in the `ai` block: its pairs, and the site's own number when it has one.
     *
     * @param array<string, mixed> $row
     * @return array<string, mixed>
     */
    private static function limitsBlock(array $row): array
    {
        return ['dailyLimits' => $row['php']] + (array_key_exists('site', $row) ? ['dailyLimit' => $row['site']] : []);
    }

    /** @return iterable<string, array{array<string, mixed>, array<string, int>, int}> */
    public static function dailyLimitsAccepted(): iterable
    {
        foreach (self::settingsRows('dailyLimits', 'accepted') as $name => $row) {
            yield $name => [self::limitsBlock($row), $row['limits'], $row['others']];
        }
    }

    // The owner's answers (2026-10-06): every feature its own daily limit, 'dailyLimit' each feature's number unless it
    // has its own, and one key of pairs for those.
    /**
     * @param array<string, mixed> $block
     * @param array<string, int> $limits
     */
    #[DataProvider('dailyLimitsAccepted')]
    public function testEachFeatureTakesItsOwnDailyLimitOrTheSites(array $block, array $limits, int $others): void
    {
        self::assertSame(self::everyFeature($others, $limits), Config::fromArray(['ai' => ['provider' => 'fake'] + $block], self::ROOT, self::shared())->ai->dailyLimits);
    }

    /** @return iterable<string, array{array<string, mixed>}> */
    public static function dailyLimitsRefused(): iterable
    {
        foreach (self::settingsRows('dailyLimits', 'refused') as $name => $row) {
            yield $name => [self::limitsBlock($row)];
        }
    }

    /** @param array<string, mixed> $block */
    #[DataProvider('dailyLimitsRefused')]
    public function testDailyLimitsNobodyWroteAreRefusedByTheSettingsNameWhetherOrNotTheAiIsOn(array $block): void
    {
        foreach ([$block, ['provider' => 'fake'] + $block] as $ai) {
            try {
                Config::fromArray(['ai' => $ai], self::ROOT, self::shared());
                self::fail('The block was accepted');
            } catch (InvalidArgumentException $e) {
                self::assertStringContainsString('ai.dailyLimits', $e->getMessage());
            }
        }
    }

    public function testThePerFeatureVectorsNameRealFeaturesAndTheirDefaultAndTheirMostAreTheSharedFacts(): void
    {
        $facts = self::shared()->ai();
        $accepted = self::settingsRows('dailyLimits', 'accepted');
        $numbers = [];
        foreach ($accepted as $name => $row) {
            foreach ($row['limits'] as $feature => $limit) {
                self::assertContains($feature, $facts['features'], $name);
                $numbers[] = $limit;
            }
        }
        self::assertSame($facts['dailyLimit'], $accepted['not set: every feature takes the default']['others']);
        self::assertSame($facts['dailyLimitMax'], max($numbers));
    }

    public function testANumberForAFeatureTheSiteDoesNotRunIsKeptAndRunsNothing(): void
    {
        [$runs, $other] = self::shared()->ai()['features'];
        $ai = Config::fromArray(['ai' => ['provider' => 'fake', 'features' => [$runs], 'dailyLimits' => [$other => 9]]], self::ROOT, self::shared())->ai;
        self::assertSame([$runs], $ai->features);
        self::assertSame(self::everyFeature(3, [$other => 9]), $ai->dailyLimits);
    }

    /**
     * A model for every feature the app has: its own where $own names it, else $others.
     *
     * @param array<string, string> $own
     * @return array<string, ?string>
     */
    private static function everyFeaturesModel(?string $others, array $own = []): array
    {
        $models = [];
        foreach (self::shared()->ai()['features'] as $feature) {
            $models[$feature] = $own[$feature] ?? $others;
        }
        return $models;
    }

    /**
     * What a row of the per-feature models sets in the `ai` block: its pairs, and the site's own model when it has one.
     *
     * @param array<string, mixed> $row
     * @return array<string, mixed>
     */
    private static function modelsBlock(array $row): array
    {
        return ['models' => $row['php']] + (array_key_exists('site', $row) ? ['model' => $row['site']] : []);
    }

    /** @return iterable<string, array{array<string, mixed>, array<string, string>, ?string}> */
    public static function modelsAccepted(): iterable
    {
        foreach (self::settingsRows('models', 'accepted') as $name => $row) {
            yield $name => [self::modelsBlock($row), $row['models'], $row['site'] ?? null];
        }
    }

    // The owner's answer (2026-10-06): "A model per feature, now", so a feature can run on a stronger model than the
    // rest. 'model' stays every feature's model unless the feature has its own.
    /**
     * @param array<string, mixed> $block
     * @param array<string, string> $models
     */
    #[DataProvider('modelsAccepted')]
    public function testEachFeatureTakesItsOwnModelOrTheSites(array $block, array $models, ?string $site): void
    {
        self::assertSame(self::everyFeaturesModel($site ?? 'fake-1', $models), Config::fromArray(['ai' => ['provider' => 'fake'] + $block], self::ROOT, self::shared())->ai->models);
        // With a real provider the rest take its default model, but for a feature with a default of its own there.
        $openai = Config::fromArray(['ai' => ['provider' => 'openai', 'apiKey' => 'k'] + $block], self::ROOT, self::shared())->ai;
        $own = $models + self::shared()->ai()['featureDefaultModel']['openai'];
        self::assertSame(self::everyFeaturesModel($site ?? 'gpt-6-luna', $own), $openai->models);
    }

    /** @return iterable<string, array{string, array<string, mixed>, array<string, string>}> */
    public static function modelDefaults(): iterable
    {
        foreach (self::settingsRows('models', 'defaults') as $name => $row) {
            yield $name => [$row['provider'], self::modelsBlock($row), $row['runs']];
        }
    }

    // The owner's answers (2026-10-06, after the real reads): the picture read runs on each provider's middle model by
    // itself. The fast models wrote a wrong time off a handwritten board, three reads of three; a host that names the
    // read and forgets its model must not get that. The rows are literal model names, held on both backends.
    /**
     * @param array<string, mixed> $block
     * @param array<string, string> $runs
     */
    #[DataProvider('modelDefaults')]
    public function testWhatEachFeatureRunsOn(string $provider, array $block, array $runs): void
    {
        $ai = ['provider' => $provider] + ($provider === 'fake' ? [] : ['apiKey' => 'k']) + $block;
        self::assertSame($runs, Config::fromArray(['ai' => $ai], self::ROOT, self::shared())->ai->models);
    }

    public function testTheDefaultRowsSayWhatEveryFeatureRunsOnAndTheReadsDefaultIsNoProvidersOwn(): void
    {
        $facts = self::shared()->ai();
        foreach (self::settingsRows('models', 'defaults') as $name => $row) {
            self::assertSame($facts['features'], array_keys($row['runs']), $name);
        }
        self::assertSame(['openai' => ['photo' => 'gpt-6.1-sol'], 'anthropic' => ['photo' => 'claude-sonnet-5-5']], $facts['featureDefaultModel']);
        foreach (['openai', 'anthropic'] as $provider) {
            self::assertNotSame($facts['defaultModel'][$provider], $facts['featureDefaultModel'][$provider]['photo']);
        }
    }

    /** @return iterable<string, array{array<string, mixed>}> */
    public static function modelsRefused(): iterable
    {
        foreach (self::settingsRows('models', 'refused') as $name => $row) {
            yield $name => [self::modelsBlock($row)];
        }
    }

    /** @param array<string, mixed> $block */
    #[DataProvider('modelsRefused')]
    public function testModelsNobodyWroteAreRefusedByTheSettingsNameWhetherOrNotTheAiIsOn(array $block): void
    {
        foreach ([$block, ['provider' => 'fake'] + $block] as $ai) {
            try {
                Config::fromArray(['ai' => $ai], self::ROOT, self::shared());
                self::fail('The block was accepted');
            } catch (InvalidArgumentException $e) {
                self::assertStringContainsString('ai.models', $e->getMessage());
            }
        }
    }

    public function testTheModelVectorsNameRealFeatures(): void
    {
        foreach (self::settingsRows('models', 'accepted') as $name => $row) {
            foreach (array_keys($row['models']) as $feature) {
                self::assertContains($feature, self::shared()->ai()['features'], $name);
            }
        }
    }

    public function testWithNoProviderNoFeatureHasAModelWhateverModelsNames(): void
    {
        self::assertSame(self::everyFeaturesModel(null), Config::fromArray(['ai' => ['models' => ['share' => 'model-b']]], self::ROOT, self::shared())->ai->models);
        self::assertSame(self::everyFeaturesModel(null), Config::fromArray([], self::ROOT, self::shared())->ai->models);
    }

    public function testAModelForAFeatureTheSiteDoesNotRunIsKeptAndRunsNothing(): void
    {
        [$runs, $other] = self::shared()->ai()['features'];
        $ai = Config::fromArray(['ai' => ['provider' => 'fake', 'features' => [$runs], 'models' => [$other => 'model-b']]], self::ROOT, self::shared())->ai;
        self::assertSame([$runs], $ai->features);
        self::assertSame(self::everyFeaturesModel('fake-1', [$other => 'model-b']), $ai->models);
    }

    public function testARefusedAiBlockNeverQuotesTheKey(): void
    {
        // Pasted on the models' line, as a name and as a model with a space in it: neither comes back.
        foreach (['sk-secret-123', ['sk-secret-123' => 'model-b'], ['share' => 'sk-secret-123 x']] as $pairs) {
            try {
                Config::fromArray(['ai' => ['provider' => 'openai', 'models' => $pairs]], self::ROOT, self::shared());
                self::fail('The block was accepted');
            } catch (InvalidArgumentException $e) {
                self::assertStringContainsString('ai.models', $e->getMessage());
                self::assertStringNotContainsString('sk-secret-123', $e->getMessage());
            }
        }
        try {
            Config::fromArray(['ai' => ['provider' => 'openai', 'apiKey' => 'sk-secret-123', 'timeoutMs' => 'slow']], self::ROOT, self::shared());
            self::fail('The block was accepted');
        } catch (InvalidArgumentException $e) {
            self::assertStringContainsString('ai.timeoutMs', $e->getMessage());
            self::assertStringNotContainsString('sk-secret-123', $e->getMessage());
        }
        // A key pasted on the features' line is named by the setting too, never repeated.
        try {
            Config::fromArray(['ai' => ['provider' => 'openai', 'features' => ['share', 'sk-secret-123']]], self::ROOT, self::shared());
            self::fail('The block was accepted');
        } catch (InvalidArgumentException $e) {
            self::assertStringContainsString('ai.features', $e->getMessage());
            self::assertStringNotContainsString('sk-secret-123', $e->getMessage());
        }
        try {
            Config::fromArray(['ai' => ['provider' => 'openai', 'dailyLimit' => 'sk-secret-123']], self::ROOT, self::shared());
            self::fail('The block was accepted');
        } catch (InvalidArgumentException $e) {
            self::assertStringContainsString('ai.dailyLimit', $e->getMessage());
            self::assertStringNotContainsString('sk-secret-123', $e->getMessage());
        }
        // Pasted whole, as a pair's name and as a pair's number: none of them comes back.
        foreach (['sk-secret-123', ['sk-secret-123' => 5], ['share' => 'sk-secret-123']] as $pairs) {
            try {
                Config::fromArray(['ai' => ['provider' => 'openai', 'dailyLimits' => $pairs]], self::ROOT, self::shared());
                self::fail('The block was accepted');
            } catch (InvalidArgumentException $e) {
                self::assertStringContainsString('ai.dailyLimits', $e->getMessage());
                self::assertStringNotContainsString('sk-secret-123', $e->getMessage());
            }
        }
    }

    public function testAKeyThatHoldsALineBreakOrASpaceIsRefusedByNameAndNeverQuoted(): void
    {
        // 'apiKey' => "sk-…\n" (double quotes) is a key with a real line break at its end: curl then sent a broken
        // header, and nothing named the cause. The twin of loadAiSettings' check in server/config.ts.
        // The last is a no-break space, which no editor shows: Node's \s takes it for a space, and so must this.
        foreach (["sk-secret-123\n", "sk-secret-123\r\n", 'sk-secret 123', "\tsk-secret-123", "sk-secret\u{00A0}123"] as $bad) {
            try {
                Config::fromArray(['ai' => ['provider' => 'openai', 'apiKey' => $bad]], self::ROOT, self::shared());
                self::fail('The block was accepted: ' . json_encode($bad));
            } catch (InvalidArgumentException $e) {
                self::assertSame('ai.apiKey must not hold spaces or line breaks', $e->getMessage());
            }
        }
        self::assertTrue(Config::fromArray(['ai' => ['provider' => 'openai', 'apiKey' => 'sk-secret-123']], self::ROOT, self::shared())->ai->enabled);
    }

    /** @return iterable<string, array{?string, string}> */
    public static function dataDirs(): iterable
    {
        yield 'null is data/ in the app root' => [null, self::ROOT . '/data'];
        yield 'relative, under data/' => ['data/library', self::ROOT . '/data/library'];
        yield 'relative, with dot segments' => ['./data/./x/../library/', self::ROOT . '/data/library'];
        yield 'relative, outside the web root' => ['../nest-flyers-data', '/srv/www/nest-flyers-data'];
        yield 'relative, further out' => ['../../private/nest', '/srv/private/nest'];
        yield 'relative, backslashes' => ['..\\nest-data', '/srv/www/nest-data'];
        yield 'absolute, outside' => ['/home/account/nest-data', '/home/account/nest-data'];
        yield 'absolute, trailing slash' => ['/home/account/nest-data/', '/home/account/nest-data'];
        yield 'absolute, dot segments' => ['/home/account/x/../nest-data', '/home/account/nest-data'];
        yield 'absolute, Windows drive' => ['D:\\nest\\data', 'D:/nest/data'];
        yield 'absolute, Windows drive with forward slashes' => ['D:/nest/data', 'D:/nest/data'];
        yield 'absolute, UNC share' => ['\\\\nas\\share\\nest', '//nas/share/nest'];
        yield 'absolute, the default spelled out' => [self::ROOT . '/data', self::ROOT . '/data'];
    }

    #[DataProvider('dataDirs')]
    public function testDataDirResolution(?string $dataDir, string $expected): void
    {
        self::assertSame($expected, Config::fromArray(['dataDir' => $dataDir], self::ROOT, self::shared())->dataDir);
    }

    public function testASubfolderInstallCannotPutTheStoreAnywhereUnderTheDocumentRoot(): void
    {
        // The app in public_html/nest-flyers: "../nest-flyers-data" leaves the
        // app folder but is still inside public_html, so it would be served.
        $app = '/home/account/public_html/nest-flyers';
        $web = '/home/account/public_html';
        $this->expectExceptionMessage('inside the web root');
        Config::fromArray(['dataDir' => '../nest-flyers-data'], $app, self::shared(), $web);
    }

    public function testADataDirOutsideTheDocumentRootIsFine(): void
    {
        $app = '/home/account/public_html/nest-flyers';
        $web = '/home/account/public_html';
        self::assertSame('/home/account/nest-flyers-data', Config::fromArray(['dataDir' => '../../nest-flyers-data'], $app, self::shared(), $web)->dataDir);
        // The release denies data/, so the default stays allowed wherever the app lives.
        self::assertSame("$app/data", Config::fromArray([], $app, self::shared(), $web)->dataDir);
    }

    public function testDataDirIsResolvedAgainstAWindowsAppRoot(): void
    {
        self::assertSame('C:/laragon/www/nest/data', Config::fromArray([], 'C:\\laragon\\www\\nest\\', self::shared())->dataDir);
        self::assertSame('C:/laragon/nest-data', Config::fromArray(['dataDir' => '..\\..\\nest-data'], 'C:\\laragon\\www\\nest', self::shared())->dataDir);
    }

    /** @return iterable<string, array{mixed}> */
    public static function servedDataDirs(): iterable
    {
        yield 'another folder in the web root' => ['library'];
        yield 'the web root itself' => ['.'];
        yield 'out of data/ and back in' => ['data/../library'];
        yield 'absolute, in the web root' => [self::ROOT . '/static/library'];
        yield 'a sibling that only shares a prefix with data' => ['database'];
    }

    #[DataProvider('servedDataDirs')]
    public function testADataDirThatWouldBeServedIsRefused(mixed $dataDir): void
    {
        $this->expectException(InvalidArgumentException::class);
        $this->expectExceptionMessage('inside the web root');
        Config::fromArray(['dataDir' => $dataDir], self::ROOT, self::shared());
    }

    /** @return iterable<string, array{mixed}> */
    public static function invalidConfigs(): iterable
    {
        yield 'a list' => [['json']];
        yield 'not an array' => ['json'];
        yield 'an unknown key' => [['acess' => ['allowPublic' => true]]];
        yield 'another storage' => [['storage' => 'sqlite']];
        yield 'another image library' => [['imageProcessor' => 'vips']];
        yield 'dataDir empty' => [['dataDir' => '']];
        yield 'dataDir not a string' => [['dataDir' => 42]];
        yield 'access not an array' => [['access' => true]];
        yield 'access, unknown key' => [['access' => ['allowIp' => ['10.0.0.0/8']]]];
        yield 'allowIps not a list' => [['access' => ['allowIps' => '10.0.0.0/8']]];
        yield 'allowIps, bad entry' => [['access' => ['allowIps' => ['the office']]]];
        yield 'allowIps, bad prefix' => [['access' => ['allowIps' => ['10.0.0.0/40']]]];
        yield 'allowIps, not a string' => [['access' => ['allowIps' => [10]]]];
        yield 'basicAuth, plain password' => [['access' => ['basicAuth' => ['user' => 'staff', 'passwordHash' => 'hunter2']]]];
        yield 'basicAuth, no user' => [['access' => ['basicAuth' => ['passwordHash' => '$2y$04$abcdefghijklmnopqrstuu5Z0Y2eBvmAqD6Zz0ZtW3J1eXbq5v1eu']]]];
        yield 'basicAuth, user with a colon' => [['access' => ['basicAuth' => ['user' => 'a:b', 'passwordHash' => '$2y$04$abcdefghijklmnopqrstuu5Z0Y2eBvmAqD6Zz0ZtW3J1eXbq5v1eu']]]];
        yield 'basicAuth, extra key' => [['access' => ['basicAuth' => ['user' => 'staff', 'password' => 'hunter2']]]];
        yield 'allowPublic, a string' => [['access' => ['allowPublic' => 'yes']]];
        yield 'allowPublic, a number' => [['access' => ['allowPublic' => 1]]];
        yield 'ai not an array' => [['ai' => true]];
        yield 'ai, a list' => [['ai' => ['fake']]];
        yield 'ai, unknown key' => [['ai' => ['provider' => 'fake', 'key' => 'sk-test']]];
        yield 'ai, a provider nobody wrote' => [['ai' => ['provider' => 'bard']]];
        yield 'ai, provider not a string' => [['ai' => ['provider' => true]]];
        yield 'ai, apiKey not a string' => [['ai' => ['provider' => 'openai', 'apiKey' => 42]]];
        yield 'ai, model not a string' => [['ai' => ['provider' => 'openai', 'model' => ['gpt']]]];
        yield 'ai, effort not a string' => [['ai' => ['provider' => 'openai', 'effort' => 1]]];
        yield 'ai, timeoutMs zero' => [['ai' => ['provider' => 'fake', 'timeoutMs' => 0]]];
        yield 'ai, timeoutMs a string' => [['ai' => ['provider' => 'fake', 'timeoutMs' => '9000']]];
        yield 'ai, timeoutMs a float' => [['ai' => ['provider' => 'fake', 'timeoutMs' => 9000.5]]];
        yield 'ai, enabled a string' => [['ai' => ['provider' => 'fake', 'enabled' => 'no']]];
    }

    #[DataProvider('invalidConfigs')]
    public function testInvalidConfigsAreRefused(mixed $raw): void
    {
        $this->expectException(InvalidArgumentException::class);
        Config::fromArray($raw, self::ROOT, self::shared());
    }

    private static function shared(): Shared
    {
        return Shared::fromFile(Paths::schema('shared.json'));
    }

    private function tempRoot(): string
    {
        return $this->appRoot = TempDir::create('config');
    }
}
