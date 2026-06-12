/**
 * Socket Payload/Response Types - Common patterns for WebSocket communication
 */

import type { ProjectTabDTO, UserPreferences } from './project-tab';
import type { QuickAction } from './workspace';
import type { CustomCommand, CustomCommandInput, CustomCommandUpdate } from './custom-command';
import type {
  BranchInfo,
  CommitInfo,
  WorktreeInfo,
  GitFileDiff,
  GitFileStatus,
  RemoteInfo,
} from './git';
import type {
  TaskItem,
  McpServerConfig,
  McpServerState,
  McpServerStatus,
  McpCapabilityDescriptor,
} from './mcp';
import type { ClaudeSessionEntry } from './session';

// ============================================
// Connection Types
// ============================================

/**
 * Frontend connection status for WebSocket state tracking
 */
export type ConnectionStatus = 'connected' | 'reconnecting' | 'failed';

// ============================================
// Generic Response Types
// ============================================

/**
 * Generic success/error response for mutations
 */
export interface SuccessResponse {
  success: boolean;
  error?: string;
}

// ============================================
// Git Payloads
// ============================================

/**
 * Payload for getting branches
 */
export interface GitBranchesPayload {
  projectPath: string;
}

/**
 * Payload for getting commits
 */
export interface GitCommitsPayload {
  projectPath: string;
  limit?: number;
  allBranches?: boolean;
}

/**
 * Payload for checkout
 */
export interface GitCheckoutPayload {
  projectPath: string;
  branch: string;
}

/**
 * Payload for creating a branch
 */
export interface GitCreateBranchPayload {
  projectPath: string;
  name: string;
  startPoint?: string;
}

/**
 * Payload for getting current branch
 */
export interface GitCurrentBranchPayload {
  projectPath: string;
}

/**
 * Payload for listing worktrees
 */
export interface GitWorktreesPayload {
  projectPath: string;
}

/**
 * Payload for cleaning up a worktree
 */
export interface GitWorktreeCleanupPayload {
  projectPath: string;
  worktreePath: string;
}

/**
 * Payload for getting remotes
 */
export interface GitRemotesPayload {
  projectPath: string;
}

/**
 * Response for remotes query
 */
export interface GitRemotesResponse {
  remotes: Array<Pick<RemoteInfo, 'name' | 'fetchUrl'>>;
  error?: string;
}

/**
 * Payload for getting diff
 */
export interface GitDiffPayload {
  projectPath: string;
  baseCommit?: string;
  includeUntracked?: boolean;
}

/**
 * Response for diff query
 */
export interface GitDiffResponse {
  files: GitFileDiff[];
  totalAdditions: number;
  totalDeletions: number;
  error?: string;
}

// ============================================
// Git Responses
// ============================================

/**
 * Response for branches query.
 * currentBranch may be a string (name only) or a full BranchInfo object
 * depending on the backend implementation.
 */
export interface GitBranchesResponse {
  branches: BranchInfo[];
  currentBranch: string | BranchInfo;
  error?: string;
}

/**
 * Response for commits query
 */
export interface GitCommitsResponse {
  commits: CommitInfo[];
  error?: string;
}

/**
 * Response for checkout mutation
 */
export interface GitCheckoutResponse extends SuccessResponse {
  currentBranch?: string;
}

/**
 * Response for create branch mutation
 */
export interface GitCreateBranchResponse extends SuccessResponse {
  branch?: BranchInfo;
}

/**
 * Response for current branch query
 */
export interface GitCurrentBranchResponse {
  currentBranch: string;
  error?: string;
}

/**
 * Response for worktrees list
 */
export interface GitWorktreesResponse {
  worktrees: WorktreeInfo[];
  error?: string;
}

/**
 * Event emitted when git branches change for a project.
 * Broadcast by the backend after branch operations.
 */
export interface GitBranchUpdateEvent {
  projectPath: string;
  branches?: BranchInfo[];
  currentBranch: BranchInfo | null;
}

// ============================================
// Terminal Payloads
// ============================================

/**
 * Payload for spawning a terminal
 */
export interface TerminalSpawnPayload {
  cwd?: string;
  env?: Record<string, string>;
}

/**
 * Payload for terminal input
 */
export interface TerminalInputPayload {
  sessionId: number;
  data: string;
}

/**
 * Payload for terminal resize
 */
export interface TerminalResizePayload {
  sessionId: number;
  cols: number;
  rows: number;
}

/**
 * Payload for terminal kill
 */
export interface TerminalKillPayload {
  sessionId: number;
}

/**
 * Payload for joining a terminal session
 */
export interface TerminalJoinPayload {
  sessionId: number;
}

// ============================================
// Terminal Responses
// ============================================

/**
 * Response for terminal spawn
 */
export interface TerminalSpawnResponse {
  sessionId: number;
  error?: string;
}

/**
 * Response for terminal join
 */
export interface TerminalJoinResponse extends SuccessResponse {
  scrollback?: string;
}

