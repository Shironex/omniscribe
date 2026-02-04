import { join } from 'path';
import { homedir } from 'os';

/**
 * Normalize path separators to forward slashes
 */
export function normalizePath(path: string): string {
  return path.replace(/\\/g, '/');
}

/**
 * Join paths and normalize to forward slashes
 */
export function joinPaths(...paths: string[]): string {
  return normalizePath(join(...paths));
}

/**
 * Get user home directory with normalized path
 */
export function getHomeDir(): string {
  return normalizePath(homedir());
}

/**
 * Check if running on Windows
 */
export function isWindows(): boolean {
  return process.platform === 'win32';
}

/**
 * Check if running on macOS
 */
export function isMac(): boolean {
  return process.platform === 'darwin';
}

/**
 * Check if running on Linux
 */
export function isLinux(): boolean {
  return process.platform === 'linux';
}
