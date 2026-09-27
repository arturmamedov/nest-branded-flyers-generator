<?php

declare(strict_types=1);

namespace NestFlyers\Tests\Http;

use Closure;
use LogicException;
use NestFlyers\Diagnostics\HostFacts;
use NestFlyers\Domain\DoodleRepository;
use NestFlyers\Domain\FlyerRepository;
use NestFlyers\Domain\HostelRepository;
use NestFlyers\Domain\MissingReference;
use NestFlyers\Domain\PhotoRepository;
use NestFlyers\Http\AccessGuard;
use NestFlyers\Http\AccessRule;
use NestFlyers\Http\Api;
use NestFlyers\Http\ApiConfig;
use NestFlyers\Http\ErrorCatalog;
use NestFlyers\Http\Kernel;
use NestFlyers\Http\Request;
use NestFlyers\Http\Response;
use NestFlyers\Http\Router;
use NestFlyers\Http\WriteGuard;
use NestFlyers\Image\ImageInfo;
use NestFlyers\Image\ImageProcessor;
use NestFlyers\Image\StoredImage;
use NestFlyers\Json;
use NestFlyers\Photos\UploadLimits;
use NestFlyers\Shared;
use NestFlyers\Tests\Support\Paths;
use NestFlyers\Tests\Support\TempDir;
use NestFlyers\Validation\FlyerValidator;
use NestFlyers\Validation\SchemaNormalizer;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use RuntimeException;
use stdClass;

/**
 * The handlers against in-memory repositories: server/app.ts's checks and
 * answers, without the JSON store (BootstrapTest runs them on the real one).
 */
final class ApiTest extends TestCase
{
    private const STAMP = '2026-09-18T10:00:00.000Z';
    /** Access is not what this file tests: every request is let in. */
    private const PUBLIC = ['allowPublic' => true];

    private Shared $shared;
    private ErrorCatalog $errors;
    private Kernel $kernel;
    /** @var HostelRepository&object{hostels: list<array<string, mixed>>} */
    private HostelRepository $hostels;
    private PhotoRepository $photos;
    /** @var FlyerRepository&object{records: array<int, array<string, mixed>>, inputs: list<array<string, mixed>>, lists: list<array{?string, ?string}>} */
    private FlyerRepository $flyers;
    private ?Closure $processor = null;
    /** The app root, data and uploads folders HostFacts looks at: empty, so the release check reports no manifest. */
    private string $root;

    protected function setUp(): void
    {
        $this->root = TempDir::create('api');
        $this->shared = Shared::fromFile(Paths::schema('shared.json'));
        $this->errors = ErrorCatalog::fromShared($this->shared);
        $this->hostels = self::hostelRepository([
            ['id' => 1, 'slug' => 'duque-nest', 'name' => 'Duque Nest', 'island' => 'Tenerife', 'logoPath' => null, 'sortOrder' => 10],
            ['id' => 2, 'slug' => 'flamingo-nest', 'name' => 'Flamingo by Nest', 'island' => 'Gran Canaria', 'logoPath' => null, 'sortOrder' => 30],
        ]);
        $this->photos = self::photoRepository([
            5 => ['id' => 5, 'path' => 'uploads/2026/09/0123456789abcdef.jpg', 'width' => 1080, 'height' => 1440, 'createdAt' => self::STAMP],
        ]);
        $this->flyers = self::flyerRepository($this->hostels, $this->photos);
        $this->kernel = $this->kernel();
    }

    public function testHostels(): void
    {
        self::assertSame(Json::encode($this->hostels->list()), $this->send('GET', 'api/hostels')->body);
    }

    public function testDoodlesAreServedWithUrlForPath(): void
    {
        $doodles = Json::decode($this->send('GET', 'api/doodles')->body);
        self::assertEquals(
            [(object) ['id' => 3, 'slug' => 'spark-teal', 'label' => 'Spark teal', 'url' => 'assets/art/spark-teal.png', 'kind' => 'spark', 'builtin' => true]],
            $doodles,
        );
    }

