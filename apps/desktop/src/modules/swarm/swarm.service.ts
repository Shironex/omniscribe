import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { Mutex } from 'async-mutex';
import * as crypto from 'node:crypto';
import {
  MAX_SWARM_GOAL_LENGTH,
  SwarmStatus,
  SwarmRole,
  SwarmAgent,
  CreateSwarmPayload,
  SwarmContextResponse,
  SessionStatusUpdate,
  MAX_SWARM_AGENTS,
  MAX_SWARM_NAME_LENGTH,
  SWARM_COMPLETED_RETENTION_MS,
  createLogger,
  extractErrorMessage,
} from '@omniscribe/shared';
import { InternalSessionEvents, InternalSwarmEvents } from '../shared/events';
import { SessionService } from '../session/session.service';
import { SessionLauncherService } from '../session/session-launcher.service';
import { SwarmTaskService } from './swarm-task.service';
import { SwarmMessagingService } from './swarm-messaging.service';
import { SwarmFileService } from './swarm-file.service';
import { SwarmFileWatcherService } from './swarm-file-watcher.service';
import {
  buildAgentPrompt,
  buildLeadInitialPrompt,
  buildWorkerInitialPrompt,
} from './swarm-prompts';
import { BackendSwarmConfig, BackendSwarmAgent } from './types';

/**
 * Valid swarm status transitions.
 * Maps each status to the set of statuses it can transition to.
 */
const VALID_SWARM_TRANSITIONS: Record<SwarmStatus, SwarmStatus[]> = {
  configuring: ['starting', 'cancelled'],
  starting: ['planning', 'error', 'cancelled'],
  planning: ['active', 'completing', 'error', 'cancelled'],
  active: ['completing', 'error', 'cancelled'],
  completing: ['done', 'error', 'cancelled'],
  done: [],
  error: ['cancelled'],
  cancelled: [],
};

@Injectable()
export class SwarmService {
  private readonly logger = createLogger('SwarmService');

