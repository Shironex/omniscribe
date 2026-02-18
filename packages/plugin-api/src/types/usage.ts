/**
 * Provider Usage Types
 *
 * Provider-agnostic usage data format. Each provider maps its specific
 * metrics to this generic structure. The core renders usage panels
 * based on these named metrics without knowledge of provider-specific details.
 *
 * @example
 * Claude maps: sessionPercentage -> "Current Session", weeklyPercentage -> "Weekly"
 * A hypothetical provider maps: tokensUsed -> "API Tokens", budget -> "Monthly Budget"
 */

/**
 * Provider-agnostic usage data.
 * Returned by the optional `parseUsage()` method on providers that
 * declare `supportsUsage: true`.
 */
export interface ProviderUsageData {
  /** Named usage metrics (e.g., "Session", "Weekly", "Sonnet Weekly") */
  metrics: UsageMetric[];

  /** ISO date string for when the data was last fetched */
  lastUpdated: string;

  /** User's timezone identifier (e.g., 'America/New_York') */
  userTimezone?: string;
}

/**
 * A single named usage metric with percentage and optional reset information.
 *
 * @example
 * ```typescript
 * // Claude's session usage metric
 * {
 *   name: 'Current Session',
 *   percentage: 35,
 *   percentageType: 'used',
 *   resetTime: '2026-02-18T15:00:00Z',
 *   resetText: 'Resets in 2h 15m',
 *   category: 'session',
 * }
 * ```
 */
export interface UsageMetric {
  /** Display name for this metric (e.g., "Current Session", "Weekly") */
  name: string;

  /**
   * Usage as a percentage (0-100).
   * Interpretation depends on `percentageType`.
   */
  percentage: number;

  /**
   * Whether the percentage represents amount used or amount remaining.
   * - `'used'`: 75% means 75% consumed, 25% left
   * - `'remaining'`: 75% means 75% left, 25% consumed
   */
  percentageType: 'used' | 'remaining';

  /** ISO date string for when this metric resets */
  resetTime?: string;

  /** Human-readable reset text (e.g., "Resets in 2h 15m") */
  resetText?: string;

  /** Optional category for grouping metrics in the UI (e.g., "session", "billing") */
  category?: string;
}
