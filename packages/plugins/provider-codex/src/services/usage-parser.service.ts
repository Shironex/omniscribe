/**
 * Codex Usage Parser Service
 *
 * Transforms Codex-specific usage data (CodexUsageData) into the provider-agnostic
 * ProviderUsageData format consumed by the core app's usage panel.
 *
 * Maps primary and secondary rate limit windows into UsageMetric entries
 * with human-readable reset times.
 */

import type { ProviderUsageData, UsageMetric } from '@omniscribe/plugin-api';
import type { CodexUsageData } from '../types';

/**
 * Codex Usage Parser Service.
 *
 * Converts raw Codex rate limit data into the standardized ProviderUsageData
 * format. Each rate limit window becomes a UsageMetric with percentage,
 * reset time, and human-readable reset text.
 */
export class CodexUsageParserService {
  /**
   * Transform CodexUsageData into ProviderUsageData.
   *
   * Maps primary and secondary rate limit windows to named metrics.
   * Includes plan type in metric names when known.
   *
   * @param data - Raw Codex usage data from the fetcher
   * @returns Provider-agnostic usage data with metrics array
   */
  toProviderUsageData(data: CodexUsageData): ProviderUsageData {
    const metrics: UsageMetric[] = [];

    if (data.rateLimits?.primary) {
      const primary = data.rateLimits.primary;
      const planLabel = this.getPlanLabel(data.rateLimits.planType);

      metrics.push({
        name: planLabel ? `Primary Rate Limit (${planLabel})` : 'Primary Rate Limit',
        percentage: primary.usedPercent,
        percentageType: 'used',
        resetTime: new Date(primary.resetsAt * 1000).toISOString(),
        resetText: this.formatResetText(primary.resetsAt),
        category: 'rate-limit',
      });
    }

    if (data.rateLimits?.secondary) {
      const secondary = data.rateLimits.secondary;

      metrics.push({
        name: 'Secondary Rate Limit',
        percentage: secondary.usedPercent,
        percentageType: 'used',
        resetTime: new Date(secondary.resetsAt * 1000).toISOString(),
        resetText: this.formatResetText(secondary.resetsAt),
        category: 'rate-limit',
      });
    }

    return {
      metrics,
      lastUpdated: data.lastUpdated,
    };
  }

  /**
   * Format a Unix timestamp into a human-readable reset text.
   *
   * @param resetsAt - Unix timestamp (seconds) when the window resets
   * @returns Human-readable string like "Resets in 5 min" or "Resets in 1 hr 30 min"
   */
  private formatResetText(resetsAt: number): string {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const secondsUntilReset = resetsAt - nowSeconds;

    if (secondsUntilReset <= 0) {
      return 'Reset pending';
    }

    if (secondsUntilReset < 60) {
      return 'Resets soon';
    }

    const minutes = Math.floor(secondsUntilReset / 60);
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;

    if (hours === 0) {
      return `Resets in ${minutes} min`;
    }

    if (remainingMinutes === 0) {
      return `Resets in ${hours} hr`;
    }

    return `Resets in ${hours} hr ${remainingMinutes} min`;
  }

  /**
   * Get a display label for the plan type.
   *
   * @param planType - The user's OpenAI plan type
   * @returns Capitalized plan label or undefined for unknown
   */
  private getPlanLabel(planType?: string): string | undefined {
    if (!planType || planType === 'unknown') return undefined;

    // Capitalize first letter
    return planType.charAt(0).toUpperCase() + planType.slice(1);
  }
}