// ============================================
// MCP Payloads
// ============================================

/**
 * Payload for MCP server discovery
 */
export interface McpDiscoverPayload {
  projectPath?: string;
}

/**
 * Payload for setting enabled MCP servers
 */
export interface McpSetEnabledPayload {
  projectPath: string;
  sessionId: string;
  serverIds: string[];
}

/**
 * Payload for getting enabled MCP servers
 */
export interface McpGetEnabledPayload {
  projectPath: string;
  sessionId: string;
}

/**
 * Payload for getting MCP servers
 */
export interface McpGetServersPayload {
  projectPath: string;
}

/**
 * Payload for removing MCP config
 */
export interface McpRemoveConfigPayload {
  workingDir: string;
  sessionId: string;
  projectPath: string;
}

/**
 * Payload for writing MCP config
 */
export interface McpWriteConfigPayload {
  workingDir: string;
  sessionId: string;
  projectPath: string;
  servers: import('./mcp').McpServerConfig[];
}

// ============================================
// MCP Responses
// ============================================

/**
 * Response for MCP server discovery
 */
export interface McpDiscoverResponse {
  servers: import('./mcp').McpServerConfig[];
  error?: string;
}

/**
 * Response for setting enabled MCP servers
 */
export interface McpSetEnabledResponse extends SuccessResponse {}

/**
 * Response for getting enabled MCP servers
 */
export interface McpGetEnabledResponse {
  serverIds: string[];
  error?: string;
}

/**
 * Response for getting MCP servers
 */
export interface McpGetServersResponse {
  servers: import('./mcp').McpServerConfig[];
  error?: string;
}

/**
 * Response for writing MCP config
 */
export interface McpWriteConfigResponse extends SuccessResponse {
  configPath?: string;
}

/**
 * Response for removing MCP config
 */
export interface McpRemoveConfigResponse extends SuccessResponse {}

/**
 * Response for internal MCP status
 */
export interface McpInternalStatusResponse {
  available: boolean;
  path: string | null;
}

/**
 * Response for MCP status server info
 */
export interface McpStatusServerInfoResponse {
  running: boolean;
  port: number | null;
  statusUrl: string | null;
  instanceId: string;
}

/**
 * Event emitted when MCP servers are discovered.
 * Broadcast by the backend after discovery completes.
 */
export interface McpServersDiscoveredEvent {
  servers: McpServerConfig[];
}

/**
 * Event emitted when an MCP server's connection status changes.
 */
export interface McpStatusUpdateEvent {
  serverId: string;
  status: McpServerStatus;
  errorMessage?: string;
}

/**
 * Event emitted when an MCP server's full state updates
 * (tools, resources, prompts).
 */
export interface McpServerStateUpdateEvent {
  serverId: string;
  state: McpServerState;
}

// ============================================
// MCP Capability Payloads / Responses
// ============================================

/**
 * Payload for listing capabilities for a project.
 */
export interface McpCapabilityListPayload {
  projectPath: string;
}

/**
 * Response for listing capabilities for a project.
 */
export interface McpCapabilityListResponse {
  capabilities: McpCapabilityDescriptor[];
  error?: string;
}

/**
 * Payload for toggling a single capability on/off for a project.
 */
export interface McpCapabilityTogglePayload {
  projectPath: string;
  capabilityId: string;
  enabled: boolean;
}

/**
 * Response for toggling a capability.
 */
export interface McpCapabilityToggleResponse {
  success: boolean;
  enabledIds?: string[];
  error?: string;
}

/**
 * Broadcast event when a project's enabled-capability set changes.
 */
export interface McpCapabilityChangedEvent {
  projectPath: string;
  enabledIds: string[];
}

/**
 * Payload for setting the per-project Electron CDP port (used by the
 * `playwright-electron` capability to target the user's own app).
 */
export interface McpCapabilitySetPortPayload {
  projectPath: string;
  capabilityId: string;
  port: number;
}

/**
 * Response for setting the per-project Electron CDP port.
 */
export interface McpCapabilitySetPortResponse {
  success: boolean;
  port?: number;
  error?: string;
}

// ============================================
// Session Payloads
// ============================================

/**
 * Payload for creating a session
 */
export interface CreateSessionPayload {
  mode: import('./session').AiMode;
  projectPath: string;
  branch?: string;
  name?: string;
  workingDirectory?: string;
  model?: string;
  systemPrompt?: string;
  mcpServers?: string[];
}

/**
 * Payload for updating a session
 */
export interface UpdateSessionPayload {
  sessionId: string;
  updates: import('./session').UpdateSessionOptions;
}

/**
 * Payload for removing a session
 */
export interface SessionRemovePayload {
  sessionId: string;
}

/**
 * Payload for listing sessions
 */
export interface SessionListPayload {
  projectPath?: string;
}

/**
 * Session status update event payload.
 * Emitted when a session's status changes.
 */
