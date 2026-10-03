<?php

declare(strict_types=1);

namespace NestFlyers\Tests\Ai;

use NestFlyers\Ai\AiBundle;
use NestFlyers\Json;
use NestFlyers\Tests\Support\Paths;
use NestFlyers\Tests\Support\TempDir;
use NestFlyers\Validation\SchemaNormalizer;
use NestFlyers\Validation\SchemaValidator;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use RuntimeException;
use stdClass;

/** schema/ai.json as `npm run gen` writes it: read and checked when the AI is on, as server/ai/bundle.ts loads it. */
final class AiBundleTest extends TestCase
{
    private ?string $dir = null;

    protected function tearDown(): void
    {
        if ($this->dir !== null) {
            TempDir::remove($this->dir);
        }
    }

    public function testTheGeneratedBundleLoadsAsWritten(): void
    {
        $file = Json::decode((string) file_get_contents(Paths::schema('ai.json')));
        $bundle = AiBundle::fromFile(Paths::schema('ai.json'), self::validator());

        self::assertSame((array) $file->prompts, $bundle->prompts);
        self::assertCount(count($file->examples), $bundle->examples);
        // Byte for byte, key order included: the few-shot answers go to the provider as JSON.stringify writes them.
        self::assertSame(Json::encode($file->examples), Json::encode($bundle->examples));
        self::assertSame(['flyerAnswer', 'shareAnswer', 'flyerRequest', 'shareRequest'], array_keys($bundle->schemas));
    }

    public function testEverySchemaTakesAValidValueThroughThePhpValidator(): void
    {
        // SchemaNormalizer refuses keywords it does not follow ($ref, allOf, oneOf…): the bundle's schemas must stay inline.
        $bundle = AiBundle::fromFile(Paths::schema('ai.json'), self::validator());
        $sample = Json::decode((string) file_get_contents(Paths::seed('samples.json')))[0];
        $values = [
            'flyerAnswer' => $bundle->examples[0]->answer,
            'shareAnswer' => (object) ['share' => 'Yoga mañana'],
            'flyerRequest' => (object) ['text' => '  Yoga at 9  ', 'hostel' => 'duque-nest'],
            'shareRequest' => (object) ['hostel' => null, 'template' => $sample->template, 'data' => $sample->data, 'idea' => 'Yoga'],
        ];
        foreach ($values as $name => $value) {
            self::assertInstanceOf(stdClass::class, self::validator()->validate($value, $bundle->schemas[$name]), $name);
        }
    }

    /** @return iterable<string, array{string, string}> */
    public static function brokenBundles(): iterable
    {
        yield 'not JSON' => ['{', 'ai.json'];
        yield 'no prompts' => ['{"examples": [], "schemas": {}}', 'prompts'];
        yield 'an empty prompt' => ['{"prompts": {"flyer": "", "share": "S"}, "examples": [], "schemas": {}}', 'prompts'];
        yield 'a schema missing' => ['{"prompts": {"flyer": "F", "share": "S"}, "examples": [], "schemas": {"flyerAnswer": {}}}', 'schemas'];
    }

    #[DataProvider('brokenBundles')]
    public function testABrokenBundleIsRefusedNamingTheFile(string $json, string $mentions): void
    {
        $file = $this->write($json);
        try {
            AiBundle::fromFile($file, self::validator());
            self::fail('The bundle was accepted');
        } catch (RuntimeException $e) {
            self::assertStringContainsString('ai.json', $e->getMessage());
            self::assertStringContainsString($mentions, $e->getMessage());
        }
    }

    public function testAnExampleWhoseAnswerFailsItsSchemaIsRefused(): void
    {
        $bundle = Json::decode((string) file_get_contents(Paths::schema('ai.json')));
        $bundle->examples[0]->answer->brief->template = 'poster';
        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage('examples.0');
        AiBundle::fromFile($this->write(Json::encode($bundle)), self::validator());
    }

    public function testAMissingBundleSaysTheReleaseIsIncomplete(): void
    {
        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage('the release is incomplete');
        AiBundle::fromFile(Paths::schema('no-such-ai.json'), self::validator());
    }

    private function write(string $json): string
    {
        $this->dir ??= TempDir::create('bundle');
        file_put_contents("$this->dir/ai.json", $json);
        return "$this->dir/ai.json";
    }

    private static function validator(): SchemaValidator
    {
        return new SchemaValidator(new SchemaNormalizer());
    }
}
