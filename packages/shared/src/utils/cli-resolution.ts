/**
 * Shared CLI path resolution utilities.
 *
 * Extracted from provider-claude and provider-codex plugins to eliminate
 * ~200+ lines of duplicated code. Provides both synchronous (for
 * cli-command services) and asynchronous (for cli-detection services)
 * path resolution strategies.
 */

import { existsSync, readdirSync } from 'fs';
import { execFile, execFileSync } from 'child_process';
import { join } from 'path';
import { homedir, platform } from 'os';
import { normalizePath } from './path';

/**
 * Promise wrapper for execFile.
 * Avoids importing `promisify` from `util` which breaks the Vite browser
 * build (Rollup errors on `util` externalization unlike `path`/`os`/`fs`).
 */
function execFilePromise(
  file: string,
  args: readonly string[],
  options?: { timeout?: number }
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(file, [...args], options ?? {}, (error, stdout, stderr) => {
      if (error) {
        reject(error);
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
}

// ---- Minimal logger interface for optional diagnostic output ----

interface CliLogger {
  debug: (message: string, ...args: unknown[]) => void;
  info: (message: string, ...args: unknown[]) => void;
}

// ---- Cross-platform path helpers ----

/** Join path segments and normalize separators to forward slashes. */
export function joinPaths(...paths: string[]): string {
  return normalizePath(join(...paths));
}

/** Get the user's home directory with normalized separators. */
export function getHomeDir(): string {
  return normalizePath(homedir());
}

/** Check if the current platform is Windows. */
export function isWindows(): boolean {
  return platform() === 'win32';
}

// ---- Synchronous CLI resolution (for cli-command services) ----

/**
 * Find a CLI command synchronously.
 *
 * Checks PATH first (with .cmd/.exe extensions on Windows), then known
 * installation locations, and falls back to the bare command name.
 */
export function findCliCommandSync(
  command: string,
  knownPaths: string[],
  logger?: CliLogger
): string {
  const pathResult = findInPathSync(command, logger);
  if (pathResult) {
    return pathResult;
  }

  // On Windows, also try with .cmd and .exe extensions
  if (isWindows()) {
    const cmdResult = findInPathSync(`${command}.cmd`, logger);
    if (cmdResult) {
      return cmdResult;
    }
    const exeResult = findInPathSync(`${command}.exe`, logger);
    if (exeResult) {
      return exeResult;
    }
  }

  // Check known installation paths
  const knownPath = findFirstExistingPath(knownPaths, logger);
  if (knownPath) {
    return knownPath;
  }

  // Fall back to the bare command (will likely fail, but provides clear error)
  logger?.info(
    `CLI not found in PATH or known locations, falling back to bare command: ${command}`
  );
  return command;
}

/**
 * Find an executable in the system PATH using 'where' (Windows) or 'which' (Unix).
 * Synchronous variant for cli-command services.
 */
export function findInPathSync(command: string, logger?: CliLogger): string | null {
  try {
    const whichCmd = isWindows() ? 'where' : 'which';
    const result = execFileSync(whichCmd, [command], {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const firstLine = result.trim().split(/\r?\n/)[0];
    return firstLine || null;
  } catch (error) {
    logger?.debug(`CLI "${command}" not found in PATH`, error);
    return null;
  }
}

/**
 * Find the first existing path from a list of candidate paths.
 */
export function findFirstExistingPath(paths: string[], logger?: CliLogger): string | null {
  for (const p of paths) {
    try {
      if (existsSync(p)) {
        return p;
      }
    } catch (error) {
      logger?.debug(`Error checking path ${p}`, error);
    }
  }
  return null;
}

// ---- Asynchronous CLI resolution (for cli-detection services) ----

/**
 * Find a CLI tool in the system PATH asynchronously.
 * Uses `which` (Unix) or `where` (Windows) via execFile (no shell).
 */
export async function findCliInPath(toolName: string): Promise<string | undefined> {
  try {
    const whichCmd = isWindows() ? 'where' : 'which';
    const { stdout } = await execFilePromise(whichCmd, [toolName], { timeout: 5000 });
    const firstPath = stdout.trim().split(/\r?\n/)[0]?.trim();
    return firstPath || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Find a CLI tool by checking a list of known local installation paths.
 */
export function findCliInLocalPaths(localPaths: string[]): string | undefined {
  for (const localPath of localPaths) {
    if (existsSync(localPath)) {
      return localPath;
    }
  }
  return undefined;
}

// ---- NVM / fnm path scanning (generalized from Codex detection) ----

/**
 * Get NVM-installed Node.js bin paths.
 * Scans $NVM_DIR/versions/node/\{version\}/bin/ for installed node versions.
 */
export function getNvmBinPaths(): string[] {
  const nvmDir = process.env['NVM_DIR'] || join(homedir(), '.nvm');
  const versionsDir = join(nvmDir, 'versions', 'node');

  try {
    if (!existsSync(versionsDir)) {
      return [];
    }
    const versions = readdirSync(versionsDir, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);
    return versions.map(version => join(versionsDir, version, 'bin'));
  } catch {
    return [];
  }
}

/**
 * Get fnm (Fast Node Manager) installed Node.js bin paths.
 * Scans possible fnm directories for installed node versions.
 */
export function getFnmBinPaths(): string[] {
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
      const versions = readdirSync(fnmDir, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name);
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
 * Get NVM for Windows (nvm4w) symlink paths for a given CLI tool.
 */
export function getNvmWindowsCliPaths(toolName: string): string[] {
  const nvmSymlink = process.env['NVM_SYMLINK'];
  if (!nvmSymlink) return [];
  return [join(nvmSymlink, `${toolName}.cmd`), join(nvmSymlink, toolName)];
}
