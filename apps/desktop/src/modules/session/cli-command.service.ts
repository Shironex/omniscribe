import { Injectable } from '@nestjs/common';
import * as os from 'os';
import { AiMode, createLogger } from '@omniscribe/shared';
import type { LaunchContext, CliCommandConfig } from '@omniscribe/plugin-api';
import { PluginRegistryService } from '../plugin';
import { AiCliConfig } from './types';

/**
 * Session configuration subset needed for CLI config generation
 */
export interface CliSessionContext {
  model?: string;
  systemPrompt?: string;
  skipPermissions?: boolean;
  /** Claude Code session UUID to resume (passes --resume flag) */
  resumeSessionId?: string;
  /** Claude Code session UUID to fork (passes --resume + --fork-session flags) */
  forkSessionId?: string;
  /** Whether to continue the most recent session (passes --continue flag) */
  continueLastSession?: boolean;
  /** Initial prompt to auto-start the session (used by swarm agents) */
  initialPrompt?: string;
  // --- Added for plugin LaunchContext population ---
  /** Omniscribe session identifier */
  sessionId?: string;
  /** Working directory for the session (may be a worktree path) */
  workingDirectory?: string;
  /** Original project path (before worktree resolution) */
  projectPath?: string;
}

/**
 * Service responsible for CLI command resolution and configuration.
 * Handles finding AI CLI executables across different platforms and
 * building the appropriate command arguments.
 *
 * For 'plain' mode, uses shell config.
 * For all other modes, delegates to the provider plugin via the registry.
 */
@Injectable()
export class CliCommandService {
  private readonly logger = createLogger('CliCommandService');

  constructor(private readonly pluginRegistry: PluginRegistryService) {}

  /**
   * Get the CLI configuration for a given AI mode
   * @param aiMode The AI mode determining which CLI to spawn
   * @param session Session context with optional model and system prompt
   * @returns CLI configuration with command and arguments
   */
  getCliConfig(aiMode: AiMode, session: CliSessionContext): AiCliConfig {
    if (aiMode === 'plain') return this.getShellConfig();

    // ALL non-plain modes go through the plugin registry (including Claude)
    if (this.pluginRegistry.isPluginMode(aiMode)) {
      return this.getPluginCliConfig(aiMode, session);
    }

    // Unknown mode -- should not happen if isValidMode() was checked
    this.logger.warn(`No provider registered for mode: ${aiMode}, falling back to shell`);
    return this.getShellConfig();
  }

  /**
   * Get human-readable name for AI mode
   * @param aiMode The AI mode
   * @returns Human-readable name
   */
  getAiModeName(aiMode: AiMode): string {
    if (aiMode === 'plain') return 'Plain Terminal';
    if (aiMode === 'claude') return 'Claude';

    // Check plugin registry for display name
    const entry = this.pluginRegistry.getProviderEntry(aiMode);
    if (entry) return entry.manifest.displayName;

    return aiMode;
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
   * Get CLI configuration by delegating to a plugin provider.
   * Builds a LaunchContext from the CliSessionContext and routes to the
   * appropriate provider method (launch/resume/fork/continue).
   */
  private getPluginCliConfig(aiMode: string, session: CliSessionContext): AiCliConfig {
    const provider = this.pluginRegistry.getProvider(aiMode);

    const launchContext: LaunchContext = {
      sessionId: session.sessionId ?? '',
      workingDirectory: session.workingDirectory ?? '',
      projectPath: session.projectPath ?? '',
      model: session.model,
      systemPrompt: session.systemPrompt,
      skipPermissions: session.skipPermissions,
      initialPrompt: session.initialPrompt,
    };

    let cmdConfig: CliCommandConfig;

    if (session.continueLastSession && provider.buildContinueCommand) {
      cmdConfig = provider.buildContinueCommand(launchContext);
    } else if (session.forkSessionId && provider.buildForkCommand) {
      cmdConfig = provider.buildForkCommand(session.forkSessionId, launchContext);
    } else if (session.resumeSessionId && provider.buildResumeCommand) {
      cmdConfig = provider.buildResumeCommand(session.resumeSessionId, launchContext);
    } else {
      cmdConfig = provider.buildLaunchCommand(launchContext);
    }

    this.logger.debug(
      `Plugin CLI config for '${aiMode}': ${cmdConfig.command} ${cmdConfig.args.join(' ')}`
    );

    return {
      command: cmdConfig.command,
      args: cmdConfig.args,
    };
  }
}
