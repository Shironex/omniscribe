import { Injectable } from '@nestjs/common';
import { Mutex } from 'async-mutex';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import {
  WorktreeInfo,
  WorktreeLocation,
  USER_DATA_DIR,
  WORKTREES_DIR,
  APP_NAME_LOWER,
  createLogger,
  normalizePath,
} from '@omniscribe/shared';
import { GitBaseService } from './git-base.service';

/** Central directory for worktrees (follows XDG spec on Linux, .omniscribe on Windows/macOS) */
const CENTRAL_DIR =
  process.platform === 'linux'
    ? path.join(os.homedir(), '.local', 'share', APP_NAME_LOWER, WORKTREES_DIR)
    : path.join(os.homedir(), USER_DATA_DIR, WORKTREES_DIR);

/** Project-local worktree directory name */
const PROJECT_WORKTREE_DIR = '.worktrees';

/**
 * Security: Validate and sanitize a branch name for use in file paths
 * Returns null if the branch name is invalid
 */
function sanitizeBranchForPath(branch: string): string | null {
  if (!branch || branch.length === 0 || branch.length > 255) {
    return null;
  }

  // Reject null bytes and control characters (ASCII 0-31)
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f]/.test(branch)) {
    return null;
  }

  // Reject path traversal attempts
  if (branch === '.' || branch === '..' || branch.includes('/../') || branch.includes('/..')) {
    return null;
  }

  // Sanitize branch name - replace unsafe characters with underscore
  // Keep only alphanumeric, dash, underscore, and dot
  const safeBranch = branch.replace(/[^a-zA-Z0-9._-]/g, '_');

  // Ensure the result doesn't start/end with dots or dashes
  const trimmed = safeBranch.replace(/^[._-]+|[._-]+$/g, '');

  // Ensure we have something left
  if (trimmed.length === 0) {
    return null;
  }

  return trimmed;
}

@Injectable()
export class WorktreeService {
  private readonly logger = createLogger('WorktreeService');

  /**
   * Per-repo locks. Worktree mutations (`prepare`/`cleanup`) for the same repo
   * must be serialized: git serializes index/worktree changes via on-disk locks,
   * so concurrent operations race into cryptic "already exists / locked" errors
   * or a silent `--detach` fallback that changes the session's branch semantics.
   * Keyed by normalized projectPath; intentionally never pruned (bounded by the
   * number of open repos, and dropping a lock mid-flight would defeat it).
   */
  private readonly repoLocks = new Map<string, Mutex>();

  constructor(private readonly gitBase: GitBaseService) {}

  private getRepoMutex(projectPath: string): Mutex {
    const key = normalizePath(projectPath);
    let mutex = this.repoLocks.get(key);
    if (!mutex) {
      mutex = new Mutex();
      this.repoLocks.set(key, mutex);
    }
    return mutex;
  }

  /**
   * Compute the worktree path for a given project, branch, and location preference
   *
   * For 'project' location: {projectPath}/.worktrees/{sanitized-branch}/
   * For 'central' location: {CENTRAL_DIR}/{repo-hash}/{sanitized-branch}/
   */
  getWorktreePath(
    projectPath: string,
    branch: string,
    location: WorktreeLocation = 'project'
  ): string {
    // Security: Sanitize branch name to prevent path traversal
    const safeBranch = sanitizeBranchForPath(branch);
    if (!safeBranch) {
      throw new Error(`Invalid branch name: ${branch}`);
    }

    if (location === 'project') {
      // Store in project's .worktrees/ directory
      return path.join(projectPath, PROJECT_WORKTREE_DIR, safeBranch);
    } else {
      // Store in central ~/.omniscribe/worktrees/ directory
      // Use hash to avoid collisions between projects with same branch names
      const repoHash = crypto
        .createHash('sha256')
        .update(projectPath)
        .digest('hex')
        .substring(0, 16);

      return path.join(CENTRAL_DIR, repoHash, safeBranch);
    }
  }

  /**
   * Prepare a worktree for a given branch
   * Creates a new worktree if it doesn't exist
   *
   * @param projectPath - Path to the main repository
   * @param branch - Branch name to checkout (optional, uses current if not specified)
   * @param location - Where to store the worktree ('project' or 'central')
   * @returns Worktree path or null if not needed (working on main repo)
   */
  async prepare(
    projectPath: string,
    branch?: string,
    location: WorktreeLocation = 'project',
    currentBranchOverride?: string
  ): Promise<string | null> {
    this.logger.info(`Preparing worktree for branch "${branch || 'current'}" in ${projectPath}`);

    // If no branch specified, work directly on the main repo
    if (!branch) {
      return null;
    }

    // Serialize worktree mutations per repo to avoid git index/worktree lock races.
    return this.getRepoMutex(projectPath).runExclusive(() =>
      this.prepareLocked(projectPath, branch, location, currentBranchOverride)
    );
  }

