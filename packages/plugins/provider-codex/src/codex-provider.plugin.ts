/**
 * Codex Provider Plugin
 *
 * Main plugin class that extends BaseProviderPlugin and wires all Codex-specific
 * services together. Implements the full AiProviderPlugin interface with all
 * required and optional methods.
 *
 * This is the entry point for the @omniscribe/provider-codex package.
 * The core app creates an instance and delegates Codex-specific operations to it.
 */

import { BaseProviderPlugin } from '@omniscribe/plugin-api';
import type {
  ProviderCapabilities,
  SessionOperation,
  CliDetectionResult,
  CliCommandConfig,
  LaunchContext,
  ProviderSessionStatus,
  ProviderUsageData,
  ProviderSessionEntry,
  McpConfigContribution,
  PluginContext,
} from '@omniscribe/plugin-api';

import { CodexCliDetectionService } from './services/cli-detection.service';
import { CodexCliCommandService } from './services/cli-command.service';
import { CodexStatusParserService } from './services/status-parser.service';
import { CodexUsageFetcherService } from './services/usage-fetcher.service';
import { CodexUsageParserService } from './services/usage-parser.service';

/**
 * OpenAI Codex Provider Plugin.
 *
 * Implements the AiProviderPlugin interface for OpenAI's Codex CLI.
 * Supports MCP integration, usage tracking, and session operations
 * (resume, fork, continue). Session history is not supported.
 *
 * Internal services are instantiated as class fields and exposed via
 * delegate methods for the core adapter to consume.
 */
export class CodexProviderPlugin extends BaseProviderPlugin {
  readonly id = 'provider-codex';
  readonly displayName = 'Codex';
  readonly aiMode = 'codex';
  readonly type = 'provider' as const;

  // Internal services
  private readonly cliDetection = new CodexCliDetectionService();
  private readonly commandBuilder = new CodexCliCommandService();
  private readonly statusParser = new CodexStatusParserService();
  private readonly usageParser = new CodexUsageParserService();

  /** Lazily created -- spawns a child process for app-server */
  private usageFetcher: CodexUsageFetcherService | null = null;

  /** Stored plugin context from activation */
  private context: PluginContext | null = null;

  // ==========================================
  // Capabilities
  // ==========================================

  /**
   * Codex supports MCP, usage tracking, and session operations (resume, fork, continue).
   * Session history is not supported (Codex CLI does not expose session logs).
   */
  get capabilities(): ProviderCapabilities {
    return {
      supportsMcp: true,
      supportsUsage: true,
      supportsSessionHistory: false,
      supportedOperations: new Set<SessionOperation>(['resume', 'fork', 'continue']),
    };
  }

  // ==========================================
  // Required: CLI Detection
  // ==========================================

  async detectCli(): Promise<CliDetectionResult> {
    return this.cliDetection.detect();
  }

  // ==========================================
  // Required: Command Building
  // ==========================================

  buildLaunchCommand(context: LaunchContext): CliCommandConfig {
    return this.commandBuilder.buildLaunch(context);
  }

  // ==========================================
  // Required: Status Parsing
  // ==========================================

  parseTerminalStatus(output: string): ProviderSessionStatus | null {
    return this.statusParser.parse(output);
  }

  // ==========================================
  // Optional: Usage Data
  // ==========================================

  /**
   * Fetch usage data via the Codex app-server JSON-RPC API.
   *
   * Creates or reuses a CodexUsageFetcherService instance (lazy initialization
   * since the fetcher spawns a child process). After fetching, the raw
   * CodexUsageData is transformed to ProviderUsageData via the usage parser.
   */
  async parseUsage(workingDir: string): Promise<ProviderUsageData | null> {
    const fetcher = this.getUsageFetcher();

    try {
      const codexUsage = await fetcher.fetchUsage(workingDir);
      return this.usageParser.toProviderUsageData(codexUsage);
    } catch {
      return null;
    }
  }

  // ==========================================
  // Optional: Session History
  // ==========================================

  async readSessionHistory(_projectPath: string): Promise<ProviderSessionEntry[]> {
    // Codex CLI does not expose session history logs
    return [];
  }

  // ==========================================
  // Optional: Session Operations
  // ==========================================

  buildResumeCommand(sessionId: string, context: LaunchContext): CliCommandConfig {
    return this.commandBuilder.buildResume(sessionId, context);
  }

  buildForkCommand(sessionId: string, context: LaunchContext): CliCommandConfig {
    return this.commandBuilder.buildFork(sessionId, context);
  }

  buildContinueCommand(context: LaunchContext): CliCommandConfig {
    return this.commandBuilder.buildContinue(context);
  }

  // ==========================================
  // Optional: MCP Integration
  // ==========================================

  async getMcpConfig(
    _sessionId: string,
    _projectPath: string
  ): Promise<McpConfigContribution | null> {
    // TODO: Codex MCP config is TOML-based at .codex/config.toml
    // For now, MCP config is handled by the core's McpModule directly.
    return null;
  }

  // ==========================================
  // Lifecycle
  // ==========================================

  async activate(context: PluginContext): Promise<void> {
    this.context = context;
    context.logger.info('Codex provider plugin activated');
  }

  async deactivate(): Promise<void> {
    this.context?.logger.info('Codex provider plugin deactivated');
    this.context = null;
  }

  // ==========================================
  // Accessor methods
  // ==========================================

  /**
   * Get the usage fetcher service for raw CodexUsageData access.
   * Lazily creates the fetcher instance since it spawns child processes.
   */
  getUsageFetcher(): CodexUsageFetcherService {
    if (!this.usageFetcher) {
      this.usageFetcher = new CodexUsageFetcherService();
    }
    return this.usageFetcher;
  }
}
