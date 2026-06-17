import { ExtendedSessionConfig } from '@omniscribe/shared';

/**
 * AI CLI command configuration for each mode
 */
export interface AiCliConfig {
  command: string;
  args: string[];
}

/** The channel that produced a session status update. */
export type StatusSource = 'mcp' | 'osc' | 'terminal' | 'system';

/**
 * Backend-specific extension with fields not shared with frontend
 */
export interface BackendSessionConfig extends ExtendedSessionConfig {
  /** Timestamp of last terminal output (for health checks) */
  lastOutputAt?: Date;
  /** Claude Code session UUID to resume (used during launch) */
  resumeSessionId?: string;
  /** Claude Code session UUID to fork (used during launch) */
  forkSessionId?: string;
  /** Whether this session continues the most recent Claude session */
  continueLastSession?: boolean;
  /**
   * Which channel last drove this session's status. Used for source precedence:
   * the MCP channel (in-CLI status reports) is authoritative over OSC
   * (terminal-stream) signals for a short window after an MCP update.
   */
  lastStatusSource?: StatusSource;
  /** Timestamp (ms) of the last status update, paired with lastStatusSource. */
  lastStatusAt?: number;
}
