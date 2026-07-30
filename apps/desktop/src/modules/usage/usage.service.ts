import { Injectable } from '@nestjs/common';
import { PluginRegistryService } from '../plugin';
import {
  AiMode,
  ClaudeCliStatus,
  ClaudeUsage,
  createLogger,
  extractErrorMessage,
} from '@omniscribe/shared';
import type { CliDetectionResult, ProviderUsageData } from '@omniscribe/plugin-api';
import type { UsageError } from '@omniscribe/shared';
import { hasProviderMethod } from '../shared/provider-guards';

export interface UsageFetchResult {
  /** Provider-agnostic usage data */
  providerUsage?: ProviderUsageData;
  /** Raw ClaudeUsage for backward compat with frontend */
  rawUsage?: ClaudeUsage;
  /** Error if fetch failed */
  error?: UsageError;
  /** Error message */
  message?: string;
}

/**
 * Usage Service
 *
 * Delegates all usage fetching and CLI status detection to the provider plugin
 * via the plugin registry. No longer directly spawns PTY processes or imports
 * Claude-specific detection utilities.
 */
@Injectable()
export class UsageService {
  private readonly logger = createLogger('UsageService');

  constructor(private readonly pluginRegistry: PluginRegistryService) {}

  /**
   * Fetch usage data for the given AI mode via the provider plugin.
   * Returns null for modes that don't support usage (e.g., 'plain').
   */
  async fetchUsageForMode(aiMode: AiMode, workingDir: string): Promise<UsageFetchResult | null> {
    if (aiMode === 'plain') return null;
    if (!this.pluginRegistry.isPluginMode(aiMode)) return null;

    try {
      const provider = this.pluginRegistry.getProvider(aiMode);
      if (!provider.capabilities.supportsUsage || !provider.parseUsage) {
        return null;
      }

      const providerUsage = await provider.parseUsage(workingDir);
      if (!providerUsage) return null;

      // For backward compat: access the provider's internal fetcher to get ClaudeUsage
      let rawUsage: ClaudeUsage | undefined;
      if (hasProviderMethod(provider, 'getUsageFetcher')) {
        const fetcher = provider.getUsageFetcher() as
          { lastFetchedUsage?: ClaudeUsage } | undefined;
        if (fetcher?.lastFetchedUsage) {
          rawUsage = fetcher.lastFetchedUsage;
        }
      }

      return { providerUsage, rawUsage };
    } catch (error) {
      const message = extractErrorMessage(error);
      this.logger.error(`Usage fetch failed for '${aiMode}': ${message}`);

      let errorType: UsageError = 'unknown';
      if (message.includes('authentication') || message.includes('login')) {
        errorType = 'auth_required';
      } else if (message.includes('TRUST_PROMPT')) {
        errorType = 'trust_prompt';
      } else if (message.includes('timed out') || message.includes('too long')) {
        errorType = 'timeout';
      } else if (message.includes('not found') || message.includes('not available')) {
        errorType = 'cli_not_found';
      }
      return { error: errorType, message };
    }
  }

  /**
   * Get CLI status for the given AI mode via the provider plugin.
   */
  async getStatusForMode(
    aiMode: AiMode,
    _forceRefresh = false
  ): Promise<CliDetectionResult | ClaudeCliStatus> {
    if (aiMode === 'plain') {
      return { installed: true };
    }

    if (!this.pluginRegistry.isPluginMode(aiMode)) {
      return { installed: false, error: `No provider for mode: ${aiMode}` };
    }

    try {
      const provider = this.pluginRegistry.getProvider(aiMode);
      // For Claude, use the richer getFullStatus() for backward compat with frontend
      if (hasProviderMethod(provider, 'getCliDetectionService')) {
        const detectionService = provider.getCliDetectionService() as
          { getFullStatus?: () => Promise<ClaudeCliStatus> } | undefined;
        if (detectionService?.getFullStatus) {
          return await detectionService.getFullStatus();
        }
      }
      return await provider.detectCli();
    } catch (error) {
      const message = extractErrorMessage(error);
      this.logger.error(`CLI detection failed for '${aiMode}': ${message}`);
      return { installed: false, error: message };
    }
  }
}
