/**
 * Shell PATH resolution for macOS/Linux GUI apps.
 *
 * Electron GUI apps on macOS inherit a minimal PATH (/usr/bin:/bin:/usr/sbin:/sbin)
 * because they don't source the user's shell profile. This module resolves the
 * user's full shell PATH at startup by spawning a login shell and extracting PATH.
 *
 * Modeled after VS Code's approach in src/vs/platform/environment/node/shellEnv.ts
 */

import { execFileSync } from 'child_process';
import { userInfo } from 'os';
import { createLogger } from '@omniscribe/shared';

const logger = createLogger('ShellPath');

const PATH_DELIMITER = '___OMNISCRIBE_PATH_DELIMITER___';
const SHELL_TIMEOUT_MS = 10_000;

// ANSI escape code pattern
// eslint-disable-next-line no-control-regex
const ANSI_REGEX = /\x1B\[[0-?]*[ -/]*[@-~]/g;

/**
 * Detect the user's default shell.
 */
function getDefaultShell(): string {
  try {
    const shell = userInfo().shell;
    if (shell) return shell;
  } catch {
    // userInfo() can throw on some systems
  }

  if (process.env.SHELL) {
    return process.env.SHELL;
  }

  // Platform defaults
  return process.platform === 'darwin' ? '/bin/zsh' : '/bin/sh';
}

/**
 * Get the shell name from its path (e.g., '/bin/zsh' -> 'zsh')
 */
function getShellName(shellPath: string): string {
  return shellPath.split('/').pop()?.toLowerCase() || '';
}

/**
 * Build the shell arguments for extracting PATH.
 * Fish shell doesn't support combined -ilc flags.
 */
function buildShellArgs(shellName: string): string[] {
  const command = `echo -n "${PATH_DELIMITER}"; command env 2>/dev/null | grep "^PATH=" || env | grep "^PATH="; echo -n "${PATH_DELIMITER}"`;

  if (shellName === 'fish') {
    return ['-l', '-i', '-c', command];
  }

  // bash, zsh, and other POSIX-compatible shells
  return ['-ilc', command];
}

/**
 * Parse the PATH value from shell output using delimiters.
 */
function parsePathFromOutput(output: string): string | undefined {
  const startIdx = output.indexOf(PATH_DELIMITER);
  if (startIdx === -1) return undefined;

  const afterStart = startIdx + PATH_DELIMITER.length;
  const endIdx = output.indexOf(PATH_DELIMITER, afterStart);
  if (endIdx === -1) return undefined;

  const between = output.substring(afterStart, endIdx).trim();

  // Find PATH= line
  const pathLine = between.split('\n').find(line => line.startsWith('PATH='));
  if (!pathLine) return undefined;

  // Extract value after PATH=
  const pathValue = pathLine.substring('PATH='.length);

  // Strip any ANSI escape codes
  return pathValue.replace(ANSI_REGEX, '').trim();
}

/**
 * Attempt to resolve PATH from a specific shell.
 */
function resolvePathFromShell(shell: string): string | undefined {
  const shellName = getShellName(shell);
  const args = buildShellArgs(shellName);

  try {
    const output = execFileSync(shell, args, {
      encoding: 'utf-8',
      timeout: SHELL_TIMEOUT_MS,
      // Prevent the shell from inheriting stdio (avoids TTY issues)
      stdio: ['pipe', 'pipe', 'pipe'],
      // Pass minimal env to avoid circular issues
      env: {
        ...process.env,
        // Ensure TERM is set so shell profiles don't complain
        TERM: process.env.TERM || 'xterm-256color',
      },
    });

    return parsePathFromOutput(output);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (message.includes('ETIMEDOUT') || message.includes('timed out')) {
      logger.warn(`Shell PATH resolution timed out after ${SHELL_TIMEOUT_MS}ms using ${shell}`);
    } else {
      logger.debug(`Failed to resolve PATH from ${shell}: ${message}`);
    }

    return undefined;
  }
}

/**
 * Validate that a resolved PATH looks reasonable.
 * Must contain at least /usr/bin to be considered valid.
 */
function isValidPath(resolvedPath: string): boolean {
  if (!resolvedPath || resolvedPath.length === 0) return false;

  const entries = resolvedPath.split(':').filter(Boolean);
  if (entries.length === 0) return false;

  // Must contain at least a basic system directory
  return entries.some(entry => entry === '/usr/bin' || entry === '/bin');
}

/**
 * Resolve the user's full shell PATH and update process.env.PATH.
 *
 * Should be called once at Electron startup before any child processes are spawned.
 * On Windows, this is a no-op since GUI apps inherit the correct PATH.
 * On failure, the original PATH is preserved.
 */
export function resolveShellPath(): void {
  // Windows GUI apps inherit the full user PATH -- no fix needed
  if (process.platform === 'win32') {
    return;
  }

  const originalPath = process.env.PATH || '';

  logger.debug(`Original PATH: ${originalPath}`);

  const defaultShell = getDefaultShell();
  logger.debug(`Default shell: ${defaultShell}`);

  // Try the user's default shell first
  let resolvedPath = resolvePathFromShell(defaultShell);

  // If default shell failed, try fallback shells
  if (!resolvedPath || !isValidPath(resolvedPath)) {
    const shellName = getShellName(defaultShell);
    const fallbackShells = ['/bin/zsh', '/bin/bash', '/bin/sh'].filter(
      s => getShellName(s) !== shellName
    );

    for (const fallbackShell of fallbackShells) {
      logger.debug(`Trying fallback shell: ${fallbackShell}`);
      resolvedPath = resolvePathFromShell(fallbackShell);
      if (resolvedPath && isValidPath(resolvedPath)) break;
    }
  }

  if (resolvedPath && isValidPath(resolvedPath)) {
    process.env.PATH = resolvedPath;
    const entryCount = resolvedPath.split(':').filter(Boolean).length;
    logger.info(`Shell PATH resolved successfully (${entryCount} entries)`);
    logger.debug(`Resolved PATH: ${resolvedPath}`);
  } else {
    logger.warn(
      'Could not resolve shell PATH -- spawned processes will use the default Electron PATH'
    );
  }
}
