import { Injectable } from '@nestjs/common';
import { AiMode, LaunchSessionResult, createLogger, extractErrorMessage } from '@omniscribe/shared';
import { TerminalService } from '../terminal';
import { McpWriterService, McpDiscoveryService } from '../mcp';
import { PluginRegistryService } from '../plugin';
import { CliCommandService } from './cli-command.service';
import { ClaudeSessionReaderService } from './claude-session-reader.service';
import { HookManagerService } from './hook-manager.service';
import { ClaudeSessionTrackerService } from './claude-session-tracker.service';
import { SessionService } from './session.service';

@Injectable()
export class SessionLauncherService {
  private readonly logger = createLogger('SessionLauncher');

  constructor(
    private readonly sessionService: SessionService,
    private readonly terminalService: TerminalService,
    private readonly mcpWriterService: McpWriterService,
    private readonly mcpDiscoveryService: McpDiscoveryService,
    private readonly cliCommandService: CliCommandService,
    private readonly claudeSessionReader: ClaudeSessionReaderService,
    private readonly hookManager: HookManagerService,
    private readonly claudeSessionTracker: ClaudeSessionTrackerService,
    private readonly pluginRegistry: PluginRegistryService
  ) {}

  /**
   * Launch a session by spawning the appropriate AI CLI in a terminal.
   * @param sessionId The session ID to launch
   * @param projectPath The project directory path
   * @param worktreePath The worktree directory (working directory for the CLI)
   * @param aiMode The AI mode determining which CLI to spawn
   * @returns Launch result with terminal session ID or error
   */
  async launchSession(
    sessionId: string,
    projectPath: string,
    worktreePath: string,
    aiMode: AiMode
  ): Promise<LaunchSessionResult> {
    const session = this.sessionService.get(sessionId);

    if (!session) {
      return {
        success: false,
        error: `Session not found: ${sessionId}`,
      };
    }

    // Check if session already has an active terminal
    if (session.terminalSessionId !== undefined) {
      if (this.terminalService.hasSession(session.terminalSessionId)) {
        return {
          success: false,
          error: 'Session already has an active terminal',
        };
      }
      // Terminal no longer exists, clear the reference
      this.sessionService.clearTerminalRef(sessionId);
    }

    // Update status to connecting
    this.sessionService.updateStatus(sessionId, 'connecting', 'Starting AI session...');

    // Snapshot current Claude session IDs before spawning (for non-resumed sessions, forks, and continue)
    // so we can detect which new Claude session was created by this launch.
    // Fork creates a new session (sidechain), so we poll for it. Continue also creates/resumes.
    const shouldPollForNewSession =
      aiMode === 'claude' &&
      (!session.isResumed || session.forkSessionId || session.continueLastSession);
    let previousSessionIds: Set<string> | null = null;
    if (shouldPollForNewSession) {
      try {
        const currentEntries = await this.claudeSessionReader.readSessionsIndex(projectPath);
        previousSessionIds = new Set(currentEntries.map(e => e.sessionId));
        this.logger.debug(
          `Snapshotted ${previousSessionIds.size} existing Claude sessions for ${sessionId}`
        );
      } catch (error) {
        const msg = extractErrorMessage(error);
        this.logger.warn(`Failed to snapshot Claude sessions for ${sessionId}: ${msg}`);
      }
    }

    try {
      // Register hooks for instant session ID capture (fire-and-forget)
      if (aiMode === 'claude') {
        this.hookManager.registerHooks(projectPath).catch(err => {
          const msg = extractErrorMessage(err);
          this.logger.warn(`Failed to register hooks for ${sessionId}: ${msg}`);
        });
        this.hookManager.startWatching();
      }

      // Only discover and write MCP config for Claude sessions.
      // Plain terminals don't use Claude Code and don't read .mcp.json.
      // Writing for all modes causes a race condition where the plain session
      // overwrites the Claude session's ID in .mcp.json.
      if (aiMode === 'claude') {
        const allServers = await this.mcpDiscoveryService.discoverServers(projectPath);
        this.logger.log(`Discovered ${allServers.length} MCP servers for session ${sessionId}`);

        await this.mcpWriterService.writeConfig(worktreePath, sessionId, projectPath, allServers);

        this.logger.log(`MCP config written to ${worktreePath}/.mcp.json`);
      }
      // Plugin providers that support MCP can contribute their own config.
      // Delegated to the provider's getMcpConfig() method.
      else if (aiMode !== 'plain' && this.pluginRegistry.isPluginMode(aiMode)) {
        try {
          const provider = this.pluginRegistry.getProvider(aiMode);
          if (provider.capabilities.supportsMcp && provider.getMcpConfig) {
            const mcpContribution = await provider.getMcpConfig(sessionId, projectPath);
            if (mcpContribution) {
              this.logger.log(
                `Plugin '${aiMode}' contributed MCP config to ${mcpContribution.configPath}`
              );
            }
          }
        } catch (error) {
          const msg = extractErrorMessage(error);
          this.logger.warn(`Plugin MCP config failed for '${aiMode}': ${msg}`);
        }
      }

      // Get CLI configuration for the AI mode.
      // Spread session fields and add launch context (sessionId, worktreePath, projectPath)
      // so plugin providers receive a complete LaunchContext via CliSessionContext.
      const cliConfig = this.cliCommandService.getCliConfig(aiMode, {
        ...session,
        sessionId: sessionId,
        workingDirectory: worktreePath,
        projectPath: projectPath,
      });

      // Generate project hash for MCP status file identification
      const projectHash = this.mcpWriterService.generateProjectHash(projectPath);

      // Build environment variables for the spawned terminal process.
      // Note: OMNISCRIBE_SESSION_ID is also written to .mcp.json env for Claude sessions
      // so the MCP server subprocess can identify which session it belongs to.
      const env: Record<string, string> = {
        OMNISCRIBE_SESSION_ID: sessionId,
        OMNISCRIBE_PROJECT_HASH: projectHash,
        OMNISCRIBE_PROJECT_PATH: projectPath,
        OMNISCRIBE_WORKTREE_PATH: worktreePath,
        OMNISCRIBE_AI_MODE: aiMode,
      };

      // Add model if specified
      if (session.model) {
        env.OMNISCRIBE_MODEL = session.model;
      }

      this.logger.log(
        `Launching session ${sessionId}: ${cliConfig.command} ${cliConfig.args.join(' ')} in ${worktreePath}`
      );

      // Spawn the terminal with the AI CLI
      const terminalSessionId = this.terminalService.spawnCommand(
        cliConfig.command,
        cliConfig.args,
        worktreePath,
        env,
        sessionId // Link terminal to session
      );

      // Register terminal reference in session state
      this.sessionService.registerTerminal(sessionId, terminalSessionId, worktreePath);

      // Update status to idle (session is waiting for user input)
      // MCP will report actual status (working/planning) when user sends a prompt
      this.sessionService.updateStatus(
        sessionId,
        'idle',
        `Running ${this.cliCommandService.getAiModeName(aiMode)}`
      );

      this.logger.log(`Session ${sessionId} launched with terminal ${terminalSessionId}`);

      // Poll for new Claude session ID (fire-and-forget, does not block launch)
      if (shouldPollForNewSession && previousSessionIds) {
        this.claudeSessionTracker.startTracking(sessionId, projectPath, previousSessionIds);
      }

      return {
        success: true,
        terminalSessionId,
      };
    } catch (error) {
      const errorMessage = extractErrorMessage(error);

      this.logger.error(`Failed to launch session ${sessionId}`, error);

      this.sessionService.updateStatus(sessionId, 'error', `Launch failed: ${errorMessage}`);

      return {
        success: false,
        error: errorMessage,
      };
    }
  }
}
