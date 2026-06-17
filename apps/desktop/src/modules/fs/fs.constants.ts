/**
 * Shared constants for the FS module (explorer / search / watch).
 */

/**
 * Directories that are skipped during search / grep walks and ignored by the
 * filesystem watcher. Ported from terax's SKIP_DIRS blocklist — these are
 * heavy, machine-generated, or VCS-internal trees that explode walk cost and
 * produce watcher noise.
 */
export const SKIP_DIRS: ReadonlySet<string> = new Set([
  '.git',
  'node_modules',
  'dist',
  'out',
  'build',
  '.next',
  'target',
  '__pycache__',
  '.venv',
  'coverage',
  '.turbo',
  '.cache',
]);

/** Maximum file size we will read into memory and return as content (~2MB). */
export const MAX_READ_FILE_BYTES = 2 * 1024 * 1024;

/** Number of leading bytes sniffed for a NUL byte to detect binary files. */
export const BINARY_SNIFF_BYTES = 8192;

/** Maximum entries visited during a fuzzy file-search walk. */
export const SEARCH_WALK_LIMIT = 20_000;

/** Default / maximum number of fuzzy file-search matches returned. */
export const SEARCH_DEFAULT_LIMIT = 100;
export const SEARCH_MAX_LIMIT = 500;

/** Default / maximum number of grep matches returned. */
export const GREP_DEFAULT_LIMIT = 200;
export const GREP_MAX_LIMIT = 1000;

/** Timeout for spawned CLI helpers (git / ripgrep). */
export const FS_CLI_TIMEOUT_MS = 15_000;

/** Watch debounce: quiet window — emit this long after the last event. */
export const WATCH_DEBOUNCE_QUIET_MS = 150;

/** Watch debounce: hard ceiling — emit at least this often under sustained churn. */
export const WATCH_DEBOUNCE_MAX_MS = 1000;
