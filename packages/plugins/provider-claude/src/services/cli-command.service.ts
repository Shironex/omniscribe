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

import type { CliCommandConfig, LaunchContext } from '@omniscribe/plugin-api';
import { createLogger } from '@omniscribe/shared';
import { findCliCommandSync } from '@omniscribe/shared/node';
import { OMNISCRIBE_SYSTEM_PROMPT } from './system-prompt';
import { getClaudeCliPaths } from './cli-detection.service';

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
    // Reuse the canonical path list from the detection service (incl. NVM/fnm
    // dynamic paths) rather than maintaining a second, drift-prone copy.
    return findCliCommandSync('claude', getClaudeCliPaths(), logger);
  }
}
