import { Injectable } from '@nestjs/common';
import { exec, ExecException } from 'child_process';
import { promisify } from 'util';
import { GIT_TIMEOUT_MS, createLogger } from '@omniscribe/shared';

const execAsync = promisify(exec);

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
    const command = `git ${args.join(' ')}`;
    this.logger.debug(`execGit: ${command} (cwd: ${repoPath})`);

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
        this.logger.warn(`Git command timed out after ${timeoutMs}ms: ${command}`);
        throw new Error(`Git command timed out after ${timeoutMs}ms: ${command}`);
      }

      // Return stdout/stderr even on non-zero exit codes (some git commands use this)
      if (execError.stdout !== undefined || execError.stderr !== undefined) {
        return {
          stdout: execError.stdout ?? '',
          stderr: execError.stderr ?? '',
        };
      }

      this.logger.error(`Git command failed: ${execError.message}`);
      throw new Error(`Git command failed: ${execError.message}`);
    }
  }
}
