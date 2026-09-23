<?php

declare(strict_types=1);

namespace NestFlyers\Tests;

use NestFlyers\Bootstrap;
use NestFlyers\Http\Request;
use NestFlyers\Http\Response;
use NestFlyers\Json;
use NestFlyers\Shared;
use NestFlyers\Tests\Support\Paths;
use NestFlyers\Tests\Support\TempDir;
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
        $request = new Request('POST', '/api/photos', [], ['x-nest-flyers' => '1', 'content-type' => 'multipart/form-data; boundary=x', 'content-length' => '500'], '', $files, ['REMOTE_ADDR' => self::LOOPBACK, 'CONTENT_LENGTH' => '500']);

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
        if ($this->name() !== 'testAnInvalidConfigIs503AndSaysWhyInTheLog') {
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
        $headers ??= ['x-nest-flyers' => '1'];
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
