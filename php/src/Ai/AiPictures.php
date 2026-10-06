<?php

declare(strict_types=1);

namespace NestFlyers\Ai;

use RuntimeException;

/**
 * What a site keeps of a picture read (the owner's answer, 2026-10-06: "Keep the picture for 30 days too"): the picture
 * as the model was sent it, so a misread can be looked at. It lives in the data folder, which is never served, under
 * the Canary day it was read on, and is no part of the library: no backup and no copy carries it. A shared host has no
 * cron, so the app deletes what is past its days itself (sweep). The twin of AiPictures in server/ai/pictures.ts; the
 * ledger's record names the kept file (docs/json-storage.md).
 */
interface AiPictures
{
    /**
     * Keeps a prepared picture under its day and answers where, relative to the data folder
     * ("ai-pictures/2026-10-07/<16 hex>.jpg").
     *
     * @param string $bytes the picture: never in a trace, so never in a log line
     * @param string $extension 'jpg' | 'png'
     * @throws RuntimeException when the disk cannot take it: the read then stops before the provider is asked, so
     *         nothing is spent on a picture nobody could look at afterwards
     */
    public function keep(string $day, #[\SensitiveParameter] string $bytes, string $extension): string;

    /**
     * Deletes every day's pictures kept longer than the shared number of days, counted back from $today. It does so
     * at most once a day and never throws: it runs inside GET api/config, which every visit makes.
     */
    public function sweep(string $today): void;
}