export interface SessionStatusUpdate {
  sessionId: string;
  status: import('./session').SessionStatus;
  message?: string;
  needsInputPrompt?: boolean;
  /** Branch assigned to the session (set after worktree setup) */
  branch?: string;
  /** Worktree path (set after worktree setup) */
  worktreePath?: string;
  /** Git HEAD commit hash captured at session launch for diff baseline */
  baselineCommitHash?: string;
}

// ============================================
// Session Responses
// ============================================

/**
 * Response for session removal
 */
export interface SessionRemoveResponse extends SuccessResponse {}

// ============================================
// Tab Payloads
// ============================================

/**
 * Payload for adding a tab
 */
export interface AddTabPayload {
  id: string;
  projectPath: string;
  name: string;
  theme?: string;
}

/**
 * Payload for updating a tab's theme
 */
export interface UpdateTabThemePayload {
  tabId: string;
  theme: string;
}

/**
 * Payload for updating a tab's thumbnail
 */
export interface UpdateTabThumbnailPayload {
  tabId: string;
  thumbnailFileName: string | null;
}

/**
 * Payload for removing a tab
 */
export interface RemoveTabPayload {
  tabId: string;
}

/**
 * Payload for selecting a tab
 */
export interface SelectTabPayload {
  tabId: string;
}

/**
 * Payload for reordering tabs
 */
export interface ReorderTabsPayload {
  tabIds: string[];
}

// ============================================
// Tab Responses
// ============================================

/**
 * Response with tabs and active tab
 */
export interface TabsResponse extends SuccessResponse {
  tabs: ProjectTabDTO[];
  activeTabId: string | null;
}

/**
 * Response with just tabs (no activeTabId change)
 */
export interface TabsOnlyResponse extends SuccessResponse {
  tabs: ProjectTabDTO[];
}

// ============================================
// Workspace State Payloads
// ============================================

/**
 * Payload for saving workspace state
 */
export interface SaveStatePayload {
  tabs?: ProjectTabDTO[];
  activeTabId?: string | null;
  preferences?: UserPreferences;
}

/**
 * Backend workspace state response
 */
export interface WorkspaceStateResponse {
  tabs: ProjectTabDTO[];
  activeTabId: string | null;
  preferences: UserPreferences;
  quickActions: QuickAction[];
}

// ============================================
// Preferences Payloads
// ============================================

/**
 * Payload for updating a preference
 */
export interface UpdatePreferencePayload {
  key: string;
  value: unknown;
}

/**
 * Response with preferences
 */
export interface PreferencesResponse extends SuccessResponse {
  preferences: UserPreferences;
}

// ============================================
// Quick Action Payloads
// ============================================

/**
 * Payload for executing a quick action
 */
export interface ExecuteQuickActionPayload {
  /** The session ID context (AI session or identifier) */
  sessionId: string;
  /** The quick action to execute */
  action: QuickAction;
  /** Additional context */
  context?: {
    projectPath?: string;
    terminalSessionId?: number;
  };
}

/**
 * Payload for getting quick actions
 */
export interface GetQuickActionsPayload {
  /** Optional filter by category */
  category?: string;
  /** Only return enabled actions */
  enabledOnly?: boolean;
}

/**
 * Payload for updating quick actions
 */
export interface UpdateQuickActionsPayload {
  actions: QuickAction[];
}

/**
 * Response with quick actions
 */
export interface QuickActionsResponse extends SuccessResponse {
  actions: QuickAction[];
}

// ============================================
// Terminal Events
// ============================================

/**
 * Event emitted when terminal produces output data
 */
export interface TerminalOutputEvent {
  sessionId: number;
  data: string;
}

/**
 * Event emitted when a terminal process exits
 */
export interface TerminalClosedEvent {
  sessionId: number;
  exitCode: number;
  signal?: number;
}

/**
 * Event emitted when a terminal enters or exits backpressure state.
 * Backpressure occurs when output packets exceed the high water mark.
 */
export interface TerminalBackpressureEvent {
  sessionId: number;
  paused: boolean;
}

/**
 * Payload for cancelling terminal output (sends SIGINT)
 */
export interface TerminalCancelPayload {
  sessionId: number;
}

// ============================================
// Health Events
// ============================================

/**
 * Event emitted when a session's health level changes.
 * Health is determined by PID liveness, output recency, and session status.
 */
export interface SessionHealthEvent {
  sessionId: string;
  health: import('./session').HealthLevel;
  reason?: string;
}

/**
 * Event emitted when a zombie session is cleaned up.
 * Zombie = terminal process dead but session still tracked.
 */
export interface ZombieCleanupEvent {
  sessionId: string;
  sessionName: string;
  reason: string;
}

// ============================================
// Task Events
// ============================================

/**
 * Event emitted when a session's task list is updated via MCP tool
 */
export interface SessionTasksUpdate {
  sessionId: string;
  tasks: TaskItem[];
}

// ============================================
// Broadcast Events
// ============================================

/**
 * Tabs updated broadcast event
 */
export interface TabsUpdatedEvent {
  tabs: ProjectTabDTO[];
  activeTabId: string | null;
}

