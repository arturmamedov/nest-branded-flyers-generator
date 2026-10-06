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
    }

    public function testAPictureThatCannotBeKeptNeverPutsItsBytesInTheErrorsTrace(): void
    {
        // An uncaught error is logged with its trace, and a trace prints the start of every string argument.
        file_put_contents("$this->root/ai-pictures", 'a file where the folder belongs');
        try {
            $this->pictures()->keep('2026-10-07', 'JFIF-the-picture', 'jpg');
            self::fail('The picture was kept');
        } catch (RuntimeException $e) {
            if (ini_get('zend.exception_ignore_args') === '1') {
                self::markTestSkipped('This PHP keeps no arguments in a trace.');
            }
            self::assertStringContainsString("'2026-10-07'", (string) $e, 'the trace does print arguments here');
            self::assertStringNotContainsString('JFIF', (string) $e);
        }
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

    // One folder that will not go (a file held open, a permission) used to end the whole clean-up, for good: the
    // listing is alphabetical, so the stuck one always came first, and the marker was never written. On PHP that was
    // a walk of the folder and a log line on every page load.
    public function testADayThatCannotBeDeletedDoesNotStopTheRestTheOthersGoTheDayIsMarkedSweptAndTheLogNamesItOnce(): void
    {
        foreach (['2026-01-01', '2026-01-02', '2026-01-03', '2026-10-07'] as $day) {
            $this->aDay($day);
        }
        $stuck = static function (string $path): void {
            if (str_ends_with($path, '2026-01-01')) {
                throw new RuntimeException('resource busy or locked');
            }
            array_map('unlink', glob("$path/*") ?: []);
            rmdir($path);
        };
        $this->pictures($stuck)->sweep('2026-10-07');
        self::assertSame(['.swept', '2026-01-01', '2026-10-07'], $this->kept());
        self::assertSame(1, substr_count($this->log(), "\n"));
        self::assertStringContainsString('2026-01-01', $this->log());
        // Marked: the next try is tomorrow's, not the next page load's.
        $this->pictures($stuck)->sweep('2026-10-07');
        self::assertSame(1, substr_count($this->log(), "\n"));
    }

    public function testALinkWhereADaysFolderBelongsIsNotFollowedWhatItPointsAtIsLeftAlone(): void
    {
        mkdir("$this->root/flyers");
        file_put_contents("$this->root/flyers/1.json", '{}');
        mkdir("$this->root/ai-pictures");
        $this->aDay('2026-01-02');
        // Windows lets only a privileged account make a link: there the test has nothing to run on.
        if (!@symlink("$this->root/flyers", "$this->root/ai-pictures/2026-01-01") || !@symlink("$this->root/flyers", "$this->root/ai-pictures/2026-01-02/inside")) {
            self::markTestSkipped('This account cannot make a symbolic link.');
        }
        $this->pictures()->sweep('2026-10-07');
        self::assertFileExists("$this->root/flyers/1.json");
        self::assertNotContains('2026-01-02', $this->kept());
    }

    public function testADaysFolderIsNamedAsADayAndNothingMore(): void
    {
        // PHP's `$` also matches before a last line break: a folder so named is not a day's.
        if (@mkdir("$this->root/ai-pictures/2026-01-01\n", 0775, true)) {
            $this->pictures()->sweep('2026-10-07');
            self::assertDirectoryExists("$this->root/ai-pictures/2026-01-01\n");
        } else {
            self::assertSame(0, preg_match(FileAiPictures::DAY, "2026-01-01\n"));
        }
        self::assertSame(1, preg_match(FileAiPictures::DAY, '2026-01-01'));
        self::assertSame(0, preg_match(FileAiPictures::DAY, "2026-01-01\n"));
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

    /** @param (callable(string): void)|null $remove deletes one day's folder; a test hands in one that fails */
    private function pictures(?callable $remove = null): FileAiPictures
    {
        return new FileAiPictures($this->root, Shared::fromFile(Paths::schema('shared.json')), $remove);
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
