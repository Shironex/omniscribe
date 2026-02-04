import * as semver from 'semver';
import type {
  ClaudeVersionCheckResult,
  ClaudeInstallCommandOptions,
  ClaudeInstallCommand,
} from '@omniscribe/shared';
import { createLogger } from '@omniscribe/shared';
import { isWindows } from './path';

const logger = createLogger('VersionCheck');

/** Cache for latest version info */
let cachedLatestVersion: { version: string; timestamp: number } | null = null;
/** Cache for version list */
let cachedVersionList: { versions: string[]; timestamp: number } | null = null;
/** Cache duration for latest version (24 hours) */
const LATEST_VERSION_CACHE_MS = 24 * 60 * 60 * 1000;
/** Cache duration for version list (1 hour) */
const VERSION_LIST_CACHE_MS = 60 * 60 * 1000;

/**
 * Fetch latest version from npm registry
 */
export async function fetchLatestVersion(): Promise<string | null> {
  // Check cache first
  if (
    cachedLatestVersion &&
    Date.now() - cachedLatestVersion.timestamp < LATEST_VERSION_CACHE_MS
  ) {
    return cachedLatestVersion.version;
  }

  try {
    const response = await fetch(
      'https://registry.npmjs.org/@anthropic-ai/claude-code/latest',
    );
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = (await response.json()) as { version?: string };
    const version = data.version;

    if (version) {
      cachedLatestVersion = { version, timestamp: Date.now() };
      return version;
    }
    return null;
  } catch (error) {
    logger.error('Failed to fetch latest Claude CLI version:', error);
    // Return cached value if available, even if expired
    return cachedLatestVersion?.version ?? null;
  }
}

/**
 * Fetch available versions from npm registry
 */
export async function fetchAvailableVersions(limit = 20): Promise<string[]> {
  // Check cache first
  if (
    cachedVersionList &&
    Date.now() - cachedVersionList.timestamp < VERSION_LIST_CACHE_MS
  ) {
    return cachedVersionList.versions.slice(0, limit);
  }

  try {
    const response = await fetch(
      'https://registry.npmjs.org/@anthropic-ai/claude-code',
    );
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = (await response.json()) as { versions?: Record<string, unknown> };
    const versions = Object.keys(data.versions || {});

    // Sort by semver descending (newest first) and filter out pre-release versions
    const sortedVersions = versions
      .filter((v) => semver.valid(v) && !semver.prerelease(v))
      .sort((a, b) => semver.rcompare(a, b));

    cachedVersionList = { versions: sortedVersions, timestamp: Date.now() };
    return sortedVersions.slice(0, limit);
  } catch (error) {
    logger.error('Failed to fetch available Claude CLI versions:', error);
    // Return cached value if available, even if expired
    return cachedVersionList?.versions.slice(0, limit) ?? [];
  }
}

/**
 * Extract clean semver from version strings like "2.1.31 (Claude Code)"
 */
export function cleanVersionString(version: string): string | null {
  // Use semver.coerce to extract version from strings like "2.1.31 (Claude Code)"
  const coerced = semver.coerce(version);
  return coerced ? coerced.version : null;
}

/**
 * Check version and return comparison result
 */
export async function checkClaudeVersion(
  installedVersion?: string,
): Promise<ClaudeVersionCheckResult | null> {
  const latestVersion = await fetchLatestVersion();

  if (!latestVersion) {
    return null;
  }

  // Clean the installed version string (e.g., "2.1.31 (Claude Code)" -> "2.1.31")
  const cleanInstalled = installedVersion
    ? cleanVersionString(installedVersion)
    : null;

  const isOutdated = cleanInstalled
    ? semver.lt(cleanInstalled, latestVersion)
    : true;

  return {
    installedVersion: cleanInstalled ?? installedVersion,
    latestVersion,
    isOutdated,
    lastChecked: new Date().toISOString(),
  };
}

/**
 * Get platform-specific install command for Claude CLI
 */
export function getInstallCommand(options: ClaudeInstallCommandOptions): ClaudeInstallCommand {
  const { isUpdate, version } = options;

  if (!isUpdate) {
    // Fresh install
    if (isWindows()) {
      return {
        command: 'irm https://claude.ai/install.ps1 | iex',
        description: 'Install Claude CLI via PowerShell',
      };
    }
    return {
      command: 'curl -fsSL https://claude.ai/install.sh | bash -s -- latest',
      description: 'Install Claude CLI via shell script',
    };
  }

  // Update or specific version install
  const versionArg = version || 'latest';

  if (isWindows()) {
    return {
      command: `taskkill /IM claude.exe /F 2>$null; claude install --force ${versionArg}`,
      description: version
        ? `Update Claude CLI to version ${version}`
        : 'Update Claude CLI to latest version',
    };
  }

  return {
    command: `pkill -x claude 2>/dev/null; sleep 1; claude install --force ${versionArg}`,
    description: version
      ? `Update Claude CLI to version ${version}`
      : 'Update Claude CLI to latest version',
  };
}
