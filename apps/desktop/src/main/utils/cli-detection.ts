import { exec } from 'child_process';
import { promisify } from 'util';
import { existsSync } from 'fs';

const execAsync = promisify(exec);

/**
 * Supported CLI tools to check for
 */
export const CLI_TOOLS = ['claude', 'npm', 'node', 'git', 'pnpm', 'yarn', 'gh'] as const;
export type CLITool = (typeof CLI_TOOLS)[number];

/**
 * Check if a CLI tool is available in PATH
 */
export async function checkCliAvailable(tool: CLITool): Promise<boolean> {
  const { execSync } = await import('child_process');
  try {
    execSync(`${tool} --version`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Result of CLI detection
 */
export interface CliDetectionResult {
  cliPath?: string;
  method: 'path' | 'local' | 'none';
}

/**
 * Find a CLI tool in PATH
 * @param toolName Name of the tool to find
 * @returns Path to the tool if found, undefined otherwise
 */
export async function findCliInPath(toolName: string): Promise<string | undefined> {
  const platform = process.platform;

  try {
    const command = platform === 'win32' ? `where ${toolName}` : `which ${toolName}`;
    const { stdout } = await execAsync(command);
    // Take first line (Windows 'where' may return multiple results)
    const firstPath = stdout.trim().split('\n')[0]?.trim();
    return firstPath || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Find CLI in known local paths
 * @param localPaths Array of paths to check
 * @returns Path to the tool if found, undefined otherwise
 */
export function findCliInLocalPaths(localPaths: string[]): string | undefined {
  for (const localPath of localPaths) {
    if (existsSync(localPath)) {
      return localPath;
    }
  }
  return undefined;
}
