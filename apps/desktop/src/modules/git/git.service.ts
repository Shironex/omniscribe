import { Injectable } from '@nestjs/common';
import { exec, ExecException } from 'child_process';
import { promisify } from 'util';
import {
  BranchInfo,
  CommitInfo,
  RemoteInfo,
  GitUserConfig,
} from '@omniscribe/shared';
import type {
  GitRepoStatus,
  GitFileChange,
  GitFileStatus,
} from '@omniscribe/shared';

const execAsync = promisify(exec);

/** Default timeout for git commands (30 seconds) */
const GIT_TIMEOUT_MS = 30000;

/** Git environment variables to prevent interactive prompts */
const GIT_ENV: Record<string, string> = {
  GIT_TERMINAL_PROMPT: '0',
  LC_ALL: 'C',
};

interface ExecResult {
  stdout: string;
  stderr: string;
}

@Injectable()
export class GitService {
  /**
   * Execute a git command with timeout and proper environment
   */
  private async execGit(
    repoPath: string,
    args: string[],
    timeoutMs: number = GIT_TIMEOUT_MS,
  ): Promise<ExecResult> {
    const command = `git ${args.join(' ')}`;

    try {
      const result = await execAsync(command, {
        cwd: repoPath,
        timeout: timeoutMs,
        env: {
          ...process.env,
          ...GIT_ENV,
        },
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer for large outputs
      });

      return {
        stdout: result.stdout,
        stderr: result.stderr,
      };
    } catch (error) {
      const execError = error as ExecException & { stdout?: string; stderr?: string };

      // Check for timeout
      if (execError.killed) {
        throw new Error(`Git command timed out after ${timeoutMs}ms: ${command}`);
      }

      // Return stdout/stderr even on non-zero exit codes (some git commands use this)
      if (execError.stdout !== undefined || execError.stderr !== undefined) {
        return {
          stdout: execError.stdout ?? '',
          stderr: execError.stderr ?? '',
        };
      }

      throw new Error(`Git command failed: ${execError.message}`);
    }
  }

  /**
   * Get all branches (local and remote)
   */
  async getBranches(repoPath: string): Promise<BranchInfo[]> {
    const branches: BranchInfo[] = [];

    // Get local branches with tracking info
    const { stdout: localOutput } = await this.execGit(repoPath, [
      'for-each-ref',
      '--format=%(refname:short)|%(objectname:short)|%(subject)|%(upstream:short)|%(upstream:track)',
      'refs/heads/',
    ]);

    // Get current branch
    const currentBranch = await this.getCurrentBranch(repoPath);

    for (const line of localOutput.trim().split('\n')) {
      if (!line) continue;

      const [name, hash, message, upstream, track] = line.split('|');
      const branch: BranchInfo = {
        name,
        isCurrent: name === currentBranch,
        isRemote: false,
        lastCommitHash: hash,
        lastCommitMessage: message,
      };

      if (upstream) {
        const remoteParts = upstream.split('/');
        branch.remote = remoteParts[0];
        branch.upstream = upstream;

        // Parse tracking info (e.g., "[ahead 2, behind 1]")
        if (track) {
          const aheadMatch = track.match(/ahead (\d+)/);
          const behindMatch = track.match(/behind (\d+)/);
          if (aheadMatch) branch.ahead = parseInt(aheadMatch[1], 10);
          if (behindMatch) branch.behind = parseInt(behindMatch[1], 10);
        }
      }

      branches.push(branch);
    }

    // Get remote branches
    const { stdout: remoteOutput } = await this.execGit(repoPath, [
      'for-each-ref',
      '--format=%(refname:short)|%(objectname:short)|%(subject)',
      'refs/remotes/',
    ]);

    for (const line of remoteOutput.trim().split('\n')) {
      if (!line || line.includes('/HEAD')) continue;

      const [name, hash, message] = line.split('|');
      const remoteParts = name.split('/');

      branches.push({
        name,
        isCurrent: false,
        isRemote: true,
        remote: remoteParts[0],
        lastCommitHash: hash,
        lastCommitMessage: message,
      });
    }

    return branches;
  }

  /**
   * Get the current branch name
   */
  async getCurrentBranch(repoPath: string): Promise<string> {
    const { stdout } = await this.execGit(repoPath, ['rev-parse', '--abbrev-ref', 'HEAD']);
    return stdout.trim();
  }

  /**
   * Checkout a branch
   */
  async checkout(repoPath: string, branch: string): Promise<void> {
    await this.execGit(repoPath, ['checkout', branch]);
  }

  /**
   * Create a new branch
   */
  async createBranch(
    repoPath: string,
    name: string,
    startPoint?: string,
  ): Promise<void> {
    const args = ['checkout', '-b', name];
    if (startPoint) {
      args.push(startPoint);
    }
    await this.execGit(repoPath, args);
  }

