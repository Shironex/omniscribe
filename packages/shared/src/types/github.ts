/**
 * GitHub CLI status and types
 */

// ============================================
// GitHub CLI Status Types
// ============================================

/**
 * GitHub CLI detection method
 */
export type GhCliDetectionMethod = 'path' | 'local';

/**
 * GitHub CLI authentication status
 */
export interface GhCliAuthStatus {
  /** Whether user is authenticated */
  authenticated: boolean;

  /** GitHub username if authenticated */
  username?: string;

  /** Token scopes if available */
  scopes?: string[];
}

/**
 * Full GitHub CLI status
 */
export interface GhCliStatus {
  /** Whether gh CLI is installed */
  installed: boolean;

  /** Path to the gh CLI executable */
  path?: string;

  /** gh CLI version */
  version?: string;

  /** How the CLI was found */
  method?: GhCliDetectionMethod;

  /** Operating system platform */
  platform: string;

  /** CPU architecture */
  arch: string;

  /** Authentication status */
  auth: GhCliAuthStatus;
}

// ============================================
// GitHub Error Types
// ============================================

/**
 * GitHub CLI error codes
 */
export type GhCliErrorCode =
  | 'GH_CLI_NOT_INSTALLED'
  | 'GH_CLI_NOT_AUTHENTICATED'
  | 'GH_CLI_COMMAND_FAILED'
  | 'GH_CLI_TIMEOUT'
  | 'GH_CLI_NO_REMOTE';

/**
 * GitHub CLI error structure
 */
export interface GhCliError {
  code: GhCliErrorCode;
  message: string;
  details?: string;
}

// ============================================
// Pull Request Types
// ============================================

/**
 * Pull request state
 */
export type PullRequestState = 'open' | 'closed' | 'merged';

/**
 * Pull request author
 */
export interface PullRequestAuthor {
  login: string;
  name?: string;
}

/**
 * Pull request information
 */
export interface PullRequest {
  /** PR number */
  number: number;

  /** PR title */
  title: string;

  /** PR body/description */
  body?: string;

  /** PR state */
  state: PullRequestState;

  /** PR author */
  author: PullRequestAuthor;

  /** PR URL */
  url: string;

  /** Head branch name */
  headRefName: string;

  /** Base branch name */
  baseRefName: string;

  /** Whether PR is a draft */
  isDraft: boolean;

  /** Created timestamp */
  createdAt: string;

  /** Updated timestamp */
  updatedAt: string;

  /** Merged timestamp */
  mergedAt?: string;
}

/**
 * Options for creating a pull request
 */
export interface CreatePullRequestOptions {
  /** PR title */
  title: string;

  /** PR body/description */
  body?: string;

  /** Base branch (defaults to default branch) */
  base?: string;

  /** Head branch (defaults to current branch) */
  head?: string;

  /** Create as draft */
  draft?: boolean;
}

/**
 * Options for listing pull requests
 */
export interface ListPullRequestsOptions {
  /** Filter by state */
  state?: 'open' | 'closed' | 'all';

  /** Maximum number to return */
  limit?: number;
}

// ============================================
// Issue Types
// ============================================

/**
 * Issue state
 */
export type IssueState = 'open' | 'closed';

/**
 * Issue author
 */
export interface IssueAuthor {
  login: string;
  name?: string;
}

/**
 * Issue label
 */
export interface IssueLabel {
  name: string;
  color?: string;
}

/**
 * Issue information
 */
export interface Issue {
  /** Issue number */
  number: number;

  /** Issue title */
  title: string;

  /** Issue body/description */
  body?: string;

  /** Issue state */
  state: IssueState;

  /** Issue author */
  author: IssueAuthor;

  /** Issue URL */
  url: string;

  /** Issue labels */
  labels: IssueLabel[];

  /** Created timestamp */
  createdAt: string;

  /** Updated timestamp */
  updatedAt: string;

  /** Closed timestamp */
  closedAt?: string;
}

/**
 * Options for listing issues
 */
export interface ListIssuesOptions {
  /** Filter by state */
  state?: 'open' | 'closed' | 'all';

  /** Maximum number to return */
  limit?: number;

  /** Filter by labels */
  labels?: string[];
}

// ============================================
// Repository Types
// ============================================

/**
 * Repository visibility
 */
export type RepoVisibility = 'public' | 'private' | 'internal';

/**
 * Repository information
 */
export interface RepoInfo {
  /** Repository name */
  name: string;

  /** Repository full name (owner/repo) */
  fullName: string;

  /** Repository description */
  description?: string;

  /** Repository URL */
  url: string;

  /** Default branch */
  defaultBranch: string;

  /** Repository visibility */
  visibility: RepoVisibility;

  /** Whether it's a fork */
  isFork: boolean;

  /** Whether it's archived */
  isArchived: boolean;
}
