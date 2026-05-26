import { Injectable } from '@nestjs/common';
import { existsSync } from 'fs';
import { isAbsolute, relative, resolve } from 'path';
import { BranchInfo, createLogger } from '@omniscribe/shared';
import type { GitRepoStatus, GitFileChange, GitFileStatus } from '@omniscribe/shared';
import { GitBaseService } from './git-base.service';
import { GitRepoService } from './git-repo.service';
import { GitBranchService } from './git-branch.service';

@Injectable()
export class GitStatusService {
  private readonly logger = createLogger('GitStatusService');

  constructor(
    private readonly gitBase: GitBaseService,
    private readonly gitRepo: GitRepoService,
    private readonly gitBranch: GitBranchService
  ) {}

  /**
   * Get full repository status including staged, unstaged, and untracked files
   */
  async getStatus(projectPath: string): Promise<GitRepoStatus> {
    this.logger.debug(`Getting status for ${projectPath}`);
    const isRepo = await this.gitRepo.isGitRepository(projectPath);

    if (!isRepo) {
      return {
        isRepo: false,
        isClean: true,
        staged: [],
        unstaged: [],
        untracked: [],
        hasConflicts: false,
        isRebasing: false,
        isMerging: false,
        stashCount: 0,
      };
    }

    const rootPath = await this.gitRepo.getRepositoryRoot(projectPath);
    const currentBranchName = await this.gitBranch.getCurrentBranch(projectPath);

    // Get status using porcelain v2 format
    const { stdout: statusOutput } = await this.gitBase.execGit(projectPath, [
      'status',
      '--porcelain=v2',
      '--branch',
      '--untracked-files=all',
    ]);

    const staged: GitFileChange[] = [];
    const unstaged: GitFileChange[] = [];
    const untracked: string[] = [];
    const conflictedFiles: string[] = [];
    let ahead = 0;
    let behind = 0;
    let upstream: string | undefined;

    for (const line of statusOutput.split('\n')) {
      if (!line) continue;

      if (line.startsWith('# branch.ab')) {
        // Parse ahead/behind info: # branch.ab +1 -2
        const match = line.match(/\+(\d+)\s+-(\d+)/);
        if (match) {
          ahead = parseInt(match[1], 10);
          behind = parseInt(match[2], 10);
        }
      } else if (line.startsWith('# branch.upstream')) {
        upstream = line.split(' ')[1];
      } else if (line.startsWith('1 ') || line.startsWith('2 ')) {
        // Ordinary changed entries (1) or renamed/copied entries (2)
        const parts = line.split(' ');
        const xy = parts[1]; // XY status codes
        const stagedStatus = xy[0];
        const unstagedStatus = xy[1];

        // For renamed entries (line starts with 2), path format is different
        let filePath: string;
        let oldPath: string | undefined;

        if (line.startsWith('2 ')) {
          // Renamed entry format: 2 XY sub mH mI mW hH hI path\torigPath
          const pathPart = parts.slice(9).join(' ');
          const [newPath, origPath] = pathPart.split('\t');
          filePath = newPath;
          oldPath = origPath;
        } else {
          // Ordinary entry format: 1 XY sub mH mI mW hH hI path
          filePath = parts.slice(8).join(' ');
        }

        // Parse staged changes
        if (stagedStatus !== '.') {
          staged.push({
            path: filePath,
            oldPath,
            status: this.parseStatusCode(stagedStatus),
            staged: true,
          });
        }

        // Parse unstaged changes
        if (unstagedStatus !== '.') {
          unstaged.push({
            path: filePath,
            status: this.parseStatusCode(unstagedStatus),
            staged: false,
          });
        }
      } else if (line.startsWith('u ')) {
        // Unmerged entries (conflicts)
        const parts = line.split(' ');
        const filePath = parts.slice(10).join(' ');
        conflictedFiles.push(filePath);
      } else if (line.startsWith('? ')) {
        // Untracked files
        const filePath = line.substring(2);
        untracked.push(filePath);
      }
    }

    // Check for rebase/merge state
    const isRebasing = await this.checkRebaseState(projectPath);
    const isMerging = await this.checkMergeState(projectPath);

    // Get stash count
    const stashCount = await this.getStashCount(projectPath);

    // Build current branch info
    const currentBranch: BranchInfo = {
      name: currentBranchName,
      isCurrent: true,
      isRemote: false,
      ahead,
      behind,
      upstream,
    };

    if (upstream) {
      const remoteParts = upstream.split('/');
      currentBranch.remote = remoteParts[0];
    }

    return {
      isRepo: true,
      currentBranch,
      rootPath,
      isClean: staged.length === 0 && unstaged.length === 0 && untracked.length === 0,
      staged,
      unstaged,
      untracked,
      hasConflicts: conflictedFiles.length > 0,
      conflictedFiles: conflictedFiles.length > 0 ? conflictedFiles : undefined,
      isRebasing,
      isMerging,
      stashCount,
    };
  }

  /**
   * Get count of uncommitted changes
   */
  async getUncommittedCount(repoPath: string): Promise<number> {
    const { stdout } = await this.gitBase.execGit(repoPath, ['status', '--porcelain']);

    return stdout.trim().split('\n').filter(Boolean).length;
  }

