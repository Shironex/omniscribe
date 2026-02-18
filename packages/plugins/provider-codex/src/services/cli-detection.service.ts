/**
 * Codex CLI Detection Service
 *
 * Detects whether the OpenAI Codex CLI is installed, resolves its path,
 * checks version, and verifies authentication status.
 *
 * Auth detection uses a three-tiered fast-to-slow approach:
 * 1. Fast: Check ~/.codex/auth.json for tokens
 * 2. Fast: Check OPENAI_API_KEY environment variable
 * 3. Slow: Run `codex login status` CLI command (only if fast checks fail)
 *
 * Platform-aware path lists derived from Automaker's system-paths.ts.
 */

import { existsSync, readFileSync, readdirSync } from 'fs';
import { exec, execFile } from 'child_process';
import { join } from 'path';
import { homedir, platform } from 'os';
import { promisify } from 'util';
import type { CliDetectionResult } from '@omniscribe/plugin-api';
import { createLogger, normalizePath } from '@omniscribe/shared';

const logger = createLogger('CodexCliDetection');

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

// ---- Path utilities ----

function joinPaths(...paths: string[]): string {
  return normalizePath(join(...paths));
}

function getHomeDir(): string {
  return normalizePath(homedir());
}

function isWindows(): boolean {
  return platform() === 'win32';
}

// ---- CLI path search utilities ----

async function findCliInPath(toolName: string): Promise<string | undefined> {
  try {
    const command = isWindows() ? `where ${toolName}` : `which ${toolName}`;
    const { stdout } = await execAsync(command);
    const firstPath = stdout.trim().split('\n')[0]?.trim();
    return firstPath || undefined;
  } catch {
    return undefined;
  }
}

function findCliInLocalPaths(localPaths: string[]): string | undefined {
  for (const localPath of localPaths) {
    if (existsSync(localPath)) {
      return localPath;
    }
  }
  return undefined;
}

// ---- Auth file token detection ----

/** Keys to check for OAuth tokens in auth.json */
const OAUTH_KEYS = ['access_token', 'oauth_token'] as const;

/** Keys to check for API keys in auth.json */
const API_KEY_KEYS = ['api_key', 'OPENAI_API_KEY'] as const;

function hasNonEmptyStringField(record: Record<string, unknown>, keys: readonly string[]): boolean {
  return keys.some(key => typeof record[key] === 'string' && record[key]);
}

// ---- NVM / fnm path scanning ----

/**
 * Get NVM-installed Node.js bin paths for CLI tools.
 * Scans $NVM_DIR/versions/node/{version}/bin/ for installed node versions.
 */
function getNvmBinPaths(): string[] {
  const nvmDir = process.env['NVM_DIR'] || join(homedir(), '.nvm');
  const versionsDir = join(nvmDir, 'versions', 'node');

  try {
    if (!existsSync(versionsDir)) {
      return [];
    }
    const versions = readdirSync(versionsDir);
    return versions.map(version => join(versionsDir, version, 'bin'));
  } catch {
    return [];
  }
}

/**
 * Get fnm (Fast Node Manager) installed Node.js bin paths.
 * Scans possible fnm directories for installed node versions.
 */
function getFnmBinPaths(): string[] {
  const home = homedir();
  const possibleFnmDirs = [
    join(home, '.local', 'share', 'fnm', 'node-versions'),
    join(home, '.fnm', 'node-versions'),
    // macOS Application Support
    join(home, 'Library', 'Application Support', 'fnm', 'node-versions'),
  ];

  const binPaths: string[] = [];

  for (const fnmDir of possibleFnmDirs) {
    try {
      if (!existsSync(fnmDir)) {
        continue;
      }
      const versions = readdirSync(fnmDir);
      for (const version of versions) {
        binPaths.push(join(fnmDir, version, 'installation', 'bin'));
      }
    } catch {
      // Ignore errors for this directory
    }
  }

  return binPaths;
}

/**
 * Get NVM for Windows (nvm4w) symlink paths for the codex CLI.
 */
function getNvmWindowsCliPaths(): string[] {
  const nvmSymlink = process.env['NVM_SYMLINK'];
  if (!nvmSymlink) return [];
  return [join(nvmSymlink, 'codex.cmd'), join(nvmSymlink, 'codex')];
}

/**
 * Codex CLI Detection Service.
 *
 * Provides detection of the OpenAI Codex CLI installation, version checking,
 * and authentication verification. Returns results in the plugin-api
 * CliDetectionResult format.
 */
export class CodexCliDetectionService {
  /**
   * Detect Codex CLI installation and return plugin-api compatible result.
   *
   * Checks PATH first, then known installation paths. If found, retrieves
   * the version and checks authentication status.
   */
  async detect(): Promise<CliDetectionResult> {
    const cliPath = await this.findCodexCli();

    if (!cliPath) {
      return { installed: false, error: 'codex command not found in PATH' };
    }

    const version = await this.getVersion(cliPath);
    const auth = await this.checkAuth(cliPath);

    return {
      installed: true,
      version,
      path: cliPath,
      auth,
    };
  }

  /**
   * Find Codex CLI installation by checking PATH and known install locations.
   */
  async findCodexCli(): Promise<string | undefined> {
    // 1. Check PATH via `which codex` / `where codex`
    const pathResult = await findCliInPath('codex');
    if (pathResult) {
      logger.debug(`Found codex in PATH: ${pathResult}`);
      return pathResult;
    }

    // 2. Check known installation paths
    const localPath = findCliInLocalPaths(this.getCodexCliPaths());
    if (localPath) {
      logger.debug(`Found codex at known path: ${localPath}`);
      return localPath;
    }

    logger.debug('Codex CLI not found in PATH or known locations');
    return undefined;
  }

