<?php

declare(strict_types=1);

namespace NestFlyers;

use Closure;
use NestFlyers\Domain\Clock;
use NestFlyers\Domain\Repositories;
use NestFlyers\Domain\SystemClock;
use NestFlyers\Http\AccessGuard;
use NestFlyers\Http\Api;
use NestFlyers\Http\ApiConfig;
use NestFlyers\Http\ErrorCatalog;
use NestFlyers\Http\Kernel;
use NestFlyers\Http\Request;
use NestFlyers\Http\Response;
use NestFlyers\Http\Router;
use NestFlyers\Http\WriteGuard;
use NestFlyers\Image\ImageProcessor;
use NestFlyers\Image\ImageProcessorFactory;
use NestFlyers\Image\ImageSniffer;
use NestFlyers\Photos\PhotoService;
use NestFlyers\Photos\UploadLimits;
use NestFlyers\Storage\Json\JsonRepositories;
use NestFlyers\Validation\FlyerValidator;
use NestFlyers\Validation\SchemaNormalizer;
use RuntimeException;
use Throwable;

/**
 * The composition root. api.php hands it the app root (its own folder) and
 * every path, implementation and setting is chosen here and passed down, so
 * no class finds files through its own __DIR__ and a release works at a domain
 * root or in a subfolder alike. Config picks the implementations: the storage
 * driver by `storage`, the image library by `imageProcessor`.
 *
 * Work happens as late as it can: nothing touches storage before the access
 * check, and the image library is only loaded for uploads and diagnostics.
 */
final class Bootstrap
{
    /** The release layout under the app root (scripts/php/layout.ts assembles it). */
    private const SHARED_FILE = 'schema/shared.json';
    private const FLYER_SCHEMA = 'schema/flyer.schema.json';
    private const SEED_SCHEMA = 'schema/seed.schema.json';
    private const SEED_FILE = 'seed/hostels.json';
    private const ERROR_LOG = 'php-errors.log';

    private const FATAL_ERRORS = [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR, E_USER_ERROR, E_RECOVERABLE_ERROR];

    private ?Shared $shared = null;
    private ?ErrorCatalog $errors = null;
    private bool $configLoaded = false;
    private ?Config $config = null;
    private ?Kernel $kernel = null;
    /** @var (Closure(): Router)|null */
    private ?Closure $routes = null;
    private bool $responded = false;

    /** @param array<string, mixed>|null $rawConfig */
    private function __construct(
        private readonly string $appRoot,
        private readonly ?array $rawConfig,
    ) {
    }

    /**
     * @param string $appRoot the folder of api.php
     * @param array<string, mixed>|null $config what config.php would return; null reads <appRoot>/config.php
     */
    public static function fromAppRoot(string $appRoot, ?array $config = null): self
    {
        return new self(rtrim(str_replace('\\', '/', $appRoot), '/'), $config);
    }

    /** Serves the current request from PHP's globals and sends the answer. */
    public function run(): void
    {
        // Floats in shortest round-trip form everywhere, as JavaScript writes them (Json forces it too).
        ini_set('serialize_precision', '-1');
        $this->handleErrors();
        $this->logIntoDataDir();

        $request = null;
        try {
            $request = Request::fromGlobals();
            $response = $this->handle($request);
        } catch (Throwable $e) {
            error_log('Nest flyers: ' . $e);
            $response = $this->serverError();
        }
        $this->send($response, $request?->method === 'HEAD');
    }

    /** One request in, one answer out; no globals, so tests drive the whole app through it. */
    public function handle(Request $request): Response
    {
        $errors = $this->errors();
        $config = $this->config();
        if ($config === null) {
            return $errors->make('not_configured')->toResponse();
        }
        $this->kernel ??= new Kernel(
            $errors,
            new AccessGuard($config->access, $errors),
            new WriteGuard($errors),
            fn (): Router => $this->boot($config, $errors),
        );
        return $this->kernel->handle($request);
    }

    /**
     * Opens the store (creating it on first use), applies seed/hostels.json when
     * it changed since the last request, and returns the routes. The services
     * are built once per Bootstrap; the seed check runs on every request.
     */
    private function boot(Config $config, ErrorCatalog $errors): Router
    {
        $this->routes ??= $this->compose($config, $errors);
        return ($this->routes)();
    }

    /** @return Closure(): Router */
    private function compose(Config $config, ErrorCatalog $errors): Closure
    {
        $shared = $this->shared();
        $clock = new SystemClock();
        $normalizer = new SchemaNormalizer();
        $validator = new FlyerValidator($this->readSchema(self::FLYER_SCHEMA), $normalizer, $errors);
        $repos = $this->openStorage($config, $shared, $clock, $errors, $validator);
        $seeder = new Seeder(
            $repos->hostels,
            $repos->doodles,
            $repos->seedState,
            $repos->lock,
            $this->path(self::SEED_FILE),
            $this->readSchema(self::SEED_SCHEMA),
            $normalizer,
        );

        $limits = UploadLimits::fromIni($shared);
        $processor = self::once(static fn (): ImageProcessor => ImageProcessorFactory::create($config->imageProcessor));
        $uploadsDir = $this->path($shared->uploadsDir());
        $photoService = self::once(static fn (): PhotoService => new PhotoService(
            $repos->photos,
            new ImageSniffer($shared, $errors),
            $processor(),
            $limits,
            $errors,
            $shared,
            $clock,
            $uploadsDir,
        ));

        $router = new Router();
        (new Api(
            $repos->hostels,
            $repos->doodles,
            $repos->photos,
            $repos->flyers,
            $validator,
            $errors,
            new ApiConfig($config->storage, $shared, $limits, $processor),
            $photoService,
        ))->register($router);

        return static function () use ($seeder, $router): Router {
            $seeder->ensureSeeded();
            return $router;
        };
    }

