/**
 * Claude CLI Command Service
 *
 * Builds CLI commands for launching, resuming, forking, and continuing
 * Claude Code sessions. Handles path resolution for the Claude CLI
 * executable across platforms.
 *
 * Extracted from apps/desktop/src/modules/session/cli-command.service.ts.
 * Pure TypeScript class with no NestJS dependencies.
 */

import * as os from 'os';
import * as path from 'path';
import type { CliCommandConfig, LaunchContext } from '@omniscribe/plugin-api';
import { createLogger } from '@omniscribe/shared';
import { findCliCommandSync } from '@omniscribe/shared/node';
import { OMNISCRIBE_SYSTEM_PROMPT } from './system-prompt';

const logger = createLogger('ClaudeCliCommand');

/**
 * Claude CLI Command Service.
 *
 * Builds CliCommandConfig objects for all session operations (launch, resume,
 * fork, continue). Each method resolves the Claude CLI path and constructs
 * the appropriate argument list.
 */
export class ClaudeCliCommandService {
  /**
   * Build command to launch a new Claude Code session.
   *
   * Corresponds to AiProviderPlugin.buildLaunchCommand().
   */
  buildLaunch(context: LaunchContext): CliCommandConfig {
    const args: string[] = [];

    if (context.skipPermissions) {
      args.push('--dangerously-skip-permissions');
    }

    if (context.model) {
      args.push('--model', context.model);
    }

    // System prompt flags only apply to new sessions
    if (context.systemPrompt) {
      args.push('--system-prompt', context.systemPrompt);
    }

    args.push('--append-system-prompt', OMNISCRIBE_SYSTEM_PROMPT);

    const command = this.resolveClaudeCommand();
    return { command, args };
  }

  /**
   * Build command to resume an existing Claude Code session by ID.
   *
   * Corresponds to AiProviderPlugin.buildResumeCommand().
   */
  buildResume(sessionId: string, context: LaunchContext): CliCommandConfig {
    const args: string[] = [];

    if (context.skipPermissions) {
      args.push('--dangerously-skip-permissions');
    }

    args.push('--resume', sessionId);

    if (context.model) {
      args.push('--model', context.model);
    }

    // No system prompt flags on resume -- session already has its prompts

    const command = this.resolveClaudeCommand();
    return { command, args };
  }

  /**
   * Build command to fork a new session from an existing Claude Code session.
   *
   * Corresponds to AiProviderPlugin.buildForkCommand().
   */
  buildFork(sessionId: string, context: LaunchContext): CliCommandConfig {
    const args: string[] = [];

    if (context.skipPermissions) {
      args.push('--dangerously-skip-permissions');
    }

    args.push('--resume', sessionId, '--fork-session');

    if (context.model) {
      args.push('--model', context.model);
    }

    // No system prompt flags on fork -- forked from existing session

    const command = this.resolveClaudeCommand();
    return { command, args };
  }

  /**
   * Build command to continue the most recent Claude Code session.
   *
   * Corresponds to AiProviderPlugin.buildContinueCommand().
   */
  buildContinue(context: LaunchContext): CliCommandConfig {
    const args: string[] = [];

    if (context.skipPermissions) {
      args.push('--dangerously-skip-permissions');
    }

    args.push('--continue');

    if (context.model) {
      args.push('--model', context.model);
    }

    // No system prompt flags on continue -- session already has its prompts

    const command = this.resolveClaudeCommand();
    return { command, args };
  }

  /**
   * Resolve the Claude CLI command path.
   *
   * Checks PATH first, then known installation locations, and falls back
   * to the bare 'claude' command if nothing is found.
   */
  resolveClaudeCommand(): string {
    return findCliCommandSync('claude', this.getClaudeCliPaths(), logger);
  }

  /**
   * Get common paths where Claude CLI might be installed.
   */
  private getClaudeCliPaths(): string[] {
    const homeDir = os.homedir();

    if (os.platform() === 'win32') {
      const appData = process.env.APPDATA || path.join(homeDir, 'AppData', 'Roaming');
      const localAppData = process.env.LOCALAPPDATA || path.join(homeDir, 'AppData', 'Local');

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
}
