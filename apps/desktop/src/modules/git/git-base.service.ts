import { Injectable } from '@nestjs/common';
import { GIT_TIMEOUT_MS, createLogger } from '@omniscribe/shared';
import { execCliCommand, type ExecCliResult } from '../shared/exec-cli';

/** Git environment variables to prevent interactive prompts */
export const GIT_ENV: Record<string, string> = {
  GIT_TERMINAL_PROMPT: '0',
  LC_ALL: 'C',
};

export type { ExecCliResult as ExecResult };

@Injectable()
export class GitBaseService {
  private readonly logger = createLogger('GitBaseService');

  /**
   * Execute a git command with timeout and proper environment
   */
  async execGit(
    repoPath: string,
    args: string[],
    timeoutMs: number = GIT_TIMEOUT_MS
  ): Promise<ExecCliResult> {
    this.logger.debug(`[execGit] starting: git ${args.join(' ')} (cwd: ${repoPath})`);

    return execCliCommand({
      binary: 'git',
      args,
      cwd: repoPath,
      timeout: timeoutMs,
      env: GIT_ENV,
      logger: this.logger,
      exitCodeStrategy: 'non-fatal-below-128',
    });
  }

  /**
   * Execute a git command, piping `stdin` to the process (then closing it).
   * Used by commands that read a payload from stdin, e.g.
   * `git apply --cached -` for hunk-level staging.
   */
  async execGitWithStdin(
    repoPath: string,
    args: string[],
    stdin: string,
    timeoutMs: number = GIT_TIMEOUT_MS
  ): Promise<ExecCliResult> {
    this.logger.debug(`[execGit] starting (stdin): git ${args.join(' ')} (cwd: ${repoPath})`);

    return execCliCommand({
      binary: 'git',
      args,
      cwd: repoPath,
      timeout: timeoutMs,
      env: GIT_ENV,
      logger: this.logger,
      exitCodeStrategy: 'non-fatal-below-128',
      stdin,
    });
  }
}
