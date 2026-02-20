/**
 * AI Provider Plugin Interface
 *
 * The core contract between Omniscribe and AI provider plugins.
 * A provider plugin handles CLI detection, session command building,
 * and terminal output parsing for a specific AI tool (Claude, Codex, etc.).
 *
 * The interface has three required methods that every provider must implement,
 * and several optional methods gated by capability flags.
 */

import type { ProviderCapabilities } from './capabilities';
import type { CliCommandConfig, CliDetectionResult } from './cli';
import type { OmniscribePlugin, PluginContext } from './plugin';
import type { LaunchContext, McpConfigContribution, ProviderSessionEntry } from './session';
import type { ProviderSessionStatus } from './status';
import type { ProviderUsageData } from './usage';
import type { PluginActivation } from './activation';

/**
 * AI Provider Plugin interface.
 *
 * Extends the base `OmniscribePlugin` with provider-specific concerns:
 * capabilities, CLI detection, command building, and status parsing.
 *
 * **Required methods (minimum viable provider):**
 * - `detectCli()` - Check if the CLI tool is installed
 * - `buildLaunchCommand()` - Build the command to start a new session
 * - `parseTerminalStatus()` - Parse terminal output into session status
 *
 * **Optional methods (gated by capabilities):**
 * - `parseUsage()` - Fetch usage data (requires `supportsUsage`)
 * - `readSessionHistory()` - Read past sessions (requires `supportsSessionHistory`)
 * - `buildResumeCommand()` - Resume a session (requires `supportedOperations.has('resume')`)
 * - `buildForkCommand()` - Fork a session (requires `supportedOperations.has('fork')`)
 * - `buildContinueCommand()` - Continue latest session (requires `supportedOperations.has('continue')`)
 * - `getMcpConfig()` - Provide MCP config (requires `supportsMcp`)
 * - `getSystemPromptAdditions()` - Append to system prompt
 *
 * @example
 * ```typescript
 * class MyProvider extends BaseProviderPlugin {
 *   readonly id = 'my-provider';
 *   readonly displayName = 'My AI Tool';
 *   readonly aiMode = 'my-tool';
 *
 *   async detectCli(): Promise<CliDetectionResult> {
 *     // Check if 'my-tool' CLI is installed
 *   }
 *
 *   buildLaunchCommand(context: LaunchContext): CliCommandConfig {
 *     return { command: 'my-tool', args: ['chat', '--project', context.projectPath] };
 *   }
 *
 *   parseTerminalStatus(output: string): ProviderSessionStatus | null {
 *     if (output.includes('> ')) return 'idle';
 *     if (output.includes('Thinking...')) return 'working';
 *     return null;
 *   }
 * }
 * ```
 */
export interface AiProviderPlugin extends OmniscribePlugin {
  /** Must be 'provider' or 'both' */
  readonly type: 'provider' | 'both';

  /** Declares what optional features this provider supports */
  readonly capabilities: ProviderCapabilities;

  /**
   * The AI mode identifier this provider handles.
   * Must be unique across all loaded providers.
   * Used to route sessions to the correct provider.
   * @example 'claude' | 'codex' | 'aider'
   */
  readonly aiMode: string;

  /**
   * Events that trigger this plugin's activation.
   * Provider plugins typically use `onSessionCreateWithMode` to activate
   * only when a session with their AI mode is created.
   */
  readonly activationEvents: PluginActivation[];

  // ==========================================
  // Required: CLI Detection
  // ==========================================

  /**
   * Detect whether this provider's CLI tool is installed and configured.
   * Called during app initialization, settings display, and before session launch.
   *
   * @returns Detection result with install status, version, path, and auth info
   */
  detectCli(): Promise<CliDetectionResult>;

  // ==========================================
  // Required: Command Building
  // ==========================================

  /**
   * Build the shell command to launch a new session.
   * Returns the executable, arguments, optional env vars, and working directory.
   *
   * @param context - Launch context with session ID, paths, model, and options
   * @returns CLI command configuration ready for PTY execution
   */
  buildLaunchCommand(context: LaunchContext): CliCommandConfig;

