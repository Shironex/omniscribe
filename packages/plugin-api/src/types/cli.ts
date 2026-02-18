/**
 * CLI Detection and Command Types
 *
 * Types for detecting whether a provider's CLI tool is installed and
 * for building shell commands to launch/manage sessions.
 */

/**
 * Result of detecting whether a provider's CLI is installed and configured.
 *
 * @example
 * ```typescript
 * // CLI found and authenticated
 * {
 *   installed: true,
 *   version: '1.0.15',
 *   path: '/usr/local/bin/claude',
 *   auth: { authenticated: true }
 * }
 *
 * // CLI not found
 * {
 *   installed: false,
 *   error: 'claude command not found in PATH'
 * }
 * ```
 */
export interface CliDetectionResult {
  /** Whether the CLI tool is installed and accessible */
  installed: boolean;

  /** Installed version string (e.g., '1.0.15') */
  version?: string;

  /** Absolute path to the CLI executable */
  path?: string;

  /** Authentication status, if the provider supports auth detection */
  auth?: {
    /** Whether the user is authenticated with the provider */
    authenticated: boolean;
  };

  /** Error message if detection failed */
  error?: string;
}

/**
 * Configuration for a shell command to execute.
 * Used by buildLaunchCommand, buildResumeCommand, and other command builders.
 *
 * @example
 * ```typescript
 * // Launch a new Claude session
 * {
 *   command: 'claude',
 *   args: ['--model', 'opus', '--system-prompt', 'You are a helpful assistant.'],
 *   env: { CLAUDE_CONFIG_DIR: '/path/to/config' },
 *   cwd: '/path/to/project'
 * }
 * ```
 */
export interface CliCommandConfig {
  /** The CLI command or absolute path to the executable */
  command: string;

  /** Command-line arguments */
  args: string[];

  /** Additional environment variables to set (merged with process env) */
  env?: Record<string, string>;

  /** Working directory for the command */
  cwd?: string;
}
