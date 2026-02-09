import { existsSync, readFileSync } from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';
import type { ClaudeCliStatus } from '@omniscribe/shared';
import { createLogger } from '@omniscribe/shared';
import { joinPaths, getHomeDir, isWindows } from './path';
import { findCliInPath, findCliInLocalPaths, type CliDetectionResult } from './cli-detection';

const logger = createLogger('ClaudeDetection');

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
  return [joinPaths(claudeDir, '.credentials.json'), joinPaths(claudeDir, 'credentials.json')];
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
  } catch (error) {
    logger.debug('Failed to get Claude CLI version:', error);
    return undefined;
  }
}

/**
 * Check for OAuth account in Claude config (~/.claude/.claude.json)
 * On macOS, Claude CLI stores tokens in the Keychain rather than credential files,
 * but the config always contains oauthAccount when the user is signed in.
 */
function checkClaudeConfigAuth(): boolean {
  const configPath = joinPaths(getClaudeConfigDir(), '.claude.json');

  if (!existsSync(configPath)) {
    return false;
  }

  try {
    const content = readFileSync(configPath, 'utf-8');
    const config: unknown = JSON.parse(content);

    if (typeof config !== 'object' || config === null) {
      return false;
    }

    const cfg = config as Record<string, unknown>;
    const oauthAccount = cfg['oauthAccount'] as Record<string, unknown> | undefined;

    return (
      typeof oauthAccount?.['accountUuid'] === 'string' && oauthAccount['accountUuid'].length > 0
    );
  } catch (error) {
    logger.debug('Failed to read Claude config for auth check:', error);
    return false;
  }
}

/**
 * Check Claude CLI authentication status
 */
export async function checkClaudeAuth(): Promise<{ authenticated: boolean }> {
  // Check credential files (works on Windows where tokens are stored as files)
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
    } catch (error) {
      logger.debug(`Failed to read credentials from ${credPath}:`, error);
    }
  }

  // Fallback: check oauthAccount in config file
  // On macOS, tokens are stored in Keychain, but the config still tracks the signed-in account
  if (checkClaudeConfigAuth()) {
    return { authenticated: true };
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
