import { Injectable } from '@nestjs/common';
import { execFile, ExecException } from 'child_process';
import { promisify } from 'util';
import { existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import {
  GH_TIMEOUT_MS,
  createLogger,
  normalizePath,
  extractErrorMessage,
} from '@omniscribe/shared';
import type {
  GhCliStatus,
  GhCliAuthStatus,
  GhCliDetectionMethod,
  PullRequest,
  PullRequestState,
  ListPullRequestsOptions,
  CreatePullRequestOptions,
  Issue,
  IssueState,
  ListIssuesOptions,
  RepoInfo,
} from '@omniscribe/shared';
import type { ExecResult } from './git-base.service';

const execFileAsync = promisify(execFile);

/** Cache TTL for CLI status (1 minute) */
const CACHE_TTL_MS = 60 * 1000;

/** gh environment variables to prevent interactive prompts */
const GH_ENV: Record<string, string> = {
  GH_PROMPT_DISABLED: '1',
  NO_COLOR: '1',
};

interface CliDetectionResult {
  cliPath?: string;
  method: GhCliDetectionMethod | 'none';
}

/**
 * Join paths and normalize
 */
function joinPaths(...paths: string[]): string {
  return normalizePath(join(...paths));
}

/**
 * Get common gh CLI installation paths (cross-platform)
 */
function getGhCliPaths(): string[] {
  const home = normalizePath(homedir());
  const isWindows = process.platform === 'win32';

  if (isWindows) {
    const programFiles = process.env['ProgramFiles'] || 'C:\\Program Files';
    const localAppData = process.env['LOCALAPPDATA'] || joinPaths(home, 'AppData/Local');
    return [
      joinPaths(programFiles, 'GitHub CLI/gh.exe'),
      joinPaths(localAppData, 'Programs/GitHub CLI/gh.exe'),
      joinPaths(home, 'scoop/shims/gh.exe'),
      joinPaths(home, '.local/bin/gh.exe'),
    ];
  }

  // macOS and Linux
  const isMac = process.platform === 'darwin';
  const isLinux = process.platform === 'linux';
  return [
    '/usr/local/bin/gh',
    '/usr/bin/gh',
    ...(isMac ? ['/opt/homebrew/bin/gh'] : []),
    joinPaths(home, '.local/bin/gh'),
    ...(isLinux ? ['/snap/bin/gh'] : []),
  ];
}

@Injectable()
export class GithubService {
  private readonly logger = createLogger('GithubService');
  private cachedStatus: GhCliStatus | null = null;
  private cacheTimestamp: number = 0;
  private pendingStatus: Promise<GhCliStatus> | null = null;

  /**
   * Execute a gh CLI command with timeout and proper environment
   */
  private async execGh(
    repoPath: string,
    args: string[],
    timeoutMs: number = GH_TIMEOUT_MS
  ): Promise<ExecResult> {
    const command = `gh ${args.join(' ')}`;

    try {
      const result = await execFileAsync('gh', args, {
        cwd: repoPath,
        timeout: timeoutMs,
        env: {
          ...process.env,
          ...GH_ENV,
        },
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer
      });

      return {
        stdout: result.stdout,
        stderr: result.stderr,
      };
    } catch (error) {
      const execError = error as ExecException & {
        stdout?: string;
        stderr?: string;
      };

      // Check for timeout
      if (execError.killed) {
        throw new Error(`gh command timed out after ${timeoutMs}ms: ${command}`);
      }

      // Return stdout/stderr even on non-zero exit codes
      if (execError.stdout !== undefined || execError.stderr !== undefined) {
        return {
          stdout: execError.stdout ?? '',
          stderr: execError.stderr ?? '',
        };
      }

      throw new Error(`gh command failed: ${execError.message}`);
    }
  }

  /**
   * Find gh CLI installation
   */
  private async findCli(): Promise<CliDetectionResult> {
    const platform = process.platform;

    // Try to find CLI in PATH first
    try {
      const whichCmd = platform === 'win32' ? 'where' : '/usr/bin/which';
      const { stdout } = await execFileAsync(whichCmd, ['gh']);
      // Take first line (Windows 'where' may return multiple results)
      const firstPath = stdout.trim().split('\n')[0]?.trim();
      if (firstPath) {
        return { cliPath: firstPath, method: 'path' };
      }
    } catch (error) {
      this.logger.debug('gh CLI not found in PATH, checking common locations', error);
    }

    // Check common installation locations
    const localPaths = getGhCliPaths();
    for (const localPath of localPaths) {
      if (existsSync(localPath)) {
        return { cliPath: localPath, method: 'local' };
      }
    }

    return { method: 'none' };
  }

  /**
   * Get gh CLI version
   */
  private async getVersion(cliPath: string): Promise<string | undefined> {
    try {
      const { stdout } = await execFileAsync(cliPath, ['--version'], {
        timeout: 5000,
      });
      // Parse version from output like "gh version 2.40.1 (2024-01-15)"
      const match = stdout.match(/gh version ([^\s(]+)/);
      return match ? match[1] : stdout.trim().split('\n')[0];
    } catch (error) {
      this.logger.debug('Failed to get gh CLI version', error);
      return undefined;
    }
  }

  /**
   * Check gh CLI authentication status
   */
  private async checkAuth(cliPath: string): Promise<GhCliAuthStatus> {
    try {
      const { stdout, stderr } = await execFileAsync(cliPath, ['auth', 'status'], {
        timeout: 10000,
        env: {
          ...process.env,
          ...GH_ENV,
        },
      });
      const output = stdout + stderr;

      // Check if authenticated
      if (output.includes('Logged in to')) {
        // Extract username from output like "Logged in to github.com account username"
        const usernameMatch = output.match(/Logged in to [^\s]+ account ([^\s(]+)/);
        const username = usernameMatch ? usernameMatch[1] : undefined;

        // Extract scopes if present
        const scopesMatch = output.match(/Token scopes: ([^\n]+)/);
        const scopes = scopesMatch
          ? scopesMatch[1]
              .split(',')
              .map(s => s.trim())
              .filter(Boolean)
          : undefined;

        return { authenticated: true, username, scopes };
      }

      return { authenticated: false };
    } catch (error) {
      // gh auth status returns non-zero exit code when not logged in
      const errorMessage = extractErrorMessage(error);

      // Check if the error message indicates not logged in vs actual error
      if (
        errorMessage.includes('not logged in') ||
        errorMessage.includes('no authentication') ||
        errorMessage.includes('You are not logged')
      ) {
        return { authenticated: false };
      }

      // Handle timeout errors gracefully
      const execError = error as { killed?: boolean; signal?: string };
      if (execError.killed || execError.signal === 'SIGTERM') {
        this.logger.warn('gh auth check timed out');
        return { authenticated: false };
      }

      // Log unexpected errors but return unauthenticated
      this.logger.warn('Failed to check gh auth status', error);
      return { authenticated: false };
    }
  }

  /**
   * Get gh CLI status (with caching)
   */
  async getStatus(): Promise<GhCliStatus> {
    const now = Date.now();
    if (this.cachedStatus && now - this.cacheTimestamp < CACHE_TTL_MS) {
      return this.cachedStatus;
    }

    // Use pending promise pattern to prevent race conditions
    if (!this.pendingStatus) {
      this.pendingStatus = this.fetchStatus()
        .then(status => {
          this.cachedStatus = status;
          this.cacheTimestamp = Date.now();
          return status;
        })
        .finally(() => {
          this.pendingStatus = null;
        });
    }
    return this.pendingStatus;
  }

  /**
   * Fetch fresh gh CLI status
   */
  private async fetchStatus(): Promise<GhCliStatus> {
    const platform = process.platform;
    const arch = process.arch;

    const { cliPath, method } = await this.findCli();

    if (!cliPath || method === 'none') {
      return {
        installed: false,
        platform,
        arch,
        auth: { authenticated: false },
      };
    }

    const version = await this.getVersion(cliPath);
    const auth = await this.checkAuth(cliPath);

    return {
      installed: true,
      path: cliPath,
      version,
      method,
      platform,
      arch,
      auth,
    };
  }

  /**
   * Clear cached status (force refresh)
   */
  clearCache(): void {
    this.cachedStatus = null;
    this.cacheTimestamp = 0;
  }

  /**
   * Check if repository has a GitHub remote
   */
  async hasGitHubRemote(repoPath: string): Promise<boolean> {
    try {
      const { stdout } = await this.execGh(repoPath, ['repo', 'view', '--json', 'url']);
      const data = JSON.parse(stdout);
      return !!data.url;
    } catch (error) {
      this.logger.debug('Failed to check GitHub remote', error);
      return false;
    }
  }

  /**
   * Get repository information
   */
  async getRepoInfo(repoPath: string): Promise<RepoInfo | null> {
    try {
      const { stdout } = await this.execGh(repoPath, [
        'repo',
        'view',
        '--json',
        'name,nameWithOwner,description,url,defaultBranchRef,visibility,isFork,isArchived',
      ]);

      const data = JSON.parse(stdout);
      return {
        name: data.name,
        fullName: data.nameWithOwner,
        description: data.description || undefined,
        url: data.url,
        defaultBranch: data.defaultBranchRef?.name || 'main',
        visibility: data.visibility?.toLowerCase() || 'public',
        isFork: data.isFork || false,
        isArchived: data.isArchived || false,
      };
    } catch (error) {
      this.logger.debug('Failed to get repo info:', error);
      return null;
    }
  }

  /**
   * List pull requests
   */
  async listPullRequests(
    repoPath: string,
    options?: ListPullRequestsOptions
  ): Promise<PullRequest[]> {
    const args = [
      'pr',
      'list',
      '--json',
      'number,title,body,state,author,url,headRefName,baseRefName,isDraft,createdAt,updatedAt,mergedAt',
    ];

    if (options?.state && options.state !== 'all') {
      args.push('--state', options.state);
    }

    if (options?.limit) {
      args.push('--limit', options.limit.toString());
    }

    const { stdout } = await this.execGh(repoPath, args);

    if (!stdout.trim()) {
      return [];
    }

    const data = JSON.parse(stdout);
    return data.map((pr: Record<string, unknown>) => this.mapPullRequest(pr));
  }

  /**
   * Create a pull request
   */
  async createPullRequest(
    repoPath: string,
    options: CreatePullRequestOptions
  ): Promise<PullRequest> {
    const args = [
      'pr',
      'create',
      '--json',
      'number,title,body,state,author,url,headRefName,baseRefName,isDraft,createdAt,updatedAt',
      '--title',
      options.title,
    ];

    if (options.body) {
      args.push('--body', options.body);
    }

    if (options.base) {
      args.push('--base', options.base);
    }

    if (options.head) {
      args.push('--head', options.head);
    }

    if (options.draft) {
      args.push('--draft');
    }

    const { stdout } = await this.execGh(repoPath, args);
    const data = JSON.parse(stdout);

    return this.mapPullRequest(data);
  }

  /**
   * List issues
   */
  async listIssues(repoPath: string, options?: ListIssuesOptions): Promise<Issue[]> {
    const args = [
      'issue',
      'list',
      '--json',
      'number,title,body,state,author,url,labels,createdAt,updatedAt,closedAt',
    ];

    if (options?.state && options.state !== 'all') {
      args.push('--state', options.state);
    }

    if (options?.limit) {
      args.push('--limit', options.limit.toString());
    }

    if (options?.labels && options.labels.length > 0) {
      args.push('--label', options.labels.join(','));
    }

    const { stdout } = await this.execGh(repoPath, args);

    if (!stdout.trim()) {
      return [];
    }

    const data = JSON.parse(stdout);
    return data.map((issue: Record<string, unknown>) => this.mapIssue(issue));
  }

  /**
   * View a specific pull request
   */
  async getPullRequest(repoPath: string, prNumber: number): Promise<PullRequest | null> {
    try {
      const { stdout } = await this.execGh(repoPath, [
        'pr',
        'view',
        prNumber.toString(),
        '--json',
        'number,title,body,state,author,url,headRefName,baseRefName,isDraft,createdAt,updatedAt,mergedAt',
      ]);

      const data = JSON.parse(stdout);
      return this.mapPullRequest(data);
    } catch (error) {
      this.logger.debug(`Failed to get PR #${prNumber}:`, error);
      return null;
    }
  }

  /**
   * View a specific issue
   */
  async getIssue(repoPath: string, issueNumber: number): Promise<Issue | null> {
    try {
      const { stdout } = await this.execGh(repoPath, [
        'issue',
        'view',
        issueNumber.toString(),
        '--json',
        'number,title,body,state,author,url,labels,createdAt,updatedAt,closedAt',
      ]);

      const data = JSON.parse(stdout);
      return this.mapIssue(data);
    } catch (error) {
      this.logger.debug(`Failed to get issue #${issueNumber}:`, error);
      return null;
    }
  }

  /**
   * Map raw gh CLI JSON output to a typed PullRequest object.
   * Includes runtime validation to guard against unexpected CLI output shapes.
   */
  private mapPullRequest(pr: Record<string, unknown>): PullRequest {
    if (typeof pr.number !== 'number' || typeof pr.title !== 'string') {
      this.logger.warn('Unexpected PR shape from gh CLI:', JSON.stringify(pr).slice(0, 200));
    }

    const author = pr.author as Record<string, unknown> | null | undefined;
    const stateRaw = typeof pr.state === 'string' ? pr.state : 'open';

    return {
      number: typeof pr.number === 'number' ? pr.number : 0,
      title: typeof pr.title === 'string' ? pr.title : '',
      body: typeof pr.body === 'string' ? pr.body : undefined,
      state: (stateRaw === 'MERGED' ? 'merged' : stateRaw.toLowerCase()) as PullRequestState,
      author: {
        login: typeof author?.login === 'string' ? author.login : 'unknown',
        name: typeof author?.name === 'string' ? author.name : undefined,
      },
      url: typeof pr.url === 'string' ? pr.url : '',
      headRefName: typeof pr.headRefName === 'string' ? pr.headRefName : '',
      baseRefName: typeof pr.baseRefName === 'string' ? pr.baseRefName : '',
      isDraft: typeof pr.isDraft === 'boolean' ? pr.isDraft : false,
      createdAt: typeof pr.createdAt === 'string' ? pr.createdAt : '',
      updatedAt: typeof pr.updatedAt === 'string' ? pr.updatedAt : '',
      mergedAt: typeof pr.mergedAt === 'string' ? pr.mergedAt : undefined,
    };
  }

  /**
   * Map raw gh CLI JSON output to a typed Issue object.
   * Includes runtime validation to guard against unexpected CLI output shapes.
   */
  private mapIssue(issue: Record<string, unknown>): Issue {
    if (typeof issue.number !== 'number' || typeof issue.title !== 'string') {
      this.logger.warn('Unexpected issue shape from gh CLI:', JSON.stringify(issue).slice(0, 200));
    }

    const author = issue.author as Record<string, unknown> | null | undefined;
    const labels = Array.isArray(issue.labels) ? issue.labels : [];

    return {
      number: typeof issue.number === 'number' ? issue.number : 0,
      title: typeof issue.title === 'string' ? issue.title : '',
      body: typeof issue.body === 'string' ? issue.body : undefined,
      state: (typeof issue.state === 'string' ? issue.state.toLowerCase() : 'open') as IssueState,
      author: {
        login: typeof author?.login === 'string' ? author.login : 'unknown',
        name: typeof author?.name === 'string' ? author.name : undefined,
      },
      url: typeof issue.url === 'string' ? issue.url : '',
      labels: labels.map((label: Record<string, unknown>) => ({
        name: typeof label.name === 'string' ? label.name : '',
        color: typeof label.color === 'string' ? label.color : undefined,
      })),
      createdAt: typeof issue.createdAt === 'string' ? issue.createdAt : '',
      updatedAt: typeof issue.updatedAt === 'string' ? issue.updatedAt : '',
      closedAt: typeof issue.closedAt === 'string' ? issue.closedAt : undefined,
    };
  }
}