  /**
   * List untracked files (respecting .gitignore). Lightweight alternative to
   * getStatus() when only the untracked set is needed — one git spawn instead
   * of the full branch/rebase/merge/stash scan.
   */
  async getUntrackedFiles(repoPath: string): Promise<string[]> {
    const { stdout } = await this.gitBase.execGit(repoPath, [
      'ls-files',
      '--others',
      '--exclude-standard',
    ]);
    return stdout.split('\n').filter(Boolean);
  }

  /**
   * Parse git status code to GitFileStatus
   */
  parseStatusCode(code: string): GitFileStatus {
    switch (code) {
      case 'M':
        return 'modified';
      case 'A':
        return 'added';
      case 'D':
        return 'deleted';
      case 'R':
        return 'renamed';
      case 'C':
        return 'copied';
      case 'U':
        return 'conflicted';
      default:
        return 'modified';
    }
  }

  /**
   * Check if rebase is in progress by testing whether rebase-merge or
   * rebase-apply directories exist on disk. Mirrors `checkMergeState`'s
   * `rev-parse --git-path` + `existsSync` pattern instead of the prior
   * 4-spawn approach (`git rev-parse` ×2 + `git ls-files --error-unmatch`
   * ×2). Batches both `--git-path` flags into 1 spawn — saves ~80–100 ms
   * per `getStatus()`.
   */
  async checkRebaseState(projectPath: string): Promise<boolean> {
    try {
      // rev-parse accepts multiple --git-path flags and emits one resolved
      // path per line. Works correctly in worktrees where .git is a file
      // pointing at the shared common dir.
      const { stdout } = await this.gitBase.execGit(projectPath, [
        'rev-parse',
        '--git-path',
        'rebase-merge',
        '--git-path',
        'rebase-apply',
      ]);

      const candidates = stdout
        .trim()
        .split('\n')
        .map(p => p.trim())
        .filter(p => p.length > 0);

      for (const rel of candidates) {
        const fullPath = resolve(projectPath, rel);

        // Defense: a tampered git config could in principle make
        // --git-path point outside the worktree's project + common dir.
        // Refuse to existsSync arbitrary paths.
        if (!(await this.isInsideProjectOrGitCommon(projectPath, fullPath))) {
          this.logger.warn(
            `Refusing existsSync — rebase path outside project/git-common-dir: ${fullPath}`
          );
          continue;
        }
        if (existsSync(fullPath)) return true;
      }

      return false;
    } catch (error) {
      this.logger.warn('Failed to check rebase state:', error);
      return false;
    }
  }

  /**
   * Check if merge is in progress by testing if MERGE_HEAD file exists on disk.
   */
  async checkMergeState(projectPath: string): Promise<boolean> {
    try {
      // rev-parse --git-path resolves the actual filesystem path for MERGE_HEAD
      // (works correctly in worktrees where .git is a file pointing elsewhere)
      const { stdout } = await this.gitBase.execGit(projectPath, [
        'rev-parse',
        '--git-path',
        'MERGE_HEAD',
      ]);
      const mergePath = stdout.trim();
      if (!mergePath) return false;

      const fullPath = resolve(projectPath, mergePath);

      // Defense: ensure the resolved path lives inside this project or
      // its shared git common dir (worktree case). A tampered git config
      // could in principle point --git-path outside the worktree; we
      // refuse to existsSync() arbitrary paths on the filesystem.
      if (!(await this.isInsideProjectOrGitCommon(projectPath, fullPath))) {
        this.logger.warn(`Refusing existsSync — path outside project/git-common-dir: ${fullPath}`);
        return false;
      }
      return existsSync(fullPath);
    } catch {
      return false;
    }
  }

  /**
   * Validate that `candidate` is contained within `projectPath` or the
   * git common dir resolved from `projectPath` (worktrees share their
   * common dir with the main checkout, so MERGE_HEAD/rebase paths in
   * worktrees legitimately live outside the worktree's own tree).
   */
  private async isInsideProjectOrGitCommon(
    projectPath: string,
    candidate: string
  ): Promise<boolean> {
    const isInside = (dir: string, target: string): boolean => {
      const rel = relative(dir, target);
      return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
    };
    const target = resolve(candidate);
    if (isInside(resolve(projectPath), target)) return true;

    try {
      const { stdout } = await this.gitBase.execGit(projectPath, ['rev-parse', '--git-common-dir']);
      const common = stdout.trim();
      if (!common) return false;
      if (isInside(resolve(projectPath, common), target)) return true;
    } catch {
      // If git can't resolve the common dir, refuse the path.
    }
    return false;
  }

  /**
   * Get stash count
   */
  async getStashCount(projectPath: string): Promise<number> {
    try {
      const { stdout } = await this.gitBase.execGit(projectPath, ['stash', 'list']);
      if (!stdout.trim()) return 0;
      return stdout.trim().split('\n').filter(Boolean).length;
    } catch (error) {
      this.logger.warn('Failed to get stash count:', error);
      return 0;
    }
  }
}