  /**
   * Get commit log
   */
  async getCommitLog(
    repoPath: string,
    limit: number = 50,
    allBranches: boolean = true,
  ): Promise<CommitInfo[]> {
    const commits: CommitInfo[] = [];

    // Format: hash|shortHash|subject|body|authorName|authorEmail|authorDate|committerName|committerEmail|commitDate|parents|refs
    const format = [
      '%H',      // hash
      '%h',      // shortHash
      '%s',      // subject
      '%b',      // body
      '%an',     // authorName
      '%ae',     // authorEmail
      '%aI',     // authorDate (ISO 8601)
      '%cn',     // committerName
      '%ce',     // committerEmail
      '%cI',     // commitDate (ISO 8601)
      '%P',      // parents (space-separated)
      '%D',      // refs
    ].join('%x00'); // Use null byte as separator

    const args = [
      'log',
      `--format=${format}`,
      `-n${limit}`,
      '--date=iso-strict',
    ];

    if (allBranches) {
      args.push('--all');
    }

    const { stdout } = await this.execGit(repoPath, args);

    for (const entry of stdout.trim().split('\n')) {
      if (!entry) continue;

      const parts = entry.split('\x00');
      if (parts.length < 12) continue;

      const [
        hash,
        shortHash,
        subject,
        body,
        authorName,
        authorEmail,
        authorDate,
        committerName,
        committerEmail,
        commitDate,
        parents,
        refs,
      ] = parts;

      commits.push({
        hash,
        shortHash,
        subject,
        body: body || undefined,
        authorName,
        authorEmail,
        authorDate: new Date(authorDate),
        committerName,
        committerEmail,
        commitDate: new Date(commitDate),
        parents: parents ? parents.split(' ').filter(Boolean) : [],
        refs: refs ? refs.split(', ').filter(Boolean) : undefined,
      });
    }

    return commits;
  }

  /**
   * Get count of uncommitted changes
   */
  async getUncommittedCount(repoPath: string): Promise<number> {
    const { stdout } = await this.execGit(repoPath, [
      'status',
      '--porcelain',
    ]);

    return stdout.trim().split('\n').filter(Boolean).length;
  }

  /**
   * Get remote information
   */
  async getRemotes(repoPath: string): Promise<RemoteInfo[]> {
    const remotes: RemoteInfo[] = [];
    const remoteMap = new Map<string, RemoteInfo>();

    const { stdout } = await this.execGit(repoPath, ['remote', '-v']);

    for (const line of stdout.trim().split('\n')) {
      if (!line) continue;

      const match = line.match(/^(\S+)\s+(\S+)\s+\((fetch|push)\)$/);
      if (!match) continue;

      const [, name, url, type] = match;

      if (!remoteMap.has(name)) {
        remoteMap.set(name, {
          name,
          fetchUrl: '',
          pushUrl: '',
        });
      }

      const remote = remoteMap.get(name)!;
      if (type === 'fetch') {
        remote.fetchUrl = url;
      } else {
        remote.pushUrl = url;
      }
    }

    // Get remote branches for each remote
    for (const [name, remote] of remoteMap) {
      const { stdout: branchOutput } = await this.execGit(repoPath, [
        'ls-remote',
        '--heads',
        name,
      ]);

      const branches: string[] = [];
      for (const line of branchOutput.trim().split('\n')) {
        if (!line) continue;
        const branchMatch = line.match(/refs\/heads\/(.+)$/);
        if (branchMatch) {
          branches.push(branchMatch[1]);
        }
      }

      remote.branches = branches;
      remotes.push(remote);
    }

    return remotes;
  }

  /**
   * Get user configuration
   */
  async getUserConfig(repoPath: string): Promise<GitUserConfig> {
    const config: GitUserConfig = {};

    try {
      const { stdout: name } = await this.execGit(repoPath, [
        'config',
        '--get',
        'user.name',
      ]);
      config.name = name.trim() || undefined;
    } catch {
      // Config not set
    }

    try {
      const { stdout: email } = await this.execGit(repoPath, [
        'config',
        '--get',
        'user.email',
      ]);
      config.email = email.trim() || undefined;
    } catch {
      // Config not set
    }

    return config;
  }

  /**
   * Set user configuration
   */
  async setUserConfig(
    repoPath: string,
    name?: string,
    email?: string,
    global: boolean = false,
  ): Promise<void> {
    const scope = global ? '--global' : '--local';

    if (name !== undefined) {
      if (name) {
        await this.execGit(repoPath, ['config', scope, 'user.name', name]);
      } else {
        await this.execGit(repoPath, ['config', scope, '--unset', 'user.name']);
      }
    }

    if (email !== undefined) {
      if (email) {
        await this.execGit(repoPath, ['config', scope, 'user.email', email]);
      } else {
        await this.execGit(repoPath, ['config', scope, '--unset', 'user.email']);
      }
    }
  }