    public function testTheListPassesStringFiltersThrough(): void
    {
        self::assertSame('[]', $this->send('GET', 'api/flyers')->body);
        $this->send('GET', 'api/flyers', null, ['hostel' => 'none', 'template' => 'week']);
        $this->send('GET', 'api/flyers', null, ['hostel' => '', 'template' => '']);
        self::assertSame([[null, null], ['none', 'week'], ['', '']], $this->flyers->lists);
    }

    public function testCreateAnswers201WithTheSavedFlyer(): void
    {
        $response = $this->send('POST', 'api/flyers', $this->input());
        self::assertSame(201, $response->status);
        $saved = Json::decode($response->body);
        self::assertSame(1, $saved->id);
        self::assertSame(1, $saved->flyer->id);
        self::assertSame('duque-nest', $saved->flyer->hostel);
        self::assertSame(self::STAMP, $saved->flyer->createdAt);
    }

    public function testCreateNormalisesLikeNormalizeFlyerInput(): void
    {
        $input = $this->input();
        $input->hostel = '';
        $input->template = 'activity';
        $input->data->template = 'week';
        $this->send('POST', 'api/flyers', $input);
        $stored = $this->flyers->inputs[0];
        self::assertNull($stored['hostel'], 'an empty hostel means chain-wide');
        self::assertSame('activity', $stored['data']->template, 'the template column wins');
        self::assertSame('activity', $stored['template']);
        self::assertInstanceOf(stdClass::class, $stored['data']);
    }

    public function testValidationFailsBeforeReferencesAreChecked(): void
    {
        $input = $this->input();
        $input->title = ' ';
        $input->hostel = 'nowhere-nest';
        $error = $this->error($this->send('POST', 'api/flyers', $input), 400, 'invalid');
        self::assertEquals((object) ['title' => $error->fields->title], $error->fields);
        self::assertSame([], $this->flyers->inputs);
    }

    public function testTheHostelIsCheckedBeforeThePhoto(): void
    {
        $input = $this->input();
        $input->hostel = 'nowhere-nest';
        $input->photoId = 99;
        $error = $this->error($this->send('POST', 'api/flyers', $input), 400, 'invalid');
        self::assertEquals((object) ['hostel' => 'Unknown hostel'], $error->fields);

        $input->hostel = null;
        $error = $this->error($this->send('POST', 'api/flyers', $input), 400, 'invalid');
        self::assertEquals((object) ['photoId' => 'Unknown photo'], $error->fields);
        self::assertSame([], $this->flyers->inputs);
    }

    public function testBodiesThatAreNotObjectsAreReportedAtUnderscore(): void
    {
        $error = $this->error($this->send('POST', 'api/flyers', []), 400, 'invalid');
        self::assertSame(['_'], array_keys((array) $error->fields));
        // Not sent as JSON: Node's req.body is undefined, reported at "_" too.
        $request = new Request('POST', '/api/flyers', [], ['x-nest-flyers' => '1', 'content-type' => 'text/plain', 'content-length' => '2'], '{}');
        $error = $this->error($this->kernel->handle($request), 400, 'invalid');
        self::assertSame(['_'], array_keys((array) $error->fields));
    }

    public function testAnEmptyJsonBodyReportsEveryRequiredField(): void
    {
        $error = $this->error($this->send('POST', 'api/flyers', ''), 400, 'invalid');
        $fields = array_keys((array) $error->fields);
        sort($fields);
        self::assertSame(['data', 'hostel', 'photoId', 'template', 'title'], $fields);
    }

    public function testGetResolvesTheHostelAndThePhoto(): void
    {
        $input = $this->input();
        $input->photoId = 5;
        $id = Json::decode($this->send('POST', 'api/flyers', $input)->body)->id;
        $payload = Json::decode($this->send('GET', "api/flyers/$id")->body);
        self::assertSame(['flyer', 'hostel', 'photo'], array_keys((array) $payload));
        self::assertEquals((object) $this->hostels->bySlug('duque-nest'), $payload->hostel);
        self::assertEquals((object) ['id' => 5, 'url' => 'uploads/2026/09/0123456789abcdef.jpg', 'width' => 1080, 'height' => 1440], $payload->photo);
    }

