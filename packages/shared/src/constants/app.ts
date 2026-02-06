/**
 * Application Constants
 *
 * Centralized constants for the Omniscribe application.
 * Use these instead of hardcoding values throughout the codebase.
 */

// =============================================================================
// App Identity
// =============================================================================

/** Application name (display) */
export const APP_NAME = 'Omniscribe';

/** Application name (lowercase, for paths/IDs) */
export const APP_NAME_LOWER = 'omniscribe';

/** Application ID for Electron/OS registration */
export const APP_ID = 'com.omniscribe.desktop';

/** MCP server name used in .mcp.json */
export const MCP_SERVER_NAME = 'omniscribe';

// =============================================================================
// Paths
// =============================================================================

/** Directory name for user data (e.g., ~/.omniscribe) */
export const USER_DATA_DIR = '.omniscribe';

/** Subdirectory for worktrees */
export const WORKTREES_DIR = 'worktrees';

/** Subdirectory for MCP configs */
export const MCP_CONFIGS_DIR = 'mcp-configs';

/** Subdirectory for MCP server */
export const MCP_SERVER_DIR = 'mcp-server';

// =============================================================================
// Timeouts (in milliseconds)
// =============================================================================

/** Default timeout for git commands */
export const GIT_TIMEOUT_MS = 30000;

/** Default timeout for GitHub CLI commands */
export const GH_TIMEOUT_MS = 30000;

/** Cache TTL for status checks */
export const STATUS_CACHE_TTL_MS = 5 * 60 * 1000;

// =============================================================================
// Network
// =============================================================================

/** Vite dev server port */
export const VITE_DEV_PORT = 5173;

/** MCP status server port range start */
export const MCP_STATUS_PORT_START = 9900;

/** MCP status server port range end */
export const MCP_STATUS_PORT_END = 9999;

/** Localhost address */
export const LOCALHOST = '127.0.0.1';

// =============================================================================
// Terminal
// =============================================================================

/** Terminal program identifier */
export const TERM_PROGRAM = 'omniscribe-terminal';

// =============================================================================
// Links
// =============================================================================

/** GitHub releases page URL */
export const GITHUB_RELEASES_URL = 'https://github.com/Shironex/omniscribe/releases';

// =============================================================================
// Logging
// =============================================================================

/** Log file prefix */
export const LOG_FILE_PREFIX = 'omniscribe';

/** Maximum log file size before rotation (10MB) */
export const LOG_MAX_FILE_SIZE = 10 * 1024 * 1024;

/** Maximum age of log files before cleanup (7 days in ms) */
export const LOG_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** Log flush interval in milliseconds */
export const LOG_FLUSH_INTERVAL_MS = 100;

/** Maximum buffered log entries before forced flush */
export const LOG_BUFFER_MAX_ENTRIES = 50;

/** Log cleanup interval (1 hour in ms) */
export const LOG_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

// =============================================================================
// Session Limits
// =============================================================================

/** Maximum concurrent running sessions (matches terminal grid capacity) */
export const MAX_CONCURRENT_SESSIONS = 12;
