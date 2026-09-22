<?php

declare(strict_types=1);

/*
 * The API's front controller: every api/… request lands here (the .htaccess
 * rewrite on Apache, router.php under php -S). This folder is the app root.
 */

// First, before anything can print: PHP may already have buffered a warning
// (the post_max_size one is raised before this script starts, while the host's
// display_errors may still be on). Dropping it keeps the answer pure JSON.
while (ob_get_level() > 0) {
    ob_end_clean();
}
ini_set('display_errors', '0');

require __DIR__ . '/vendor/autoload.php';

NestFlyers\Bootstrap::fromAppRoot(__DIR__)->run();
