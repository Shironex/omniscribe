/**
 * Claude CLI Detection Service
 *
 * Detects whether the Claude Code CLI is installed, resolves its path,
 * checks version, and verifies authentication status.
 *
 * Extracted from apps/desktop/src/main/utils/claude-detection.ts and
 * apps/desktop/src/main/utils/cli-detection.ts. Pure TypeScript class
 * with no NestJS dependencies.
 */

import { existsSync, readFileSync } from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';
import type { CliDetectionResult } from '@omniscribe/plugin-api';
import type { ClaudeCliStatus } from '@omniscribe/shared';
import { createLogger } from '@omniscribe/shared';
import {
  joinPaths,
  getHomeDir,
  isWindows,
  findCliInPath,
  findCliInLocalPaths,
  getNvmBinPaths,
  getFnmBinPaths,
  getNvmWindowsCliPaths,
} from '@omniscribe/shared/node';

const logger = createLogger('ClaudeCliDetection');

const execFileAsync = promisify(execFile);

/**
 * Internal detection result with method tracking (richer than plugin-api CliDetectionResult).
 */
interface InternalDetectionResult {
  cliPath?: string;
  method: 'path' | 'local' | 'none';
}

/**
 * Claude CLI Detection Service.
 *
 * Provides detection of the Claude Code CLI installation, version checking,
 * and authentication verification. Can return results in both the plugin-api
 * format (CliDetectionResult) and the full internal format (ClaudeCliStatus).
 */
export class ClaudeCliDetectionService {
  /**
   * Detect Claude CLI installation and return plugin-api compatible result.
   *
   * Maps the full ClaudeCliStatus to the CliDetectionResult interface
   * expected by AiProviderPlugin.detectCli().
   */
  async detect(): Promise<CliDetectionResult> {
    const status = await this.getFullStatus();
    return {
      installed: status.installed,
      version: status.version,
      path: status.path,
      auth: status.auth,
    };
  }

  /**
   * Get full Claude CLI status including platform info and detection method.
   *
   * Returns the richer ClaudeCliStatus type used by the IPC handler and
   * usage gateway for backward compatibility with existing frontend code.
   */
  async getFullStatus(): Promise<ClaudeCliStatus> {
    const platform = process.platform;
    const arch = process.arch;

    const { cliPath, method } = await this.findClaudeCli();
    const version = cliPath ? await this.getClaudeCliVersion(cliPath) : undefined;
    const auth = await this.checkClaudeAuth();

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

  /**
   * Find Claude CLI installation by checking PATH and known install locations.
   */
  async findClaudeCli(): Promise<InternalDetectionResult> {
    const pathResult = await findCliInPath('claude');
    if (pathResult) {
      return { cliPath: pathResult, method: 'path' };
    }

    const localPath = findCliInLocalPaths(this.getClaudeCliPaths());
    if (localPath) {
      return { cliPath: localPath, method: 'local' };
    }

    return { method: 'none' };
  }

  /**
   * Get Claude CLI version string.
   */
  async getClaudeCliVersion(cliPath: string): Promise<string | undefined> {
    try {
      const { stdout } = await execFileAsync(cliPath, ['--version']);
      return stdout.trim();
    } catch (error) {
      logger.debug('Failed to get Claude CLI version:', error);
      return undefined;
    }
  }

  /**
   * Check Claude CLI authentication status.
   *
   * Checks credential files (Windows) and the config file's oauthAccount
   * field (macOS where tokens are stored in Keychain).
   */
  async checkClaudeAuth(): Promise<{ authenticated: boolean }> {
    const credentialPaths = this.getClaudeCredentialPaths();

    for (const credPath of credentialPaths) {
      if (!existsSync(credPath)) {
        continue;
      }

      try {
        const content = readFileSync(credPath, 'utf-8');
        const credentials: unknown = JSON.parse(content);

        if (typeof credentials !== 'object' || credentials === null) {
          continue;
        }

        const creds = credentials as Record<string, unknown>;
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
    if (this.checkClaudeConfigAuth()) {
      return { authenticated: true };
    }

    return { authenticated: false };
  }

  /**
   * Get Claude config directory (~/.claude).
   */
  getClaudeConfigDir(): string {
    return joinPaths(getHomeDir(), '.claude');
  }

  /**
   * Get paths to Claude credential files.
   */
  getClaudeCredentialPaths(): string[] {
    const claudeDir = this.getClaudeConfigDir();
    return [joinPaths(claudeDir, '.credentials.json'), joinPaths(claudeDir, 'credentials.json')];
  }

  /**
   * Get common Claude CLI installation paths (cross-platform).
   * Delegates to the standalone `getClaudeCliPaths()` function.
   */
  getClaudeCliPaths(): string[] {
    return getClaudeCliPaths();
  }

  /**
   * Check for OAuth account in Claude config (~/.claude/.claude.json).
   *
   * On macOS, Claude CLI stores tokens in the Keychain rather than credential files,
   * but the config always contains oauthAccount when the user is signed in.
   */
  private checkClaudeConfigAuth(): boolean {
    const configPath = joinPaths(this.getClaudeConfigDir(), '.claude.json');

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
}

/**
 * Get common Claude CLI installation paths across all platforms.
 *
 * Union of the standard locations, npm global, pnpm, Volta, Bun, Homebrew,
 * and dynamically-resolved NVM/fnm bin paths.
 *
 * Standalone function so that the command service (synchronous path
 * resolution) and the detection service share a single source of truth —
 * a CLI found by detection must also be found at launch time.
 */
export function getClaudeCliPaths(): string[] {
  const home = getHomeDir();

  if (isWindows()) {
    const appData = process.env['APPDATA'] || joinPaths(home, 'AppData/Roaming');
    const localAppData = process.env['LOCALAPPDATA'] || joinPaths(home, 'AppData/Local');
    return [
      joinPaths(home, '.local/bin/claude.exe'),
      joinPaths(home, '.local/bin/claude'),
      joinPaths(appData, 'npm/claude.cmd'),
      joinPaths(appData, 'npm/claude'),
      joinPaths(appData, '.npm-global/bin/claude.cmd'),
      joinPaths(appData, '.npm-global/bin/claude'),
      // pnpm on Windows
      joinPaths(localAppData, 'pnpm/claude.cmd'),
      joinPaths(localAppData, 'pnpm/claude'),
      // Volta on Windows
      joinPaths(home, '.volta/bin/claude.exe'),
      // Native installer
      joinPaths(localAppData, 'Programs/claude/claude.exe'),
      // NVM for Windows symlink paths
      ...getNvmWindowsCliPaths('claude'),
    ];
  }

  // macOS and Linux paths
  const nvmBinPaths = getNvmBinPaths().map(binPath => joinPaths(binPath, 'claude'));
  const fnmBinPaths = getFnmBinPaths().map(binPath => joinPaths(binPath, 'claude'));

  return [
    // Standard locations
    joinPaths(home, '.local/bin/claude'),
    '/usr/local/bin/claude',
    '/usr/bin/claude',
    joinPaths(home, '.npm-global/bin/claude'),
    // Homebrew
    '/opt/homebrew/bin/claude',
    // Volta
    joinPaths(home, '.volta/bin/claude'),
    // pnpm global
    joinPaths(home, 'Library/pnpm/claude'),
    joinPaths(home, '.local/share/pnpm/claude'),
    // Bun
    joinPaths(home, '.bun/bin/claude'),
    // NVM paths (dynamically resolved)
    ...nvmBinPaths,
    // fnm paths (dynamically resolved)
    ...fnmBinPaths,
  ];
}
