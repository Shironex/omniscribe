/**
 * AI mode for the session
 * - claude: Uses Claude Code CLI
 * - plain: Plain terminal without AI
 */
export type AiMode = 'claude' | 'plain';

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
  | 'active'
  | 'thinking'
  | 'executing'
  | 'paused'
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

  /** API key for the AI provider */
  apiKey?: string;

  /** Custom API endpoint */
  apiEndpoint?: string;

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

  /** Auto-save interval in milliseconds */
  autoSaveInterval?: number;

  /** Enable MCP server connections */
  mcpEnabled?: boolean;

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

  /** Token usage for current session */
  tokenUsage: {
    input: number;
    output: number;
    total: number;
  };

  /** Conversation history length */
  messageCount: number;

  /** Active tool calls */
  activeTools: string[];
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
