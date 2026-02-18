/** Built-in AI modes that are always available */
export type BuiltinAiMode = 'claude' | 'plain';

/**
 * AI mode for the session.
 * Built-in modes + any plugin-registered mode string.
 * Runtime validation happens against the plugin registry.
 *
 * NOTE: 'claude' remains a BuiltinAiMode during Phase 12 because Claude-specific
 * services still live in core. Phase 13 will extract Claude into a plugin, at which
 * point 'claude' moves from BuiltinAiMode to a plugin-registered mode.
 */
export type AiMode = BuiltinAiMode | (string & {});

/**
 * Health level for session health monitoring.
 * - healthy: Terminal responsive, PID alive, output recent
 * - degraded: Terminal exists but may be stuck (no output while working, or backpressured)
 * - failed: Terminal process dead (zombie) or session in persistent error state
 */
export type HealthLevel = 'healthy' | 'degraded' | 'failed';

/**
 * Session status
 * Includes both legacy statuses and MCP status values
 */
export type SessionStatus =
  | 'idle'
  | 'connecting'
  | 'thinking'
  | 'error'
  | 'disconnected'
  // MCP status values
  | 'working'
  | 'planning'
  | 'needs_input'
  | 'finished';

/**
 * Session configuration
 */
export interface SessionConfig {
  /** Unique session identifier */
  id: string;

  /** Display name for the session */
  name: string;

  /** Working directory path */
  workingDirectory: string;

  /** AI mode to use */
  aiMode: AiMode;

  /** Model identifier (e.g., 'claude-3-opus', 'gpt-4') */
  model?: string;

  /** System prompt override */
  systemPrompt?: string;

  /** Maximum tokens per response */
  maxTokens?: number;

  /** Temperature for AI responses */
  temperature?: number;

  /** Session creation timestamp */
  createdAt: Date;

  /** Last activity timestamp */
  lastActiveAt: Date;

  /** MCP server configurations for this session */
  mcpServers?: string[];
}

/**
 * Session state
 */
export interface SessionState {
  /** Current session configuration */
  config: SessionConfig;

  /** Current status */
  status: SessionStatus;

  /** Error message if status is 'error' */
  errorMessage?: string;

  /** Conversation history length */
  messageCount: number;
}

/**
 * Session creation options
 */
export interface CreateSessionOptions {
  name?: string;
  workingDirectory: string;
  aiMode?: AiMode;
  model?: string;
  systemPrompt?: string;
  mcpServers?: string[];
}

/**
 * Session update options
 */
export interface UpdateSessionOptions {
  name?: string;
  aiMode?: AiMode;
  model?: string;
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
  mcpServers?: string[];
}

// ============================================
// Claude Code Session Tracking Types
// ============================================

/** Entry from Claude Code's sessions-index.json */
export interface ClaudeSessionEntry {
  sessionId: string;
  fullPath: string;
  fileMtime: number;
  firstPrompt: string;
  summary: string;
  messageCount: number;
  created: string;
  modified: string;
  gitBranch: string;
  projectPath: string;
  isSidechain: boolean;
}

/** Claude Code's sessions-index.json format */
export interface ClaudeSessionsIndex {
  version: number;
  entries: ClaudeSessionEntry[];
  originalPath?: string;
}

/** Omniscribe's persisted session history entry */
export interface SessionHistoryEntry {
  omniscribeSessionId: string;
  claudeSessionId: string;
  projectPath: string;
  name: string;
  lastStatus: string;
  createdAt: string;
  lastActiveAt: string;
  branch?: string;
  exitCode?: number;
  summary?: string;
}

/**
 * Extended session config with runtime state.
 * Base shared type used by both backend and frontend.
 * Each app may extend this with app-specific fields.
 */
export interface ExtendedSessionConfig extends SessionConfig {
  /** Git branch assigned to this session */
  branch?: string;
  /** Git worktree path if using worktrees */
  worktreePath?: string;
  /** Project path for grouping sessions */
  projectPath: string;
  /** Current status of the session */
  status: SessionStatus;
  /** Status message for display */
  statusMessage?: string;
  /** Whether the session needs user input */
  needsInputPrompt?: boolean;
  /** Whether session was launched with skip-permissions mode */
  skipPermissions?: boolean;
  /** Terminal session ID if launched */
  terminalSessionId?: number;
  /** Claude Code session UUID captured after launch */
  claudeSessionId?: string;
  /** Whether this session was resumed from a previous Claude session */
  isResumed?: boolean;
}

/**
 * Result of launching a session
 */
export interface LaunchSessionResult {
  success: boolean;
  terminalSessionId?: number;
  error?: string;
}
