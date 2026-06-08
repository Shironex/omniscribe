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

import type { CliCommandConfig, LaunchContext } from '@omniscribe/plugin-api';
import { createLogger } from '@omniscribe/shared';
import { findCliCommandSync } from '@omniscribe/shared/node';
import { getCodexCliPaths } from './cli-detection.service';

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
    // Reuse the canonical path list from the detection service (incl. NVM/fnm
    // dynamic paths) rather than maintaining a second, drift-prone copy.
    return findCliCommandSync('codex', getCodexCliPaths(), logger);
  }
}