    public function testGetWithoutHostelOrPhoto(): void
    {
        $input = $this->input();
        $input->hostel = null;
        $id = Json::decode($this->send('POST', 'api/flyers', $input)->body)->id;
        $payload = Json::decode($this->send('GET', "api/flyers/$id")->body);
        self::assertNull($payload->hostel);
        self::assertNull($payload->photo);
    }

    public function testUpdateAnswers200AndDeleteAnswers204(): void
    {
        $id = Json::decode($this->send('POST', 'api/flyers', $this->input())->body)->id;
        $input = $this->input();
        $input->title = 'Renamed';
        $response = $this->send('PUT', "api/flyers/$id", $input);
        self::assertSame(200, $response->status);
        self::assertSame('Renamed', Json::decode($response->body)->flyer->title);

        $deleted = $this->send('DELETE', "api/flyers/$id");
        self::assertSame(204, $deleted->status);
        self::assertSame('', $deleted->body);
        $this->error($this->send('GET', "api/flyers/$id"), 404, 'not_found');
        $this->error($this->send('DELETE', "api/flyers/$id"), 404, 'not_found');
        $this->error($this->send('PUT', "api/flyers/$id", $this->input()), 404, 'not_found');
    }

    public function testUnknownIdsAre404(): void
    {
        $this->error($this->send('GET', 'api/flyers/99999999'), 404, 'not_found', 'no_such_flyer');
        $this->error($this->send('DELETE', 'api/flyers/99999999'), 404, 'not_found', 'no_such_flyer');
        $this->error($this->send('PUT', 'api/flyers/99999999', $this->input()), 404, 'not_found', 'no_such_flyer');
    }

    /** @return iterable<string, array{string}> */
    public static function badIds(): iterable
    {
        foreach (['0', '-3', 'abc', '1.5', '1e2', '0x10', '07', '7a', '99999999999999999999', '%20%37'] as $id) {
            yield $id => [$id];
        }
    }

    #[DataProvider('badIds')]
    public function testIdsThatAreNotPositiveIntegersAre404BeforeTheBody(string $id): void
    {
        $this->error($this->send('GET', "api/flyers/$id"), 404, 'not_found', 'no_such_flyer');
        $this->error($this->send('DELETE', "api/flyers/$id"), 404, 'not_found', 'no_such_flyer');
        $this->error($this->send('PUT', "api/flyers/$id", (object) ['nonsense' => true]), 404, 'not_found', 'no_such_flyer');
    }

    public function testConfig(): void
    {
        $this->processor = static fn (): ImageProcessor => self::processor('gd');
        $config = Json::decode($this->kernel()->handle(self::request('GET', 'api/config'))->body);
        self::assertSame('php', $config->backend);
        self::assertSame('json', $config->storage);
        self::assertSame(['client'], $config->exporters);
        self::assertEquals((object) ['maxUploadBytes' => 2 * 1024 * 1024, 'maxPhotoEdge' => $this->shared->maxPhotoEdge()], $config->limits);
        // The first six are pinned by tests/contract/php.test.ts too; the host facts follow (HostFacts).
        self::assertSame(
            [
                'php', 'upload_max_filesize', 'post_max_size', 'memory_limit', 'imageProcessor', 'formats',
                'sapi', 'extensions', 'openBasedir', 'timezone', 'dataDir', 'uploadsDir', 'errorLog', 'release', 'accessRule',
            ],
            array_keys((array) $config->server),
        );
        self::assertSame(PHP_VERSION, $config->server->php);
        self::assertSame('2M', $config->server->upload_max_filesize);
        self::assertSame('gd', $config->server->imageProcessor);
        self::assertSame(PHP_SAPI, $config->server->sapi);
        self::assertSame(HostFacts::EXTENSIONS, array_keys((array) $config->server->extensions));
        self::assertEquals((object) ['path' => $this->root . '/data', 'writable' => true], $config->server->dataDir);
        self::assertEquals((object) ['manifest' => 'missing'], $config->server->release);
        self::assertSame('allowPublic', $config->server->accessRule);
        if (extension_loaded('gd')) {
            self::assertContains('jpeg', $config->server->formats);
            self::assertContains('png', $config->server->formats);
        }
    }

