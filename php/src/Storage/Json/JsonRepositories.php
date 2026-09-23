<?php

declare(strict_types=1);

namespace NestFlyers\Storage\Json;

use NestFlyers\Domain\Clock;
use NestFlyers\Domain\Repositories;
use NestFlyers\Http\ErrorCatalog;
use NestFlyers\Shared;
use stdClass;

/**
 * The JSON-file storage driver (docs/json-storage.md, schema/storage.schema.json):
 * the one place its pieces are wired together. Bootstrap picks it when
 * config.php says 'storage' => 'json'.
 */
final class JsonRepositories
{
    private function __construct()
    {
    }

    /**
     * Opens the store in $dataDir, creating the folder and its files on first use.
     *
     * @param string $dataDir absolute; comes down from the composition root
     * @param (callable(stdClass): stdClass)|null $normalizeData applied to flyer data on every read (the
     *        validator's normalizeData in the app); null stores and returns data untouched
     * @throws \NestFlyers\Http\HttpError storage_too_new when a newer build wrote the folder
     */
    public static function open(
        string $dataDir,
        Shared $shared,
        Clock $clock,
        ErrorCatalog $errors,
        ?callable $normalizeData = null,
    ): Repositories {
        $root = rtrim(str_replace('\\', '/', $dataDir), '/');
        $names = $shared->storageFiles();
        $files = new AtomicJsonFiles($root);
        $lock = new FlockLock($root . '/' . $names['lock']);
        $store = new JsonStore($files, $lock, $shared, $errors);
        $store->open();
        self::denyOverHttp($root);

        $hostels = new JsonHostelRepository(new RecordFile($files, $names['hostels'], $store, 'hostel'), $lock);
        $photos = new JsonPhotoRepository(new RecordFile($files, $names['photos'], $store, 'photo'), $lock, $clock);
        return new Repositories(
            hostels: $hostels,
            doodles: new JsonDoodleRepository(new RecordFile($files, $names['doodles'], $store, 'doodle'), $lock),
            photos: $photos,
            flyers: new JsonFlyerRepository(
                $files,
                new RecordFile($files, $names['flyerIndex'], $store, 'flyer'),
                $lock,
                $clock,
                $hostels,
                $photos,
                $normalizeData ?? static fn (stdClass $data): stdClass => $data,
                $names['flyerDir'],
            ),
            seedState: $store,
            lock: $lock,
        );
    }

    /**
     * The store's own deny rules, next to the ones the release ships for data/.
     * The folder may be anywhere the admin pointed config.php at, and a host
     * without mod_authz_core (or with the release's data/.htaccess overwritten)
     * would otherwise serve flyers, photos index and the error log. Written once,
     * never overwritten, and a host that ignores .htaccess is unaffected either way.
     */
    private static function denyOverHttp(string $root): void
    {
        $files = [
            '.htaccess' => "# The flyer library. Never served over HTTP.\n"
                . "<IfModule mod_authz_core.c>\n    Require all denied\n</IfModule>\n"
                . "<IfModule !mod_authz_core.c>\n    Order allow,deny\n    Deny from all\n</IfModule>\n",
            // A directory listing needs something to show even where Options -Indexes is not allowed.
            'index.html' => "<!doctype html><title>Nest flyers</title>\n",
        ];
        foreach ($files as $name => $contents) {
            $path = "$root/$name";
            if (!file_exists($path)) {
                @file_put_contents($path, $contents);
            }
        }
    }
}
