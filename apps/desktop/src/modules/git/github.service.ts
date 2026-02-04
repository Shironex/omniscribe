import { Injectable, Logger } from '@nestjs/common';
import { exec, ExecException, execSync } from 'child_process';
import { promisify } from 'util';
import { existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import {
  GH_TIMEOUT_MS,
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

const execAsync = promisify(exec);

/** Cache TTL for CLI status (1 minute) */
const CACHE_TTL_MS = 60 * 1000;

/** gh environment variables to prevent interactive prompts */
const GH_ENV: Record<string, string> = {
  GH_PROMPT_DISABLED: '1',
  NO_COLOR: '1',
};

interface ExecResult {
  stdout: string;
  stderr: string;
}

interface CliDetectionResult {
  cliPath?: string;
  method: GhCliDetectionMethod | 'none';
}

/**
 * Normalize path separators
 */
function normalizePath(path: string): string {
  return path.replace(/\\/g, '/');
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
    const localAppData =
      process.env['LOCALAPPDATA'] || joinPaths(home, 'AppData/Local');
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
  private readonly logger = new Logger(GithubService.name);
  private cachedStatus: GhCliStatus | null = null;
  private cacheTimestamp: number = 0;
  private pendingStatus: Promise<GhCliStatus> | null = null;

  /**
   * Execute a gh CLI command with timeout and proper environment
   */
  private async execGh(
    repoPath: string,
    args: string[],
    timeoutMs: number = GH_TIMEOUT_MS,
  ): Promise<ExecResult> {
    const command = `gh ${args.join(' ')}`;

    try {
      const result = await execAsync(command, {
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
      const command = platform === 'win32' ? 'where gh' : 'which gh';
      const { stdout } = await execAsync(command);
      // Take first line (Windows 'where' may return multiple results)
      const firstPath = stdout.trim().split('\n')[0]?.trim();
      if (firstPath) {
        return { cliPath: firstPath, method: 'path' };
      }
    } catch {
      // Not in PATH, fall through to check common locations
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
      const { stdout } = await execAsync(`"${cliPath}" --version`, {
        timeout: 5000,
      });
      // Parse version from output like "gh version 2.40.1 (2024-01-15)"
      const match = stdout.match(/gh version ([^\s(]+)/);
      return match ? match[1] : stdout.trim().split('\n')[0];
    } catch {
      return undefined;
    }
  }

  /**
   * Check gh CLI authentication status
   */
  private async checkAuth(cliPath: string): Promise<GhCliAuthStatus> {
    try {
      const { stdout, stderr } = await execAsync(
        `"${cliPath}" auth status`,
        {
          timeout: 10000,
          env: {
            ...process.env,
            ...GH_ENV,
          },
        },
      );
      const output = stdout + stderr;

      // Check if authenticated
      if (output.includes('Logged in to')) {
        // Extract username from output like "Logged in to github.com account username"
        const usernameMatch = output.match(
          /Logged in to [^\s]+ account ([^\s(]+)/,
        );
        const username = usernameMatch ? usernameMatch[1] : undefined;

        // Extract scopes if present
        const scopesMatch = output.match(/Token scopes: ([^\n]+)/);
        const scopes = scopesMatch
          ? scopesMatch[1]
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
          : undefined;

        return { authenticated: true, username, scopes };
      }

      return { authenticated: false };
    } catch (error) {
      // gh auth status returns non-zero exit code when not logged in
      const errorMessage =
        error instanceof Error ? error.message : String(error);

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
        .then((status) => {
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
   * Check if gh CLI is available (quick synchronous check)
   */
  isAvailable(): boolean {
    try {
      const command = process.platform === 'win32' ? 'where gh' : 'which gh';
      execSync(command, { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if repository has a GitHub remote
   */
  async hasGitHubRemote(repoPath: string): Promise<boolean> {
    try {
      const { stdout } = await this.execGh(repoPath, ['repo', 'view', '--json', 'url']);
      const data = JSON.parse(stdout);
      return !!data.url;
    } catch {
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
    } catch {
      return null;
    }
  }

  /**
   * List pull requests
   */
  async listPullRequests(
    repoPath: string,
    options?: ListPullRequestsOptions,
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
    return data.map((pr: Record<string, unknown>) => ({
      number: pr.number,
      title: pr.title,
      body: pr.body || undefined,
      state: (pr.state === 'MERGED' ? 'merged' : (pr.state as string).toLowerCase()) as PullRequestState,
      author: {
        login: (pr.author as Record<string, unknown>)?.login || 'unknown',
        name: (pr.author as Record<string, unknown>)?.name,
      },
      url: pr.url,
      headRefName: pr.headRefName,
      baseRefName: pr.baseRefName,
      isDraft: pr.isDraft || false,
      createdAt: pr.createdAt,
      updatedAt: pr.updatedAt,
      mergedAt: pr.mergedAt || undefined,
    }));
  }

  /**
   * Create a pull request
   */
  async createPullRequest(
    repoPath: string,
    options: CreatePullRequestOptions,
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

    return {
      number: data.number,
      title: data.title,
      body: data.body || undefined,
      state: (data.state === 'MERGED' ? 'merged' : (data.state as string).toLowerCase()) as PullRequestState,
      author: {
        login: data.author?.login || 'unknown',
        name: data.author?.name,
      },
      url: data.url,
      headRefName: data.headRefName,
      baseRefName: data.baseRefName,
      isDraft: data.isDraft || false,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    };
  }

  /**
   * List issues
   */
  async listIssues(
    repoPath: string,
    options?: ListIssuesOptions,
  ): Promise<Issue[]> {
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
    return data.map((issue: Record<string, unknown>) => ({
      number: issue.number,
      title: issue.title,
      body: issue.body || undefined,
      state: (issue.state as string).toLowerCase() as IssueState,
      author: {
        login: (issue.author as Record<string, unknown>)?.login || 'unknown',
        name: (issue.author as Record<string, unknown>)?.name,
      },
      url: issue.url,
      labels: ((issue.labels as Array<Record<string, unknown>>) || []).map(
        (label) => ({
          name: label.name as string,
          color: label.color as string | undefined,
        }),
      ),
      createdAt: issue.createdAt,
      updatedAt: issue.updatedAt,
      closedAt: issue.closedAt || undefined,
    }));
  }

  /**
   * View a specific pull request
   */
  async getPullRequest(
    repoPath: string,
    prNumber: number,
  ): Promise<PullRequest | null> {
    try {
      const { stdout } = await this.execGh(repoPath, [
        'pr',
        'view',
        prNumber.toString(),
        '--json',
        'number,title,body,state,author,url,headRefName,baseRefName,isDraft,createdAt,updatedAt,mergedAt',
      ]);

      const data = JSON.parse(stdout);
      return {
        number: data.number,
        title: data.title,
        body: data.body || undefined,
        state: (data.state === 'MERGED' ? 'merged' : (data.state as string).toLowerCase()) as PullRequestState,
        author: {
          login: data.author?.login || 'unknown',
          name: data.author?.name,
        },
        url: data.url,
        headRefName: data.headRefName,
        baseRefName: data.baseRefName,
        isDraft: data.isDraft || false,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
        mergedAt: data.mergedAt || undefined,
      };
    } catch {
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
      return {
        number: data.number,
        title: data.title,
        body: data.body || undefined,
        state: (data.state as string).toLowerCase() as IssueState,
        author: {
          login: data.author?.login || 'unknown',
          name: data.author?.name,
        },
        url: data.url,
        labels: (data.labels || []).map(
          (label: Record<string, unknown>) => ({
            name: label.name as string,
            color: label.color as string | undefined,
          }),
        ),
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
        closedAt: data.closedAt || undefined,
      };
    } catch {
      return null;
    }
  }
}