    public function testConfigStillAnswersWithoutAnImageLibrary(): void
    {
        $this->processor = static fn (): ImageProcessor => throw new RuntimeException('Photos need the gd or the imagick PHP extension');
        $response = $this->kernel()->handle(self::request('GET', 'api/config'));
        self::assertSame(200, $response->status);
        $server = Json::decode($response->body)->server;
        self::assertNull($server->imageProcessor);
        self::assertSame([], $server->formats);
        self::assertStringContainsString('gd or the imagick', $server->imageProcessorError);
    }

    public function testRenderIsNotAnEndpoint(): void
    {
        $this->error($this->send('POST', 'api/render/1', (object) ['format' => 'png']), 404, 'not_found', 'no_such_endpoint');
    }

    public function testThePhotoServiceIsOnlyBuiltForUploads(): void
    {
        foreach (['api/config', 'api/hostels', 'api/doodles', 'api/flyers'] as $path) {
            $this->send('GET', $path);
        }
        $this->expectException(LogicException::class);
        $this->expectExceptionMessage('photo service built');
        // The Kernel would answer 500; call the route directly to see the closure run.
        $router = new Router();
        $this->api()->register($router);
        $route = $router->match('POST', '/api/photos');
        self::assertNotNull($route);
        ($route['handler'])(self::request('POST', 'api/photos'), $route['params'], null);
    }

    protected function tearDown(): void
    {
        TempDir::remove($this->root);
    }

    private function folder(string $name): string
    {
        $dir = $this->root . '/' . $name;
        if (!is_dir($dir)) {
            mkdir($dir);
        }
        return $dir;
    }

    private function kernel(): Kernel
    {
        $router = new Router();
        $this->api()->register($router);
        return new Kernel(
            $this->errors,
            new AccessGuard(AccessRule::fromArray(self::PUBLIC), $this->errors),
            new WriteGuard($this->errors),
            static fn (): Router => $router,
        );
    }

    private function api(): Api
    {
        $validator = new FlyerValidator(Json::decode((string) file_get_contents(Paths::schema('flyer.schema.json'))), new SchemaNormalizer(), $this->errors);
        $processor = $this->processor ?? static fn (): ImageProcessor => self::processor('gd');
        $limits = new UploadLimits($this->shared->maxUploadBytes(), '2M', '8M', '128M');
        return new Api(
            $this->hostels,
            self::doodleRepository(),
            $this->photos,
            $this->flyers,
            $validator,
            $this->errors,
            new ApiConfig('json', $this->shared, $limits, new HostFacts(
                $this->shared,
                $limits,
                $processor,
                AccessRule::fromArray(self::PUBLIC),
                $this->root,
                $this->folder('data'),
                $this->folder('uploads'),
            )),
            static fn () => throw new LogicException('photo service built'),
        );
    }

    /** The first sample flyer (seed/samples.json) as a request body. */
    private function input(): stdClass
    {
        $sample = Json::decode((string) file_get_contents(Paths::seed('samples.json')))[0];
        return (object) [
            'title' => $sample->title,
            'hostel' => $sample->hostel,
            'template' => $sample->template,
            'data' => $sample->data,
            'photoId' => null,
        ];
    }

    /** @param array<string, string> $query */
    private function send(string $method, string $path, mixed $json = null, array $query = []): Response
    {
        return $this->kernel->handle(self::request($method, $path, $json, $query));
    }

    /** @param array<string, string> $query */
    private static function request(string $method, string $path, mixed $json = null, array $query = []): Request
    {
        $headers = ['x-nest-flyers' => '1'];
        $body = '';
        if ($json !== null) {
            $body = is_string($json) ? $json : Json::encode($json);
            $headers += ['content-type' => 'application/json', 'content-length' => (string) strlen($body)];
        }
        return new Request($method, '/' . rawurldecode($path), $query, $headers, $body);
    }

    private function error(Response $response, int $status, string $code, ?string $key = null): stdClass
    {
        self::assertSame($status, $response->status, $response->body);
        $error = Json::decode($response->body)->error;
        self::assertSame($code, $error->code);
        if ($key !== null) {
            self::assertSame($this->errors->make($key)->getMessage(), $error->message);
        }
        return $error;
    }

