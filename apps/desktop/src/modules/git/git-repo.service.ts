import { Injectable } from '@nestjs/common';
import { GitUserConfig } from '@omniscribe/shared';
import { GitBaseService } from './git-base.service';

@Injectable()
export class GitRepoService {
  constructor(private readonly gitBase: GitBaseService) {}

  /**
   * Check if a path is a git repository
   */
  async isGitRepository(repoPath: string): Promise<boolean> {
    try {
      await this.gitBase.execGit(repoPath, ['rev-parse', '--git-dir']);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get the repository root path
   */
  async getRepositoryRoot(repoPath: string): Promise<string> {
    const { stdout } = await this.gitBase.execGit(repoPath, [
      'rev-parse',
      '--show-toplevel',
    ]);
    return stdout.trim();
  }

  /**
   * Get user configuration
   */
  async getUserConfig(repoPath: string): Promise<GitUserConfig> {
    const config: GitUserConfig = {};

    try {
      const { stdout: name } = await this.gitBase.execGit(repoPath, [
        'config',
        '--get',
        'user.name',
      ]);
      config.name = name.trim() || undefined;
    } catch {
      // Config not set
    }

    try {
      const { stdout: email } = await this.gitBase.execGit(repoPath, [
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
        await this.gitBase.execGit(repoPath, ['config', scope, 'user.name', name]);
      } else {
        await this.gitBase.execGit(repoPath, ['config', scope, '--unset', 'user.name']);
      }
    }

    if (email !== undefined) {
      if (email) {
        await this.gitBase.execGit(repoPath, ['config', scope, 'user.email', email]);
      } else {
        await this.gitBase.execGit(repoPath, ['config', scope, '--unset', 'user.email']);
      }
    }
  }
}
