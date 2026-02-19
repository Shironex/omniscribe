/**
 * Plugin-internal types for @omniscribe/provider-codex
 *
 * Re-exports commonly used types from @omniscribe/plugin-api for convenience
 * within the plugin package, plus Codex-specific internal types.
 */

// Re-export commonly used types for convenience
export type { CliDetectionResult, CliCommandConfig } from '@omniscribe/plugin-api';
export type { LaunchContext } from '@omniscribe/plugin-api';
export type { ProviderSessionStatus } from '@omniscribe/plugin-api';
export type { ProviderUsageData, UsageMetric } from '@omniscribe/plugin-api';

// ---------------------------------------------------------------------------
// Codex-specific types
// ---------------------------------------------------------------------------

/**
 * Rate limit window data from Codex app-server JSON-RPC.
 *
 * Codex uses primary and secondary rate limit windows.
 * The primary window is the main rate limit, secondary is a burst/quota limit.
 */
export interface CodexRateLimitWindow {
  /** Maximum requests allowed in this window */
  limit: number;

  /** Number of requests already used */
  used: number;

  /** Remaining requests in this window */
  remaining: number;

  /** Percentage of the window that has been consumed (0-100) */
  usedPercent: number;

  /** Duration of the rate limit window in minutes */
  windowDurationMins: number;

  /** Unix timestamp (seconds) when the window resets */
  resetsAt: number;
}

/**
 * OpenAI plan types that determine rate limits and features.
 */
export type CodexPlanType = 'free' | 'plus' | 'pro' | 'team' | 'enterprise' | 'edu' | 'unknown';

/**
 * Codex usage data structure returned by the usage fetcher.
 *
 * Maps to ProviderUsageData via the usage parser service.
 */
export interface CodexUsageData {
  /** Rate limit information, null if unavailable */
  rateLimits: {
    /** Primary rate limit window (main usage quota) */
    primary?: CodexRateLimitWindow;

    /** Secondary rate limit window (burst/additional quota) */
    secondary?: CodexRateLimitWindow;

    /** User's OpenAI plan type */
    planType?: CodexPlanType;
  } | null;

  /** ISO date string for when this data was fetched */
  lastUpdated: string;
}
