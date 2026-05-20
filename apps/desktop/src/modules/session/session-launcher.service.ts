import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as crypto from 'crypto';
import {
  AiMode,
  LaunchSessionResult,
  WorktreeSettings,
  SessionSettings,
  DEFAULT_WORKTREE_SETTINGS,
  DEFAULT_SESSION_SETTINGS,
  MAX_CONCURRENT_SESSIONS,
  MAX_SESSION_NAME_LENGTH,
  createLogger,
  extractErrorMessage,
} from '@omniscribe/shared';
import { TerminalService } from '../terminal';
import { McpWriterService, McpDiscoveryService } from '../mcp';
import { GitBaseService, GitService, WorktreeService } from '../git';
import { WorkspaceService } from '../workspace';
import { PluginRegistryService } from '../plugin';
import { validatePath } from '../shared/validation';
import { CliCommandService } from './cli-command.service';
import { SessionService } from './session.service';
import { BackendSessionConfig } from './types';
import { InternalSessionEvents } from '../shared/events';
import { hasProviderMethod } from '../shared/provider-guards';

/**
 * Input for the top-level launch flow used by both the WebSocket gateway
 * and the omniscribe:// deep-link handler.
 */
export interface LaunchInput {
  projectPath: string;
  mode: AiMode;
  branch?: string;
  name?: string;
  source: 'gateway' | 'deeplink';
  createOptions?: Parameters<SessionService['create']>[2];
}

export interface LaunchOutcome {
  session?: BackendSessionConfig;
  terminalSessionId?: number;
  worktreeWarning?: string;
  error?: string;
  /** When the concurrency limit is hit, names of idle sessions the user could close. */
  idleSessions?: string[];
}

@Injectable()
export class SessionLauncherService {
  private readonly logger = createLogger('SessionLauncher');

  constructor(
    private readonly sessionService: SessionService,
    private readonly terminalService: TerminalService,
    private readonly mcpWriterService: McpWriterService,
    private readonly mcpDiscoveryService: McpDiscoveryService,
    private readonly gitBase: GitBaseService,
    private readonly cliCommandService: CliCommandService,
    private readonly pluginRegistry: PluginRegistryService,
    private readonly eventEmitter: EventEmitter2,
    private readonly worktreeService: WorktreeService,
    private readonly gitService: GitService,
    @Inject(forwardRef(() => WorkspaceService))
    private readonly workspaceService: WorkspaceService
  ) {}

