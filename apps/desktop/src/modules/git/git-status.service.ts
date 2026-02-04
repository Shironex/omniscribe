import { Injectable } from '@nestjs/common';
import { BranchInfo } from '@omniscribe/shared';
import type { GitRepoStatus, GitFileChange, GitFileStatus } from '@omniscribe/shared';
import { GitBaseService } from './git-base.service';
import { GitRepoService } from './git-repo.service';
import { GitBranchService } from './git-branch.service';

@Injectable()
export class GitStatusService {
  constructor(
    private readonly gitBase: GitBaseService,
    private readonly gitRepo: GitRepoService,
    private readonly gitBranch: GitBranchService,
  ) {}

  /**
   * Get full repository status including staged, unstaged, and untracked files
   */
  async getStatus(projectPath: string): Promise<GitRepoStatus> {
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
    const { stdout } = await this.gitBase.execGit(repoPath, [
      'status',
      '--porcelain',
    ]);

    return stdout.trim().split('\n').filter(Boolean).length;
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
   * Check if rebase is in progress
   */
  async checkRebaseState(projectPath: string): Promise<boolean> {
    try {
      const { stdout } = await this.gitBase.execGit(projectPath, [
        'rev-parse',
        '--git-path',
        'rebase-merge',
      ]);
      const rebaseMergePath = stdout.trim();

      const { stdout: rebaseApplyOutput } = await this.gitBase.execGit(projectPath, [
        'rev-parse',
        '--git-path',
        'rebase-apply',
      ]);
      const rebaseApplyPath = rebaseApplyOutput.trim();

      // Check if either rebase directory exists
      const { stdout: lsOutput } = await this.gitBase.execGit(projectPath, [
        'ls-files',
        '--error-unmatch',
        rebaseMergePath,
      ]).catch(() => ({ stdout: '' }));

      if (lsOutput) return true;

      const { stdout: lsApplyOutput } = await this.gitBase.execGit(projectPath, [
        'ls-files',
        '--error-unmatch',
        rebaseApplyPath,
      ]).catch(() => ({ stdout: '' }));

      return !!lsApplyOutput;
    } catch {
      return false;
    }
  }

  /**
   * Check if merge is in progress
   */
  async checkMergeState(projectPath: string): Promise<boolean> {
    try {
      const { stdout } = await this.gitBase.execGit(projectPath, [
        'rev-parse',
        '--git-path',
        'MERGE_HEAD',
      ]);
      const mergePath = stdout.trim();

      // Try to read MERGE_HEAD - if it exists, merge is in progress
      await this.gitBase.execGit(projectPath, ['cat-file', '-e', `HEAD:${mergePath}`]);
      return true;
    } catch {
      // MERGE_HEAD doesn't exist, no merge in progress
      return false;
    }
  }

  /**
   * Get stash count
   */
  async getStashCount(projectPath: string): Promise<number> {
    try {
      const { stdout } = await this.gitBase.execGit(projectPath, ['stash', 'list']);
      if (!stdout.trim()) return 0;
      return stdout.trim().split('\n').filter(Boolean).length;
    } catch {
      return 0;
    }
  }
}
