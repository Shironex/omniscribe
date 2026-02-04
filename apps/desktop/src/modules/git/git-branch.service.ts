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
  async enrichBranchesWithTrackingInfo(
    repoPath: string,
    branches: BranchInfo[],
    _currentBranch: string,
  ): Promise<void> {
    try {
      // Get local branch details
      // Note: Double quotes around format string for Windows compatibility (prevents % variable expansion)
      const { stdout: localRefOutput } = await this.gitBase.execGit(repoPath, [
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
      const { stdout: remoteRefOutput } = await this.gitBase.execGit(repoPath, [
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
    } catch (error) {
      this.logger.debug('Failed to enrich branches with tracking info:', error);
      // Continue without enrichment - basic branch info is still useful
    }
  }

  /**
   * Fallback: Get branches using for-each-ref directly
   */
  async getBranchesWithForEachRef(
    repoPath: string,
    currentBranch: string,
  ): Promise<BranchInfo[]> {
    const branches: BranchInfo[] = [];

    // Get local branches
    // Note: Double quotes around format string for Windows compatibility (prevents % variable expansion)
    const { stdout: localOutput } = await this.gitBase.execGit(repoPath, [
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
    const { stdout: remoteOutput } = await this.gitBase.execGit(repoPath, [
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
  async createBranch(
    repoPath: string,
    name: string,
    startPoint?: string,
  ): Promise<void> {
    // Security: Validate branch name to prevent injection
    if (!isValidGitRefName(name)) {
      this.logger.warn(`Rejected invalid branch name for create: ${name}`);
      throw new Error(`Invalid branch name: ${name}`);
    }
    if (startPoint && !isValidGitRefName(startPoint)) {
      this.logger.warn(`Rejected invalid start point: ${startPoint}`);
      throw new Error(`Invalid start point: ${startPoint}`);
    }

    this.logger.debug(`Creating branch "${name}" in ${repoPath}${startPoint ? ` from ${startPoint}` : ''}`);
    const args = ['checkout', '-b', name];
    if (startPoint) {
      args.push(startPoint);
    }
    await this.gitBase.execGit(repoPath, args);
  }
}
