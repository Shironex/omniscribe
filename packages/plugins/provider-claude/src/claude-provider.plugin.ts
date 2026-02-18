/**
 * Claude Provider Plugin
 *
 * Main plugin class that extends BaseProviderPlugin and wires all Claude-specific
 * services together. Implements the full AiProviderPlugin interface with all
 * required and optional methods.
 *
 * This is the entry point for the @omniscribe/provider-claude package.
 * The core app creates an instance and delegates Claude-specific operations to it.
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

import { ClaudeCliDetectionService } from './services/cli-detection.service';
import { ClaudeCliCommandService } from './services/cli-command.service';
import { ClaudeSessionReaderService } from './services/session-reader.service';
import { ClaudeUsageFetcherService } from './services/usage-fetcher.service';
import { ClaudeUsageParserService } from './services/usage-parser.service';
import { ClaudeStatusParserService } from './services/status-parser.service';
import { ClaudeHookManagerService } from './services/hook-manager.service';
import { ClaudeSessionTrackerService } from './services/session-tracker.service';
import { getSystemPromptAdditions } from './services/system-prompt';

/**
 * Claude Code Provider Plugin.
 *
 * Implements the AiProviderPlugin interface for Anthropic's Claude Code CLI.
 * Supports all optional capabilities: MCP, usage tracking, session history,
 * and all session operations (resume, fork, continue).
 *
 * Internal services are instantiated as class fields and exposed via accessor
 * methods for the core adapter to consume when bridging to NestJS services.
 */
export class ClaudeProviderPlugin extends BaseProviderPlugin {
  readonly id = 'provider-claude';
  readonly displayName = 'Claude Code';
  readonly aiMode = 'claude';
  readonly type = 'provider' as const;

  // Internal services
  private readonly cliDetection = new ClaudeCliDetectionService();
  private readonly commandBuilder = new ClaudeCliCommandService();
  private readonly sessionReader = new ClaudeSessionReaderService();
  private readonly usageParser = new ClaudeUsageParserService();
  private readonly statusParser = new ClaudeStatusParserService();
  private readonly hookManager = new ClaudeHookManagerService();
  private readonly sessionTracker: ClaudeSessionTrackerService;

  /** Lazily created -- PTY is a heavy resource */
  private usageFetcher: ClaudeUsageFetcherService | null = null;

  /** Stored plugin context from activation */
  private context: PluginContext | null = null;

  constructor() {
    super();
    // Session tracker depends on session reader
    this.sessionTracker = new ClaudeSessionTrackerService(this.sessionReader);
  }

  // ==========================================
  // Capabilities
  // ==========================================

  /**
   * Claude Code supports all optional features:
   * MCP integration, usage tracking, session history, and all session operations.
   */
  get capabilities(): ProviderCapabilities {
    return {
      supportsMcp: true,
      supportsUsage: true,
      supportsSessionHistory: true,
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
   * Fetch usage data via the Claude CLI's /usage command.
   *
   * Creates or reuses a ClaudeUsageFetcherService instance (lazy initialization
   * since PTY is a heavy resource). After fetching, the raw ClaudeUsage data
   * is available via `getUsageFetcher().lastFetchedUsage` for backward compat.
   */
  async parseUsage(workingDir: string): Promise<ProviderUsageData | null> {
    const fetcher = this.getUsageFetcher();

    try {
      const claudeUsage = await fetcher.fetchUsage(workingDir);
      return this.usageParser.toProviderUsageData(claudeUsage);
    } catch {
      return null;
    }
  }

  // ==========================================
  // Optional: Session History
  // ==========================================

  async readSessionHistory(projectPath: string): Promise<ProviderSessionEntry[]> {
    return this.sessionReader.readSessionHistory(projectPath);
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
    // MCP config is handled by the core's McpModule directly.
    // The plugin does not need to contribute MCP config at this stage.
    return null;
  }

  // ==========================================
  // Optional: System Prompt
  // ==========================================

  getSystemPromptAdditions(context: LaunchContext): string[] {
    return getSystemPromptAdditions(context);
  }

  // ==========================================
  // Lifecycle
  // ==========================================

  async activate(context: PluginContext): Promise<void> {
    this.context = context;
    context.logger.info('Claude Code provider plugin activated');
  }

  async deactivate(): Promise<void> {
    this.sessionReader.destroy();
    this.hookManager.destroy();
    this.context?.logger.info('Claude Code provider plugin deactivated');
    this.context = null;
  }

  // ==========================================
  // Accessor methods for core adapter consumption
  // ==========================================

  /**
   * Get the session reader service for direct access to Claude session data.
   * Used by the core adapter to set up filesystem watchers and read raw entries.
   */
  getSessionReader(): ClaudeSessionReaderService {
    return this.sessionReader;
  }

  /**
   * Get the hook manager service for registering/watching Claude Code hooks.
   * Used by the core adapter to bridge hook events to NestJS EventEmitter2.
   */
  getHookManager(): ClaudeHookManagerService {
    return this.hookManager;
  }

  /**
   * Get the session tracker service for polling new session IDs.
   * Used by the core adapter to run discovery and then handle persistence.
   */
  getSessionTracker(): ClaudeSessionTrackerService {
    return this.sessionTracker;
  }

  /**
   * Get the CLI detection service for full ClaudeCliStatus access.
   * Used by the core adapter for backward compat with getClaudeCliStatus().
   */
  getCliDetectionService(): ClaudeCliDetectionService {
    return this.cliDetection;
  }

  /**
   * Get the usage fetcher service for raw ClaudeUsage access.
   * Lazily creates the fetcher instance since PTY is a heavy resource.
   * Used by the core adapter to access lastFetchedUsage for backward compat
   * with the frontend's ClaudeUsage data shape.
   */
  getUsageFetcher(): ClaudeUsageFetcherService {
    if (!this.usageFetcher) {
      this.usageFetcher = new ClaudeUsageFetcherService();
    }
    return this.usageFetcher;
  }
}
