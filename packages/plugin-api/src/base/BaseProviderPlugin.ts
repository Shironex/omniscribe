/**
 * Base Provider Plugin
 *
 * Abstract base class that implements the AiProviderPlugin interface
 * with sensible defaults for optional methods and properties.
 *
 * Plugin authors extend this class and implement only the three
 * required abstract methods: detectCli, buildLaunchCommand, and parseTerminalStatus.
 *
 * All optional capabilities default to disabled. Override the `capabilities`
 * getter and implement the corresponding optional methods to enable features.
 *
 * @example
 * ```typescript
 * class MyProvider extends BaseProviderPlugin {
 *   readonly id = 'my-provider';
 *   readonly displayName = 'My AI Tool';
 *   readonly aiMode = 'my-tool';
 *
 *   async detectCli() {
 *     // ... detect CLI installation
 *   }
 *
 *   buildLaunchCommand(context: LaunchContext) {
 *     return { command: 'my-tool', args: ['--project', context.projectPath] };
 *   }
 *
 *   parseTerminalStatus(output: string) {
 *     if (output.includes('> ')) return 'idle';
 *     return null;
 *   }
 * }
 * ```
 */

import type { ProviderCapabilities, SessionOperation } from '../types/capabilities';
import type { CliCommandConfig, CliDetectionResult } from '../types/cli';
import type { PluginContext } from '../types/plugin';
import type { AiProviderPlugin } from '../types/provider';
import type {
  LaunchContext,
  McpConfigContribution,
  ProviderSessionEntry,
} from '../types/session';
import type { ProviderSessionStatus } from '../types/status';
import type { ProviderUsageData } from '../types/usage';
import type { PluginActivation } from '../types/activation';

export abstract class BaseProviderPlugin implements AiProviderPlugin {
  /**
   * Unique plugin identifier.
   * Must match the `id` field in the plugin's package.json `omniscribe` manifest.
   */
  abstract readonly id: string;

  /**
   * Human-readable display name shown in the UI.
   */
  abstract readonly displayName: string;

  /**
   * The AI mode identifier this provider handles.
   * Must be unique across all loaded providers.
   */
  abstract readonly aiMode: string;

  /**
   * Plugin type. Base provider plugins are always 'provider'.
   * Override to 'both' in a subclass that also implements frontend contributions.
   */
  readonly type: 'provider' | 'both' = 'provider';

  /**
   * Default activation events: activate when a session with this provider's
   * AI mode is created. Override to customize activation behavior.
   */
  get activationEvents(): PluginActivation[] {
    return [{ event: 'onSessionCreateWithMode', mode: this.aiMode }];
  }

  /**
   * Default capabilities: all optional features disabled.
   * Override this getter to declare supported capabilities.
   *
   * @example
   * ```typescript
   * get capabilities(): ProviderCapabilities {
   *   return {
   *     supportsMcp: true,
   *     supportsUsage: true,
   *     supportsSessionHistory: true,
   *     supportedOperations: new Set(['resume', 'fork', 'continue']),
   *   };
   * }
   * ```
   */
  get capabilities(): ProviderCapabilities {
    return {
      supportsMcp: false,
      supportsUsage: false,
      supportsSessionHistory: false,
      supportedOperations: new Set<SessionOperation>(),
    };
  }

  // ==========================================
  // Required: Must be implemented by subclass
  // ==========================================

  /**
   * Detect whether this provider's CLI tool is installed and configured.
   */
  abstract detectCli(): Promise<CliDetectionResult>;

  /**
   * Build the shell command to launch a new session.
   */
  abstract buildLaunchCommand(context: LaunchContext): CliCommandConfig;

  /**
   * Parse terminal output to determine session status.
   */
  abstract parseTerminalStatus(output: string): ProviderSessionStatus | null;

  // ==========================================
  // Lifecycle: No-op defaults
  // ==========================================

  /**
   * Called when the plugin is activated. No-op by default.
   * Override to initialize resources, register event listeners, etc.
   */
  async activate(_context: PluginContext): Promise<void> {
    // No-op default -- override in subclass if needed
  }

  /**
   * Called when the plugin is deactivated. No-op by default.
   * Override to clean up resources not tracked via context.subscriptions.
   */
  async deactivate(): Promise<void> {
    // No-op default -- override in subclass if needed
  }

  // ==========================================
  // Optional: No-op defaults
  // ==========================================

  /**
   * Read past session history for the given project. No-op by default.
   * Override to return session entries if the provider supports session history.
   */
  async readSessionHistory(_projectPath: string): Promise<ProviderSessionEntry[]> {
    // No-op default -- override in subclass if needed
    return [];
  }

  /**
   * Get MCP configuration this provider needs written before session launch. No-op by default.
   * Override to contribute MCP config if the provider supports MCP.
   */
  async getMcpConfig(
    _sessionId: string,
    _projectPath: string
  ): Promise<McpConfigContribution | null> {
    // No-op default -- override in subclass if needed
    return null;
  }

  /**
   * Fetch usage data for display in the usage panel. No-op by default.
   * Override to return usage metrics if the provider supports usage tracking.
   */
  async parseUsage(_workingDir: string): Promise<ProviderUsageData | null> {
    // No-op default -- override in subclass if needed
    return null;
  }

  /**
   * Get additional system prompt text to append for this provider. No-op by default.
   * Override to inject provider-specific instructions.
   */
  getSystemPromptAdditions(_context: LaunchContext): string[] {
    // No-op default -- override in subclass if needed
    return [];
  }
}
