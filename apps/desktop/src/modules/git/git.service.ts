import { Injectable } from '@nestjs/common';
import { BranchInfo, CommitInfo, RemoteInfo, GitUserConfig } from '@omniscribe/shared';
import type { GitRepoStatus } from '@omniscribe/shared';
import { GitBranchService } from './git-branch.service';
import { GitStatusService } from './git-status.service';
import { GitCommitService } from './git-commit.service';
import { GitRemoteService } from './git-remote.service';
import { GitRepoService } from './git-repo.service';

/**
 * GitService acts as a facade that delegates to specialized domain services.
 * This maintains backward compatibility with existing code that uses GitService.
 */
@Injectable()
export class GitService {
  constructor(
    private readonly gitBranch: GitBranchService,
    private readonly gitStatus: GitStatusService,
    private readonly gitCommit: GitCommitService,
    private readonly gitRemote: GitRemoteService,
    private readonly gitRepo: GitRepoService
  ) {}

  // ==================== Branch Operations ====================

  /**
   * Get all branches (local and remote)
   */
  async getBranches(repoPath: string): Promise<BranchInfo[]> {
    return this.gitBranch.getBranches(repoPath);
  }

  /**
   * Get the current branch name
   */
  async getCurrentBranch(repoPath: string): Promise<string> {
    return this.gitBranch.getCurrentBranch(repoPath);
  }

  /**
   * Checkout a branch
   */
  async checkout(repoPath: string, branch: string): Promise<void> {
    return this.gitBranch.checkout(repoPath, branch);
  }

  /**
   * Create a new branch
   */
  async createBranch(repoPath: string, name: string, startPoint?: string): Promise<void> {
    return this.gitBranch.createBranch(repoPath, name, startPoint);
  }

  // ==================== Status Operations ====================

  /**
   * Get full repository status including staged, unstaged, and untracked files
   */
  async getStatus(projectPath: string): Promise<GitRepoStatus> {
    return this.gitStatus.getStatus(projectPath);
  }

  /**
   * Get count of uncommitted changes
   */
  async getUncommittedCount(repoPath: string): Promise<number> {
    return this.gitStatus.getUncommittedCount(repoPath);
  }

  // ==================== Commit Operations ====================

  /**
   * Get commit log
   */
  async getCommitLog(
    repoPath: string,
    limit: number = 50,
    allBranches: boolean = true
  ): Promise<CommitInfo[]> {
    return this.gitCommit.getCommitLog(repoPath, limit, allBranches);
  }

  /**
   * Stage files for commit
   */
  async stage(projectPath: string, files: string[]): Promise<void> {
    return this.gitCommit.stage(projectPath, files);
  }

  /**
   * Unstage files from the index
   */
  async unstage(projectPath: string, files: string[]): Promise<void> {
    return this.gitCommit.unstage(projectPath, files);
  }

  /**
   * Create a commit with the given message
   * @returns The commit hash of the new commit
   */
  async commit(projectPath: string, message: string): Promise<string> {
    return this.gitCommit.commit(projectPath, message);
  }

  /**
   * Get diff for the working tree or a specific file
   */
  async diff(projectPath: string, file?: string): Promise<string> {
    return this.gitCommit.diff(projectPath, file);
  }

  // ==================== Remote Operations ====================

  /**
   * Get remote information
   */
  async getRemotes(repoPath: string): Promise<RemoteInfo[]> {
    return this.gitRemote.getRemotes(repoPath);
  }

  /**
   * Push commits to a remote repository
   */
  async push(projectPath: string, remote: string = 'origin', branch?: string): Promise<void> {
    return this.gitRemote.push(projectPath, remote, branch);
  }

  /**
   * Pull changes from a remote repository
   */
  async pull(projectPath: string, remote: string = 'origin', branch?: string): Promise<void> {
    return this.gitRemote.pull(projectPath, remote, branch);
  }

  /**
   * Fetch updates from a remote repository
   */
  async fetch(projectPath: string, remote?: string): Promise<void> {
    return this.gitRemote.fetch(projectPath, remote);
  }

  // ==================== Repository Operations ====================

  /**
   * Check if a path is a git repository
   */
  async isGitRepository(repoPath: string): Promise<boolean> {
    return this.gitRepo.isGitRepository(repoPath);
  }

  /**
   * Get the repository root path
   */
  async getRepositoryRoot(repoPath: string): Promise<string> {
    return this.gitRepo.getRepositoryRoot(repoPath);
  }

  /**
   * Get user configuration
   */
  async getUserConfig(repoPath: string): Promise<GitUserConfig> {
    return this.gitRepo.getUserConfig(repoPath);
  }

  /**
   * Set user configuration
   */
  async setUserConfig(
    repoPath: string,
    name?: string,
    email?: string,
    global: boolean = false
  ): Promise<void> {
    return this.gitRepo.setUserConfig(repoPath, name, email, global);
  }
}