/**
 * Preferences updated broadcast event
 */
export interface PreferencesUpdatedEvent {
  preferences: UserPreferences;
}

/**
 * Quick actions updated broadcast event
 */
export interface QuickActionsUpdatedEvent {
  actions: QuickAction[];
}

// ============================================
// Throttle Events
// ============================================

/**
 * Event emitted by WsThrottlerGuard when a request is rate-limited.
 * Sent to the client so the frontend can display feedback.
 */
export interface WsThrottledPayload {
  /** The socket event name that was throttled */
  event: string;
  /** Milliseconds until the block expires */
  retryAfter: number;
}

// ============================================
// GitHub Payloads
// ============================================

/**
 * Payload for getting GitHub CLI status
 */
export interface GithubStatusPayload {
  /** Force refresh (bypass cache) */
  refresh?: boolean;
}

/**
 * Payload for GitHub operations that require a project path
 */
export interface GithubProjectPayload {
  projectPath: string;
}

/**
 * Payload for listing pull requests
 */
export interface GithubListPRsPayload extends GithubProjectPayload {
  /** Filter by state */
  state?: 'open' | 'closed' | 'all';
  /** Maximum number to return */
  limit?: number;
}

/**
 * Payload for creating a pull request
 */
export interface GithubCreatePRPayload extends GithubProjectPayload {
  /** PR title */
  title: string;
  /** PR body/description */
  body?: string;
  /** Base branch */
  base?: string;
  /** Head branch */
  head?: string;
  /** Create as draft */
  draft?: boolean;
}

/**
 * Payload for getting a specific PR
 */
export interface GithubGetPRPayload extends GithubProjectPayload {
  /** PR number */
  prNumber: number;
}

/**
 * Payload for listing issues
 */
export interface GithubListIssuesPayload extends GithubProjectPayload {
  /** Filter by state */
  state?: 'open' | 'closed' | 'all';
  /** Maximum number to return */
  limit?: number;
  /** Filter by labels */
  labels?: string[];
}

/**
 * Payload for getting a specific issue
 */
export interface GithubGetIssuePayload extends GithubProjectPayload {
  /** Issue number */
  issueNumber: number;
}

// ============================================
// GitHub Responses
// ============================================

/**
 * Response for GitHub CLI status
 */
export interface GithubStatusResponse {
  status: import('./github').GhCliStatus;
  error?: string;
}

/**
 * Response for repository info
 */
export interface GithubRepoInfoResponse {
  repo: import('./github').RepoInfo | null;
  error?: string;
}

/**
 * Response for pull requests list
 */
export interface GithubPRsResponse {
  pullRequests: import('./github').PullRequest[];
  error?: string;
}

/**
 * Response for a single pull request
 */
export interface GithubPRResponse {
  pullRequest: import('./github').PullRequest | null;
  error?: string;
}

/**
 * Response for creating a pull request
 */
export interface GithubCreatePRResponse extends SuccessResponse {
  pullRequest?: import('./github').PullRequest;
}

/**
 * Response for issues list
 */
export interface GithubIssuesResponse {
  issues: import('./github').Issue[];
  error?: string;
}

/**
 * Response for a single issue
 */
export interface GithubIssueResponse {
  issue: import('./github').Issue | null;
  error?: string;
}

// ============================================
// Claude Session History Payloads
// ============================================

/**
 * Request to fetch Claude Code session history for a project
 */
export interface ClaudeSessionHistoryPayload {
  projectPath: string;
}

/**
 * Response with Claude Code session history
 */
export interface ClaudeSessionHistoryResponse {
  sessions: ClaudeSessionEntry[];
  error?: string;
}

/**
 * Request to resume a Claude Code session
 */
export interface ResumeSessionPayload {
  claudeSessionId: string;
  projectPath: string;
  name?: string;
  branch?: string;
}

/**
 * Event emitted when a Claude session ID is captured for an Omniscribe session
 */
export interface ClaudeSessionIdCapturedEvent {
  /** Omniscribe session ID */
  sessionId: string;
  /** Claude Code session UUID */
  claudeSessionId: string;
}

/**
 * Request to fork a Claude Code session (creates a branch from existing history)
 */
export interface ForkSessionPayload {
  claudeSessionId: string;
  projectPath: string;
  name?: string;
  branch?: string;
}

/**
 * Request to continue the most recent Claude Code session in a project
 */
export interface ContinueLastSessionPayload {
  projectPath: string;
  branch?: string;
  name?: string;
}

/**
 * Event payload when a Claude Code session hook ends
 */
export interface SessionHookEndedPayload {
  claudeSessionId: string;
}

// ============================================
// Plugin Payloads
// ============================================

/**
 * CLI detection status for WebSocket transport.
 * Structurally compatible with `CliDetectionResult` from `@omniscribe/plugin-api`.
 */
export interface CliDetectionStatus {
  installed: boolean;
  version?: string;
  path?: string;
  auth?: { authenticated: boolean };
  error?: string;
}

