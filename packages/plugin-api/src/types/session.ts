/**
 * Provider Session Types
 *
 * Types related to launching sessions and reading session history.
 * These are provider-agnostic abstractions -- each provider maps
 * its CLI-specific behavior to these common types.
 */

/**
 * Context provided to command builders when launching a new session.
 * Contains all the information a provider needs to construct the CLI command.
 */
export interface LaunchContext {
  /** Unique Omniscribe session identifier */
  sessionId: string;

  /** Working directory for the session (may be a worktree path) */
  workingDirectory: string;

  /** Original project path (before worktree resolution) */
  projectPath: string;

  /** AI model to use (provider-specific, e.g., 'opus', 'gpt-4o') */
  model?: string;

  /** System prompt to prepend */
  systemPrompt?: string;

  /** Whether to skip permission prompts (provider-specific flag) */
  skipPermissions?: boolean;

  /** Git branch name for context */
  branch?: string;

  /** Git worktree path if using worktrees */
  worktreePath?: string;

  /** MCP server names to configure for this session */
  mcpServers?: string[];
}

/**
 * A session history entry read from the provider's local storage.
 * Providers that support session history map their native format to this type.
 *
 * @example
 * ```typescript
 * // Claude session entry
 * {
 *   sessionId: 'abc123-def456',
 *   projectPath: '/Users/dev/my-project',
 *   summary: 'Implemented user authentication',
 *   messageCount: 42,
 *   created: '2026-02-18T10:00:00Z',
 *   modified: '2026-02-18T11:30:00Z',
 * }
 * ```
 */
export interface ProviderSessionEntry {
  /** Provider-specific session identifier */
  sessionId: string;

  /** Project path this session belongs to */
  projectPath: string;

  /** Summary or first prompt of the session */
  summary?: string;

  /** Number of messages in the session */
  messageCount?: number;

  /** ISO date string when the session was created */
  created: string;

  /** ISO date string when the session was last modified */
  modified: string;

  /** Additional provider-specific metadata */
  metadata?: Record<string, unknown>;
}

/**
 * MCP configuration contribution from a provider.
 * Providers that support MCP can contribute configuration that gets written
 * to the appropriate location before session launch.
 */
export interface McpConfigContribution {
  /** Absolute path where the MCP config should be written */
  configPath: string;

  /** MCP configuration content to write */
  config: Record<string, unknown>;

  /**
   * Optional cleanup function called after session ends.
   * Use this to remove temporary config files.
   */
  cleanup?: () => Promise<void>;
}
