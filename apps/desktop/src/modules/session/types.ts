import { ExtendedSessionConfig } from '@omniscribe/shared';

/**
 * AI CLI command configuration for each mode
 */
export interface AiCliConfig {
  command: string;
  args: string[];
}

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
}
