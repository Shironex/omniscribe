import { Injectable } from '@nestjs/common';
import { exec, ExecException } from 'child_process';
import { promisify } from 'util';
import { GIT_TIMEOUT_MS } from '@omniscribe/shared';

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
  /**
   * Execute a git command with timeout and proper environment
   */
  async execGit(
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
}