  /** swarmId -> swarm config */
  private swarms = new Map<string, BackendSwarmConfig>();
  /** swarmId -> agents */
  private agents = new Map<string, BackendSwarmAgent[]>();
  /** Per-swarm spawn lock — serializes agent spawning to prevent race conditions */
  private spawnLocks = new Map<string, Mutex>();
  /** swarmId -> delayed cleanup timer */
  private cleanupTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly eventEmitter: EventEmitter2,
    @Inject(forwardRef(() => SessionService))
    private readonly sessionService: SessionService,
    @Inject(forwardRef(() => SessionLauncherService))
    private readonly sessionLauncherService: SessionLauncherService,
    private readonly swarmTaskService: SwarmTaskService,
    private readonly swarmMessagingService: SwarmMessagingService,
    private readonly swarmFileService: SwarmFileService,
    private readonly swarmFileWatcherService: SwarmFileWatcherService
  ) {}

  private validateCreatePayload(payload: CreateSwarmPayload): void {
    const name = payload.name.trim();
    const goal = payload.goal.trim();

    if (!name) {
      throw new Error('Swarm name is required');
    }
    if (!goal) {
      throw new Error('Swarm goal is required');
    }
    if (name.length > MAX_SWARM_NAME_LENGTH) {
      throw new Error(`Swarm name exceeds maximum length of ${MAX_SWARM_NAME_LENGTH}`);
    }
    if (goal.length > MAX_SWARM_GOAL_LENGTH) {
      throw new Error(`Swarm goal exceeds maximum length of ${MAX_SWARM_GOAL_LENGTH}`);
    }
  }

  /** Get or create a per-swarm spawn lock. */
  private getSpawnLock(swarmId: string): Mutex {
    let lock = this.spawnLocks.get(swarmId);
    if (!lock) {
      lock = new Mutex();
      this.spawnLocks.set(swarmId, lock);
    }
    return lock;
  }

  private scheduleCleanup(swarmId: string): void {
    const existingTimer = this.cleanupTimers.get(swarmId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(() => {
      this.cleanupTimers.delete(swarmId);
      this.removeSwarm(swarmId);
    }, SWARM_COMPLETED_RETENTION_MS);
    this.cleanupTimers.set(swarmId, timer);
  }

  private removeSwarm(swarmId: string): void {
    const swarm = this.swarms.get(swarmId);
    if (!swarm) return;

    this.swarmFileWatcherService.stopWatching(swarmId);
    this.swarmTaskService.cleanup(swarmId);
    this.swarmMessagingService.cleanup(swarmId);
    this.spawnLocks.delete(swarmId);
    this.agents.delete(swarmId);

    // Clean up disk directory
    this.swarmFileService
      .cleanupSwarmDirectory(swarm.projectPath, swarmId)
      .catch(err =>
        this.logger.warn(`Failed to clean up swarm directory: ${extractErrorMessage(err)}`)
      );

    this.swarms.delete(swarmId);
    this.eventEmitter.emit(InternalSwarmEvents.REMOVED, { swarmId });
  }

  /**
   * Create a new swarm from a configuration payload.
   */
  async create(payload: CreateSwarmPayload): Promise<BackendSwarmConfig> {
    this.validateCreatePayload(payload);

    // Validate total agent count
    const totalAgents = payload.roles.reduce((sum, r) => sum + r.count, 0);
    if (totalAgents > MAX_SWARM_AGENTS) {
      throw new Error(`Total agent count (${totalAgents}) exceeds maximum of ${MAX_SWARM_AGENTS}`);
    }

    if (totalAgents < 1) {
      throw new Error('Swarm must have at least one agent');
    }

    const now = new Date().toISOString();
    const swarmId = crypto.randomUUID();

    const swarm: BackendSwarmConfig = {
      id: swarmId,
      name: payload.name.trim(),
      goal: payload.goal.trim(),
      projectPath: payload.projectPath,
      status: 'configuring',
      strategy: 'hierarchical',
      roles: payload.roles,
      memberSessionIds: [],
      createdAt: now,
      updatedAt: now,
    };

    this.swarms.set(swarmId, swarm);
    this.agents.set(swarmId, []);

    // Persist swarm directory to disk and start watching for agent file changes
    await this.swarmFileService.initSwarmDirectory(payload.projectPath, swarm);
    this.swarmFileWatcherService.startWatching(swarmId, payload.projectPath);

    this.logger.info(`Created swarm ${swarmId}: ${payload.name} (${totalAgents} agents)`);

    this.eventEmitter.emit(InternalSwarmEvents.CREATED, swarm);

    // Transition to starting and spawn lead session
    this.updateStatus(swarmId, 'starting');

    try {
      await this.spawnLeadSession(swarmId);
    } catch (error) {
      const errorMessage = extractErrorMessage(error);
      this.logger.error(`Failed to spawn lead session for swarm ${swarmId}: ${errorMessage}`);
      swarm.error = errorMessage;
      this.updateStatus(swarmId, 'error');
    }

    return swarm;
  }

  /**
   * Spawn the lead session for a swarm.
   */
  private async spawnLeadSession(swarmId: string): Promise<void> {
    const swarm = this.swarms.get(swarmId);
    if (!swarm) throw new Error(`Swarm not found: ${swarmId}`);

    // Find the lead role (or first role if no explicit lead)
    const leadRole = swarm.roles.find(r => r.role === 'lead') ?? swarm.roles[0];

    const systemPrompt = buildAgentPrompt(swarm, leadRole.role, true);

    // Create session using SessionService
    const session = this.sessionService.create('claude', swarm.projectPath, {
      name: `[Swarm] ${swarm.name} - Lead`,
      systemPrompt,
      skipPermissions: true,
      initialPrompt: buildLeadInitialPrompt(swarm),
    });

    swarm.leadSessionId = session.id;
    swarm.memberSessionIds.push(session.id);
    swarm.updatedAt = new Date().toISOString();

    // Register agent
    const agent = this.registerAgent(swarmId, session.id, leadRole.role);

    this.logger.info(`Spawned lead session ${session.id} for swarm ${swarmId}`);

    // Launch the session
    const result = await this.sessionLauncherService.launchSession(
      session.id,
      swarm.projectPath,
      session.workingDirectory,
      'claude'
    );

    if (!result.success) {
      this.updateAgent(swarmId, agent.id, { status: 'error' });
      throw new Error(`Failed to launch lead session: ${result.error}`);
    }

    this.updateAgent(swarmId, agent.id, { status: 'active' });

    // Transition to planning since lead is now active
    this.updateStatus(swarmId, 'planning');
  }

  /**
   * Spawn a teammate agent for the swarm.
   * Serialized per-swarm via mutex to prevent concurrent spawn race conditions.
   */
  async spawnTeammate(
    swarmId: string,
    role: SwarmRole,
    taskDescription?: string
  ): Promise<BackendSwarmAgent> {
    const lock = this.getSpawnLock(swarmId);

    return lock.runExclusive(async () => {
      const swarm = this.swarms.get(swarmId);
      if (!swarm) throw new Error(`Swarm not found: ${swarmId}`);

      if (swarm.status !== 'active' && swarm.status !== 'planning') {
        throw new Error(`Cannot spawn teammate: swarm is in '${swarm.status}' state`);
      }

      const currentAgents = this.agents.get(swarmId) ?? [];
      if (currentAgents.length >= MAX_SWARM_AGENTS) {
        throw new Error(`Swarm has reached maximum agent count (${MAX_SWARM_AGENTS})`);
      }

      const systemPrompt = buildAgentPrompt(swarm, role, false, taskDescription);

      const session = this.sessionService.create('claude', swarm.projectPath, {
        name: `[Swarm] ${swarm.name} - ${role}`,
        systemPrompt,
        skipPermissions: true,
        initialPrompt: buildWorkerInitialPrompt(swarm, role, taskDescription),
      });

      swarm.memberSessionIds.push(session.id);
      swarm.updatedAt = new Date().toISOString();

      // Register agent
      const agent = this.registerAgent(swarmId, session.id, role);

      this.logger.info(`Spawning teammate ${session.id} (${role}) for swarm ${swarmId}`);

      // Launch the session
      const result = await this.sessionLauncherService.launchSession(
        session.id,
        swarm.projectPath,
        session.workingDirectory,
        'claude'
      );

      if (!result.success) {
        this.updateAgent(swarmId, agent.id, { status: 'error' });
        throw new Error(`Failed to launch teammate session: ${result.error}`);
      }

      this.updateAgent(swarmId, agent.id, { status: 'active' });

      // Ensure the agents/ subdirectory watcher is running (may not have existed at initial watch)
      this.swarmFileWatcherService.ensureAgentsWatcher(swarmId, swarm.projectPath);

      // Transition to active if still in planning
      if (swarm.status === 'planning') {
        this.updateStatus(swarmId, 'active');
      }

      return agent;
    });
  }

  /**
   * Close and fully remove a swarm from state.
   * Unlike cancel (which transitions to 'cancelled'), this removes the swarm entirely
   * so the user can start a new one. Only allowed when swarm is in a terminal state.
   */
  async close(swarmId: string): Promise<void> {
    const swarm = this.swarms.get(swarmId);
    if (!swarm) throw new Error(`Swarm not found: ${swarmId}`);

    const terminalStates: SwarmStatus[] = ['done', 'cancelled', 'error'];
    if (!terminalStates.includes(swarm.status)) {
      throw new Error(`Cannot close swarm in '${swarm.status}' state. Stop the swarm first.`);
    }

    this.logger.info(`Closing swarm ${swarmId} (status: ${swarm.status})`);

    // Cancel any pending delayed cleanup timer since we're removing now
    const existingTimer = this.cleanupTimers.get(swarmId);
    if (existingTimer) {
      clearTimeout(existingTimer);
      this.cleanupTimers.delete(swarmId);
    }

    // Stop any sessions that might still be running (e.g. error state)
    const swarmAgents = this.agents.get(swarmId) ?? [];
    for (const agent of swarmAgents) {
      if (agent.status !== 'stopped' && agent.status !== 'error') {
        try {
          await this.sessionService.remove(agent.sessionId);
        } catch (error) {
          const msg = extractErrorMessage(error);
          this.logger.warn(`Failed to stop agent ${agent.id} during close: ${msg}`);
        }
      }
    }

    // Fully remove the swarm
    this.removeSwarm(swarmId);
  }

  /**
   * Cancel a swarm — stops all agents and cleans up.
   */
  async cancel(swarmId: string): Promise<void> {
    const swarm = this.swarms.get(swarmId);
    if (!swarm) throw new Error(`Swarm not found: ${swarmId}`);

    this.logger.info(`Cancelling swarm ${swarmId}`);

    // Stop all agent sessions
    const swarmAgents = this.agents.get(swarmId) ?? [];
    for (const agent of swarmAgents) {
      if (agent.status !== 'stopped' && agent.status !== 'error') {
        try {
          await this.sessionService.remove(agent.sessionId);
          agent.status = 'stopped';
        } catch (error) {
          const msg = extractErrorMessage(error);
          this.logger.warn(`Failed to stop agent ${agent.id}: ${msg}`);
        }
      }
    }

    // Cleanup watchers, tasks, messages, and spawn lock
    this.swarmFileWatcherService.stopWatching(swarmId);
    this.swarmTaskService.cleanup(swarmId);
    this.swarmMessagingService.cleanup(swarmId);
    this.spawnLocks.delete(swarmId);

    this.updateStatus(swarmId, 'cancelled');
  }

  /**
   * Stop a single agent in a swarm.
   */
  async stopAgent(swarmId: string, agentId: string): Promise<void> {
    const swarm = this.swarms.get(swarmId);
    if (!swarm) throw new Error(`Swarm not found: ${swarmId}`);

    const swarmAgents = this.agents.get(swarmId) ?? [];
    const agent = swarmAgents.find(a => a.id === agentId);
    if (!agent) throw new Error(`Agent not found: ${agentId}`);

    this.logger.info(`Stopping agent ${agentId} in swarm ${swarmId}`);

    try {
      await this.sessionService.remove(agent.sessionId);
    } catch (error) {
      const msg = extractErrorMessage(error);
      this.logger.warn(`Failed to remove session for agent ${agentId}: ${msg}`);
    }

    // Release file locks for this agent
    this.swarmTaskService.releaseFiles(swarmId, agentId);

    this.updateAgent(swarmId, agentId, { status: 'stopped' });
  }

  /**
   * Get a swarm by ID.
   */
  getSwarm(swarmId: string): BackendSwarmConfig | undefined {
    return this.swarms.get(swarmId);
  }

  /**
   * Get all swarms.
   */
  getSwarms(): BackendSwarmConfig[] {
    return Array.from(this.swarms.values());
  }

  /**
   * Get full swarm context: swarm + agents + tasks + recent messages.
   */
  getSwarmContext(swarmId: string): SwarmContextResponse | undefined {
    const swarm = this.swarms.get(swarmId);
    if (!swarm) return undefined;

    return {
      swarm,
      agents: this.agents.get(swarmId) ?? [],
      tasks: this.swarmTaskService.getTasksForSwarm(swarmId),
      recentMessages: this.swarmMessagingService.getRecentMessages(swarmId),
    };
  }

  /**
   * Get agents for a swarm.
   */
  getAgentsForSwarm(swarmId: string): BackendSwarmAgent[] {
    return this.agents.get(swarmId) ?? [];
  }

  /**
   * Persist current tasks to disk. Called after task mutations.
   */
  persistTasks(swarmId: string): void {
    const swarm = this.swarms.get(swarmId);
    if (!swarm) return;

    const tasks = this.swarmTaskService.getTasksForSwarm(swarmId);
    this.swarmFileService
      .writeTasks(swarm.projectPath, swarmId, tasks)
      .catch(err => this.logger.warn(`Failed to persist tasks: ${extractErrorMessage(err)}`));
  }

  /**
   * Persist current messages to disk. Called after message mutations.
   */
  persistMessages(swarmId: string): void {
    const swarm = this.swarms.get(swarmId);
    if (!swarm) return;

    const messages = this.swarmMessagingService.getRecentMessages(swarmId);
    this.swarmFileService
      .writeMessages(swarm.projectPath, swarmId, messages)
      .catch(err => this.logger.warn(`Failed to persist messages: ${extractErrorMessage(err)}`));
  }

  /**
   * Auto-persist tasks to disk when any task is updated.
   * Skips when the update originated from the file watcher to prevent infinite loops.
   */
  @OnEvent(InternalSwarmEvents.TASK_UPDATED)
  handleTaskUpdatedPersistence(update: { swarmId: string; fromFile?: boolean }): void {
    if (update.fromFile) return;
    this.persistTasks(update.swarmId);
  }

  /**
   * Auto-persist messages to disk when a message is sent.
   * Skips when the update originated from the file watcher to prevent infinite loops.
   */
  @OnEvent(InternalSwarmEvents.MESSAGE)
  handleMessagePersistence(update: { swarmId: string; fromFile?: boolean }): void {
    if (update.fromFile) return;
    this.persistMessages(update.swarmId);
  }

  /**
   * Handle spawn-teammate requests from the MCP status server.
   * Decoupled via events to avoid circular McpModule <-> SwarmModule dependency.
   */
  @OnEvent(InternalSwarmEvents.SPAWN_TEAMMATE)
  async handleSpawnTeammateRequest(request: {
    swarmId: string;
    sessionId: string;
    role: SwarmRole;
    taskDescription?: string;
    resolve: (result: { agentId: string }) => void;
    reject: (error: string) => void;
  }): Promise<void> {
    try {
      // Validate the requesting session belongs to the swarm
      const agents = this.getAgentsForSwarm(request.swarmId);
      const requestingAgent = agents.find(a => a.sessionId === request.sessionId);
      if (!requestingAgent) {
        request.reject('Session is not a member of the specified swarm');
        return;
      }
      if (requestingAgent.role !== 'lead') {
        request.reject('Only the lead agent can spawn teammates');
        return;
      }

      const agent = await this.spawnTeammate(
        request.swarmId,
        request.role,
        request.taskDescription
      );
      request.resolve({ agentId: agent.id });
    } catch (error) {
      request.reject(extractErrorMessage(error));
    }
  }

  /**
   * Handle session status changes to update agent status.
   */
  @OnEvent(InternalSessionEvents.STATUS)
  handleSessionStatusChange(update: SessionStatusUpdate): void {
    const result = this.findSwarmBySessionId(update.sessionId);
    if (!result) return;

    const { swarmId, agent } = result;

    // Map session status to agent status
    let agentStatus: SwarmAgent['status'] | undefined;

    switch (update.status) {
      case 'working':
      case 'planning':
      case 'thinking':
        agentStatus = 'active';
        break;
      case 'idle':
      case 'needs_input':
      case 'finished':
        agentStatus = 'idle';
        break;
      case 'error':
        agentStatus = 'error';
        break;
      case 'disconnected':
        agentStatus = 'stopped';
        break;
    }

    if (agentStatus && agentStatus !== agent.status) {
      this.updateAgent(swarmId, agent.id, { status: agentStatus });
    }
  }

  /**
   * Handle session removal to update agent status and check for swarm completion.
   */
  @OnEvent(InternalSessionEvents.REMOVED)
  handleSessionRemoved(payload: { sessionId: string }): void {
    const result = this.findSwarmBySessionId(payload.sessionId);
    if (!result) return;

    const { swarmId, agent } = result;

    this.logger.info(
      `Session ${payload.sessionId} removed for agent ${agent.id} in swarm ${swarmId}`
    );

    // Release file locks for the removed agent
    this.swarmTaskService.releaseFiles(swarmId, agent.id);

    this.updateAgent(swarmId, agent.id, { status: 'stopped' });

    // Check if all agents are stopped -> auto-complete
    this.checkSwarmCompletion(swarmId);
  }

  /**
   * Validate and update swarm status.
   */
  private updateStatus(swarmId: string, newStatus: SwarmStatus): void {
    const swarm = this.swarms.get(swarmId);
    if (!swarm) return;

    const validTargets = VALID_SWARM_TRANSITIONS[swarm.status];
    if (!validTargets.includes(newStatus)) {
      this.logger.warn(
        `Invalid swarm status transition for ${swarmId}: ${swarm.status} -> ${newStatus}`
      );
      return;
    }

    this.logger.info(`Swarm ${swarmId} status: ${swarm.status} -> ${newStatus}`);

    swarm.status = newStatus;
    swarm.updatedAt = new Date().toISOString();

    // Persist status change to disk
    this.swarmFileService
      .writeState(swarm.projectPath, swarmId, newStatus, swarm.error)
      .catch(err => this.logger.warn(`Failed to persist swarm state: ${extractErrorMessage(err)}`));

    this.eventEmitter.emit(InternalSwarmEvents.STATUS, {
      swarmId,
      status: newStatus,
      error: swarm.error,
    });

    if (newStatus === 'done' || newStatus === 'cancelled') {
      this.eventEmitter.emit(InternalSwarmEvents.COMPLETED, {
        swarmId,
        status: newStatus,
      });
      this.scheduleCleanup(swarmId);
    }
  }

  /**
   * Add a task ID to an agent's assignedTaskIds and emit an update.
   * Called when a task is assigned via get-assignment.
   */
  addTaskToAgent(swarmId: string, agentId: string, taskId: string): void {
    const swarmAgents = this.agents.get(swarmId);
    if (!swarmAgents) return;

    const agent = swarmAgents.find(a => a.id === agentId);
    if (!agent) return;

    if (!agent.assignedTaskIds.includes(taskId)) {
      agent.assignedTaskIds.push(taskId);

      // Persist agent state to disk
      const swarm = this.swarms.get(swarmId);
      if (swarm) {
        this.swarmFileService
          .writeAgent(swarm.projectPath, swarmId, agent)
          .catch(err =>
            this.logger.warn(`Failed to persist agent task assignment: ${extractErrorMessage(err)}`)
          );
      }

      this.eventEmitter.emit(InternalSwarmEvents.AGENT_UPDATED, { swarmId, agent });
    }
  }

  /**
   * Update an agent's state and emit an event.
   */
  private updateAgent(
    swarmId: string,
    agentId: string,
    updates: Partial<
      Pick<BackendSwarmAgent, 'status' | 'assignedTaskIds' | 'claimedFiles' | 'lastActivityAt'>
    >
  ): void {
    const swarmAgents = this.agents.get(swarmId);
    if (!swarmAgents) return;

    const agent = swarmAgents.find(a => a.id === agentId);
    if (!agent) return;

    Object.assign(agent, updates);

    // Persist agent state to disk
    const swarm = this.swarms.get(swarmId);
    if (swarm) {
      this.swarmFileService
        .writeAgent(swarm.projectPath, swarmId, agent)
        .catch(err =>
          this.logger.warn(`Failed to persist agent update: ${extractErrorMessage(err)}`)
        );
    }

    this.eventEmitter.emit(InternalSwarmEvents.AGENT_UPDATED, { swarmId, agent });
  }

  /**
   * Find which swarm a session belongs to.
   */
  private findSwarmBySessionId(
    sessionId: string
  ): { swarmId: string; agent: BackendSwarmAgent } | undefined {
    for (const [swarmId, swarmAgents] of this.agents.entries()) {
      const agent = swarmAgents.find(a => a.sessionId === sessionId);
      if (agent) {
        return { swarmId, agent };
      }
    }
    return undefined;
  }

  /**
   * Register a new agent for a swarm.
   */
  private registerAgent(swarmId: string, sessionId: string, role: SwarmRole): BackendSwarmAgent {
    const agent: BackendSwarmAgent = {
      id: crypto.randomUUID(),
      swarmId,
      sessionId,
      role,
      status: 'spawning',
      assignedTaskIds: [],
      claimedFiles: [],
      spawnedAt: new Date(),
      lastActivityAt: new Date(),
    };

    const swarmAgents = this.agents.get(swarmId) ?? [];
    swarmAgents.push(agent);
    this.agents.set(swarmId, swarmAgents);

    // Persist agent state to disk
    const swarm = this.swarms.get(swarmId);
    if (swarm) {
      this.swarmFileService
        .writeAgent(swarm.projectPath, swarmId, agent)
        .catch(err =>
          this.logger.warn(`Failed to persist agent state: ${extractErrorMessage(err)}`)
        );
    }

    this.eventEmitter.emit(InternalSwarmEvents.AGENT_UPDATED, { swarmId, agent });

    return agent;
  }

  /**
   * Check if all agents are stopped/error to auto-complete the swarm.
   */
  private checkSwarmCompletion(swarmId: string): void {
    const swarm = this.swarms.get(swarmId);
    if (!swarm) return;

    // Only auto-complete if the swarm is in an active state
    if (swarm.status !== 'active' && swarm.status !== 'planning' && swarm.status !== 'completing') {
      return;
    }

    const swarmAgents = this.agents.get(swarmId) ?? [];
    const allStopped = swarmAgents.every(a => a.status === 'stopped' || a.status === 'error');

    if (allStopped && swarmAgents.length > 0) {
      this.logger.info(`All agents stopped in swarm ${swarmId}, transitioning to completing`);

      if (swarm.status !== 'completing') {
        this.updateStatus(swarmId, 'completing');
      }
      this.updateStatus(swarmId, 'done');
      this.spawnLocks.delete(swarmId);
    }
  }
}
