import { Injectable } from '@nestjs/common';
import { BranchInfo, createLogger } from '@omniscribe/shared';
import { GitBaseService } from './git-base.service';

/**
 * Security: Validate git branch/ref names
 * Git ref names have specific rules about what characters are allowed
 * See: https://git-scm.com/docs/git-check-ref-format
 */
function isValidGitRefName(name: string): boolean {
  if (!name || name.length === 0 || name.length > 255) {
    return false;
  }

  // Cannot start or end with a slash, or contain consecutive slashes
  if (name.startsWith('/') || name.endsWith('/') || name.includes('//')) {
    return false;
  }

  // Cannot start with a dot or end with .lock
  if (name.startsWith('.') || name.endsWith('.lock')) {
    return false;
  }

  // Cannot contain special sequences
  const invalidPatterns = [
    '..', // Two consecutive dots
    '@{', // Reflog syntax
    '\\', // Backslash
    '\x00', // Null byte
  ];

  for (const pattern of invalidPatterns) {
    if (name.includes(pattern)) {
      return false;
    }
  }

  // Cannot contain ASCII control characters, space, tilde, caret, colon, question, asterisk, or open bracket
  // Allow: alphanumeric, dash, underscore, dot, slash (for remote branches)
  const validPattern = /^[a-zA-Z0-9._\-/]+$/;
  if (!validPattern.test(name)) {
    return false;
  }

  // Cannot be empty component (e.g., "foo//bar" is invalid)
  const components = name.split('/');
  for (const component of components) {
    if (component.length === 0 || component.startsWith('.') || component.endsWith('.lock')) {
      return false;
    }
  }

  return true;
}

/**
 * Remove surrounding quotes from git output line and trim whitespace.
 * Git format strings wrapped in double quotes for Windows compatibility
 * may produce quoted output lines.
 */