  // ==========================================
  // Required: Status Parsing
  // ==========================================

  /**
   * Parse terminal output to determine session status.
   * Called on each chunk of terminal output from the PTY.
   * Return `null` if the output doesn't indicate a status change.
   *
   * @param output - Raw terminal output string
   * @returns Parsed status or null if no status change detected
   */
  parseTerminalStatus(output: string): ProviderSessionStatus | null;

  // ==========================================
  // Optional: Usage Data
  // ==========================================

  /**
   * Fetch usage data for display in the usage panel.
   * Only called if `capabilities.supportsUsage` is `true`.
   *
   * @param workingDir - Working directory context for CLI execution
   * @returns Usage data with named metrics, or null if unavailable
   */
  parseUsage?(workingDir: string): Promise<ProviderUsageData | null>;

  // ==========================================
  // Optional: Session History
  // ==========================================

  /**
   * Read past session history for the given project.
   * Only called if `capabilities.supportsSessionHistory` is `true`.
   *
   * @param projectPath - Project path to read history for
   * @returns Array of historical session entries
   */
  readSessionHistory?(projectPath: string): Promise<ProviderSessionEntry[]>;

  // ==========================================
  // Optional: Session Operations
  // ==========================================

  /**
   * Build command to resume an existing session by ID.
   * Only called if `capabilities.supportedOperations.has('resume')`.
   *
   * @param sessionId - Provider-specific session ID to resume
   * @param context - Launch context with paths and options
   * @returns CLI command configuration for resuming
   */
  buildResumeCommand?(sessionId: string, context: LaunchContext): CliCommandConfig;

  /**
   * Build command to fork a new session from an existing one.
   * Only called if `capabilities.supportedOperations.has('fork')`.
   *
   * @param sessionId - Provider-specific session ID to fork from
   * @param context - Launch context with paths and options
   * @returns CLI command configuration for forking
   */
  buildForkCommand?(sessionId: string, context: LaunchContext): CliCommandConfig;

  /**
   * Build command to continue the most recent session for a project.
   * Only called if `capabilities.supportedOperations.has('continue')`.
   *
   * @param context - Launch context with paths and options
   * @returns CLI command configuration for continuing
   */
  buildContinueCommand?(context: LaunchContext): CliCommandConfig;

  // ==========================================
  // Optional: MCP Integration
  // ==========================================

  /**
   * Get MCP configuration this provider needs written before session launch.
   * Only called if `capabilities.supportsMcp` is `true`.
   *
   * @param sessionId - Omniscribe session ID
   * @param projectPath - Project path for scoped MCP config
   * @returns MCP config contribution with path and content, or null
   */
  getMcpConfig?(sessionId: string, projectPath: string): Promise<McpConfigContribution | null>;

  // ==========================================
  // Optional: System Prompt
  // ==========================================

  /**
   * Get additional system prompt text to append for this provider.
   * Used to inject provider-specific instructions (e.g., MCP tool usage guidance).
   *
   * @param context - Launch context with session details
   * @returns Array of prompt addition strings to append
   */
  getSystemPromptAdditions?(context: LaunchContext): string[];
}

/**
 * Extended plugin context for AI provider plugins.
 * Inherits the base PluginContext with provider-specific additions.
 * Currently identical to PluginContext but provides a dedicated type
 * for future provider-specific context extensions.
 */
export type ProviderPluginContext = PluginContext;

/**
 * Methods on `AiProviderPlugin` that may be invoked remotely via the
 * `plugin:invoke` WebSocket event.  Any method NOT in this set will be
 * rejected at runtime to prevent prototype-chain traversal and
 * invocation of internal/lifecycle methods.
 *
 * Keep in sync with the `AiProviderPlugin` interface above.
 */
export const ALLOWED_PROVIDER_INVOKE_METHODS: ReadonlySet<string> = new Set([
  // Required
  'detectCli',
  'buildLaunchCommand',
  'parseTerminalStatus',
  // Optional
  'parseUsage',
  'readSessionHistory',
  'buildResumeCommand',
  'buildForkCommand',
  'buildContinueCommand',
  'getMcpConfig',
  'getSystemPromptAdditions',
]);
