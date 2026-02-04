import { existsSync, readFileSync } from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';
import type { ClaudeCliStatus } from '@omniscribe/shared';
import { joinPaths, getHomeDir, isWindows } from './path';
import { findCliInPath, findCliInLocalPaths, type CliDetectionResult } from './cli-detection';

const execFileAsync = promisify(execFile);

/**
 * Get Claude config directory (~/.claude)
 */
export function getClaudeConfigDir(): string {
  return joinPaths(getHomeDir(), '.claude');
}

/**
 * Get paths to Claude credential files
 */
export function getClaudeCredentialPaths(): string[] {
  const claudeDir = getClaudeConfigDir();
  return [
    joinPaths(claudeDir, '.credentials.json'),
    joinPaths(claudeDir, 'credentials.json'),
  ];
}

/**
 * Get common Claude CLI installation paths (cross-platform)
 */
export function getClaudeCliPaths(): string[] {
  const home = getHomeDir();

  if (isWindows()) {
    const appData = process.env['APPDATA'] || joinPaths(home, 'AppData/Roaming');
    const localAppData = process.env['LOCALAPPDATA'] || joinPaths(home, 'AppData/Local');
    return [
      joinPaths(home, '.local/bin/claude.exe'),
      joinPaths(appData, 'npm/claude.cmd'),
      joinPaths(appData, 'npm/claude'),
      joinPaths(localAppData, 'Programs/claude/claude.exe'),
    ];
  }

  // Unix (macOS/Linux)
  return [
    joinPaths(home, '.local/bin/claude'),
    '/usr/local/bin/claude',
    joinPaths(home, '.npm-global/bin/claude'),
  ];
}

/**
 * Find Claude CLI installation
 */
export async function findClaudeCli(): Promise<CliDetectionResult> {
  // Try to find CLI in PATH first
  const pathResult = await findCliInPath('claude');
  if (pathResult) {
    return { cliPath: pathResult, method: 'path' };
  }

  // Check common installation locations
  const localPath = findCliInLocalPaths(getClaudeCliPaths());
  if (localPath) {
    return { cliPath: localPath, method: 'local' };
  }

  return { method: 'none' };
}

/**
 * Get Claude CLI version
 */
export async function getClaudeCliVersion(cliPath: string): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync(cliPath, ['--version']);
    return stdout.trim();
  } catch {
    return undefined;
  }
}

/**
 * Check Claude CLI authentication status
 */
export async function checkClaudeAuth(): Promise<{ authenticated: boolean }> {
  const credentialPaths = getClaudeCredentialPaths();

  for (const credPath of credentialPaths) {
    if (!existsSync(credPath)) {
      continue;
    }

    try {
      const content = readFileSync(credPath, 'utf-8');
      const credentials: unknown = JSON.parse(content);

      // Validate that credentials is an object
      if (typeof credentials !== 'object' || credentials === null) {
        continue;
      }

      const creds = credentials as Record<string, unknown>;

      // Check for OAuth token in various locations
      const claudeAiOauth = creds['claudeAiOauth'] as Record<string, unknown> | undefined;
      const hasToken =
        (typeof claudeAiOauth?.['accessToken'] === 'string' &&
          claudeAiOauth['accessToken'].length > 0) ||
        (typeof creds['oauth_token'] === 'string' && creds['oauth_token'].length > 0) ||
        (typeof creds['accessToken'] === 'string' && creds['accessToken'].length > 0);

      if (hasToken) {
        return { authenticated: true };
      }
    } catch {
      // Failed to read credentials
    }
  }

  return { authenticated: false };
}

/**
 * Get full Claude CLI status
 */
export async function getClaudeCliStatus(): Promise<ClaudeCliStatus> {
  const platform = process.platform;
  const arch = process.arch;

  const { cliPath, method } = await findClaudeCli();
  const version = cliPath ? await getClaudeCliVersion(cliPath) : undefined;
  const auth = await checkClaudeAuth();

  return {
    installed: !!cliPath,
    path: cliPath,
    version,
    method: method === 'none' ? undefined : method,
    platform,
    arch,
    auth,
  };
}
