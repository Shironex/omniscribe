import { Injectable } from '@nestjs/common';
import { RemoteInfo, createLogger } from '@omniscribe/shared';
import { GitBaseService } from './git-base.service';

@Injectable()
export class GitRemoteService {
  private readonly logger = createLogger('GitRemoteService');

  constructor(private readonly gitBase: GitBaseService) {}

  /**
   * Get remote information
   */
  async getRemotes(repoPath: string): Promise<RemoteInfo[]> {
    this.logger.debug(`Getting remotes for ${repoPath}`);
    const remotes: RemoteInfo[] = [];
    const remoteMap = new Map<string, RemoteInfo>();

    const { stdout } = await this.gitBase.execGit(repoPath, ['remote', '-v']);

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
      const { stdout: branchOutput } = await this.gitBase.execGit(repoPath, [
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
   * Get remote names and their fetch URLs without making any network requests.
   * Runs only `git remote -v` and deduplicates by remote name.
   * Returns an empty array if the directory is not a git repo or has no remotes.
   */
  async getRemoteUrls(repoPath: string): Promise<Array<{ name: string; url: string }>> {
    this.logger.debug(`Getting remote URLs for ${repoPath}`);
    try {
      const { stdout } = await this.gitBase.execGit(repoPath, ['remote', '-v']);
      const seen = new Set<string>();
      const remotes: Array<{ name: string; url: string }> = [];

      for (const line of stdout.trim().split('\n')) {
        if (!line) continue;
        const match = line.match(/^(\S+)\s+(\S+)\s+\(fetch\)$/);
        if (!match) continue;
        const [, name, url] = match;
        if (!seen.has(name)) {
          seen.add(name);
          remotes.push({ name, url });
        }
      }

      return remotes;
    } catch {
      return [];
    }
  }

  /**
   * Push commits to a remote repository
   */
  async push(projectPath: string, remote: string = 'origin', branch?: string): Promise<void> {
    this.logger.info(`Pushing to ${remote}${branch ? `/${branch}` : ''} in ${projectPath}`);
    const args = ['push', remote];
    if (branch) {
      args.push(branch);
    }
    await this.gitBase.execGit(projectPath, args);
  }

  /**
   * Pull changes from a remote repository
   */
  async pull(projectPath: string, remote: string = 'origin', branch?: string): Promise<void> {
    this.logger.info(`Pulling from ${remote}${branch ? `/${branch}` : ''} in ${projectPath}`);
    const args = ['pull', remote];
    if (branch) {
      args.push(branch);
    }
    await this.gitBase.execGit(projectPath, args);
  }

  /**
   * Fetch updates from a remote repository
   */
  async fetch(projectPath: string, remote?: string): Promise<void> {
    this.logger.info(`Fetching${remote ? ` from ${remote}` : ' all'} in ${projectPath}`);
    const args = ['fetch'];
    if (remote) {
      args.push(remote);
    } else {
      args.push('--all');
    }
    await this.gitBase.execGit(projectPath, args);
  }
}