  /**
   * Internal worktree preparation. Runs while holding the per-repo lock so the
   * list -> branch-probe -> `worktree add` sequence is atomic against other
   * sessions targeting the same repo.
   */
  private async prepareLocked(
    projectPath: string,
    branch: string,
    location: WorktreeLocation,
    currentBranchOverride?: string
  ): Promise<string | null> {
    // Use provided currentBranch to avoid redundant git calls (Bug #8: TOCTOU race)
    let currentBranch: string;
    if (currentBranchOverride) {
      currentBranch = currentBranchOverride;
    } else {
      const { stdout } = await this.gitBase.execGit(projectPath, [
        'rev-parse',
        '--abbrev-ref',
        'HEAD',
      ]);
      currentBranch = stdout.trim();
    }

    // If the requested branch is the current branch, work directly on the repo
    if (currentBranch === branch) {
      this.logger.debug(`Branch "${branch}" is current branch, no worktree needed`);
      return null;
    }

    const worktreePath = this.getWorktreePath(projectPath, branch, location);

    // Ensure the parent directory exists (BASE_DIR/repo-hash/)
    const parentDir = path.dirname(worktreePath);
    await fs.mkdir(parentDir, { recursive: true });

    // Check if worktree already exists
    const existingWorktrees = await this.list(projectPath);
    const existingWorktree = existingWorktrees.find(wt => wt.path === worktreePath);

    if (existingWorktree) {
      // Worktree exists, verify it's still valid
      try {
        await fs.access(worktreePath);
        this.logger.debug(`Reusing existing worktree at ${worktreePath}`);
        return worktreePath;
      } catch {
        this.logger.debug('Worktree directory missing, pruning stale ref');
        await this.gitBase.execGit(projectPath, ['worktree', 'prune']);
      }
    }

    // Check if the branch exists locally or remotely
    this.logger.debug(`Checking if branch "${branch}" exists locally or remotely`);
    let branchExists = false;
    let remoteBranchRef: string | null = null;

    try {
      await this.gitBase.execGit(projectPath, ['rev-parse', '--verify', branch]);
      branchExists = true;
    } catch (error) {
      this.logger.debug(`Branch "${branch}" not found locally, checking remote`, error);
      try {
        const { stdout: remoteBranches } = await this.gitBase.execGit(projectPath, [
          'branch',
          '-r',
          '--list',
          `*/${branch}`,
        ]);
        const trimmed = remoteBranches.trim();
        if (trimmed.length > 0) {
          branchExists = true;
          // Get the first matching remote branch (e.g., "origin/branch-name")
          remoteBranchRef = trimmed.split('\n')[0].trim();
        }
      } catch (innerError) {
        this.logger.debug(`Branch "${branch}" not found remotely either`, innerError);
      }
    }

    // Create the worktree
    try {
      if (branchExists) {
        // Branch exists - create worktree pointing to it
        await this.gitBase.execGit(projectPath, ['worktree', 'add', worktreePath, branch]);
      } else {
        // Branch doesn't exist - create a new branch with the worktree
        // git worktree add -b <new-branch> <path> HEAD
        await this.gitBase.execGit(projectPath, [
          'worktree',
          'add',
          '-b',
          branch,
          worktreePath,
          'HEAD',
        ]);
      }
    } catch (error) {
      const errorStr = String(error);
      // If branch is already checked out elsewhere, try with --detach
      if (errorStr.includes('already checked out')) {
        await this.gitBase.execGit(projectPath, [
          'worktree',
          'add',
          '--detach',
          worktreePath,
          branch,
        ]);
      } else if (errorStr.includes('already exists') && remoteBranchRef) {
        // Local branch already exists but wasn't found by rev-parse
        // This can happen with tracking branches - try tracking the remote
        await this.gitBase.execGit(projectPath, [
          'worktree',
          'add',
          '--track',
          '-b',
          branch,
          worktreePath,
          remoteBranchRef,
        ]);
      } else {
        throw error;
      }
    }

    this.logger.debug(`Worktree created at ${worktreePath} for branch "${branch}"`);

    // Defensive check: verify the worktree directory was actually created
    try {
      await fs.access(worktreePath);
    } catch {
      throw new Error(
        `Worktree directory was not created at ${worktreePath}. ` +
          `The git worktree add command may have failed silently for branch "${branch}".`
      );
    }

    return worktreePath;
  }

