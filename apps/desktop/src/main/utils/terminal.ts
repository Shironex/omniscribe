import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import { createLogger } from '@omniscribe/shared';

const execAsync = promisify(exec);
const logger = createLogger('TerminalUtil');

/**
 * Security: Escape a string for use in a shell command
 * Uses single quotes with proper escaping
 */
function escapeShellArg(arg: string): string {
  // Replace single quotes with '\'' (end quote, escaped quote, start quote)
  // Then wrap the whole thing in single quotes
  return `'${arg.replace(/'/g, "'\\''")}'`;
}

/**
 * Security: Escape a string for PowerShell
 * PowerShell has different escaping rules
 */
function escapePowerShellArg(arg: string): string {
  // Escape special PowerShell characters
  // Replace backticks, dollars, and quotes
  return arg.replace(/`/g, '``').replace(/\$/g, '`$').replace(/"/g, '`"').replace(/'/g, "''");
}

/**
 * Security: Validate command string
 * Rejects commands with obvious injection attempts
 */
function validateCommand(command: string): boolean {
  // Reject empty commands
  if (!command || command.trim().length === 0) {
    return false;
  }

  // Reject commands with null bytes
  if (command.includes('\0')) {
    return false;
  }

  // Reject excessively long commands
  if (command.length > 10000) {
    return false;
  }

  return true;
}

/**
 * Open an external terminal and run a command
 *
 * Security: This function properly escapes commands to prevent injection.
 * However, since it runs arbitrary commands, it should only be called
 * with trusted input (e.g., from known install scripts).
 */
export async function openTerminalWithCommand(command: string): Promise<void> {
  // Security: Validate command first
  if (!validateCommand(command)) {
    throw new Error('Invalid command');
  }

  const platform = process.platform;
  logger.info(`Opening terminal with command on ${platform}`);

  if (platform === 'win32') {
    // Windows: Use 'start' via cmd.exe to open a visible PowerShell window.
    // spawn with detached+stdio:'ignore' runs without a console window,
    // so we need cmd's 'start' to create one.
    const escapedCommand = escapePowerShellArg(command);
    return new Promise((resolve, reject) => {
      const proc = spawn(
        'cmd.exe',
        ['/c', 'start', 'powershell', '-NoExit', '-Command', escapedCommand],
        {
          detached: true,
          stdio: 'ignore',
          shell: false,
        }
      );
      proc.unref();
      proc.on('error', reject);
      // Resolve immediately since we detached the process
      resolve();
    });
  } else if (platform === 'darwin') {
    // macOS: Use osascript with properly escaped command
    // AppleScript escaping: escape backslashes and quotes
    const escapedForAppleScript = command.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const terminalCommand = `osascript -e 'tell app "Terminal" to do script "${escapedForAppleScript}"' -e 'tell app "Terminal" to activate'`;
    await execAsync(terminalCommand);
  } else {
    // Linux: Use spawn with argument arrays for safer execution
    const escapedCommand = escapeShellArg(command);
    const bashCommand = `${escapedCommand}; exec bash`;

    return new Promise((resolve, reject) => {
      // Try gnome-terminal first
      const proc = spawn('gnome-terminal', ['--', 'bash', '-c', bashCommand], {
        detached: true,
        stdio: 'ignore',
        shell: false,
      });

      proc.on('error', () => {
        // Try konsole as fallback
        logger.warn('gnome-terminal not available, falling back to konsole');
        const konsole = spawn('konsole', ['-e', 'bash', '-c', bashCommand], {
          detached: true,
          stdio: 'ignore',
          shell: false,
        });

        konsole.on('error', () => {
          // Try xterm as last resort
          logger.warn('konsole not available, falling back to xterm');
          const xterm = spawn('xterm', ['-hold', '-e', command], {
            detached: true,
            stdio: 'ignore',
            shell: false,
          });

          xterm.on('error', reject);
          xterm.unref();
          resolve();
        });

        konsole.unref();
        resolve();
      });

      proc.unref();
      resolve();
    });
  }
}
