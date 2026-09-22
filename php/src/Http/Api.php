<?php

declare(strict_types=1);

namespace NestFlyers\Http;

use Closure;
use NestFlyers\Domain\DoodleRepository;
use NestFlyers\Domain\FlyerRepository;
use NestFlyers\Domain\HostelRepository;
use NestFlyers\Domain\PhotoRepository;
use NestFlyers\Photos\PhotoService;
use NestFlyers\Validation\FlyerValidator;
use stdClass;

/**
 * The API's routes and handlers: server/app.ts, route for route, check for
 * check (docs/api-contract.md). Render (server-side export) is not registered:
 * PHP has no headless browser, so api/render falls through to 404 like any
 * unknown path, and the editor exports in the browser.
 */
final class Api
{
    /**
     * @param Closure(): PhotoService $photoService built on the first upload, so a host without an image library
     *        still serves everything else
     */
    public function __construct(
        private readonly HostelRepository $hostels,
        private readonly DoodleRepository $doodles,
        private readonly PhotoRepository $photos,
        private readonly FlyerRepository $flyers,
        private readonly FlyerValidator $validator,
        private readonly ErrorCatalog $errors,
        private readonly ApiConfig $config,
        private readonly Closure $photoService,
    ) {
    }

    public function register(Router $router): void
    {
        $router->add('GET', '/api/config', fn (): Response => Response::json($this->config->toArray()));
        $router->add('GET', '/api/hostels', fn (): Response => Response::json($this->hostels->list()));
        $router->add('GET', '/api/doodles', fn (): Response => Response::json(array_map(self::toDoodle(...), $this->doodles->list())));
        $router->add('GET', '/api/flyers', $this->listFlyers(...));
        $router->add('POST', '/api/flyers', $this->createFlyer(...));
        $router->add('GET', '/api/flyers/{id}', $this->getFlyer(...));
        $router->add('PUT', '/api/flyers/{id}', $this->updateFlyer(...));
        $router->add('DELETE', '/api/flyers/{id}', $this->archiveFlyer(...));
        $router->add('POST', '/api/photos', $this->uploadPhoto(...));
    }

    private function listFlyers(Request $request): Response
    {
        // One value per name, or none: Request::parseQuery drops a repeated name,
        // and a bracketed one ("hostel[]") never matches, exactly as Express leaves them.
        return Response::json($this->flyers->list($request->query['hostel'] ?? null, $request->query['template'] ?? null));
    }

    private function createFlyer(Request $request, array $params, mixed $body): Response
    {
        $id = $this->flyers->create($this->flyerInput($body));
        return Response::json($this->saved($id), 201);
    }

    /** @param array<string, string> $params */
    private function getFlyer(Request $request, array $params): Response
    {
        $flyer = $this->flyers->get($this->idParam($params)) ?? throw $this->errors->make('no_such_flyer');
        $photo = $flyer['photoId'] === null ? null : $this->photos->get($flyer['photoId']);
        return Response::json([
            'flyer' => $flyer,
            'hostel' => $flyer['hostel'] !== null && $flyer['hostel'] !== '' ? $this->hostels->bySlug($flyer['hostel']) : null,
            'photo' => $photo === null ? null : self::toPhotoInfo($photo),
        ]);
    }

    /** @param array<string, string> $params */
    private function updateFlyer(Request $request, array $params, mixed $body): Response
    {
        // The id first: a bad one is 404 whatever the body holds.
        $id = $this->idParam($params);
        if (!$this->flyers->update($id, $this->flyerInput($body))) {
            throw $this->errors->make('no_such_flyer');
        }
        return Response::json($this->saved($id));
    }

    /** @param array<string, string> $params */
    private function archiveFlyer(Request $request, array $params): Response
    {
        if (!$this->flyers->archive($this->idParam($params))) {
            throw $this->errors->make('no_such_flyer');
        }
        return Response::noContent();
    }

    private function uploadPhoto(Request $request): Response
    {
        $photo = ($this->photoService)()->store($request);
        return Response::json(self::toPhotoInfo($photo), 201);
    }

    /**
     * A path id counts only when it is a positive integer, else 404 before the
     * body is looked at. Node takes Number(id); the contract leaves odd
     * spellings (1e2, 0x10, 07) open, so only canonical digits count here, and
     * a number too big for an int can't name a flyer either.
     *
     * @param array<string, string> $params
     */
    private function idParam(array $params): int
    {
        $raw = $params['id'] ?? '';
        $id = preg_match('/^[1-9][0-9]*\z/', $raw) === 1 ? filter_var($raw, FILTER_VALIDATE_INT) : false;
        if (!is_int($id)) {
            throw $this->errors->make('no_such_flyer');
        }
        return $id;
    }

    /**
     * FlyerInputSchema, then normalizeFlyerInput (src/shared/normalize.ts), then
     * the references, hostel before photo: the order parseInput in server/app.ts
     * checks them in.
     *
     * @return array{title:string, hostel:?string, template:string, data:stdClass, photoId:?int}
     * @throws HttpError invalid, unknown_hostel, unknown_photo
     */
    private function flyerInput(mixed $body): array
    {
        $input = $this->validator->validate($body);
        // An empty hostel means chain-wide, and the template column wins over data.template.
        $input['hostel'] = $input['hostel'] === '' ? null : $input['hostel'];
        $data = clone $input['data'];
        $data->template = $input['template'];
        $input['data'] = $data;

        if ($input['hostel'] !== null && $this->hostels->bySlug($input['hostel']) === null) {
            throw $this->errors->make('unknown_hostel');
        }
        if ($input['photoId'] !== null && $this->photos->get($input['photoId']) === null) {
            throw $this->errors->make('unknown_photo');
        }
        return $input;
    }

    /** @return array{id:int, flyer:array<string, mixed>|null} */
    private function saved(int $id): array
    {
        return ['id' => $id, 'flyer' => $this->flyers->get($id)];
    }

    /**
     * Stored paths have no leading slash; the API hands them out as URLs relative to the app root.
     *
     * @param array{id:int, path:string, width:int, height:int, createdAt?:string} $photo
     * @return array{id:int, url:string, width:int, height:int}
     */
    private static function toPhotoInfo(array $photo): array
    {
        return ['id' => $photo['id'], 'url' => $photo['path'], 'width' => $photo['width'], 'height' => $photo['height']];
    }

    /**
     * @param array{id:int, slug:string, label:string, path:string, kind:string, builtin:bool} $doodle
     * @return array{id:int, slug:string, label:string, url:string, kind:string, builtin:bool}
     */
    private static function toDoodle(array $doodle): array
    {
        return [
            'id' => $doodle['id'],
            'slug' => $doodle['slug'],
            'label' => $doodle['label'],
            'url' => $doodle['path'],
            'kind' => $doodle['kind'],
            'builtin' => $doodle['builtin'],
        ];
    }
}
