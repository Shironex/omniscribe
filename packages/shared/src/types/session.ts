/**
 * AI mode for the session
 * - claude: Uses Claude Code CLI
 * - plain: Plain terminal without AI
 */
export type AiMode = 'claude' | 'plain';

/** Runtime-validated AI mode values */
export const AI_MODES: readonly AiMode[] = ['claude', 'plain'] as const;

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
 * Valid session status transitions.
 * Used by SessionService.updateStatus() to warn on unexpected transitions.
 * Deliberately permissive: MCP status values can freely transition among themselves,
 * and 'error'/'idle' are reachable from any state.
 */
export const VALID_STATUS_TRANSITIONS: Record<SessionStatus, readonly SessionStatus[]> = {
  idle: ['connecting', 'thinking', 'working', 'planning', 'needs_input', 'error'],
  connecting: ['active', 'idle', 'error'],
  active: [
    'idle',
    'thinking',
    'working',
    'planning',
    'needs_input',
    'error',
    'finished',
    'disconnected',
  ],
  thinking: ['idle', 'working', 'executing', 'needs_input', 'error', 'finished'],
  executing: ['idle', 'thinking', 'working', 'needs_input', 'error', 'finished'],
  working: ['idle', 'thinking', 'planning', 'needs_input', 'error', 'finished'],
  planning: ['idle', 'working', 'thinking', 'needs_input', 'error', 'finished'],
  needs_input: ['idle', 'working', 'thinking', 'planning', 'error', 'finished'],
  paused: ['idle', 'active', 'error'],
  error: ['idle', 'connecting', 'error'],
  disconnected: ['idle', 'error'],
  finished: ['idle', 'error'],
};

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
