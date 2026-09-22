/* The PHP release's security-relevant layout, stated once. Every stage (test
   stages, the smoke stage, release/php) is php/web plus generated files, and
   these are the parts of it that must never be served over HTTP, and the parts
   the app writes to at runtime.

   Every entry must be covered by all three enforcers, or the layout and the
   rules drift apart:
   - php/web/.htaccess (Apache: the RewriteRule for the folders, FilesMatch for the files);
   - php/web/router.php (php -S emulates the same denies);
   - tests/contract/security.test.ts (probes each entry over HTTP, mixed case too).
   stage.ts also writes a deny-all .htaccess into every denied folder, so a host
   that ignores the root rewrite rules still refuses them. */

export const RELEASE_LAYOUT = {
  /** Top-level folders that hold code, data or seed input: 403/404, never served. */
  deniedDirs: ['src', 'vendor', 'seed', 'schema', 'data'],
  /** Root files that are never served (config.php holds the access rule; the rest leak internals). */
  deniedFiles: ['config.php', 'config.sample.php', 'router.php', 'composer.json', 'composer.lock', '.user.ini'],
  /** Folders PHP writes at runtime. A release ships only their .htaccess, so re-uploading can't overwrite data. */
  writableDirs: ['data', 'uploads'],
} as const;

export type DeniedDir = (typeof RELEASE_LAYOUT.deniedDirs)[number];
export type DeniedFile = (typeof RELEASE_LAYOUT.deniedFiles)[number];
export type WritableDir = (typeof RELEASE_LAYOUT.writableDirs)[number];