function cleanGitOutputLine(line: string): string {
  return line.trim().replace(/^["']|["']$/g, '');
}

/**
 * Remove trailing quote from a pipe-delimited field value.
 * The last field in a git format string may retain a trailing quote
 * after splitting on '|'.
 */
function cleanTrailingQuote(value: string): string {
  return value.replace(/["']$/g, '');
}

/**
 * Parse ahead/behind tracking info from git upstream:track output.
 * Input format: "[ahead 2, behind 1]" or "[ahead 3]" or "[behind 1]"
 */
function parseBranchTrackingInfo(track: string): { ahead?: number; behind?: number } {
  const result: { ahead?: number; behind?: number } = {};
  const aheadMatch = track.match(/ahead (\d+)/);
  const behindMatch = track.match(/behind (\d+)/);
  if (aheadMatch) result.ahead = parseInt(aheadMatch[1], 10);
  if (behindMatch) result.behind = parseInt(behindMatch[1], 10);
  return result;
}

/**
 * Null byte delimiter for for-each-ref format strings.
 * Using %x00 (null byte) instead of pipe to avoid breakage when commit
 * messages contain '|'.
 */
const DELIM = '\x00';

/**
 * for-each-ref format for local branches with tracking info.
 * Double quotes for Windows compatibility (prevents % variable expansion).
 * Uses null byte (%x00) as delimiter to avoid pipe-in-subject breakage.
 */
const LOCAL_REF_FORMAT =
  '"%(refname:short)%x00%(objectname:short)%x00%(subject)%x00%(upstream:short)%x00%(upstream:track)"';

/**
 * for-each-ref format for remote branches (no tracking info).
 * Double quotes for Windows compatibility (prevents % variable expansion).
 * Uses null byte (%x00) as delimiter to avoid pipe-in-subject breakage.
 */
const REMOTE_REF_FORMAT = '"%(refname:short)%x00%(objectname:short)%x00%(subject)"';

/** Parsed local ref fields from a for-each-ref line */
interface LocalRefInfo {
  hash: string;
  message: string;
  upstream: string;
  track: string;
}

/** Parsed remote ref fields from a for-each-ref line */
interface RemoteRefInfo {
  hash: string;
  message: string;
}

/**
 * Parse local branch refs from for-each-ref output into a Map.
 */
function parseLocalRefs(output: string): Map<string, LocalRefInfo> {
  const refMap = new Map<string, LocalRefInfo>();

  for (const line of output.split('\n')) {
    if (!line.trim()) continue;
    const cleanLine = cleanGitOutputLine(line);
    if (!cleanLine) continue;
    const [name, hash, message, upstream, track] = cleanLine.split(DELIM);
    if (name) {
      refMap.set(name.trim(), {
        hash: hash || '',
        message: message || '',
        upstream: upstream || '',
        track: cleanTrailingQuote(track || ''),
      });
    }
  }

  return refMap;
}

/**
 * Parse remote branch refs from for-each-ref output into a Map.
 */
function parseRemoteRefs(output: string): Map<string, RemoteRefInfo> {
  const refMap = new Map<string, RemoteRefInfo>();

  for (const line of output.split('\n')) {
    if (!line.trim()) continue;
    const cleanLine = cleanGitOutputLine(line);
    if (!cleanLine) continue;
    const [name, hash, message] = cleanLine.split(DELIM);
    if (name && !name.includes('/HEAD')) {
      refMap.set(name.trim(), {
        hash: hash || '',
        message: cleanTrailingQuote(message || ''),
      });
    }
  }

  return refMap;
}

/**
 * Apply tracking info from a LocalRefInfo to a BranchInfo.
 */
function applyTrackingInfo(branch: BranchInfo, refInfo: LocalRefInfo): void {
  branch.lastCommitHash = refInfo.hash || undefined;
  branch.lastCommitMessage = refInfo.message || undefined;

  if (refInfo.upstream) {
    const remoteParts = refInfo.upstream.split('/');
    branch.remote = remoteParts[0];
    branch.upstream = refInfo.upstream;

    if (refInfo.track) {
      const tracking = parseBranchTrackingInfo(refInfo.track);
      if (tracking.ahead !== undefined) branch.ahead = tracking.ahead;
      if (tracking.behind !== undefined) branch.behind = tracking.behind;
    }
  }
}

@Injectable()
export class GitBranchService {
  private readonly logger = createLogger('GitBranchService');

  constructor(private readonly gitBase: GitBaseService) {}

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
    const { stdout: branchOutput } = await this.gitBase.execGit(repoPath, [
      'branch',
      '-a',
      '--no-color',
      '--format="%(HEAD)|%(refname:short)|%(refname:rstrip=-2)"',
    ]);

    // Parse branches from git branch -a output
    for (const line of branchOutput.split('\n')) {
      if (!line.trim()) continue;

      // Remove surrounding quotes that may be present on Windows
      const cleanLine = cleanGitOutputLine(line);
      if (!cleanLine) continue;

      const parts = cleanLine.split('|');
      if (parts.length < 2) {
        continue;
      }

      const isCurrent = parts[0].trim() === '*';
      // Also clean individual parts in case quotes are embedded
      const name = cleanGitOutputLine(parts[1]);
      const refType = cleanGitOutputLine(parts[2] ?? '');

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
  async enrichBranchesWithTrackingInfo(
    repoPath: string,
    branches: BranchInfo[],
    _currentBranch: string
  ): Promise<void> {
    try {
      const { stdout: localRefOutput } = await this.gitBase.execGit(repoPath, [
        'for-each-ref',
        `--format=${LOCAL_REF_FORMAT}`,
        'refs/heads/',
      ]);
      const localRefMap = parseLocalRefs(localRefOutput);

      const { stdout: remoteRefOutput } = await this.gitBase.execGit(repoPath, [
        'for-each-ref',
        `--format=${REMOTE_REF_FORMAT}`,
        'refs/remotes/',
      ]);
      const remoteRefMap = parseRemoteRefs(remoteRefOutput);

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
            applyTrackingInfo(branch, refInfo);
          }
        }
      }
    } catch (error) {
      this.logger.debug('Failed to enrich branches with tracking info:', error);
      // Continue without enrichment - basic branch info is still useful
    }
  }

  /**
   * Fallback: Get branches using for-each-ref directly
   */
  async getBranchesWithForEachRef(repoPath: string, currentBranch: string): Promise<BranchInfo[]> {
    const branches: BranchInfo[] = [];

    // Get local branches
    const { stdout: localOutput } = await this.gitBase.execGit(repoPath, [
      'for-each-ref',
      `--format=${LOCAL_REF_FORMAT}`,
      'refs/heads/',
    ]);
    const localRefMap = parseLocalRefs(localOutput);

    for (const [name, refInfo] of localRefMap) {
      const branch: BranchInfo = {
        name,
        isCurrent: name === currentBranch,
        isRemote: false,
        lastCommitHash: refInfo.hash || undefined,
        lastCommitMessage: refInfo.message || undefined,
      };

      applyTrackingInfo(branch, refInfo);
      branches.push(branch);
    }

    // Get remote branches
    const { stdout: remoteOutput } = await this.gitBase.execGit(repoPath, [
      'for-each-ref',
      `--format=${REMOTE_REF_FORMAT}`,
      'refs/remotes/',
    ]);
    const remoteRefMap = parseRemoteRefs(remoteOutput);

    for (const [name, refInfo] of remoteRefMap) {
      const remoteParts = name.split('/');

      branches.push({
        name,
        isCurrent: false,
        isRemote: true,
        remote: remoteParts[0],
        lastCommitHash: refInfo.hash || undefined,
        lastCommitMessage: refInfo.message || undefined,
      });
    }

    return branches;
  }

  /**
   * Get the current branch name
   */
  async getCurrentBranch(repoPath: string): Promise<string> {
    const { stdout } = await this.gitBase.execGit(repoPath, ['rev-parse', '--abbrev-ref', 'HEAD']);
    return stdout.trim();
  }

  /**
   * Checkout a branch
   */
  async checkout(repoPath: string, branch: string): Promise<void> {
    // Security: Validate branch name to prevent injection
    if (!isValidGitRefName(branch)) {
      this.logger.warn(`Rejected invalid branch name for checkout: ${branch}`);
      throw new Error(`Invalid branch name: ${branch}`);
    }
    this.logger.debug(`Checking out branch "${branch}" in ${repoPath}`);
    await this.gitBase.execGit(repoPath, ['checkout', branch]);
  }

  /**
   * Create a new branch
   */
  async createBranch(repoPath: string, name: string, startPoint?: string): Promise<void> {
    // Security: Validate branch name to prevent injection
    if (!isValidGitRefName(name)) {
      this.logger.warn(`Rejected invalid branch name for create: ${name}`);
      throw new Error(`Invalid branch name: ${name}`);
    }
    if (startPoint && !isValidGitRefName(startPoint)) {
      this.logger.warn(`Rejected invalid start point: ${startPoint}`);
      throw new Error(`Invalid start point: ${startPoint}`);
    }

    this.logger.debug(
      `Creating branch "${name}" in ${repoPath}${startPoint ? ` from ${startPoint}` : ''}`
    );
    const args = ['checkout', '-b', name];
    if (startPoint) {
      args.push(startPoint);
    }
    await this.gitBase.execGit(repoPath, args);
  }
}
