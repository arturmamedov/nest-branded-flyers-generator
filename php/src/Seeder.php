<?php

declare(strict_types=1);

namespace NestFlyers;

use JsonException;
use NestFlyers\Domain\DoodleRepository;
use NestFlyers\Domain\HostelRepository;
use NestFlyers\Domain\Lock;
use NestFlyers\Domain\SeedState;
use NestFlyers\Validation\InvalidData;
use NestFlyers\Validation\SchemaNormalizer;
use NestFlyers\Validation\SchemaValidator;
use stdClass;

/**
 * Applies seed/hostels.json (the hostels Artur supplies and the built-in
 * doodles) to the store. Shared hosting has no shell to run `npm run seed`
 * on, so this runs inside requests: on the first one, and again whenever the
 * file's sha256 differs from the one the store recorded (the same rules as
 * applySeedFile in server/storage/seed.ts).
 *
 * - Upserts by slug and never deletes: flyers point at hostels by slug.
 * - Validates against the generated schema/seed.schema.json and fills its
 *   defaults (logo_path null, sort_order 0) before anything is written.
 * - A broken seed file is logged and skipped, so the app keeps serving the
 *   hostels it already has; the next request tries again.
 */
final class Seeder
{
    /** @param object $seedSchema the decoded schema/seed.schema.json */
    public function __construct(
        private readonly HostelRepository $hostels,
        private readonly DoodleRepository $doodles,
        private readonly SeedState $seedState,
        private readonly Lock $lock,
        private readonly string $seedFile,
        private readonly object $seedSchema,
        private readonly SchemaNormalizer $normalizer,
    ) {
    }

    public function ensureSeeded(): void
    {
        $json = @file_get_contents($this->seedFile);
        if ($json === false) {
            $this->skip('the file cannot be read');
            return;
        }
        $hash = hash('sha256', $json);
        // The common case, every request after the first: one small read, no write lock.
        if ($this->seedState->seedHash() === $hash) {
            return;
        }
        $this->lock->exclusive(function () use ($json, $hash): void {
            // Another request may have seeded while this one waited for the lock.
            if ($this->seedState->seedHash() === $hash) {
                return;
            }
            $seed = $this->parse($json);
            if ($seed === null) {
                return;
            }
            foreach ($seed->hostels as $hostel) {
                $this->hostels->upsert([
                    'slug' => $hostel->slug,
                    'name' => $hostel->name,
                    'island' => $hostel->island,
                    'logoPath' => $hostel->logo_path,
                    'sortOrder' => $hostel->sort_order,
                ]);
            }
            foreach ($seed->doodles as $doodle) {
                $this->doodles->upsert([
                    'slug' => $doodle->slug,
                    'label' => $doodle->label,
                    'path' => $doodle->path,
                    'kind' => $doodle->kind,
                    'builtin' => true,
                ]);
            }
            // Recorded last, so a failure part-way leaves the hash stale and the next request finishes the job.
            $this->seedState->recordSeedHash($hash);
        });
    }

    /** The validated, normalised seed, or null (logged) when the file is not usable. */
    private function parse(string $json): ?stdClass
    {
        try {
            $seed = (new SchemaValidator($this->normalizer))->validate(Json::decode($json), $this->seedSchema);
        } catch (JsonException $e) {
            $this->skip('it is not valid JSON: ' . $e->getMessage());
            return null;
        } catch (InvalidData $e) {
            $this->skip('it does not match seed.schema.json: ' . $e->getMessage());
            return null;
        }
        if (!$seed instanceof stdClass) {
            $this->skip('seed.schema.json does not describe an object'); // only a broken schema gets here
            return null;
        }
        return $seed;
    }

    private function skip(string $reason): void
    {
        error_log("Nest flyers: {$this->seedFile} was not applied ($reason). Hostels and doodles stay as they were.");
    }
}