  /**
   * Check if a path is a git repository
   */
  async isGitRepository(repoPath: string): Promise<boolean> {
    try {
      await this.execGit(repoPath, ['rev-parse', '--git-dir']);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get the repository root path
   */
  async getRepositoryRoot(repoPath: string): Promise<string> {
    const { stdout } = await this.execGit(repoPath, [
      'rev-parse',
      '--show-toplevel',
    ]);
    return stdout.trim();
  }

  /**
   * Get full repository status including staged, unstaged, and untracked files
   */
  async getStatus(projectPath: string): Promise<GitRepoStatus> {
    const isRepo = await this.isGitRepository(projectPath);

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

    const rootPath = await this.getRepositoryRoot(projectPath);
    const currentBranchName = await this.getCurrentBranch(projectPath);

    // Get status using porcelain v2 format
    const { stdout: statusOutput } = await this.execGit(projectPath, [
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
   * Parse git status code to GitFileStatus
   */
  private parseStatusCode(code: string): GitFileStatus {
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
  private async checkRebaseState(projectPath: string): Promise<boolean> {
    try {
      const { stdout } = await this.execGit(projectPath, [
        'rev-parse',
        '--git-path',
        'rebase-merge',
      ]);
      const rebaseMergePath = stdout.trim();

      const { stdout: rebaseApplyOutput } = await this.execGit(projectPath, [
        'rev-parse',
        '--git-path',
        'rebase-apply',
      ]);
      const rebaseApplyPath = rebaseApplyOutput.trim();

      // Check if either rebase directory exists
      const { stdout: lsOutput } = await this.execGit(projectPath, [
        'ls-files',
        '--error-unmatch',
        rebaseMergePath,
      ]).catch(() => ({ stdout: '' }));

      if (lsOutput) return true;

      const { stdout: lsApplyOutput } = await this.execGit(projectPath, [
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
  private async checkMergeState(projectPath: string): Promise<boolean> {
    try {
      const { stdout } = await this.execGit(projectPath, [
        'rev-parse',
        '--git-path',
        'MERGE_HEAD',
      ]);
      const mergePath = stdout.trim();

      // Try to read MERGE_HEAD - if it exists, merge is in progress
      await this.execGit(projectPath, ['cat-file', '-e', `HEAD:${mergePath}`]);
      return true;
    } catch {
      // MERGE_HEAD doesn't exist, no merge in progress
      return false;
    }
  }

  /**
   * Get stash count
   */
  private async getStashCount(projectPath: string): Promise<number> {
    try {
      const { stdout } = await this.execGit(projectPath, ['stash', 'list']);
      if (!stdout.trim()) return 0;
      return stdout.trim().split('\n').filter(Boolean).length;
    } catch {
      return 0;
    }
  }

  /**
   * Stage files for commit
   */
  async stage(projectPath: string, files: string[]): Promise<void> {
    if (files.length === 0) return;

    await this.execGit(projectPath, ['add', '--', ...files]);
  }

  /**
   * Unstage files from the index
   */
  async unstage(projectPath: string, files: string[]): Promise<void> {
    if (files.length === 0) return;

    await this.execGit(projectPath, ['restore', '--staged', '--', ...files]);
  }

  /**
   * Create a commit with the given message
   * @returns The commit hash of the new commit
   */
  async commit(projectPath: string, message: string): Promise<string> {
    await this.execGit(projectPath, ['commit', '-m', message]);

    // Get the hash of the newly created commit
    const { stdout } = await this.execGit(projectPath, ['rev-parse', 'HEAD']);
    return stdout.trim();
  }

  /**
   * Push commits to a remote repository
   */
  async push(
    projectPath: string,
    remote: string = 'origin',
    branch?: string,
  ): Promise<void> {
    const args = ['push', remote];
    if (branch) {
      args.push(branch);
    }
    await this.execGit(projectPath, args);
  }

  /**
   * Pull changes from a remote repository
   */
  async pull(
    projectPath: string,
    remote: string = 'origin',
    branch?: string,
  ): Promise<void> {
    const args = ['pull', remote];
    if (branch) {
      args.push(branch);
    }
    await this.execGit(projectPath, args);
  }

  /**
   * Fetch updates from a remote repository
   */
  async fetch(projectPath: string, remote?: string): Promise<void> {
    const args = ['fetch'];
    if (remote) {
      args.push(remote);
    } else {
      args.push('--all');
    }
    await this.execGit(projectPath, args);
  }

  /**
   * Get diff for the working tree or a specific file
   * @param projectPath - Repository path
   * @param file - Optional specific file to diff
   * @returns The diff output as a string
   */
  async diff(projectPath: string, file?: string): Promise<string> {
    const args = ['diff'];
    if (file) {
      args.push('--', file);
    }
    const { stdout } = await this.execGit(projectPath, args);
    return stdout;
  }
}
