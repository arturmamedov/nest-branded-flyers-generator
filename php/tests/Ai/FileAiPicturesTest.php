<?php

declare(strict_types=1);

namespace NestFlyers\Tests\Ai;

use NestFlyers\Ai\FileAiPictures;
use NestFlyers\Shared;
use NestFlyers\Tests\Support\Paths;
use NestFlyers\Tests\Support\TempDir;
use PHPUnit\Framework\TestCase;
use RuntimeException;

/**
 * What a site keeps of a picture read (the owner's answer, 2026-10-06: "Keep the picture for 30 days too"): the
 * prepared picture, in the data folder, never served, under the Canary day it was read on, and deleted by the app
 * itself once past its days. The twin of tests/unit/ai-pictures.test.ts; BootstrapTest crosses the thirty days through
 * GET api/config.
 */
final class FileAiPicturesTest extends TestCase
{
    private string $root;
    private string $logDir;
    private string|false $previousLog;

    protected function setUp(): void
    {
        $this->root = TempDir::create('ai-pictures');
        $this->logDir = TempDir::create('log');
        $this->previousLog = ini_get('error_log');
        ini_set('error_log', "$this->logDir/php-errors.log");
    }

    protected function tearDown(): void
    {
        ini_set('error_log', (string) $this->previousLog);
        TempDir::remove($this->root);
        TempDir::remove($this->logDir);
    }

    public function testThirtyDaysInAFolderOfTheDataFolderAreSharedFacts(): void
    {
        $shared = Shared::fromFile(Paths::schema('shared.json'));
        self::assertSame(30, $shared->ai()['pictureDays']);
        self::assertSame('ai-pictures', $shared->storageFiles()['aiPicturesDir']);
    }

    public function testItKeepsAPictureUnderItsDayWithANameNobodyCanGuessAndAnswersWhere(): void
    {
        $pictures = $this->pictures();
        $path = $pictures->keep('2026-10-07', 'jpeg bytes', 'jpg');
        self::assertMatchesRegularExpression('~^ai-pictures/2026-10-07/[0-9a-f]{16}\.jpg$~', $path);
        self::assertSame('jpeg bytes', file_get_contents("$this->root/$path"));
        $png = $pictures->keep('2026-10-07', 'png bytes', 'png');
        self::assertStringEndsWith('.png', $png);
        self::assertNotSame($path, $png);
        self::assertSame([], glob("$this->root/ai-pictures/2026-10-07/*.tmp") ?: [], 'nothing is left half written');
    }

    public function testADiskThatCannotTakeThePictureIsAnErrorSoAReadStopsBeforeAnythingIsSpent(): void
    {
        file_put_contents("$this->root/ai-pictures", 'a file where the folder belongs');
        $this->expectException(RuntimeException::class);
        $this->pictures()->keep('2026-10-07', 'x', 'jpg');
    }

    public function testItDeletesADaysPicturesOnceThatDayIsMoreThanThirtyDaysBackAndNothingElse(): void
    {
        foreach (['2026-09-01', '2026-09-06', '2026-09-07', '2026-10-07'] as $day) {
            $this->aDay($day);
        }
        mkdir("$this->root/ai-pictures/not-a-day");
        file_put_contents("$this->root/ai-pictures/2026-01-01.txt", 'not a day\'s folder either');
        file_put_contents("$this->root/meta.json", '{}');

        $this->pictures()->sweep('2026-10-07');
        // 7 September is thirty days before 7 October: kept. The 6th is thirty-one: gone.
        self::assertSame(['.swept', '2026-01-01.txt', '2026-09-07', '2026-10-07', 'not-a-day'], $this->kept());
        self::assertFileExists("$this->root/ai-pictures/2026-09-07/0123456789abcdef.jpg");
        self::assertFileExists("$this->root/meta.json");
        self::assertSame('', $this->log());
    }

    public function testItSweepsAtMostOnceADayWhicheverRequestAsksTheFolderRemembersTheDay(): void
    {
        $this->aDay('2026-10-07');
        $first = $this->pictures();
        $first->sweep('2026-10-07');
        self::assertSame('2026-10-07', file_get_contents("$this->root/ai-pictures/.swept"));
        // Something old turns up later the same day (a backup put back): it waits for tomorrow's sweep.
        $this->aDay('2026-01-01');
        $first->sweep('2026-10-07');
        $this->pictures()->sweep('2026-10-07');
        self::assertContains('2026-01-01', $this->kept());
        $this->pictures()->sweep('2026-10-08');
        self::assertSame(['.swept', '2026-10-07'], $this->kept());
    }

    public function testASiteThatNeverReadAPictureGetsNoFolderFromASweep(): void
    {
        $this->pictures()->sweep('2026-10-07');
        self::assertDirectoryDoesNotExist("$this->root/ai-pictures");
    }

    public function testASweepThatFailsSaysSoInTheLogAndNeverThrows(): void
    {
        // It runs inside GET api/config, which every visit makes: the kept pictures must never decide whether the app loads.
        mkdir("$this->root/ai-pictures");
        mkdir("$this->root/ai-pictures/.swept"); // a folder where the day swept is written
        $this->aDay('2026-01-01');
        $this->pictures()->sweep('2026-10-07');
        self::assertStringContainsString('the kept pictures in ai-pictures/ could not be cleaned up', $this->log());
        self::assertSame(1, substr_count($this->log(), "\n"), 'one line, no trace');
    }

    private function pictures(): FileAiPictures
    {
        return new FileAiPictures($this->root, Shared::fromFile(Paths::schema('shared.json')));
    }

    /** A day's folder with one picture in it, as a read on that day leaves it. */
    private function aDay(string $day): void
    {
        mkdir("$this->root/ai-pictures/$day", 0775, true);
        file_put_contents("$this->root/ai-pictures/$day/0123456789abcdef.jpg", 'a picture');
    }

    /** @return list<string> */
    private function kept(): array
    {
        $names = array_values(array_diff((array) scandir("$this->root/ai-pictures"), ['.', '..']));
        sort($names);
        return $names;
    }

    private function log(): string
    {
        return is_file("$this->logDir/php-errors.log") ? (string) file_get_contents("$this->logDir/php-errors.log") : '';
    }
}