/**
 * Serializable provider info for WebSocket transport (no class instances).
 */
export interface ProviderInfo {
  id: string;
  displayName: string;
  description: string;
  aiMode: string;
  icon?: string;
  enabled: boolean;
  activated: boolean;
  cliStatus: CliDetectionStatus;
}

// ============================================
// Custom Command Payloads
// ============================================

/**
 * Payload for listing per-project custom commands.
 */
export interface CustomCommandListPayload {
  projectPath: string;
}

/**
 * Response for listing custom commands.
 */
export interface CustomCommandListResponse {
  commands: CustomCommand[];
  error?: string;
}

/**
 * Payload for creating a custom command for a project.
 */
export interface CustomCommandCreatePayload {
  projectPath: string;
  command: CustomCommandInput;
}

/**
 * Response for creating a custom command.
 */
export interface CustomCommandCreateResponse extends SuccessResponse {
  command?: CustomCommand;
  commands?: CustomCommand[];
}

/**
 * Payload for updating an existing custom command.
 */
export interface CustomCommandUpdatePayload {
  projectPath: string;
  id: string;
  updates: CustomCommandUpdate;
}

/**
 * Response for updating a custom command.
 */
export interface CustomCommandUpdateResponse extends SuccessResponse {
  command?: CustomCommand;
  commands?: CustomCommand[];
}

/**
 * Payload for deleting a custom command.
 */
export interface CustomCommandDeletePayload {
  projectPath: string;
  id: string;
}

/**
 * Response for deleting a custom command.
 */
export interface CustomCommandDeleteResponse extends SuccessResponse {
  commands?: CustomCommand[];
}

/**
 * Payload for executing a custom command (spawns a fresh plain session).
 */
export interface CustomCommandExecutePayload {
  projectPath: string;
  id: string;
}

/**
 * Response for executing a custom command.
 */
export interface CustomCommandExecuteResponse extends SuccessResponse {
  /** ID of the new Omniscribe plain session running the command. */
  sessionId?: string;
  /** Terminal (PTY) session ID bound to the new session — needed by the renderer
   * to populate `session.terminalSessionId`, since the `session:created` broadcast
   * fires before launch completes and carries a stale (undefined) value. */
  terminalSessionId?: number;
}

/**
 * Broadcast emitted whenever a project's custom command list changes
 * (create / update / delete). Carries the full updated list for that project.
 */
export interface CustomCommandsChangedEvent {
  projectPath: string;
  commands: CustomCommand[];
}

/**
 * Payload for invoking a method on a plugin remotely.
 */
export interface PluginInvokePayload {
  pluginId: string;
  method: string;
  args?: unknown[];
}

/**
 * Payload for enabling/disabling a provider plugin.
 */
export interface PluginSetEnabledPayload {
  aiMode: string;
  enabled: boolean;
}

// ============================================================
// FS payloads (file explorer / editor) — owned by the WS3 lane.
// Edit ONLY between these markers in parallel-lane work.
// ============================================================

/**
 * Kind of a filesystem entry. Symlinks are reported as `symlink` regardless of
 * their target so the renderer can badge them; size/mtime reflect the link's
 * stat (lstat), not the resolved target.
 */
export type FsEntryKind = 'file' | 'dir' | 'symlink';

/**
 * A single directory entry returned by {@link FsReadDirResponse}.
 * All paths are absolute and already validated against the project root.
 */
export interface FsEntry {
  /** Base name (no directory component). */
  name: string;
  /** Absolute path of the entry. */
  path: string;
  /** Entry kind (file / dir / symlink). */
  kind: FsEntryKind;
  /** Size in bytes (0 for directories). */
  size: number;
  /** Last-modified time in epoch milliseconds. */
  mtime: number;
}

/**
 * Common shape for all FS requests: the authorized project root plus a target.
 * `target` may be absolute (must resolve inside `projectPath`) or relative to it.
 */
export interface FsBasePayload {
  /** Authorized project root — the security boundary for the operation. */
  projectPath: string;
}

/** Request: list the entries of a directory. */
export interface FsReadDirPayload extends FsBasePayload {
  /** Directory to read. Defaults to the project root when omitted. */
  target?: string;
}

/** Response: directory listing, sorted dirs-first then case-insensitive name. */
export interface FsReadDirResponse {
  /** Absolute path actually read (resolved). */
  path?: string;
  /** Directory entries. */
  entries?: FsEntry[];
  error?: string;
}

/** Request: stat a single path. */
export interface FsStatPayload extends FsBasePayload {
  target: string;
}

/** Response: stat result for a single path. */
export interface FsStatResponse {
  entry?: FsEntry;
  error?: string;
}

/** Request: read a file's UTF-8 content (capped, binary-sniffed). */
export interface FsReadFilePayload extends FsBasePayload {
  target: string;
}

