/**
 * Internal EventEmitter2 Event Constants (Backend Only)
 *
 * These events are used for internal NestJS module communication.
 * They use dot-notation (e.g., 'session.created') and are NOT sent over WebSocket.
 *
 * For WebSocket socket.io events, see @omniscribe/shared constants/events.ts
 */

// ============================================
// Session Internal Events
// ============================================
export const InternalSessionEvents = {
  CREATED: 'session.created',
  STATUS: 'session.status',
  REMOVED: 'session.removed',
  HEALTH: 'session.health',
  CLAUDE_ID_CAPTURED: 'session.claude-id-captured',
  TASKS: 'session.tasks',
  HOOK_START: 'session.hook.start',
  HOOK_END: 'session.hook.end',
  /** Emitted by McpStatusServerService when an MCP status HTTP POST arrives.
   *  SessionService listens and calls updateStatus() to keep backend state in sync. */
  MCP_STATUS_RECEIVED: 'session.mcp-status-received',
  /** Emitted by SessionService when a terminal closes and the session had a claudeSessionId.
   *  ClaudeSessionTrackerService listens to persist history and refresh snapshot. */
  TERMINAL_CLOSED_WITH_SESSION: 'session.terminal-closed-with-session',
} as const;

// ============================================
// Terminal Internal Events
// ============================================
export const InternalTerminalEvents = {
  OUTPUT: 'terminal.output',
  CLOSED: 'terminal.closed',
} as const;

// ============================================
// Quick Action Internal Events
// ============================================
export const InternalQuickActionEvents = {
  EXECUTED: 'quickaction.executed',
  AI_PROMPT: 'quickaction.ai.prompt',
} as const;

// ============================================
// Health/Zombie Internal Events
// ============================================
export const InternalZombieEvents = {
  CLEANUP: 'zombie.cleanup',
} as const;
