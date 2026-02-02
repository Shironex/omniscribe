/**
 * Git branch information
 */
export interface BranchInfo {
  /** Branch name */
  name: string;

  /** Whether this is the current branch */
  isCurrent: boolean;

  /** Whether this is a remote tracking branch */
  isRemote: boolean;

  /** Remote name if tracking */
  remote?: string;

  /** Upstream branch name */
  upstream?: string;

  /** Commits ahead of upstream */
  ahead?: number;

  /** Commits behind upstream */
  behind?: number;

  /** Last commit hash */
  lastCommitHash?: string;

  /** Last commit message */
  lastCommitMessage?: string;

  /** Last commit date */
  lastCommitDate?: Date;
}

/**
 * Git commit information
 */
export interface CommitInfo {
  /** Full commit hash */
  hash: string;

  /** Abbreviated commit hash */
  shortHash: string;

  /** Commit message subject line */
  subject: string;

  /** Full commit message body */
  body?: string;

  /** Author name */
  authorName: string;

  /** Author email */
  authorEmail: string;

  /** Author date */
  authorDate: Date;

  /** Committer name */
  committerName: string;

  /** Committer email */
  committerEmail: string;

  /** Commit date */
  commitDate: Date;

  /** Parent commit hashes */
  parents: string[];

  /** Associated refs (branches, tags) */
  refs?: string[];
}

/**
 * Git remote information
 */
export interface RemoteInfo {
  /** Remote name (e.g., 'origin') */
  name: string;

  /** Fetch URL */
  fetchUrl: string;

  /** Push URL */
  pushUrl: string;

  /** Remote branches */
  branches?: string[];
}

/**
 * Git file status
 */
export type GitFileStatus =
  | 'modified'
  | 'added'
  | 'deleted'
  | 'renamed'
  | 'copied'
  | 'untracked'
  | 'ignored'
  | 'conflicted';

/**
 * Git file change
 */
export interface GitFileChange {
  /** File path */
  path: string;

  /** Old path (for renames) */
  oldPath?: string;

  /** File status */
  status: GitFileStatus;

  /** Whether file is staged */
  staged: boolean;

  /** Lines added */
  additions?: number;

  /** Lines removed */
  deletions?: number;
}

/**
 * Git repository status
 */
export interface GitRepoStatus {
  /** Whether this is a git repository */
  isRepo: boolean;

  /** Current branch */
  currentBranch?: BranchInfo;

  /** Repository root path */
  rootPath?: string;

  /** Working tree clean */
  isClean: boolean;

  /** Staged file changes */
  staged: GitFileChange[];

  /** Unstaged file changes */
  unstaged: GitFileChange[];

  /** Untracked files */
  untracked: string[];

  /** Whether there are merge conflicts */
  hasConflicts: boolean;

  /** Conflicted files */
  conflictedFiles?: string[];

  /** Whether rebase is in progress */
  isRebasing: boolean;

  /** Whether merge is in progress */
  isMerging: boolean;

  /** Stash count */
  stashCount: number;
}

/**
 * Git diff hunk
 */
export interface GitDiffHunk {
  /** Old start line */
  oldStart: number;

  /** Old line count */
  oldLines: number;

  /** New start line */
  newStart: number;

  /** New line count */
  newLines: number;

  /** Hunk header */
  header: string;

  /** Diff lines */
  lines: GitDiffLine[];
}

/**
 * Git diff line
 */
export interface GitDiffLine {
  /** Line type */
  type: 'context' | 'addition' | 'deletion';

  /** Line content */
  content: string;

  /** Old line number (for context and deletion) */
  oldLineNumber?: number;

  /** New line number (for context and addition) */
  newLineNumber?: number;
}

/**
 * Git file diff
 */
export interface GitFileDiff {
  /** File path */
  path: string;

  /** Old path (for renames) */
  oldPath?: string;

  /** Whether file is binary */
  isBinary: boolean;

  /** Diff hunks */
  hunks: GitDiffHunk[];

  /** Total additions */
  additions: number;

  /** Total deletions */
  deletions: number;
}

/**
 * Git user configuration
 */
export interface GitUserConfig {
  /** User name */
  name?: string;

  /** User email */
  email?: string;
}

/**
 * Git worktree information
 */
export interface WorktreeInfo {
  /** Worktree path */
  path: string;

  /** HEAD commit hash */
  head: string;

  /** Branch name */
  branch: string;

  /** Whether this is the main worktree */
  isMain: boolean;

  /** Whether the worktree is locked */
  isLocked: boolean;

  /** Whether the worktree is prunable */
  isPrunable: boolean;
}