  /**
   * Top-level launch flow: validate, enforce concurrency, resolve worktree preference,
   * create the session, and spawn the AI CLI. Shared by SessionGateway (WebSocket
   * create/resume/fork/continue-last) and DeepLinkService (omniscribe://run).
   *
   * The caller is still responsible for transport-specific work (e.g. joining
   * Socket.io rooms) — this method only owns the session lifecycle.
   */
  async launch(input: LaunchInput): Promise<LaunchOutcome> {
    const { projectPath, mode, branch, name, createOptions } = input;

    if (name && name.length > MAX_SESSION_NAME_LENGTH) {
      return { error: `name exceeds maximum length of ${MAX_SESSION_NAME_LENGTH} characters` };
    }

    if (!this.pluginRegistry.isValidMode(mode)) {
      return {
        error: `Invalid AI mode: ${String(mode)}. No built-in or plugin provider registered for this mode.`,
      };
    }

    const pathError = validatePath(projectPath);
    if (pathError) {
      return { error: pathError };
    }

    const runningSessions = this.sessionService.getRunningSessions();
    if (runningSessions.length >= MAX_CONCURRENT_SESSIONS) {
      const idleSessions = this.sessionService.getIdleSessions();
      this.logger.warn(
        `[${input.source}] Session limit reached: ${runningSessions.length}/${MAX_CONCURRENT_SESSIONS} running`
      );
      return {
        error: `Session limit reached (${runningSessions.length}/${MAX_CONCURRENT_SESSIONS}). Close a session to start a new one.`,
        idleSessions: idleSessions.map(s => s.name),
      };
    }

    const preferences = this.workspaceService.getPreferences();
    const worktreeSettings: WorktreeSettings = preferences.worktree ?? DEFAULT_WORKTREE_SETTINGS;
    const sessionSettings: SessionSettings = preferences.session ?? DEFAULT_SESSION_SETTINGS;
    const skipPermissions = mode !== 'plain' && sessionSettings.skipPermissions ? true : undefined;

    const session = this.sessionService.create(mode, projectPath, {
      ...createOptions,
      name: createOptions?.name ?? name,
      skipPermissions,
    });

    let worktreePath: string | null = null;
    let worktreeWarning: string | undefined;

    if (worktreeSettings.mode !== 'never') {
      let currentBranch: string | undefined;
      try {
        currentBranch = await this.gitService.getCurrentBranch(projectPath);
      } catch (error) {
        const errorMessage = extractErrorMessage(error);
        this.logger.warn(`Failed to get current branch for worktree setup: ${errorMessage}`);
        worktreeWarning = `Could not determine current branch: ${errorMessage}. Skipping worktree setup.`;
      }

      if (currentBranch) {
        const branchToUse = branch ?? currentBranch;

        try {
          if (worktreeSettings.mode === 'always') {
            const uniqueSuffix = crypto.randomUUID().slice(0, 8);
            const isolatedBranch = `${branchToUse}-${uniqueSuffix}`;
            worktreePath = await this.worktreeService.prepare(
              projectPath,
              isolatedBranch,
              worktreeSettings.location,
              currentBranch
            );
          } else if (worktreeSettings.mode === 'branch' && branchToUse !== currentBranch) {
            worktreePath = await this.worktreeService.prepare(
              projectPath,
              branchToUse,
              worktreeSettings.location,
              currentBranch
            );
          }
        } catch (error) {
          const errorMessage = extractErrorMessage(error);
          this.logger.warn(`Failed to create worktree for session ${session.id}: ${errorMessage}`);
          worktreeWarning = `Worktree creation failed: ${errorMessage}. Running in main project directory.`;
        }

        if (branch) {
          this.sessionService.assignBranch(session.id, branch, worktreePath ?? undefined);
        } else if (worktreePath) {
          this.sessionService.assignBranch(session.id, currentBranch, worktreePath);
        } else {
          this.sessionService.assignBranch(session.id, currentBranch);
        }
      } else if (branch) {
        this.sessionService.assignBranch(session.id, branch);
      }
    }

    const workingDir = worktreePath ?? session.workingDirectory;
    const launchResult = await this.launchSession(session.id, projectPath, workingDir, mode);

    if (!launchResult.success) {
      return {
        error: launchResult.error ?? 'Failed to launch session',
        worktreeWarning,
      };
    }

    return {
      session: this.sessionService.get(session.id) ?? session,
      terminalSessionId: launchResult.terminalSessionId,
      worktreeWarning,
    };
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
          if (hasProviderMethod(provider, 'getHookManager')) {
            const hookMgr = provider.getHookManager() as {
              registerHooks(p: string): Promise<void>;
              startWatching(): void;
            };
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
            await this.mcpWriterService.writeConfig(
              worktreePath,
              sessionId,
              projectPath,
              allServers
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

      // Capture git HEAD as baseline for diff tracking (fire-and-forget, non-blocking)
      this.gitBase
        .execGit(worktreePath, ['rev-parse', 'HEAD'])
        .then(({ stdout }) => {
          const hash = stdout.trim();
          if (hash) {
            session.baselineCommitHash = hash;
            this.logger.debug(`Captured baseline commit for ${sessionId}: ${hash}`);
            // Broadcast to frontend so DiffPanel can use the baseline
            this.eventEmitter.emit(InternalSessionEvents.STATUS, {
              sessionId,
              status: session.status,
              message: session.statusMessage,
              baselineCommitHash: hash,
            });
          }
        })
        .catch(() => {
          // Not a git repo or no commits — baseline stays undefined
          this.logger.debug(`No baseline commit captured for ${sessionId} (not a git repo?)`);
        });

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

      // Post-launch session tracking (fire-and-forget)
      if (shouldTrackSession && previousSessionIds) {
        const provider = this.pluginRegistry.getProvider(aiMode);
        if (hasProviderMethod(provider, 'getSessionTracker')) {
          const tracker = provider.getSessionTracker() as {
            pollForNewSession(
              projectPath: string,
              previousSessionIds: Set<string>,
              maxPolls?: number,
              intervalMs?: number
            ): Promise<string | null>;
          };
          // Fire-and-forget: polls for new session, emits event when found
          tracker.pollForNewSession(projectPath, previousSessionIds).then(
            (newSessionId: string | null) => {
              if (newSessionId) {
                this.sessionService.setClaudeSessionId(sessionId, newSessionId);
                this.logger.info(`Captured provider session ID for ${sessionId}: ${newSessionId}`);

                // Emit event so gateway broadcasts to frontend AND tracker persists snapshot
                this.eventEmitter.emit(InternalSessionEvents.CLAUDE_ID_CAPTURED, {
                  sessionId,
                  claudeSessionId: newSessionId,
                });
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
