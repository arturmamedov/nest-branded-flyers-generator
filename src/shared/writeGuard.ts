/* The write guard. The app has no login, so a page on another site must not be
   able to write through a staff browser: every request that can change
   something (any method but the safe ones) carries this header, or the API
   answers 403 `forbidden`. A custom header can't be sent from another origin
   without a CORS preflight, and neither backend ever grants one. The Node
   server (server/app.ts) and the PHP backend (WriteGuard, through the
   generated schema/shared.json) check it; the editor and the tests send it. */

export const WRITE_GUARD = {
  /** Case-insensitive on the wire; PHP keeps every header name lower-cased. */
  header: 'X-Nest-Flyers',
  /** The only value that passes: "true", or the header sent twice ("1, 1"), is refused. */
  value: '1',
  /** The methods that only read, so need no header. Widened so any request method can be looked up. */
  safeMethods: ['GET', 'HEAD', 'OPTIONS'] as readonly string[],
} as const;

/** The header as fetch() and Playwright take it. It is shared: spread it to add more, never write to it. */
export const WRITE_HEADERS = { [WRITE_GUARD.header]: WRITE_GUARD.value } as const;
