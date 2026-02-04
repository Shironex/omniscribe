import { Injectable } from '@nestjs/common';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { execFileSync } from 'child_process';
import { AiMode } from '@omniscribe/shared';
import { AiCliConfig } from './types';

/**
 * Session configuration subset needed for CLI config generation
 */
export interface CliSessionContext {
  model?: string;
  systemPrompt?: string;
}

/**
 * Service responsible for CLI command resolution and configuration.
 * Handles finding AI CLI executables across different platforms and
 * building the appropriate command arguments.
 */
@Injectable()
export class CliCommandService {

  /**
   * Get the CLI configuration for a given AI mode
   * @param aiMode The AI mode determining which CLI to spawn
   * @param session Session context with optional model and system prompt
   * @returns CLI configuration with command and arguments
   */
  getCliConfig(aiMode: AiMode, session: CliSessionContext): AiCliConfig {
    switch (aiMode) {
      case 'claude':
        return this.getClaudeCliConfig(session);

      case 'plain':
      default:
        return this.getShellConfig();
    }
  }

  /**
   * Get human-readable name for AI mode
   * @param aiMode The AI mode
   * @returns Human-readable name
   */
  getAiModeName(aiMode: AiMode): string {
    switch (aiMode) {
      case 'claude':
        return 'Claude';
      case 'plain':
        return 'Plain Terminal';
      default:
        return 'Unknown';
    }
  }

  /**
   * Get Claude CLI configuration
   */
  private getClaudeCliConfig(session: CliSessionContext): AiCliConfig {
    const args: string[] = [];

    // Add model flag if specified
    if (session.model) {
      args.push('--model', session.model);
    }

    // Add system prompt if specified (replaces default)
    if (session.systemPrompt) {
      args.push('--system-prompt', session.systemPrompt);
    }

    // Append Omniscribe status reporting instructions
    // This adds to the default system prompt without replacing it
    const omniscribePrompt = `
## Omniscribe Integration

You have access to the Omniscribe MCP server which tracks your task status. Use it proactively:

- **When starting work**: Call \`mcp__omniscribe__omniscribe_status\` with state "working" and describe what you're doing
- **When entering plan mode**: Call with state "planning" and describe what you're planning
- **When waiting for user input**: Call with state "needs_input" and include the question in \`needsInputPrompt\`
- **When task/plan is complete**: Call with state "finished" to indicate completion
- **On errors**: Call with state "error" and describe what went wrong

Report status at key transitions so the user can see your progress in the Omniscribe UI.
`.trim();

    args.push('--append-system-prompt', omniscribePrompt);

    // Find the Claude CLI command with proper path resolution
    // This is needed on all platforms because Electron doesn't inherit the user's shell PATH
    const command = this.findCliCommand('claude', this.getClaudeCliPaths());

    return {
      command,
      args,
    };
  }

  /**
   * Get shell configuration for plain terminal mode
   */
  private getShellConfig(): AiCliConfig {
    if (os.platform() === 'win32') {
      return {
        command: process.env.COMSPEC || 'cmd.exe',
        args: [],
      };
    }

    return {
      command: process.env.SHELL || '/bin/bash',
      args: ['-l'], // Login shell
    };
  }

  /**
   * Find a CLI command, checking PATH first, then known installation locations
   * @param command The base command name (e.g., 'claude')
   * @param knownPaths Platform-specific known installation paths
   * @returns The resolved command path
   */
  private findCliCommand(command: string, knownPaths: string[]): string {
    // First, try to find in PATH
    const pathResult = this.findInPath(command);
    if (pathResult) {
      return pathResult;
    }

    // On Windows, also try with .cmd and .exe extensions
    if (os.platform() === 'win32') {
      const cmdResult = this.findInPath(`${command}.cmd`);
      if (cmdResult) {
        return cmdResult;
      }
      const exeResult = this.findInPath(`${command}.exe`);
      if (exeResult) {
        return exeResult;
      }
    }

    // Check known installation paths
    const knownPath = this.findFirstExistingPath(knownPaths);
    if (knownPath) {
      return knownPath;
    }

    // Fall back to the bare command (will likely fail, but provides clear error)
    return command;
  }

  /**
   * Find an executable in the system PATH using 'where' (Windows) or 'which' (Unix)
   * @param command The command name to find
   * @returns The full path to the executable, or null if not found
   */
  private findInPath(command: string): string | null {
    try {
      const whichCmd = os.platform() === 'win32' ? 'where' : 'which';
      const result = execFileSync(whichCmd, [command], {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      // 'where' on Windows may return multiple lines, take the first
      const firstLine = result.trim().split(/\r?\n/)[0];
      return firstLine || null;
    } catch {
      return null;
    }
  }

  /**
   * Get common paths where Claude CLI might be installed
   */
  private getClaudeCliPaths(): string[] {
    const homeDir = os.homedir();

    if (os.platform() === 'win32') {
      const appData =
        process.env.APPDATA || path.join(homeDir, 'AppData', 'Roaming');
      const localAppData =
        process.env.LOCALAPPDATA || path.join(homeDir, 'AppData', 'Local');

      return [
        // npm global installations
        path.join(appData, 'npm', 'claude.cmd'),
        path.join(appData, 'npm', 'claude'),
        path.join(appData, '.npm-global', 'bin', 'claude.cmd'),
        path.join(appData, '.npm-global', 'bin', 'claude'),
        // Local bin
        path.join(homeDir, '.local', 'bin', 'claude.exe'),
        path.join(homeDir, '.local', 'bin', 'claude'),
        // pnpm global
        path.join(localAppData, 'pnpm', 'claude.cmd'),
        path.join(localAppData, 'pnpm', 'claude'),
        // Volta
        path.join(homeDir, '.volta', 'bin', 'claude.exe'),
      ];
    }

    // macOS and Linux paths
    return [
      // npm global installations
      '/usr/local/bin/claude',
      '/usr/bin/claude',
      path.join(homeDir, '.npm-global', 'bin', 'claude'),
      // Local bin
      path.join(homeDir, '.local', 'bin', 'claude'),
      // nvm installations
      path.join(homeDir, '.nvm', 'versions', 'node', '*', 'bin', 'claude'),
      // pnpm global
      path.join(homeDir, 'Library', 'pnpm', 'claude'),
      path.join(homeDir, '.local', 'share', 'pnpm', 'claude'),
      // Homebrew
      '/opt/homebrew/bin/claude',
      // Volta
      path.join(homeDir, '.volta', 'bin', 'claude'),
      // Bun
      path.join(homeDir, '.bun', 'bin', 'claude'),
    ];
  }

  /**
   * Find the first existing path from a list of paths
   */
  private findFirstExistingPath(paths: string[]): string | null {
    for (const p of paths) {
      try {
        if (fs.existsSync(p)) {
          return p;
        }
      } catch {
        // Ignore errors, try next path
      }
    }
    return null;
  }
}