/** Response: file content, or a binary/too-large marker instead of content. */
export interface FsReadFileResponse {
  /** Absolute path read. */
  path?: string;
  /** UTF-8 content. Absent when `binary` or `tooLarge`. */
  content?: string;
  /** True when the file was detected as binary (NUL-byte sniff). */
  binary?: boolean;
  /** True when the file exceeded the size cap and was not read. */
  tooLarge?: boolean;
  /** Size in bytes. */
  size?: number;
  error?: string;
}

/** Request: write UTF-8 content to a file (atomic temp + rename). */
export interface FsWriteFilePayload extends FsBasePayload {
  target: string;
  content: string;
}

/** Request: create a new empty file. */
export interface FsCreateFilePayload extends FsBasePayload {
  target: string;
}

/** Request: create a new directory (recursive). */
export interface FsCreateDirPayload extends FsBasePayload {
  target: string;
}

/** Request: rename / move within the project root. */
export interface FsRenamePayload extends FsBasePayload {
  /** Existing path. */
  from: string;
  /** New path. */
  to: string;
}

/** Request: delete a path (sent to OS recycle bin, never hard-deleted). */
export interface FsDeletePayload extends FsBasePayload {
  target: string;
}

/** Generic FS mutation response carrying the affected absolute path. */
export interface FsMutateResponse extends SuccessResponse {
  /** Absolute path of the created / renamed / deleted entry. */
  path?: string;
}

/** Request: fuzzy file-name search across the project (gitignore-aware). */
export interface FsSearchPayload extends FsBasePayload {
  /** Fuzzy query against relative file paths. Empty returns a bounded sample. */
  query: string;
  /** Max results to return (server-capped). */
  limit?: number;
}

/** A single fuzzy file-search match. */
export interface FsSearchMatch {
  /** Absolute path. */
  path: string;
  /** Project-relative path (what the matcher scored). */
  relativePath: string;
  /** Match score (higher = better). */
  score: number;
}

/** Response: ranked fuzzy file matches. */
export interface FsSearchResponse {
  matches?: FsSearchMatch[];
  /** True when the walk hit its bound and results may be incomplete. */
  truncated?: boolean;
  error?: string;
}

/** Request: content grep across the project (ripgrep → git grep → JS scan). */
export interface FsGrepPayload extends FsBasePayload {
  /** Literal/regex query (passed through to the underlying engine). */
  query: string;
  /** Treat the query as a fixed string rather than a regex. */
  fixedString?: boolean;
  /** Case-insensitive match. */
  caseInsensitive?: boolean;
  /** Max matches to return (server-capped). */
  limit?: number;
}

/** A single grep match (one line). */
export interface FsGrepMatch {
  /** Absolute path of the file containing the match. */
  path: string;
  /** Project-relative path. */
  relativePath: string;
  /** 1-based line number. */
  line: number;
  /** 1-based column of the first match on the line. */
  column: number;
  /** The full matching line text (trimmed of trailing newline). */
  text: string;
}

/** Response: grep matches. */
export interface FsGrepResponse {
  matches?: FsGrepMatch[];
  /** True when the match cap was reached and results may be incomplete. */
  truncated?: boolean;
  error?: string;
}

/** Request: start watching a project root for filesystem changes. */
export interface FsWatchPayload extends FsBasePayload {
  /** Stable client-chosen id so multiple watchers per client are refcounted. */
  watchId: string;
}

/** Request: stop a previously-started watch. */
export interface FsUnwatchPayload extends FsBasePayload {
  watchId: string;
}

/** Response for watch / unwatch. */
export interface FsWatchResponse extends SuccessResponse {
  /** The watchId acknowledged. */
  watchId?: string;
}

/**
 * Broadcast: a batch of filesystem paths under `projectPath` changed.
 * Emitted to the `fs:<projectPath>` room after debounce-batching.
 */
export interface FsChangedEvent {
  projectPath: string;
  /** Absolute paths that changed within the debounce window (deduplicated). */
  paths: string[];
}

// ============================================================
// END FS payloads
// ============================================================

// ============================================================
// SCM payloads (staging/commit/history) — owned by the WS5 lane.
// Edit ONLY between these markers in parallel-lane work.
// ============================================================

/**
 * Machine-readable error codes the SCM panel can render distinct UI for.
 * Returned as `errorCode` alongside the human-readable `error` string.
 */
export type ScmErrorCode =
  | 'NOT_A_REPO' // path is not inside a git repository
  | 'INVALID_PATH' // a supplied pathspec escaped the repo root or was malformed
  | 'NOTHING_TO_COMMIT' // commit attempted with an empty index
  | 'HOOK_FAILED' // a git hook (pre-commit, commit-msg, pre-push) rejected the operation
  | 'NO_UPSTREAM' // pull/push needs an upstream that isn't configured
  | 'NO_REMOTE' // no remote is configured for fetch/pull/push
  | 'DIVERGED' // ff-only pull/push rejected because histories diverged
  | 'AUTH_FAILED' // remote rejected credentials / authentication
  | 'CONFLICT' // operation left or hit merge conflicts
  | 'PATCH_FAILED' // git apply could not apply the supplied hunk patch
  | 'GIT_ERROR'; // catch-all for an unmapped git failure

