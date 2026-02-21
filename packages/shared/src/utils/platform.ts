/**
 * Cross-platform path and OS utilities.
 *
 * Generic helpers for path normalization and platform detection,
 * used by cli-resolution and other shared utilities.
 */

import { join } from 'path';
import { homedir, platform } from 'os';
import { normalizePath } from './path';

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
