import { Injectable, Inject, forwardRef, Optional } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AiMode, LaunchSessionResult, createLogger, extractErrorMessage } from '@omniscribe/shared';
import type { AiProviderPlugin } from '@omniscribe/plugin-api';
import { TerminalService } from '../terminal';
import { McpWriterService, McpDiscoveryService } from '../mcp';
import { PluginRegistryService } from '../plugin';
import type { SwarmService } from '../swarm/swarm.service';
import { CliCommandService } from './cli-command.service';
import { ClaudeSessionTrackerService } from './claude-session-tracker.service';
import { SessionService } from './session.service';
import { InternalSessionEvents, InternalTerminalEvents } from '../shared/events';

const INITIAL_PROMPT_READY_TIMEOUT_MS = 15000;
const INITIAL_PROMPT_SETTLE_MS = 500;
const INITIAL_PROMPT_SUBMIT_DELAY_MS = 200;
/** Minimum time to wait after spawn before sending prompt, regardless of output settle.
 *  Claude CLI's TUI needs time to initialize its input handler after initial output.
 *  Swarm agents have extra MCP servers which increase TUI init time. */
const INITIAL_PROMPT_MIN_WAIT_MS = 5000;
/** How long to wait for a response after submitting the initial prompt before retrying. */
const INITIAL_PROMPT_VERIFY_TIMEOUT_MS = 5000;
/** Maximum number of times to retry submitting the initial prompt. */
const INITIAL_PROMPT_MAX_RETRIES = 2;

// Type guard for providers that support session tracking
function hasSessionTracker(provider: AiProviderPlugin): provider is AiProviderPlugin & {
  getSessionTracker(): {
    pollForNewSession(
      projectPath: string,
      previousSessionIds: Set<string>,
      maxPolls?: number,
      intervalMs?: number
    ): Promise<{ sessionId: string } | null>;
  };
} {
  return (
    'getSessionTracker' in provider && typeof (provider as any).getSessionTracker === 'function'
  );
}

// Type guard for providers that expose hook management
function hasHookManager(provider: AiProviderPlugin): provider is AiProviderPlugin & {
  getHookManager(): {
    registerHooks(projectPath: string): Promise<void>;
    startWatching(): void;
  };
} {
  return 'getHookManager' in provider && typeof (provider as any).getHookManager === 'function';
}

@Injectable()
export class SessionLauncherService {
  private readonly logger = createLogger('SessionLauncher');

  constructor(
    private readonly sessionService: SessionService,
    private readonly terminalService: TerminalService,
    private readonly mcpWriterService: McpWriterService,
    private readonly mcpDiscoveryService: McpDiscoveryService,
    private readonly cliCommandService: CliCommandService,
    private readonly claudeSessionTracker: ClaudeSessionTrackerService,
    private readonly pluginRegistry: PluginRegistryService,
    private readonly eventEmitter: EventEmitter2,
    @Optional()
    @Inject(forwardRef(() => require('../swarm/swarm.service').SwarmService))
    private readonly swarmService: SwarmService | null
  ) {}

  private async waitForTerminalReady(
    terminalSessionId: number,
    timeoutMs = INITIAL_PROMPT_READY_TIMEOUT_MS
  ): Promise<void> {
    const startTime = Date.now();

    // Phase 1: Wait for terminal output to settle (TUI has rendered)
    await new Promise<void>(resolve => {
      let settleTimer: NodeJS.Timeout | null = null;
      let resolved = false;

      const finish = () => {
        if (resolved) return;
        resolved = true;
        if (settleTimer) {
          clearTimeout(settleTimer);
        }
        clearTimeout(timeout);
        this.eventEmitter.off(InternalTerminalEvents.OUTPUT, handleOutput);
        resolve();
      };

      const handleOutput = (event: { sessionId: number; data: string }) => {
        if (event.sessionId !== terminalSessionId) return;
        if (!event.data.trim()) return;

        if (settleTimer) {
          clearTimeout(settleTimer);
        }
        settleTimer = setTimeout(finish, INITIAL_PROMPT_SETTLE_MS);
      };

      const timeout = setTimeout(() => {
        this.logger.warn(
          `Timed out waiting for terminal readiness for ${terminalSessionId}; sending initial prompt anyway`
        );
        finish();
      }, timeoutMs);

      this.eventEmitter.on(InternalTerminalEvents.OUTPUT, handleOutput);
    });

    // Phase 2: Ensure minimum wait time has elapsed.
    // Claude CLI's TUI may output initial text then pause while loading MCP servers.
    // The settle timer can resolve during this pause, but the TUI input handler
    // isn't ready yet. Enforce a minimum wait to let the TUI fully initialize.
    const elapsed = Date.now() - startTime;
    if (elapsed < INITIAL_PROMPT_MIN_WAIT_MS) {
      const remaining = INITIAL_PROMPT_MIN_WAIT_MS - elapsed;
      this.logger.debug(
        `Terminal output settled after ${elapsed}ms, waiting ${remaining}ms more for TUI readiness`
      );
      await new Promise<void>(resolve => setTimeout(resolve, remaining));
    }
  }