/**
 * A single changed file in an SCM panel snapshot. Mirrors the porcelain v2
 * XY status semantics so the UI can render staged vs. unstaged state precisely.
 */
export interface ScmFileEntry {
  /** Repo-root-relative path (the new path for renames). */
  path: string;
  /** Original path for renamed/copied entries. */
  oldPath?: string;
  /**
   * Status as seen from the relevant side. For the staged list this is the
   * index status; for the unstaged list this is the worktree status; for the
   * untracked list it is always 'untracked'; for conflicts it is 'conflicted'.
   */
  status: GitFileStatus;
  /** Raw porcelain v2 XY code (e.g. 'M.', '.M', 'R.', 'UU') for advanced UI. */
  xy?: string;
}

/**
 * Payload to request a batched SCM panel snapshot. One round trip returns
 * everything the SCM panel needs to render its header + change lists.
 */
export interface ScmPanelSnapshotPayload {
  projectPath: string;
}

/**
 * Batched panel snapshot response — current branch, upstream tracking,
 * ahead/behind, the three change buckets, and in-progress operation flags.
 */
export interface ScmPanelSnapshotResponse {
  /** Whether projectPath is inside a git repository. */
  isRepo: boolean;
  /** Repository root path (absolute) when isRepo is true. */
  rootPath?: string;
  /** Current branch name, or undefined when HEAD is detached. */
  branch?: string;
  /** Short HEAD hash when detached (branch is undefined). */
  detachedHead?: string;
  /** Upstream tracking branch (e.g. 'origin/main') when configured. */
  upstream?: string;
  /** Commits ahead of upstream. */
  ahead: number;
  /** Commits behind upstream. */
  behind: number;
  /** Files with staged (index) changes. */
  staged: ScmFileEntry[];
  /** Files with unstaged (worktree) changes. */
  unstaged: ScmFileEntry[];
  /** Untracked files. */
  untracked: ScmFileEntry[];
  /** Conflicted (unmerged) files. */
  conflicted: ScmFileEntry[];
  /** Whether a merge is in progress. */
  isMerging: boolean;
  /** Whether a rebase is in progress. */
  isRebasing: boolean;
  error?: string;
  errorCode?: ScmErrorCode;
}

/** Payload for stage / unstage / discard operations over a set of paths. */
export interface ScmStagePayload {
  projectPath: string;
  /** Repo-root-relative paths to operate on. */
  paths: string[];
}

/**
 * Payload for a hunk-level stage/unstage. `patch` is a complete unified-diff
 * patch (with `diff --git` + `@@` headers) for the selected hunk, generated by
 * the renderer; the backend pipes it to `git apply --cached` via stdin.
 */
export interface ScmHunkPayload {
  projectPath: string;
  /** Repo-root-relative path the patch is expected to touch. */
  filePath: string;
  /** Unified-diff patch text for the hunk. */
  patch: string;
}

/** Payload for creating a commit. */
export interface ScmCommitPayload {
  projectPath: string;
  message: string;
  /** Amend the previous commit instead of creating a new one. */
  amend?: boolean;
}

/** Response for a commit mutation. */
export interface ScmCommitResponse extends SuccessResponse {
  /** Full hash of the new (or amended) commit. */
  hash?: string;
  errorCode?: ScmErrorCode;
}

/** Payload for fetch / pull / push remote operations. */
export interface ScmRemotePayload {
  projectPath: string;
  /** Remote name; defaults to 'origin' when omitted. */
  remote?: string;
}

/** Response for a remote operation (fetch/pull/push). */
export interface ScmRemoteResponse extends SuccessResponse {
  errorCode?: ScmErrorCode;
}

/** Generic SCM mutation response (stage/unstage/discard/hunk). */
export interface ScmMutationResponse extends SuccessResponse {
  errorCode?: ScmErrorCode;
}

/** Payload for a paginated commit-log page. */
export interface ScmLogPayload {
  projectPath: string;
  /** Max commits to return (default 50). */
  limit?: number;
  /**
   * Continue paging from BEFORE this commit (exclusive). Pass the last hash of
   * the previous page to fetch the next page.
   */
  beforeSha?: string;
}

/** A single entry in the SCM commit log. */
export interface ScmLogEntry {
  hash: string;
  shortHash: string;
  /** Parent commit hashes (2+ for merge commits). */
  parents: string[];
  authorName: string;
  authorEmail: string;
  /** Authored date in ISO-8601. */
  authoredDate: string;
  subject: string;
  /** Ref decorations (branches/tags/HEAD) from `--decorate=short`. */
  refs: string[];
}

/** Response for a commit-log page. */
export interface ScmLogResponse {
  commits: ScmLogEntry[];
  /**
   * Hash to pass as `beforeSha` for the next page, or undefined when the last
   * page has been reached.
   */
  nextBeforeSha?: string;
  error?: string;
  errorCode?: ScmErrorCode;
}

