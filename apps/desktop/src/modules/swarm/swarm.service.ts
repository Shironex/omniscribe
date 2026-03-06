import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
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
import type { McpStatusServerService } from '../mcp/mcp-status-server.service';
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

/**
 * Default system prompts for each swarm role.
 */
const ROLE_PROMPTS: Record<SwarmRole, string> = {
  lead: `You are the Lead ORCHESTRATOR agent in a multi-agent swarm. You are STRICTLY a coordinator — you do NOT do any actual work (no code review, no coding, no testing, no security audits).

Your ONLY responsibilities:
- Analyze the goal and decompose it into discrete tasks
- Create tasks using omniscribe_swarm_create_task with appropriate assignedRole values
- Spawn teammates using omniscribe_swarm_spawn_teammate for each role needed
- Monitor progress by polling omniscribe_swarm_get_context
- Wait for teammates to complete their work, then collect and synthesize their results
- Communicate with agents through omniscribe_swarm_send_message

DO NOT:
- Read or review code yourself — delegate that to reviewer/security agents
- Write code yourself — delegate that to builder agents
- Perform testing — delegate that to tester agents
- Do anything that should be done by a teammate

Your workflow: create tasks → spawn teammates → wait for results → synthesize final report.

## CRITICAL: Status Reporting
You MUST call omniscribe_status and omniscribe_tasks MCP tools throughout your work:
- Call omniscribe_status with state "working" when you START any work
- Call omniscribe_tasks to report your task plan and update progress
- Call omniscribe_status with state "finished" when ALL your work is DONE
- NEVER end your session without calling omniscribe_status with state "finished"
This is mandatory — the UI relies on your status to track swarm progress.`,

  builder: `You are a Builder agent in a multi-agent swarm. Your responsibilities:
- Check for task assignments using omniscribe_swarm_get_assignment
- Implement the assigned tasks by writing code
- Claim files before editing them to prevent conflicts
- Report results using omniscribe_swarm_report_result when tasks are complete
- Communicate with the Lead agent for clarification

Poll for new assignments regularly using the swarm tools.

## CRITICAL: Status Reporting
You MUST call omniscribe_status and omniscribe_tasks MCP tools throughout your work:
- Call omniscribe_status with state "working" when you START any work
- Call omniscribe_tasks to report your task plan and update progress
- Call omniscribe_swarm_report_result for each completed task
- Call omniscribe_status with state "finished" when ALL your work is DONE
- NEVER end your session without calling omniscribe_status with state "finished"
This is mandatory — the UI relies on your status to track swarm progress.`,

  reviewer: `You are a Reviewer agent in a multi-agent swarm. Your responsibilities:
- Check for review task assignments using omniscribe_swarm_get_assignment
- Review code changes for correctness, style, and best practices
- Provide detailed feedback through omniscribe_swarm_send_message
- Report review results using omniscribe_swarm_report_result

Poll for review tasks regularly using the swarm tools.

## CRITICAL: Status Reporting
You MUST call omniscribe_status and omniscribe_tasks MCP tools throughout your work:
- Call omniscribe_status with state "working" when you START any work
- Call omniscribe_tasks to report your task plan and update progress
- Call omniscribe_swarm_report_result for each completed review
- Call omniscribe_status with state "finished" when ALL your work is DONE
- NEVER end your session without calling omniscribe_status with state "finished"
This is mandatory — the UI relies on your status to track swarm progress.`,

  architect: `You are an Architect agent in a multi-agent swarm. Your responsibilities:
- Design the high-level architecture and approach
- Create tasks for builders with clear specifications
- Review architectural decisions and patterns
- Ensure consistency across the codebase

Use swarm tools to communicate design decisions and report results.

## CRITICAL: Status Reporting
You MUST call omniscribe_status and omniscribe_tasks MCP tools throughout your work:
- Call omniscribe_status with state "working" when you START any work
- Call omniscribe_tasks to report your task plan and update progress
- Call omniscribe_swarm_report_result for each completed task
- Call omniscribe_status with state "finished" when ALL your work is DONE
- NEVER end your session without calling omniscribe_status with state "finished"
This is mandatory — the UI relies on your status to track swarm progress.`,

  tester: `You are a Tester agent in a multi-agent swarm. Your responsibilities:
- Check for test task assignments using omniscribe_swarm_get_assignment
- Write and run tests for completed features
- Verify that implementations match requirements
- Report bugs through omniscribe_swarm_send_message
- Report test results using omniscribe_swarm_report_result

Poll for testing tasks regularly using the swarm tools.

## CRITICAL: Status Reporting
You MUST call omniscribe_status and omniscribe_tasks MCP tools throughout your work:
- Call omniscribe_status with state "working" when you START any work
- Call omniscribe_tasks to report your task plan and update progress
- Call omniscribe_swarm_report_result for each completed task
- Call omniscribe_status with state "finished" when ALL your work is DONE
- NEVER end your session without calling omniscribe_status with state "finished"
This is mandatory — the UI relies on your status to track swarm progress.`,

  security: `You are a Security Auditor agent in a multi-agent swarm. Your responsibilities:
- Check for security review task assignments using omniscribe_swarm_get_assignment
- Review code for security vulnerabilities and anti-patterns
- Verify input validation, authentication, and authorization
- Report security findings through omniscribe_swarm_send_message
- Report audit results using omniscribe_swarm_report_result

Poll for security review tasks regularly using the swarm tools.

## CRITICAL: Status Reporting
You MUST call omniscribe_status and omniscribe_tasks MCP tools throughout your work:
- Call omniscribe_status with state "working" when you START any work
- Call omniscribe_tasks to report your task plan and update progress
- Call omniscribe_swarm_report_result for each completed task
- Call omniscribe_status with state "finished" when ALL your work is DONE
- NEVER end your session without calling omniscribe_status with state "finished"
This is mandatory — the UI relies on your status to track swarm progress.`,
};