    /** The storage driver config.php names. A new driver is a new arm here and a new class, nothing else. */
    private function openStorage(Config $config, Shared $shared, Clock $clock, ErrorCatalog $errors, FlyerValidator $validator): Repositories
    {
        return match ($config->storage) {
            'json' => JsonRepositories::open($config->dataDir, $shared, $clock, $errors, $validator->normalizeData(...)),
        };
    }

    private function shared(): Shared
    {
        return $this->shared ??= Shared::fromFile($this->path(self::SHARED_FILE));
    }

    private function errors(): ErrorCatalog
    {
        return $this->errors ??= ErrorCatalog::fromShared($this->shared());
    }

    /** null when config.php is missing or invalid; the reason for an invalid one goes to the error log. */
    private function config(): ?Config
    {
        if (!$this->configLoaded) {
            $this->configLoaded = true;
            try {
                // The document root, when the server tells us, so a dataDir that
                // is outside the app folder but still inside public_html (the
                // subfolder case) is refused rather than served.
                $documentRoot = is_string($_SERVER['DOCUMENT_ROOT'] ?? null) ? $_SERVER['DOCUMENT_ROOT'] : null;
                $this->config = $this->rawConfig !== null
                    ? Config::fromArray($this->rawConfig, $this->appRoot, $documentRoot)
                    : Config::load($this->appRoot, $documentRoot);
            } catch (Throwable $e) {
                error_log('Nest flyers: config.php is not valid, so the API answers 503 until it is fixed: ' . $e->getMessage());
                $this->config = null;
            }
        }
        return $this->config;
    }

    private function readSchema(string $relative): object
    {
        $json = @file_get_contents($this->path($relative));
        if ($json === false) {
            throw new RuntimeException("Missing $relative: the release is incomplete.");
        }
        $schema = Json::decode($json);
        if (!is_object($schema)) {
            throw new RuntimeException("$relative is not a JSON Schema object.");
        }
        return $schema;
    }

    private function path(string $relative): string
    {
        return $this->appRoot . '/' . $relative;
    }

    /**
     * Warnings and notices go to the error log and never become a 500 (code
     * checks return values instead). Display is off (api.php), so nothing can
     * leak into a JSON answer. A fatal error (memory exhausted while decoding a
     * photo) still gets a JSON 500 when nothing was sent yet.
     */
    private function handleErrors(): void
    {
        set_error_handler(static function (int $level, string $message, string $file, int $line): bool {
            if ((error_reporting() & $level) === 0) {
                return false; // silenced with @: PHP drops it
            }
            error_log(sprintf('Nest flyers: PHP error %d: %s in %s on line %d', $level, $message, $file, $line));
            return true;
        });
        register_shutdown_function(function (): void {
            $error = error_get_last();
            if ($this->responded || $error === null || !in_array($error['type'], self::FATAL_ERRORS, true) || headers_sent()) {
                return;
            }
            $this->send($this->serverError(), false);
        });
    }

    /** PHP's own log goes into the data folder when it can: the host's default log is often out of reach. */
    private function logIntoDataDir(): void
    {
        $dataDir = $this->config()?->dataDir;
        if ($dataDir !== null && is_dir($dataDir) && is_writable($dataDir)) {
            ini_set('error_log', $dataDir . '/' . self::ERROR_LOG);
        }
    }

    /** The catalogue's 500 when it can be read; a bare 500 when even schema/shared.json is missing. */
    private function serverError(): Response
    {
        try {
            return $this->errors()->make('server_error')->toResponse();
        } catch (Throwable $e) {
            error_log('Nest flyers: ' . $e);
            return new Response(500, ['Cache-Control' => 'no-store'], '');
        }
    }

    private function send(Response $response, bool $headOnly): void
    {
        // Whatever PHP printed so far (a warning while display was still on, a BOM in config.php) would corrupt the JSON.
        while (ob_get_level() > 0) {
            ob_end_clean();
        }
        $this->responded = true;
        header_remove('X-Powered-By');
        ($headOnly ? new Response($response->status, $response->headers, '') : $response)->send();
    }

    /**
     * @template T
     * @param Closure(): T $build
     * @return Closure(): T the same value on every call, built on the first
     */
    private static function once(Closure $build): Closure
    {
        $built = false;
        $value = null;
        return static function () use ($build, &$built, &$value): mixed {
            if (!$built) {
                $value = $build();
                $built = true;
            }
            return $value;
        };
    }
}