/** Per-file change summary within a single commit. */
export interface ScmCommitFile {
  path: string;
  oldPath?: string;
  status: GitFileStatus;
  additions: number;
  deletions: number;
  isBinary: boolean;
}

/** Payload to inspect the files changed by a single commit. */
export interface ScmShowCommitPayload {
  projectPath: string;
  sha: string;
}

/** Response describing the files a commit changed. */
export interface ScmShowCommitResponse {
  hash: string;
  files: ScmCommitFile[];
  error?: string;
  errorCode?: ScmErrorCode;
}

/** Payload for the diff of one file within a commit. */
export interface ScmCommitFileDiffPayload {
  projectPath: string;
  sha: string;
  path: string;
}

/**
 * Payload for the working-tree diff of one file (staged or unstaged). Renders
 * through the same diff component as commit diffs.
 */
export interface ScmFileDiffPayload {
  projectPath: string;
  path: string;
  /** When true, diff the staged (index) version; otherwise the worktree. */
  staged?: boolean;
}

/**
 * Diff response shared by `scm:commit-file-diff` and `scm:file-diff`. Reuses
 * the existing GitFileDiff structure so the UI renders both through one
 * diff component. `file` is undefined when the path has no changes.
 */
export interface ScmDiffResponse {
  file?: GitFileDiff;
  error?: string;
  errorCode?: ScmErrorCode;
}

/** Broadcast emitted after every mutating SCM op so panels can refresh. */
export interface ScmChangedEvent {
  projectPath: string;
}

// ============================================================
// END SCM payloads
// ============================================================

// ============================================================
// Footprint payloads (project-write tracking & cleanup) — owned by the WS7 lane.
// Edit ONLY between these markers in parallel-lane work.
// ============================================================

/**
 * The category of artifact Omniscribe writes into a user's project.
 * Each kind maps to an owning service that knows how to detect and remove it.
 *
 * - `mcp-config`    — Omniscribe-managed entries in `.mcp.json` (marker-gated).
 * - `claude-hooks`  — Omniscribe hooks in `.claude/settings.local.json`.
 * - `hook-script`   — The `.claude/hooks/omniscribe-notify.js` script file.
 * - `worktrees`     — Git worktrees under the project's `.worktrees/` dir.
 */
export type FootprintKind = 'mcp-config' | 'claude-hooks' | 'hook-script' | 'worktrees';

/**
 * A single detected piece of Omniscribe's footprint in a project. Only
 * provably Omniscribe-owned artifacts (marker / command-signature gated)
 * are ever reported.
 */
export interface FootprintEntry {
  /** Which category of artifact this entry represents. */
  kind: FootprintKind;
  /** Absolute path to the file or directory holding the artifact. */
  path: string;
  /** Human-readable summary shown in the cleanup preview. */
  description: string;
  /**
   * Optional count of sub-items (e.g. number of managed `.mcp.json` entries,
   * number of project worktrees). Omitted when a count is not meaningful.
   */
  count?: number;
}

/**
 * Request the current Omniscribe footprint for a project.
 */
export interface FootprintGetPayload {
  projectPath: string;
}

/**
 * Response listing every detected footprint entry for a project.
 */
export interface FootprintGetResponse {
  entries: FootprintEntry[];
  error?: string;
}

/**
 * Per-kind result of a removal request.
 */
export interface FootprintRemovalResult {
  kind: FootprintKind;
  /** True when the removal for this kind completed without error. */
  ok: boolean;
  /** Error message when `ok` is false. */
  error?: string;
}

/**
 * Request removal of the listed footprint kinds from a project. Only the
 * requested kinds are touched; everything else is left intact.
 */
export interface FootprintRemovePayload {
  projectPath: string;
  kinds: FootprintKind[];
}

/**
 * Response reporting the per-kind outcome of a removal request.
 */
export interface FootprintRemoveResponse {
  success: boolean;
  results: FootprintRemovalResult[];
  error?: string;
}

/**
 * Request to enable/disable passive mode for a project. When passive mode is
 * on, Omniscribe does not write MCP config or Claude hooks into the project on
 * session launch.
 */
export interface FootprintSetPassiveModePayload {
  projectPath: string;
  enabled: boolean;
}

/**
 * Response confirming the new passive-mode state for a project.
 */
export interface FootprintSetPassiveModeResponse {
  success: boolean;
  enabled: boolean;
  error?: string;
}

/**
 * Request the current passive-mode state for a project.
 */
export interface FootprintGetPassiveModePayload {
  projectPath: string;
}

/**
 * Response reporting whether passive mode is enabled for a project.
 */
export interface FootprintGetPassiveModeResponse {
  enabled: boolean;
  error?: string;
}

/**
 * Broadcast event emitted after a project's footprint changes (e.g. after a
 * removal), so other windows can re-fetch the footprint for that project.
 */
export interface FootprintChangedEvent {
  projectPath: string;
}

// ============================================================
// END Footprint payloads
// ============================================================
