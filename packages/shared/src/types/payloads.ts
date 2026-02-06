/**
 * Socket Payload/Response Types - Common patterns for WebSocket communication
 */

import type { ProjectTabDTO, UserPreferences } from './project-tab';
import type { QuickAction } from './workspace';
import type { BranchInfo, CommitInfo } from './git';

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

/**
 * Generic data response for queries (check error field for failure)
 */
export interface DataResponse<T> {
  data: T;
  error?: string;
}

/**
 * Response with project path
 */
export interface ProjectPathPayload {
  projectPath: string;
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

// ============================================
// Git Responses
// ============================================

/**
 * Response for branches query
 */
export interface GitBranchesResponse {
  branches: BranchInfo[];
  currentBranch: string;
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
  projectPath: string;
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

// ============================================
// Session Payloads
// ============================================

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

// ============================================
// Session Responses
// ============================================

/**
 * Response for session removal
 */
export interface SessionRemoveResponse extends SuccessResponse {}

/**
 * Response when session creation is rejected due to concurrency limit.
 * Includes names of idle sessions the user could close to free slots.
 */
export interface SessionLimitResponse {
  error: string;
  idleSessions: string[];
}

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