  /**
   * Wait for terminal output activity after submitting a prompt.
   * Returns true if activity was detected (meaning the TUI received the input).
   */
  private waitForPromptResponse(terminalSessionId: number, timeoutMs: number): Promise<boolean> {
    return new Promise<boolean>(resolve => {
      let resolved = false;

      const finish = (detected: boolean) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timeout);
        this.eventEmitter.off(InternalTerminalEvents.OUTPUT, handleOutput);
        resolve(detected);
      };

      const handleOutput = (event: { sessionId: number; data: string }) => {
        if (event.sessionId !== terminalSessionId) return;
        if (!event.data.trim()) return;
        finish(true);
      };

      const timeout = setTimeout(() => finish(false), timeoutMs);
      this.eventEmitter.on(InternalTerminalEvents.OUTPUT, handleOutput);
    });
  }

  private async submitInitialPrompt(
    sessionId: string,
    terminalSessionId: number,
    prompt: string
  ): Promise<void> {
    await this.waitForTerminalReady(terminalSessionId);

    for (let attempt = 0; attempt <= INITIAL_PROMPT_MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        this.logger.warn(
          `Retrying initial prompt for session ${sessionId} (attempt ${attempt + 1}/${INITIAL_PROMPT_MAX_RETRIES + 1})`
        );
        // Wait a bit before retrying
        await new Promise<void>(r => setTimeout(r, INITIAL_PROMPT_MIN_WAIT_MS));
      }

      this.logger.log(`Writing initial prompt to session ${sessionId} (attempt ${attempt + 1})`);
      this.terminalService.write(terminalSessionId, prompt);
      await new Promise<void>(r => setTimeout(r, INITIAL_PROMPT_SUBMIT_DELAY_MS));
      this.terminalService.write(terminalSessionId, '\r');

      // Verify the TUI responded (any output after we sent the prompt)
      const gotResponse = await this.waitForPromptResponse(
        terminalSessionId,
        INITIAL_PROMPT_VERIFY_TIMEOUT_MS
      );

      if (gotResponse) {
        this.logger.log(`Initial prompt accepted by session ${sessionId}`);
        return;
      }

      this.logger.warn(`No response after initial prompt for session ${sessionId}`);
    }

    this.logger.error(
      `Initial prompt may not have been received by session ${sessionId} after ${INITIAL_PROMPT_MAX_RETRIES + 1} attempts`
    );
  }

  /** Look up swarm membership for a session and return env vars if applicable. */
  private getSwarmEnvVars(sessionId: string): Record<string, string> {
    if (!this.swarmService) return {};
    try {
      const swarms = this.swarmService.getSwarms();
      for (const swarm of swarms) {
        const agents = this.swarmService.getAgentsForSwarm(swarm.id);
        const agent = agents.find(a => a.sessionId === sessionId);
        if (agent) {
          return {
            OMNISCRIBE_SWARM_ID: swarm.id,
            OMNISCRIBE_SWARM_ROLE: agent.role,
          };
        }
      }
    } catch {
      this.logger.debug(`Could not look up swarm membership for session ${sessionId}`);
    }
    return {};
  }

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

    // Snapshot current sessions for tracking (if provider supports it)
    let previousSessionIds: Set<string> | null = null;
    const shouldTrackSession = aiMode !== 'plain' && this.pluginRegistry.isPluginMode(aiMode);
    if (shouldTrackSession) {
      try {
        const provider = this.pluginRegistry.getProvider(aiMode);
        if (provider.capabilities.supportsSessionHistory && provider.readSessionHistory) {
          const shouldPoll =
            !session.isResumed || session.forkSessionId || session.continueLastSession;
          if (shouldPoll) {
            const currentEntries = await provider.readSessionHistory(projectPath);
            previousSessionIds = new Set(currentEntries.map(e => e.sessionId));
            this.logger.debug(
              `Snapshotted ${previousSessionIds.size} existing sessions for ${sessionId}`
            );
          }
        }
      } catch (error) {
        const msg = extractErrorMessage(error);
        this.logger.warn(`Failed to snapshot sessions for ${sessionId}: ${msg}`);
      }
    }

    try {
      // Register provider-specific hooks (fire-and-forget)
      if (aiMode !== 'plain' && this.pluginRegistry.isPluginMode(aiMode)) {
        try {
          const provider = this.pluginRegistry.getProvider(aiMode);
          if (hasHookManager(provider)) {
            const hookMgr = provider.getHookManager();
            hookMgr.registerHooks(projectPath).catch((err: Error) => {
              this.logger.warn(`Failed to register hooks for ${sessionId}: ${err.message}`);
            });
            hookMgr.startWatching();
          }
        } catch (error) {
          const msg = extractErrorMessage(error);
          this.logger.warn(`Hook registration failed for ${sessionId}: ${msg}`);
        }
      }

      // MCP config for all provider modes
      if (aiMode !== 'plain' && this.pluginRegistry.isPluginMode(aiMode)) {
        try {
          const provider = this.pluginRegistry.getProvider(aiMode);
          if (provider.capabilities.supportsMcp) {
            // Core handles MCP discovery and writing -- provider specifies via getMcpConfig()
            // For Claude, we use the existing core MCP infrastructure
            const allServers = await this.mcpDiscoveryService.discoverServers(projectPath);
            this.logger.log(`Discovered ${allServers.length} MCP servers for session ${sessionId}`);
            const swarmEnv = this.getSwarmEnvVars(sessionId);
            await this.mcpWriterService.writeConfig(
              worktreePath,
              sessionId,
              projectPath,
              allServers,
              swarmEnv
            );
            this.logger.log(`MCP config written to ${worktreePath}/.mcp.json`);
          }
        } catch (error) {
          const msg = extractErrorMessage(error);
          this.logger.warn(`MCP config failed for '${aiMode}': ${msg}`);
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

      // Auto-submit initial prompt for swarm agents once the terminal starts producing output.
      // Text and Enter (\r) are sent separately — Claude CLI's TUI may
      // swallow a trailing \r when it arrives in the same buffer as the text.
      if (session.initialPrompt) {
        const prompt = session.initialPrompt;
        this.submitInitialPrompt(sessionId, terminalSessionId, prompt).catch((error: Error) => {
          this.logger.warn(
            `Failed to auto-submit initial prompt for ${sessionId}: ${error.message}`
          );
        });
      }

      // Post-launch session tracking (fire-and-forget)
      if (shouldTrackSession && previousSessionIds) {
        const provider = this.pluginRegistry.getProvider(aiMode);
        if (hasSessionTracker(provider)) {
          const tracker = provider.getSessionTracker();
          // Fire-and-forget: polls for new session, emits event when found
          tracker.pollForNewSession(projectPath, previousSessionIds).then(
            (entry: { sessionId: string } | null) => {
              if (entry) {
                const providerSessionId = entry.sessionId;
                this.sessionService.setClaudeSessionId(sessionId, providerSessionId);
                this.logger.info(
                  `Captured provider session ID for ${sessionId}: ${providerSessionId}`
                );

                // Emit event so gateway broadcasts to frontend AND tracker persists snapshot
                this.eventEmitter.emit(InternalSessionEvents.CLAUDE_ID_CAPTURED, {
                  sessionId,
                  claudeSessionId: providerSessionId,
                });

                // Eagerly update the active sessions snapshot
                this.claudeSessionTracker.refreshActiveSessionsSnapshot('claude-id-captured');
              }
            },
            (error: Error) => {
              this.logger.warn(`Session tracking failed for ${sessionId}: ${error.message}`);
            }
          );
        }
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
