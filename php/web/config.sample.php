<?php

/*
 * Nest flyers settings. Copy this file to config.php in the same folder and
 * edit the copy. Uploading a new release never overwrites config.php.
 *
 * Until config.php sets at least one access rule, the API answers every
 * request with 503 "not set up yet". There is no login, so the rule is the
 * lock: pick one (or more; any one of them lets a request in).
 *
 * The rule guards the API only. To also keep the editor page and the photos
 * private, paste access-examples/htaccess-basic-auth.txt at the top of
 * .htaccess. The preflight page (docs/deploy.md) prints a complete config.php
 * and that block from one password.
 */

return [
    'access' => [
        // Office networks allowed to use the app, by the address the server sees
        // (REMOTE_ADDR). CIDR, IPv4 or IPv6; a bare address means that one machine.
        // e.g. ['203.0.113.7/32', '198.51.100.0/24', '2001:db8:1234::/48']
        'allowIps' => [],

        // A shared staff login (HTTP Basic auth; use it only over https, which
        // the release's .htaccess sends every http:// visitor to).
        // The hash comes from PHP's password_hash() on any machine with PHP:
        //     php -r "echo password_hash('the-password', PASSWORD_DEFAULT), PHP_EOL;"
        // or from `htpasswd -nbB staff the-password` (the part after "staff:").
        // e.g. ['user' => 'staff', 'passwordHash' => '$2y$10$…']
        // With allowIps too, people on those networks skip the password.
        'basicAuth' => null,

        // true lets anyone who can reach the server in. Only for a machine
        // nobody else can reach (a laptop); never on a public host.
        'allowPublic' => false,
    ],

    // Where the flyer library (JSON files) is kept.
    // null = the data/ folder next to this file, which .htaccess denies over HTTP.
    // Better, where the host allows it: a folder outside the web root, either
    // absolute ('/home/account/nest-flyers-data') or relative to this folder
    // ('../nest-flyers-data'). A folder inside the web root other than data/ is
    // refused, because it would be served to anyone.
    'dataDir' => null,

    // The only storage PHP has: JSON files.
    'storage' => 'json',

    // Photo processing: 'auto' (GD when installed, else Imagick), 'gd' or 'imagick'.
    'imageProcessor' => 'auto',

    // The AI assistant ("Create with AI" and "Write with AI"). Off until a provider,
    // its key and the features are set; without this block it is off too. At most 3 generations
    // a day unless 'dailyLimit' says otherwise, counted in the Canary Islands. Needs PHP's curl extension.
    // Before going back to an older release, take out what it does not know, or it
    // refuses config.php (503): 'dailyLimits' for release 2ad58f28364e (2026-10-06) or any
    // before it, 'features' and 'dailyLimit' as well for one from before 2026-10-06, the
    // whole block for one from before the AI (docs/deploy.md).
    'ai' => [
        // 'openai' or 'anthropic' ('fake' answers canned examples, for tests).
        'provider' => null,
        // The provider's API key. It stays on the server: never shown, logged or sent anywhere else.
        'apiKey' => null,
        // The features that run: 'flyer' ("Create with AI") and 'share' ("Write with AI").
        // None until named: [] keeps the AI off even with a key. The share text alone: ['share'].
        'features' => [],
        // Generations a day for the whole site, both features together; null = 3. A whole number from 1 to 20.
        'dailyLimit' => null,
        // A feature's own number a day, by its name, e.g. ['share' => 10]; null = none. A whole number from 1 to 20 each.
        'dailyLimits' => null,
        // null = the provider's default model (src/shared/ai.ts).
        'model' => null,
        // The provider's effort setting ('low', …); null leaves it to the model. Leave it null for Claude Haiku.
        'effort' => null,
        // How long to wait for an answer, in milliseconds; null = the default, under the host's time limit.
        'timeoutMs' => null,
        // false switches the AI off while keeping the key here.
        'enabled' => true,
    ],
];
