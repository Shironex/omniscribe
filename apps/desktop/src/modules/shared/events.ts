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
