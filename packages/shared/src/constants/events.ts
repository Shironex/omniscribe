/**
 * WebSocket Socket.io Event Constants
 *
 * Single source of truth for all socket event names used between
 * the frontend (apps/web) and backend (apps/desktop).
 *
 * Naming convention: 'domain:action' (colon separator)
 */

// ============================================
// Session Events
// ============================================
export const SessionEvents = {
  // Client -> Server (requests)
  CREATE: 'session:create',
  UPDATE: 'session:update',
  REMOVE: 'session:remove',
  LIST: 'session:list',
  HISTORY: 'session:history',
  RESUME: 'session:resume',
  FORK: 'session:fork',
  CONTINUE_LAST: 'session:continue-last',
  GET_RESTORE_SNAPSHOT: 'session:get-restore-snapshot',

  // Server -> Client (broadcasts)
  CREATED: 'session:created',
  STATUS: 'session:status',
  REMOVED: 'session:removed',
  HEALTH: 'session:health',
  HOOK_ENDED: 'session:hook-ended',
  CLAUDE_ID_CAPTURED: 'session:claude-id-captured',
  TASKS: 'session:tasks',
} as const;

// ============================================
// Terminal Events
// ============================================
export const TerminalEvents = {
  // Client -> Server (requests)
  SPAWN: 'terminal:spawn',
  INPUT: 'terminal:input',
  RESIZE: 'terminal:resize',
  KILL: 'terminal:kill',
  JOIN: 'terminal:join',
  CANCEL: 'terminal:cancel',

  // Server -> Client (broadcasts)
  OUTPUT: 'terminal:output',
  CLOSED: 'terminal:closed',
  BACKPRESSURE: 'terminal:backpressure',
} as const;

// ============================================
// Git Events
// ============================================
export const GitEvents = {
  BRANCHES: 'git:branches',
  COMMITS: 'git:commits',
  CHECKOUT: 'git:checkout',
  CREATE_BRANCH: 'git:create-branch',
  CURRENT_BRANCH: 'git:current-branch',
  WORKTREES: 'git:worktrees',
  WORKTREE_CLEANUP: 'git:worktree:cleanup',
} as const;

// ============================================
// GitHub Events
// ============================================
export const GithubEvents = {
  STATUS: 'github:status',
  REPO_INFO: 'github:repo-info',
  PRS: 'github:prs',
  PR: 'github:pr',
  CREATE_PR: 'github:create-pr',
  ISSUES: 'github:issues',
  ISSUE: 'github:issue',
} as const;

// ============================================
// MCP Events
// ============================================
export const McpEvents = {
  // Client -> Server (requests)
  DISCOVER: 'mcp:discover',
  SET_ENABLED: 'mcp:set-enabled',
  WRITE_CONFIG: 'mcp:write-config',
  GET_ENABLED: 'mcp:get-enabled',
  GET_SERVERS: 'mcp:get-servers',
  REMOVE_CONFIG: 'mcp:remove-config',
  GET_INTERNAL_STATUS: 'mcp:get-internal-status',
  GET_STATUS_SERVER_INFO: 'mcp:get-status-server-info',

  // Server -> Client (broadcasts)
  ENABLED_CHANGED: 'mcp:enabled-changed',
} as const;

// ============================================
// Workspace Events
// ============================================
export const WorkspaceEvents = {
  // Client -> Server (requests)
  GET_STATE: 'workspace:get-state',
  SAVE_STATE: 'workspace:save-state',
  ADD_TAB: 'workspace:add-tab',
  UPDATE_TAB_THEME: 'workspace:update-tab-theme',
  REMOVE_TAB: 'workspace:remove-tab',
  SELECT_TAB: 'workspace:select-tab',
  UPDATE_PREFERENCE: 'workspace:update-preference',
  GET_PREFERENCES: 'workspace:get-preferences',

  // Server -> Client (broadcasts)
  TABS_UPDATED: 'workspace:tabs-updated',
  PREFERENCES_UPDATED: 'workspace:preferences-updated',
} as const;

// ============================================
// Quick Action Events
// ============================================
export const QuickActionEvents = {
  // Client -> Server (requests)
  EXECUTE: 'quickaction:execute',
  LIST: 'quickaction:list',
  UPDATE: 'quickaction:update',
  RESET: 'quickaction:reset',

  // Server -> Client (broadcasts)
  UPDATED: 'quickaction:updated',
  EXECUTED: 'quickaction:executed',
  AI_PROMPT: 'quickaction:prompt',
  RESULT: 'quickaction:result',
} as const;

// ============================================
// Usage Events
// ============================================
export const UsageEvents = {
  FETCH: 'usage:fetch',
  CLAUDE_STATUS: 'usage:claude-status',
} as const;

// ============================================
// Zombie Events
// ============================================
export const ZombieEvents = {
  CLEANUP: 'zombie:cleanup',
} as const;

// ============================================
// System Events
// ============================================
export const SystemEvents = {
  THROTTLED: 'ws:throttled',
} as const;
