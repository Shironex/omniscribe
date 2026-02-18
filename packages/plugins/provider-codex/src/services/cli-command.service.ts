/**
 * Codex CLI Command Service
 *
 * Builds CLI commands for launching, resuming, forking, and continuing
 * Codex CLI sessions. Handles path resolution for the Codex CLI
 * executable across platforms.
 *
 * Key differences from Claude CLI:
 * - Resume uses `codex resume SESSION_ID` (subcommand, not --flag)
 * - Continue uses `codex resume --last`
 * - Fork uses `codex fork SESSION_ID` (dedicated subcommand)
 * - Skip permissions uses `--dangerously-bypass-approvals-and-sandbox`
 * - No system prompt flags (Codex uses AGENTS.md and config)
 */

import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { execFileSync } from 'child_process';
import type { CliCommandConfig, LaunchContext } from '@omniscribe/plugin-api';
import { createLogger } from '@omniscribe/shared';

const logger = createLogger('CodexCliCommand');

/**
 * Codex CLI Command Service.
 *
 * Builds CliCommandConfig objects for all session operations (launch, resume,
 * fork, continue). Each method resolves the Codex CLI path and constructs
 * the appropriate argument list.
 */
export class CodexCliCommandService {
  /**
   * Build command to launch a new Codex session.
   *
   * Corresponds to AiProviderPlugin.buildLaunchCommand().
   *
   * Usage: codex [--model MODEL] [--dangerously-bypass-approvals-and-sandbox] [PROMPT]
   */
  buildLaunch(context: LaunchContext): CliCommandConfig {
    const args: string[] = [];

    if (context.skipPermissions) {
      args.push('--dangerously-bypass-approvals-and-sandbox');
    }

    if (context.model) {
      args.push('--model', context.model);
    }

    // Codex does not have --system-prompt or --append-system-prompt.
    // System prompt instructions go via AGENTS.md or config.toml.

    const command = this.resolveCodexCommand();
    return { command, args, cwd: context.workingDirectory };
  }

  /**
   * Build command to resume an existing Codex session by ID.
   *
   * Corresponds to AiProviderPlugin.buildResumeCommand().
   *
   * Usage: codex resume SESSION_ID [--model MODEL]
   */
  buildResume(sessionId: string, context: LaunchContext): CliCommandConfig {
    const args: string[] = ['resume', sessionId];

    if (context.model) {
      args.push('--model', context.model);
    }

    const command = this.resolveCodexCommand();
    return { command, args, cwd: context.workingDirectory };
  }

  /**
   * Build command to continue the most recent Codex session.
   *
   * Corresponds to AiProviderPlugin.buildContinueCommand().
   *
   * Usage: codex resume --last [--model MODEL]
   */
  buildContinue(context: LaunchContext): CliCommandConfig {
    const args: string[] = ['resume', '--last'];

    if (context.model) {
      args.push('--model', context.model);
    }

    const command = this.resolveCodexCommand();
    return { command, args, cwd: context.workingDirectory };
  }

  /**
   * Build command to fork a new session from an existing Codex session.
   *
   * Corresponds to AiProviderPlugin.buildForkCommand().
   *
   * Usage: codex fork SESSION_ID [--model MODEL]
   */
  buildFork(sessionId: string, context: LaunchContext): CliCommandConfig {
    const args: string[] = ['fork', sessionId];

    if (context.model) {
      args.push('--model', context.model);
    }

    const command = this.resolveCodexCommand();
    return { command, args, cwd: context.workingDirectory };
  }

  /**
   * Resolve the Codex CLI command path.
   *
   * Checks PATH first, then known installation locations, and falls back
   * to the bare 'codex' command if nothing is found.
   */
  resolveCodexCommand(): string {
    return this.findCliCommand('codex', this.getCodexCliPaths());
  }

  /**
   * Find a CLI command, checking PATH first, then known installation locations.
   */
  private findCliCommand(command: string, knownPaths: string[]): string {
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
    logger.info(
      `CLI not found in PATH or known locations, falling back to bare command: ${command}`
    );
    return command;
  }

  /**
   * Find an executable in the system PATH using 'where' (Windows) or 'which' (Unix).
   */
  private findInPath(command: string): string | null {
    try {
      const whichCmd = os.platform() === 'win32' ? 'where' : 'which';
      const result = execFileSync(whichCmd, [command], {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      const firstLine = result.trim().split(/\r?\n/)[0];
      return firstLine || null;
    } catch (error) {
      logger.debug(`CLI "${command}" not found in PATH`, error);
      return null;
    }
  }

  /**
   * Get common paths where Codex CLI might be installed.
   *
   * Covers standard locations, npm global, Volta, pnpm, Yarn,
   * Homebrew, and Linuxbrew paths. NVM/fnm dynamic scanning is
   * handled by the detection service (this uses static paths only
   * for synchronous resolution).
   */
  private getCodexCliPaths(): string[] {
    const homeDir = os.homedir();

    if (os.platform() === 'win32') {
      const appData = process.env['APPDATA'] || path.join(homeDir, 'AppData', 'Roaming');
      const localAppData = process.env['LOCALAPPDATA'] || path.join(homeDir, 'AppData', 'Local');

      return [
        // Local bin
        path.join(homeDir, '.local', 'bin', 'codex.exe'),
        // npm global installations
        path.join(appData, 'npm', 'codex.cmd'),
        path.join(appData, 'npm', 'codex'),
        path.join(appData, '.npm-global', 'bin', 'codex.cmd'),
        path.join(appData, '.npm-global', 'bin', 'codex'),
        // Volta
        path.join(homeDir, '.volta', 'bin', 'codex.exe'),
        // pnpm global
        path.join(localAppData, 'pnpm', 'codex.cmd'),
        path.join(localAppData, 'pnpm', 'codex'),
      ];
    }

    // macOS and Linux paths
    return [
      // Standard locations
      path.join(homeDir, '.local', 'bin', 'codex'),
      '/opt/homebrew/bin/codex',
      '/usr/local/bin/codex',
      '/usr/bin/codex',
      path.join(homeDir, '.npm-global', 'bin', 'codex'),
      // Linuxbrew
      '/home/linuxbrew/.linuxbrew/bin/codex',
      // Volta
      path.join(homeDir, '.volta', 'bin', 'codex'),
      // pnpm global
      path.join(homeDir, '.local', 'share', 'pnpm', 'codex'),
      // Yarn global
      path.join(homeDir, '.yarn', 'bin', 'codex'),
      path.join(homeDir, '.config', 'yarn', 'global', 'node_modules', '.bin', 'codex'),
      // Snap packages
      '/snap/bin/codex',
    ];
  }

  /**
   * Find the first existing path from a list of paths.
   */
  private findFirstExistingPath(paths: string[]): string | null {
    for (const p of paths) {
      try {
        if (fs.existsSync(p)) {
          return p;
        }
      } catch (error) {
        logger.debug(`Error checking path ${p}`, error);
      }
    }
    return null;
  }
}