  /**
   * Get Codex CLI version string.
   */
  async getVersion(cliPath: string): Promise<string | undefined> {
    try {
      const { stdout } = await execFileAsync(cliPath, ['--version']);
      return stdout.trim();
    } catch (error) {
      logger.debug('Failed to get Codex CLI version:', error);
      return undefined;
    }
  }

  /**
   * Check Codex CLI authentication status.
   *
   * Uses a three-tiered fast-to-slow approach:
   * 1. Fast: Check ~/.codex/auth.json for OAuth tokens or API keys
   * 2. Fast: Check OPENAI_API_KEY environment variable
   * 3. Slow: Run `codex login status` CLI command (only if fast checks fail)
   */
  async checkAuth(cliPath?: string): Promise<{ authenticated: boolean }> {
    // Fast check 1: auth file has tokens
    if (this.hasAuthTokenInFile()) {
      logger.debug('Auth detected via ~/.codex/auth.json tokens');
      return { authenticated: true };
    }

    // Fast check 2: OPENAI_API_KEY env var
    if (process.env['OPENAI_API_KEY']) {
      logger.debug('Auth detected via OPENAI_API_KEY environment variable');
      return { authenticated: true };
    }

    // Slow check: codex login status (only if fast checks failed)
    if (cliPath) {
      try {
        const { stdout, stderr } = await execAsync(`"${cliPath}" login status`, {
          env: { ...process.env, TERM: 'dumb' },
          timeout: 10000,
        });
        const combined = (stdout + stderr).toLowerCase();
        if (combined.includes('logged in')) {
          logger.debug('Auth detected via `codex login status` command');
          return { authenticated: true };
        }
      } catch {
        // Command failed or timed out -- treat as not authenticated
        logger.debug('`codex login status` command failed or timed out');
      }
    }

    return { authenticated: false };
  }

  /**
   * Check if ~/.codex/auth.json contains authentication tokens.
   *
   * Checks for top-level and nested tokens: access_token, oauth_token,
   * api_key, OPENAI_API_KEY, and tokens.{access_token, oauth_token}.
   */
  private hasAuthTokenInFile(): boolean {
    const authPath = joinPaths(getHomeDir(), '.codex', 'auth.json');
    try {
      const content = readFileSync(authPath, 'utf-8');
      const data = JSON.parse(content) as Record<string, unknown>;

      // Check top-level OAuth tokens and API keys
      const hasOAuth = hasNonEmptyStringField(data, OAUTH_KEYS);
      const hasApiKey = hasNonEmptyStringField(data, API_KEY_KEYS);

      if (hasOAuth || hasApiKey) {
        return true;
      }

      // Check nested tokens object
      const tokens = data['tokens'];
      if (tokens && typeof tokens === 'object' && !Array.isArray(tokens)) {
        const nestedTokens = tokens as Record<string, unknown>;
        const hasNestedOAuth = hasNonEmptyStringField(nestedTokens, OAUTH_KEYS);
        const hasNestedApiKey = hasNonEmptyStringField(nestedTokens, API_KEY_KEYS);

        if (hasNestedOAuth || hasNestedApiKey) {
          return true;
        }
      }

      return false;
    } catch {
      return false;
    }
  }

  /**
   * Get common Codex CLI installation paths across all platforms.
   *
   * Includes standard locations, npm global, Volta, pnpm, Yarn,
   * NVM, fnm, Snap, Linuxbrew, and Homebrew paths.
   *
   * Derived from Automaker's system-paths.ts getCodexCliPaths().
   */
  getCodexCliPaths(): string[] {
    const home = getHomeDir();

    if (isWindows()) {
      const appData = process.env['APPDATA'] || joinPaths(home, 'AppData/Roaming');
      const localAppData = process.env['LOCALAPPDATA'] || joinPaths(home, 'AppData/Local');
      return [
        joinPaths(home, '.local/bin/codex.exe'),
        joinPaths(appData, 'npm/codex.cmd'),
        joinPaths(appData, 'npm/codex'),
        joinPaths(appData, '.npm-global/bin/codex.cmd'),
        joinPaths(appData, '.npm-global/bin/codex'),
        // Volta on Windows
        joinPaths(home, '.volta/bin/codex.exe'),
        // pnpm on Windows
        joinPaths(localAppData, 'pnpm/codex.cmd'),
        joinPaths(localAppData, 'pnpm/codex'),
        // NVM for Windows symlink paths
        ...getNvmWindowsCliPaths(),
      ];
    }

    // macOS and Linux paths

    // NVM-installed Node.js bin paths
    const nvmBinPaths = getNvmBinPaths().map(binPath => join(binPath, 'codex'));

    // fnm-installed Node.js bin paths
    const fnmBinPaths = getFnmBinPaths().map(binPath => join(binPath, 'codex'));

    // pnpm global bin path
    const pnpmHome = process.env['PNPM_HOME'] || joinPaths(homedir(), '.local/share/pnpm');

    return [
      // Standard locations
      joinPaths(home, '.local/bin/codex'),
      '/opt/homebrew/bin/codex',
      '/usr/local/bin/codex',
      '/usr/bin/codex',
      joinPaths(home, '.npm-global/bin/codex'),
      // Linuxbrew
      '/home/linuxbrew/.linuxbrew/bin/codex',
      // Volta
      joinPaths(home, '.volta/bin/codex'),
      // pnpm global
      joinPaths(pnpmHome, 'codex'),
      // Yarn global
      joinPaths(home, '.yarn/bin/codex'),
      joinPaths(home, '.config/yarn/global/node_modules/.bin/codex'),
      // Snap packages
      '/snap/bin/codex',
      // NVM paths (dynamically resolved)
      ...nvmBinPaths,
      // fnm paths (dynamically resolved)
      ...fnmBinPaths,
    ];
  }
}
