import { Injectable } from '@nestjs/common';
import { execFile, ExecException } from 'child_process';
import { promisify } from 'util';
import { GIT_TIMEOUT_MS, createLogger } from '@omniscribe/shared';

const execFileAsync = promisify(execFile);

/** Git environment variables to prevent interactive prompts */
export const GIT_ENV: Record<string, string> = {
  GIT_TERMINAL_PROMPT: '0',
  LC_ALL: 'C',
};

export interface ExecResult {
  stdout: string;
  stderr: string;
}

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
  ): Promise<ExecResult> {
    const commandStr = `git ${args.join(' ')}`;
    this.logger.debug(`[execGit] starting: ${commandStr} (cwd: ${repoPath})`);

    try {
      const result = await execFileAsync('git', args, {
        cwd: repoPath,
        timeout: timeoutMs,
        env: {
          ...process.env,
          ...GIT_ENV,
        },
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer for large outputs
      });

      this.logger.debug(`[execGit] completed: ${commandStr}`);
      return {
        stdout: result.stdout,
        stderr: result.stderr,
      };
    } catch (error) {
      const execError = error as ExecException & { stdout?: string; stderr?: string };

      // Check for timeout
      if (execError.killed) {
        this.logger.warn(`Git command timed out after ${timeoutMs}ms: ${commandStr}`);
        throw new Error(`Git command timed out after ${timeoutMs}ms: ${commandStr}`, {
          cause: error,
        });
      }

      // For non-fatal exit codes (1-127), return stdout/stderr.
      // Some git commands use these codes for informational results
      // (e.g., git diff --quiet returns 1 when there are differences).
      // Fatal git errors (exit code >= 128) must always throw.
      const exitCode = execError.code;
      if (
        typeof exitCode === 'number' &&
        exitCode > 0 &&
        exitCode < 128 &&
        (execError.stdout !== undefined || execError.stderr !== undefined)
      ) {
        return {
          stdout: execError.stdout ?? '',
          stderr: execError.stderr ?? '',
        };
      }

      this.logger.error('Git command failed', execError);
      throw new Error(`Git command failed: ${execError.message}`, { cause: error });
    }
  }
}