@Injectable()
export class SwarmService {
  private readonly logger = createLogger('SwarmService');

  /** swarmId -> swarm config */
  private swarms = new Map<string, BackendSwarmConfig>();
  /** swarmId -> agents */
  private agents = new Map<string, BackendSwarmAgent[]>();
  /** Per-swarm spawn lock — serializes agent spawning to prevent .mcp.json race conditions */
  private spawnLocks = new Map<string, Mutex>();
  /** swarmId -> delayed cleanup timer */
  private cleanupTimers = new Map<string, NodeJS.Timeout>();
  /** Lazily resolved McpStatusServerService (avoids circular dep) */
  private _statusServer: McpStatusServerService | null = null;

  constructor(
    private readonly eventEmitter: EventEmitter2,
    @Inject(forwardRef(() => SessionService))
    private readonly sessionService: SessionService,
    @Inject(forwardRef(() => SessionLauncherService))
    private readonly sessionLauncherService: SessionLauncherService,
    private readonly swarmTaskService: SwarmTaskService,
    private readonly swarmMessagingService: SwarmMessagingService,
    private readonly moduleRef: ModuleRef
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

  /** Lazily resolve McpStatusServerService to avoid circular module dependency. */
  private get statusServer(): McpStatusServerService {
    if (!this._statusServer) {
      // Dynamic import to avoid circular dependency at load time
      const { McpStatusServerService } =
        require('../mcp/mcp-status-server.service') as typeof import('../mcp/mcp-status-server.service');
      this._statusServer = this.moduleRef.get(McpStatusServerService, { strict: false });
    }
    return this._statusServer!;
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

    for (const sessionId of swarm.memberSessionIds) {
      this.statusServer.clearSessionMcpReady(sessionId);
    }

    this.swarmTaskService.cleanup(swarmId);
    this.swarmMessagingService.cleanup(swarmId);
    this.spawnLocks.delete(swarmId);
    this.agents.delete(swarmId);
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

    const systemPrompt = this.buildAgentPrompt(swarm, leadRole.role, true);

    // Create session using SessionService
    const session = this.sessionService.create('claude', swarm.projectPath, {
      name: `[Swarm] ${swarm.name} - Lead`,
      systemPrompt,
      skipPermissions: true,
      initialPrompt: `You are the Lead ORCHESTRATOR of the "${swarm.name}" swarm. Your goal:\n\n${swarm.goal}\n\nStart by calling omniscribe_status with state "working". Then decompose this goal into tasks using omniscribe_swarm_create_task and spawn the right teammates using omniscribe_swarm_spawn_teammate. DO NOT do any actual work yourself (no code review, no coding) — only delegate, monitor via omniscribe_swarm_get_context, and synthesize the final report from teammate results. When all work is complete, call omniscribe_status with state "finished".`,
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
   * Serialized per-swarm via mutex to prevent .mcp.json race conditions —
   * each agent must read its .mcp.json before the next spawn overwrites it.
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

      const systemPrompt = this.buildAgentPrompt(swarm, role, false, taskDescription);

      // Create session using SessionService
      const initialPrompt = taskDescription
        ? `You are a ${role} agent in the "${swarm.name}" swarm. Your task:\n\n${taskDescription}\n\nStart by calling omniscribe_status with state "working". Use swarm MCP tools to check your assignment, claim files, and report results. When done, call omniscribe_status with state "finished".`
        : `You are a ${role} agent in the "${swarm.name}" swarm. Start by calling omniscribe_status with state "working". Use omniscribe_swarm_get_assignment to poll for your task, then work on it. Use swarm MCP tools to claim files, report results, and communicate with teammates. When done, call omniscribe_status with state "finished".`;

      const session = this.sessionService.create('claude', swarm.projectPath, {
        name: `[Swarm] ${swarm.name} - ${role}`,
        systemPrompt,
        skipPermissions: true,
        initialPrompt,
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

      // Transition to active if still in planning
      if (swarm.status === 'planning') {
        this.updateStatus(swarmId, 'active');
      }

      // Wait for the agent's MCP server to come online before releasing the lock.
      // This ensures .mcp.json has been read before the next agent can overwrite it.
      const mcpReady = await this.statusServer.waitForSessionMcpReady(session.id, 20000);
      if (!mcpReady) {
        this.logger.warn(
          `Agent ${session.id} (${role}) MCP server did not report in within timeout — proceeding`
        );
      }

      return agent;
    });
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

    // Cleanup tasks, messages, and spawn lock
    this.swarmTaskService.cleanup(swarmId);
    this.swarmMessagingService.cleanup(swarmId);
    this.spawnLocks.delete(swarmId);
    swarm.memberSessionIds.forEach(sessionId => this.statusServer.clearSessionMcpReady(sessionId));

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
    this.statusServer.clearSessionMcpReady(payload.sessionId);

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

  /**
   * Build a system prompt for an agent including swarm context.
   */
  private buildAgentPrompt(
    swarm: BackendSwarmConfig,
    role: SwarmRole,
    isLead: boolean,
    taskDescription?: string
  ): string {
    const rolePrompt = ROLE_PROMPTS[role] ?? `You are a ${role} agent in a multi-agent swarm.`;

    const parts = [
      rolePrompt,
      '',
      `## Swarm Context`,
      `- Swarm ID: ${swarm.id}`,
      `- Swarm Name: ${swarm.name}`,
      `- Goal: ${swarm.goal}`,
      `- Your Role: ${role}${isLead ? ' (Lead)' : ''}`,
      `- Strategy: ${swarm.strategy}`,
    ];

    if (taskDescription) {
      parts.push('', `## Your Current Task`, taskDescription);
    }

    parts.push(
      '',
      `## Important`,
      `Use the omniscribe swarm MCP tools to coordinate with other agents.`,
      `Always claim files before editing them to prevent conflicts.`,
      `Report your results when tasks are complete using omniscribe_swarm_report_result.`,
      '',
      `## MANDATORY: Before You Finish`,
      `When your work is complete, you MUST do these steps IN ORDER:`,
      `1. Call omniscribe_swarm_report_result to report each task result`,
      `2. Call omniscribe_tasks with all tasks marked "completed"`,
      `3. Call omniscribe_status with state "finished" and a summary message`,
      `If any of these MCP calls fail, RETRY them. Do not end without completing all three steps.`
    );

    return parts.join('\n');
  }
}
