/**
 * Node.js-only exports from @omniscribe/shared.
 *
 * Import from '@omniscribe/shared/node' for CLI resolution, env filtering,
 * and other Node.js-specific utilities that cannot be bundled for the browser.
 *
 * The main '@omniscribe/shared' entry remains browser-safe.
 */

export {
  joinPaths,
  getHomeDir,
  isWindows,
  findCliCommandSync,
  findInPathSync,
  findFirstExistingPath,
  findCliInPath,
  findCliInLocalPaths,
  getNvmBinPaths,
  getFnmBinPaths,
  getNvmWindowsCliPaths,
} from './utils/cli-resolution';

export { ENV_ALLOWLIST, ENV_BLOCKLIST_PATTERNS, buildSafeEnv } from './utils/env-utils';