    private static function processor(string $name): ImageProcessor
    {
        return new class ($name) implements ImageProcessor {
            public function __construct(private readonly string $name)
            {
            }

            public function name(): string
            {
                return $this->name;
            }

            public function process(string $bytes, ImageInfo $info, int $maxEdge, int $jpegQuality): ?StoredImage
            {
                return null;
            }

            public function peakMemoryBytes(ImageInfo $info, int $maxEdge): int
            {
                return 0;
            }
        };
    }

    /** @param list<array<string, mixed>> $hostels */
    private static function hostelRepository(array $hostels): HostelRepository
    {
        return new class ($hostels) implements HostelRepository {
            /** @param list<array<string, mixed>> $hostels */
            public function __construct(public array $hostels)
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
                throw new LogicException('The API never writes hostels');
            }
        };
    }

    private static function doodleRepository(): DoodleRepository
    {
        return new class () implements DoodleRepository {
            public function list(): array
            {
                return [['id' => 3, 'slug' => 'spark-teal', 'label' => 'Spark teal', 'path' => 'assets/art/spark-teal.png', 'kind' => 'spark', 'builtin' => true]];
            }

            public function upsert(array $doodle): void
            {
                throw new LogicException('The API never writes doodles');
            }
        };
    }

    /** @param array<int, array{id:int, path:string, width:int, height:int, createdAt:string}> $photos */
    private static function photoRepository(array $photos): PhotoRepository
    {
        return new class ($photos) implements PhotoRepository {
            /** @param array<int, array{id:int, path:string, width:int, height:int, createdAt:string}> $photos */
            public function __construct(private array $photos)
            {
            }

            public function insert(string $path, int $width, int $height): array
            {
                throw new LogicException('Uploads go through the photo service');
            }

            public function get(int $id): ?array
            {
                return $this->photos[$id] ?? null;
            }
        };
    }

    private static function flyerRepository(HostelRepository $hostels, PhotoRepository $photos): FlyerRepository
    {
        return new class ($hostels, $photos) implements FlyerRepository {
            /** @var array<int, array<string, mixed>> */
            public array $records = [];
            /** @var array<int, true> */
            private array $archived = [];
            /** @var list<array<string, mixed>> */
            public array $inputs = [];
            /** @var list<array{?string, ?string}> */
            public array $lists = [];

            public function __construct(private readonly HostelRepository $hostels, private readonly PhotoRepository $photos)
            {
            }

            public function get(int $id): ?array
            {
                return isset($this->records[$id]) && !isset($this->archived[$id]) ? $this->records[$id] : null;
            }

            public function list(?string $hostel, ?string $template): array
            {
                $this->lists[] = [$hostel, $template];
                return [];
            }

            public function create(array $input): int
            {
                $this->check($input);
                $this->inputs[] = $input;
                $id = count($this->records) + 1;
                $this->records[$id] = $this->record($id, $input, '2026-09-18T10:00:00.000Z');
                return $id;
            }

            public function update(int $id, array $input): bool
            {
                if ($this->get($id) === null) {
                    return false;
                }
                $this->check($input);
                $this->inputs[] = $input;
                $this->records[$id] = $this->record($id, $input, $this->records[$id]['createdAt']);
                return true;
            }

            public function archive(int $id): bool
            {
                if ($this->get($id) === null) {
                    return false;
                }
                $this->archived[$id] = true;
                return true;
            }

            /** @param array<string, mixed> $input */
            private function check(array $input): void
            {
                // The repository contract: unknown references throw. The API must check first, so this never fires.
                if (($input['hostel'] !== null && $this->hostels->bySlug($input['hostel']) === null)
                    || ($input['photoId'] !== null && $this->photos->get($input['photoId']) === null)) {
                    throw new MissingReference('unchecked reference');
                }
            }

            /**
             * @param array<string, mixed> $input
             * @return array<string, mixed>
             */
            private function record(int $id, array $input, string $createdAt): array
            {
                return [
                    'id' => $id,
                    'hostel' => $input['hostel'],
                    'template' => $input['template'],
                    'title' => $input['title'],
                    'data' => $input['data'],
                    'photoId' => $input['photoId'],
                    'createdAt' => $createdAt,
                    'updatedAt' => '2026-09-18T10:00:00.000Z',
                ];
            }
        };
    }
}
