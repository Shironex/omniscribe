import { Injectable } from '@nestjs/common';
import { exec, ExecException } from 'child_process';
import { promisify } from 'util';
import {
  BranchInfo,
  CommitInfo,
  RemoteInfo,
  GitUserConfig,
  GIT_TIMEOUT_MS,
} from '@omniscribe/shared';
import type {
  GitRepoStatus,
  GitFileChange,
  GitFileStatus,
} from '@omniscribe/shared';

const execAsync = promisify(exec);

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
   * Uses 'git branch -a' with custom format for reliable cross-platform results.
   * Falls back to simpler parsing if the format option fails.
   */
  async getBranches(repoPath: string): Promise<BranchInfo[]> {
    const branches: BranchInfo[] = [];

    // Get current branch first
    const currentBranch = await this.getCurrentBranch(repoPath);

    // Try using git branch -a with format (like maestro does)
    // Format: %(HEAD)|%(refname:short)|%(refname:rstrip=-2)
    // %(HEAD) = * if current, empty otherwise
    // %(refname:short) = branch name
    // %(refname:rstrip=-2) = "remotes" for remote branches, empty for local
    // Note: Double quotes around format string for Windows compatibility (prevents % variable expansion)
    const { stdout: branchOutput } = await this.execGit(repoPath, [
      'branch',
      '-a',
      '--no-color',
      '--format="%(HEAD)|%(refname:short)|%(refname:rstrip=-2)"',
    ]);

    // Parse branches from git branch -a output
    for (const line of branchOutput.split('\n')) {
      if (!line.trim()) continue;

      // Remove surrounding quotes that may be present on Windows
      const cleanLine = line.trim().replace(/^["']|["']$/g, '');
      if (!cleanLine) continue;

      const parts = cleanLine.split('|');
      if (parts.length < 2) {
        continue;
      }

      const isCurrent = parts[0].trim() === '*';
      // Also clean individual parts in case quotes are embedded
      const name = parts[1].trim().replace(/^["']|["']$/g, '');
      const refType = (parts[2]?.trim() || '').replace(/^["']|["']$/g, '');

      // Remote branches have refType containing 'remotes' (e.g., 'refs/remotes')
      const isRemote = refType.includes('remotes');

      // Skip HEAD pointer entries like "origin/HEAD" or detached HEAD entries
      // Also skip remote entries that are just the remote name (e.g., "origin" which is refs/remotes/origin/HEAD)
      if (name === 'HEAD' || name.endsWith('/HEAD') || name.startsWith('(HEAD detached')) {
        continue;
      }
      // Skip symbolic refs: for remote branches, name should contain "/" (e.g., "origin/main")
      if (isRemote && !name.includes('/')) {
        continue;
      }

      const branch: BranchInfo = {
        name,
        isCurrent: isCurrent || name === currentBranch,
        isRemote,
      };

      if (isRemote) {
        const remoteParts = name.split('/');
        branch.remote = remoteParts[0];
      }

      branches.push(branch);
    }

    // If git branch -a returned results, enrich local branches with tracking info
    if (branches.length > 0) {
      await this.enrichBranchesWithTrackingInfo(repoPath, branches, currentBranch);
    } else {
      // Fallback: try for-each-ref directly
      const fallbackBranches = await this.getBranchesWithForEachRef(repoPath, currentBranch);
      branches.push(...fallbackBranches);
    }

    return branches;
  }

  /**
   * Enrich branches with commit info and tracking info using for-each-ref
   */
  private async enrichBranchesWithTrackingInfo(
    repoPath: string,
    branches: BranchInfo[],
    _currentBranch: string,
  ): Promise<void> {
    try {
      // Get local branch details
      // Note: Double quotes around format string for Windows compatibility (prevents % variable expansion)
      const { stdout: localRefOutput } = await this.execGit(repoPath, [
        'for-each-ref',
        '--format="%(refname:short)|%(objectname:short)|%(subject)|%(upstream:short)|%(upstream:track)"',
        'refs/heads/',
      ]);

      const localRefMap = new Map<string, {
        hash: string;
        message: string;
        upstream: string;
        track: string;
      }>();

      for (const line of localRefOutput.split('\n')) {
        if (!line.trim()) continue;
        // Remove surrounding quotes that may be present on Windows
        const cleanLine = line.trim().replace(/^["']|["']$/g, '');
        if (!cleanLine) continue;
        const [name, hash, message, upstream, track] = cleanLine.split('|');
        if (name) {
          localRefMap.set(name.trim(), {
            hash: hash || '',
            message: message || '',
            upstream: upstream || '',
            track: (track || '').replace(/["']$/g, ''), // Remove trailing quote if present
          });
        }
      }

      // Get remote branch details
      // Note: Double quotes around format string for Windows compatibility (prevents % variable expansion)
      const { stdout: remoteRefOutput } = await this.execGit(repoPath, [
        'for-each-ref',
        '--format="%(refname:short)|%(objectname:short)|%(subject)"',
        'refs/remotes/',
      ]);

      const remoteRefMap = new Map<string, { hash: string; message: string }>();

      for (const line of remoteRefOutput.split('\n')) {
        if (!line.trim()) continue;
        // Remove surrounding quotes that may be present on Windows
        const cleanLine = line.trim().replace(/^["']|["']$/g, '');
        if (!cleanLine) continue;
        const [name, hash, message] = cleanLine.split('|');
        if (name && !name.includes('/HEAD')) {
          remoteRefMap.set(name.trim(), {
            hash: hash || '',
            message: (message || '').replace(/["']$/g, ''), // Remove trailing quote if present
          });
        }
      }

      // Enrich branch info
      for (const branch of branches) {
        if (branch.isRemote) {
          const refInfo = remoteRefMap.get(branch.name);
          if (refInfo) {
            branch.lastCommitHash = refInfo.hash;
            branch.lastCommitMessage = refInfo.message;
          }
        } else {
          const refInfo = localRefMap.get(branch.name);
          if (refInfo) {
            branch.lastCommitHash = refInfo.hash;
            branch.lastCommitMessage = refInfo.message;

            if (refInfo.upstream) {
              const remoteParts = refInfo.upstream.split('/');
              branch.remote = remoteParts[0];
              branch.upstream = refInfo.upstream;

              // Parse tracking info (e.g., "[ahead 2, behind 1]")
              if (refInfo.track) {
                const aheadMatch = refInfo.track.match(/ahead (\d+)/);
                const behindMatch = refInfo.track.match(/behind (\d+)/);
                if (aheadMatch) branch.ahead = parseInt(aheadMatch[1], 10);
                if (behindMatch) branch.behind = parseInt(behindMatch[1], 10);
              }
            }
          }
        }
      }
    } catch {
      // Continue without enrichment - basic branch info is still useful
    }
  }

  /**
   * Fallback: Get branches using for-each-ref directly
   */
  private async getBranchesWithForEachRef(
    repoPath: string,
    currentBranch: string,
  ): Promise<BranchInfo[]> {
    const branches: BranchInfo[] = [];

    // Get local branches
    // Note: Double quotes around format string for Windows compatibility (prevents % variable expansion)
    const { stdout: localOutput } = await this.execGit(repoPath, [
      'for-each-ref',
      '--format="%(refname:short)|%(objectname:short)|%(subject)|%(upstream:short)|%(upstream:track)"',
      'refs/heads/',
    ]);

    for (const line of localOutput.split('\n')) {
      if (!line.trim()) continue;

      // Remove surrounding quotes that may be present on Windows
      const cleanLine = line.trim().replace(/^["']|["']$/g, '');
      if (!cleanLine) continue;

      const [name, hash, message, upstream, track] = cleanLine.split('|');
      if (!name) continue;

      const branch: BranchInfo = {
        name: name.trim(),
        isCurrent: name.trim() === currentBranch,
        isRemote: false,
        lastCommitHash: hash || undefined,
        lastCommitMessage: message || undefined,
      };

      if (upstream) {
        const remoteParts = upstream.split('/');
        branch.remote = remoteParts[0];
        branch.upstream = upstream;

        // Clean track value of any trailing quotes
        const cleanTrack = (track || '').replace(/["']$/g, '');
        if (cleanTrack) {
          const aheadMatch = cleanTrack.match(/ahead (\d+)/);
          const behindMatch = cleanTrack.match(/behind (\d+)/);
          if (aheadMatch) branch.ahead = parseInt(aheadMatch[1], 10);
          if (behindMatch) branch.behind = parseInt(behindMatch[1], 10);
        }
      }

      branches.push(branch);
    }

    // Get remote branches
    // Note: Double quotes around format string for Windows compatibility (prevents % variable expansion)
    const { stdout: remoteOutput } = await this.execGit(repoPath, [
      'for-each-ref',
      '--format="%(refname:short)|%(objectname:short)|%(subject)"',
      'refs/remotes/',
    ]);

    for (const line of remoteOutput.split('\n')) {
      if (!line.trim() || line.includes('/HEAD')) continue;

      // Remove surrounding quotes that may be present on Windows
      const cleanLine = line.trim().replace(/^["']|["']$/g, '');
      if (!cleanLine || cleanLine.includes('/HEAD')) continue;

      const [name, hash, message] = cleanLine.split('|');
      if (!name) continue;

      const remoteParts = name.split('/');

      branches.push({
        name: name.trim(),
        isCurrent: false,
        isRemote: true,
        remote: remoteParts[0],
        lastCommitHash: hash || undefined,
        lastCommitMessage: (message || '').replace(/["']$/g, '') || undefined, // Remove trailing quote if present
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
    // Note: Double quotes around format string for Windows compatibility (prevents % variable expansion)
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
      `--format="${format}"`,
      `-n${limit}`,
      '--date=iso-strict',
    ];

    if (allBranches) {
      args.push('--all');
    }

    const { stdout } = await this.execGit(repoPath, args);

    for (const entry of stdout.trim().split('\n')) {
      if (!entry) continue;

      // Remove surrounding quotes that may be present on Windows
      const cleanEntry = entry.replace(/^["']|["']$/g, '');
      if (!cleanEntry) continue;

      const parts = cleanEntry.split('\x00');
      if (parts.length < 12) continue;

      // First and last elements may have quotes on Windows
      const hash = parts[0].replace(/^["']/, '');
      const shortHash = parts[1];
      const subject = parts[2];
      const body = parts[3];
      const authorName = parts[4];
      const authorEmail = parts[5];
      const authorDate = parts[6];
      const committerName = parts[7];
      const committerEmail = parts[8];
      const commitDate = parts[9];
      const parents = parts[10];
      const refs = parts[11].replace(/["']$/, ''); // Remove trailing quote if present

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
