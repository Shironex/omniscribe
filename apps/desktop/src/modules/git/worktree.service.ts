import { Injectable } from '@nestjs/common';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { WorktreeInfo } from '@omniscribe/shared';

const execAsync = promisify(exec);

/** Base directory for worktrees */
const BASE_DIR = path.join(os.homedir(), '.omniscribe', 'worktrees');

/** Default timeout for git commands (30 seconds) */
const GIT_TIMEOUT_MS = 30000;

/** Git environment variables to prevent interactive prompts */
const GIT_ENV: Record<string, string> = {
  GIT_TERMINAL_PROMPT: '0',
  LC_ALL: 'C',
};

@Injectable()
export class WorktreeService {
  /**
   * Execute a git command with timeout and proper environment
   */
  private async execGit(
    cwd: string,
    args: string[],
    timeoutMs: number = GIT_TIMEOUT_MS,
  ): Promise<{ stdout: string; stderr: string }> {
    const command = `git ${args.join(' ')}`;

    const result = await execAsync(command, {
      cwd,
      timeout: timeoutMs,
      env: {
        ...process.env,
        ...GIT_ENV,
      },
      maxBuffer: 10 * 1024 * 1024,
    });

    return {
      stdout: result.stdout,
      stderr: result.stderr,
    };
  }

  /**
   * Compute the worktree path for a given project and branch
   * Uses SHA256 hash to create a unique, filesystem-safe path
   */
  getWorktreePath(projectPath: string, branch: string): string {
    const hash = crypto
      .createHash('sha256')
      .update(`${projectPath}:${branch}`)
      .digest('hex')
      .substring(0, 16);

    // Sanitize branch name for use in path
    const safeBranch = branch.replace(/[^a-zA-Z0-9-_]/g, '_');

    return path.join(BASE_DIR, `${safeBranch}-${hash}`);
  }

  /**
   * Prepare a worktree for a given branch
   * Creates a new worktree if it doesn't exist
   *
   * @param projectPath - Path to the main repository
   * @param branch - Branch name to checkout (optional, uses current if not specified)
   * @returns Worktree path or null if not needed (working on main repo)
   */
  async prepare(projectPath: string, branch?: string): Promise<string | null> {
    // If no branch specified, work directly on the main repo
    if (!branch) {
      return null;
    }

    // Get the current branch
    const { stdout: currentBranch } = await this.execGit(projectPath, [
      'rev-parse',
      '--abbrev-ref',
      'HEAD',
    ]);

    // If the requested branch is the current branch, work directly on the repo
    if (currentBranch.trim() === branch) {
      return null;
    }

    const worktreePath = this.getWorktreePath(projectPath, branch);

    // Ensure the base directory exists
    await fs.mkdir(BASE_DIR, { recursive: true });

    // Check if worktree already exists
    const existingWorktrees = await this.list(projectPath);
    const existingWorktree = existingWorktrees.find((wt) => wt.path === worktreePath);

    if (existingWorktree) {
      // Worktree exists, verify it's still valid
      try {
        await fs.access(worktreePath);
        return worktreePath;
      } catch {
        // Worktree directory doesn't exist, remove stale reference
        await this.execGit(projectPath, ['worktree', 'prune']);
      }
    }

    // Check if the branch exists locally or remotely
    let branchExists = false;
    try {
      await this.execGit(projectPath, ['rev-parse', '--verify', branch]);
      branchExists = true;
    } catch {
      // Check remote branches
      try {
        const { stdout: remoteBranches } = await this.execGit(projectPath, [
          'branch',
          '-r',
          '--list',
          `*/${branch}`,
        ]);
        branchExists = remoteBranches.trim().length > 0;
      } catch {
        // Branch doesn't exist
      }
    }

    if (!branchExists) {
      throw new Error(`Branch '${branch}' does not exist`);
    }

    // Create the worktree
    try {
      await this.execGit(projectPath, ['worktree', 'add', worktreePath, branch]);
    } catch (error) {
      // If branch is already checked out elsewhere, try with --detach
      if (String(error).includes('already checked out')) {
        await this.execGit(projectPath, [
          'worktree',
          'add',
          '--detach',
          worktreePath,
          branch,
        ]);
      } else {
        throw error;
      }
    }

    return worktreePath;
  }

  /**
   * Clean up a worktree
   */
  async cleanup(projectPath: string, worktreePath: string): Promise<void> {
    // Remove the worktree
    try {
      await this.execGit(projectPath, ['worktree', 'remove', worktreePath, '--force']);
    } catch {
      // If git worktree remove fails, try manual cleanup
      try {
        await fs.rm(worktreePath, { recursive: true, force: true });
        await this.execGit(projectPath, ['worktree', 'prune']);
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  /**
   * List all worktrees for a repository
   */
  async list(projectPath: string): Promise<WorktreeInfo[]> {
    const worktrees: WorktreeInfo[] = [];

    const { stdout } = await this.execGit(projectPath, [
      'worktree',
      'list',
      '--porcelain',
    ]);

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
    if (worktrees.length > 0 && !worktrees.some((wt) => wt.isMain)) {
      worktrees[0].isMain = true;
    }

    return worktrees;
  }

  /**
   * Clean up all worktrees for a repository that are managed by Omniscribe
   */
  async cleanupAll(projectPath: string): Promise<void> {
    const worktrees = await this.list(projectPath);

    for (const worktree of worktrees) {
      // Only clean up worktrees in our base directory
      if (!worktree.isMain && worktree.path.startsWith(BASE_DIR)) {
        await this.cleanup(projectPath, worktree.path);
      }
    }
  }
}
