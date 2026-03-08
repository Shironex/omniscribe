import { execFile, ExecException } from 'child_process';
import { promisify } from 'util';
import type { Logger } from '@omniscribe/shared';

const execFileAsync = promisify(execFile);

export interface ExecCliOptions {
  /** The binary to execute (e.g., 'git', 'gh') */
  binary: string;
  /** Command arguments */
  args: string[];
  /** Working directory */
  cwd: string;
  /** Timeout in milliseconds */
  timeout: number;
  /** Environment variable overrides merged onto process.env */
  env: Record<string, string>;
  /** Max buffer size in bytes (default: 10MB) */
  maxBuffer?: number;
  /** Logger instance for debug/warning output */
  logger: Logger;
  /**
   * Strategy for handling non-zero exit codes:
   * - 'non-fatal-below-128': return stdout/stderr for exit codes 1-127, throw for >= 128 (git)
   * - 'always-return': return stdout/stderr for any non-zero exit code (gh)
   */
  exitCodeStrategy: 'non-fatal-below-128' | 'always-return';
}

export interface ExecCliResult {
  stdout: string;
  stderr: string;
}

/** Capitalize first letter for error messages (e.g. 'git' -> 'Git') */
function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Execute a CLI command with timeout, environment overrides, and error handling.
 * Used by both git and GitHub CLI services to avoid duplicating exec logic.
 */
export async function execCliCommand(options: ExecCliOptions): Promise<ExecCliResult> {
  const {
    binary,
    args,
    cwd,
    timeout,
    env,
    maxBuffer = 10 * 1024 * 1024,
    logger,
    exitCodeStrategy,
  } = options;

  const command = `${binary} ${args.join(' ')}`;
  const label = capitalize(binary);

  try {
    const result = await execFileAsync(binary, args, {
      cwd,
      timeout,
      env: {
        ...process.env,
        ...env,
      },
      maxBuffer,
    });

    logger.debug(`[exec] completed: ${command}`);
    return {
      stdout: result.stdout,
      stderr: result.stderr,
    };
  } catch (error) {
    const execError = error as ExecException & { stdout?: string; stderr?: string };

    // Check for timeout
    if (execError.killed) {
      logger.warn(`${label} command timed out after ${timeout}ms: ${command}`);
      throw new Error(`${label} command timed out after ${timeout}ms: ${command}`, {
        cause: error,
      });
    }

    if (exitCodeStrategy === 'non-fatal-below-128') {
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
    } else {
      // 'always-return': Return stdout/stderr even on non-zero exit codes
      if (execError.stdout !== undefined || execError.stderr !== undefined) {
        return {
          stdout: execError.stdout ?? '',
          stderr: execError.stderr ?? '',
        };
      }
    }

    logger.error(`${label} command failed`, execError);
    throw new Error(`${label} command failed: ${execError.message}`, { cause: error });
  }
}
