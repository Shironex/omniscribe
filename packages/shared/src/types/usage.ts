/**
 * Claude Usage types for CLI-based usage tracking
 *
 * Usage data is fetched by executing the Claude CLI's /usage command.
 * Token counts are not available from the CLI (always 0).
 */

/**
 * Claude CLI usage data
 */
export type ClaudeUsage = {
  /** Session usage percentage (5-hour rolling window) */
  sessionPercentage: number;
  /** ISO date string for when session resets */
  sessionResetTime: string;
  /** Raw text like "Resets in 2h 15m" */
  sessionResetText: string;

  /** Weekly usage percentage (all models) */
  weeklyPercentage: number;
  /** ISO date string for when weekly resets */
  weeklyResetTime: string;
  /** Raw text like "Resets Dec 22 at 7:59pm" */
  weeklyResetText: string;

  /** Sonnet/Opus weekly usage percentage */
  sonnetWeeklyPercentage: number;
  /** Raw text like "Resets Dec 27 at 9:59am" */
  sonnetResetText: string;

  /** When the data was last fetched (ISO date string) */
  lastUpdated: string;
  /** User's timezone from the system */
  userTimezone: string;
};

/**
 * Status of the usage fetch operation
 */
export type UsageStatus = 'idle' | 'fetching' | 'success' | 'error';

/**
 * Error types for usage fetching
 */
export type UsageError =
  | 'auth_required'
  | 'cli_not_found'
  | 'timeout'
  | 'parse_error'
  | 'trust_prompt'
  | 'unknown';

/**
 * Payload for requesting usage data
 */
export interface UsageFetchPayload {
  /** Working directory to run claude from */
  workingDir: string;
}

/**
 * Response from usage fetch
 */
export interface UsageFetchResponse {
  /** Usage data if successful */
  usage?: ClaudeUsage;
  /** Error type if failed */
  error?: UsageError;
  /** Error message with details */
  message?: string;
}
