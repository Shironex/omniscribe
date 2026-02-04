import { execFile } from 'child_process';
import { promisify } from 'util';
import type { GhCliStatus, GhCliAuthStatus } from '@omniscribe/shared';
import { joinPaths, getHomeDir, isWindows, isMac, isLinux } from './path';
import { findCliInPath, findCliInLocalPaths, type CliDetectionResult } from './cli-detection';

const execFileAsync = promisify(execFile);

/**
 * Get common gh CLI installation paths (cross-platform)
 */
export function getGhCliPaths(): string[] {
  const home = getHomeDir();

  if (isWindows()) {
    const programFiles = process.env['ProgramFiles'] || 'C:\\Program Files';
    const localAppData = process.env['LOCALAPPDATA'] || joinPaths(home, 'AppData/Local');
    return [
      joinPaths(programFiles, 'GitHub CLI/gh.exe'),
      joinPaths(localAppData, 'Programs/GitHub CLI/gh.exe'),
      joinPaths(home, 'scoop/shims/gh.exe'),
      joinPaths(home, '.local/bin/gh.exe'),
    ];
  }

  // macOS and Linux
  return [
    '/usr/local/bin/gh',
    '/usr/bin/gh',
    ...(isMac() ? ['/opt/homebrew/bin/gh'] : []),
    joinPaths(home, '.local/bin/gh'),
    ...(isLinux() ? ['/snap/bin/gh'] : []),
  ];
}

/**
 * Find gh CLI installation
 */
export async function findGhCli(): Promise<CliDetectionResult> {
  // Try to find CLI in PATH first
  const pathResult = await findCliInPath('gh');
  if (pathResult) {
    return { cliPath: pathResult, method: 'path' };
  }

  // Check common installation locations
  const localPath = findCliInLocalPaths(getGhCliPaths());
  if (localPath) {
    return { cliPath: localPath, method: 'local' };
  }

  return { method: 'none' };
}

/**
 * Get gh CLI version
 */
export async function getGhCliVersion(cliPath: string): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync(cliPath, ['--version']);
    const match = stdout.match(/gh version ([^\s(]+)/);
    return match ? match[1] : stdout.trim().split('\n')[0];
  } catch {
    return undefined;
  }
}

/**
 * Check gh CLI authentication status
 */
export async function checkGhAuth(cliPath: string): Promise<GhCliAuthStatus> {
  try {
    const { stdout, stderr } = await execFileAsync(cliPath, ['auth', 'status'], {
      timeout: 10000,
      env: {
        ...process.env,
        GH_PROMPT_DISABLED: '1',
        NO_COLOR: '1',
      },
    });
    const output = stdout + stderr;

    if (output.includes('Logged in to')) {
      const usernameMatch = output.match(
        /Logged in to [^\s]+ account ([^\s(]+)/,
      );
      const username = usernameMatch ? usernameMatch[1] : undefined;

      const scopesMatch = output.match(/Token scopes: ([^\n]+)/);
      const scopes = scopesMatch
        ? scopesMatch[1]
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : undefined;

      return { authenticated: true, username, scopes };
    }

    return { authenticated: false };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);

    if (
      errorMessage.includes('not logged in') ||
      errorMessage.includes('no authentication') ||
      errorMessage.includes('You are not logged')
    ) {
      return { authenticated: false };
    }

    return { authenticated: false };
  }
}

/**
 * Get full GitHub CLI status
 */
export async function getGhCliStatus(): Promise<GhCliStatus> {
  const platform = process.platform;
  const arch = process.arch;

  const { cliPath, method } = await findGhCli();

  if (!cliPath || method === 'none') {
    return {
      installed: false,
      platform,
      arch,
      auth: { authenticated: false },
    };
  }

  const version = await getGhCliVersion(cliPath);
  const auth = await checkGhAuth(cliPath);

  return {
    installed: true,
    path: cliPath,
    version,
    method,
    platform,
    arch,
    auth,
  };
}