  /**
   * Validate that a worktree path is within Omniscribe-managed directories.
   * Prevents arbitrary path deletion via fs.rm().
   */
  private validateWorktreePath(projectPath: string, worktreePath: string): void {
    const resolved = path.resolve(worktreePath);
    const allowedProjectDir = path.resolve(projectPath, PROJECT_WORKTREE_DIR) + path.sep;
    const allowedCentralDir = path.resolve(CENTRAL_DIR) + path.sep;

    if (!resolved.startsWith(allowedProjectDir) && !resolved.startsWith(allowedCentralDir)) {
      throw new Error(
        'Worktree path is outside of managed directories. ' +
          'Path must be within the project .worktrees/ directory or the central worktree directory.'
      );
    }
  }

  /**
   * Clean up a worktree
   */
  async cleanup(projectPath: string, worktreePath: string): Promise<void> {
    this.validateWorktreePath(projectPath, worktreePath);
    this.logger.info(`Cleaning up worktree at ${worktreePath}`);
    // Serialize against prepare()/other cleanups on the same repo (git lock races).
    await this.getRepoMutex(projectPath).runExclusive(async () => {
      // Remove the worktree
      try {
        await this.gitBase.execGit(projectPath, ['worktree', 'remove', worktreePath, '--force']);
      } catch (error) {
        this.logger.warn(`git worktree remove failed for ${worktreePath}`, error);
        // If git worktree remove fails, try manual cleanup
        try {
          await fs.rm(worktreePath, { recursive: true, force: true });
          await this.gitBase.execGit(projectPath, ['worktree', 'prune']);
        } catch (innerError) {
          this.logger.warn(`Manual worktree cleanup failed for ${worktreePath}:`, innerError);
        }
      }
    });
  }

  /**
   * List all worktrees for a repository
   */
  async list(projectPath: string): Promise<WorktreeInfo[]> {
    this.logger.debug(`[list] projectPath=${projectPath}`);
    const worktrees: WorktreeInfo[] = [];

    const { stdout } = await this.gitBase.execGit(projectPath, ['worktree', 'list', '--porcelain']);

    let current: Partial<WorktreeInfo> = {};

    for (const line of stdout.split('\n')) {
      if (line.startsWith('worktree ')) {
        if (current.path) {
          worktrees.push(current as WorktreeInfo);
        }
        current = {
          path: line.substring(9),
          isMain: false,
          isLocked: false,
          isPrunable: false,
        };
      } else if (line.startsWith('HEAD ')) {
        current.head = line.substring(5);
      } else if (line.startsWith('branch ')) {
        // refs/heads/branch-name -> branch-name
        const ref = line.substring(7);
        current.branch = ref.replace('refs/heads/', '');
      } else if (line === 'bare') {
        current.isMain = true;
      } else if (line === 'locked') {
        current.isLocked = true;
      } else if (line === 'prunable') {
        current.isPrunable = true;
      } else if (line.startsWith('detached')) {
        current.branch = 'detached';
      } else if (line === '') {
        // Entry separator
      }
    }

    // Push the last entry
    if (current.path) {
      worktrees.push(current as WorktreeInfo);
    }

    // Mark the first worktree as main (it's the original repo)
    if (worktrees.length > 0 && !worktrees.some(wt => wt.isMain)) {
      worktrees[0].isMain = true;
    }

    return worktrees;
  }

  /**
   * Clean up all worktrees for a repository that are managed by Omniscribe
   */
  async cleanupAll(projectPath: string): Promise<void> {
    this.logger.debug(`[cleanupAll] projectPath=${projectPath}`);
    const worktrees = await this.list(projectPath);
    const projectWorktreeDir = normalizePath(path.join(projectPath, PROJECT_WORKTREE_DIR));

    for (const worktree of worktrees) {
      // Normalize path separators for cross-platform comparison
      const normalizedPath = normalizePath(worktree.path);
      const normalizedCentralDir = normalizePath(CENTRAL_DIR);

      // Only clean up worktrees managed by Omniscribe (in .worktrees/ or central dir)
      const isProjectWorktree = normalizedPath.startsWith(projectWorktreeDir);
      const isCentralWorktree = normalizedPath.startsWith(normalizedCentralDir);

      if (!worktree.isMain && (isProjectWorktree || isCentralWorktree)) {
        await this.cleanup(projectPath, worktree.path);
      }
    }
  }
}
