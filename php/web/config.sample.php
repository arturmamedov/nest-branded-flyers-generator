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
 * private, paste a snippet from access-examples/ into .htaccess.
 */

return [
    'access' => [
        // Office networks allowed to use the app, by the address the server sees
        // (REMOTE_ADDR). CIDR, IPv4 or IPv6; a bare address means that one machine.
        // e.g. ['203.0.113.7/32', '198.51.100.0/24', '2001:db8:1234::/48']
        'allowIps' => [],

        // A shared staff login (HTTP Basic auth; use it only over https).
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
];
