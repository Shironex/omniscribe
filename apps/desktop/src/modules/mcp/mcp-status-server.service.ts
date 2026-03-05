import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as http from 'http';
import * as crypto from 'crypto';
import {
  MCP_STATUS_PORT_START,
  MCP_STATUS_PORT_END,
  LOCALHOST,
  StatusPayload,
  TasksPayload,
  SessionStatusState,
  SessionTasksUpdate,
  SwarmGetAssignmentPayload,
  SwarmReportResultPayload,
  SwarmClaimFilesPayload,
  SwarmReleaseFilesPayload,
  SwarmSendMessagePayload,
  SwarmGetMessagesPayload,
  SwarmGetContextPayload,
  SwarmSpawnTeammatePayload,
  SwarmCreateTaskPayload,
  createLogger,
  extractErrorMessage,
} from '@omniscribe/shared';
import { InternalSessionEvents } from '../shared/events';
import { McpSessionRegistryService } from './services/mcp-session-registry.service';
import type { SwarmService } from '../swarm/swarm.service';
import type { SwarmTaskService } from '../swarm/swarm-task.service';
import type { SwarmMessagingService } from '../swarm/swarm-messaging.service';

/**
 * Session status event emitted for UI updates
 */
export interface SessionStatusEvent {
  sessionId: string;
  status: SessionStatusState;
  message?: string;
  needsInputPrompt?: string;
}

/**
 * HTTP-based status server that receives status updates from MCP servers.
 *
 * Replaces file-based polling with real-time HTTP POST endpoint.
 * Provides instance ID validation to prevent cross-instance pollution.
 */
@Injectable()
export class McpStatusServerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = createLogger('McpStatusServerService');

  /** Port range for status server */
  private readonly PORT_RANGE_START = MCP_STATUS_PORT_START;
  private readonly PORT_RANGE_END = MCP_STATUS_PORT_END;

  /** HTTP server instance */
  private server: http.Server | null = null;

  /** Port the server is listening on */
  private port: number | null = null;

  /** Unique instance ID for this Omniscribe instance */
  private readonly instanceId: string;

  /** Lazily resolved swarm services (avoids circular McpModule ↔ SwarmModule dep) */
  private swarmService!: SwarmService;
  private swarmTaskService!: SwarmTaskService;
  private swarmMessagingService!: SwarmMessagingService;

  /** Sessions whose MCP server has reported in at least once */
  private mcpReadySessions = new Set<string>();
  /** Pending waiters for MCP readiness (used to serialize swarm spawning) */
  private mcpReadyWaiters = new Map<string, Array<() => void>>();

  constructor(
    private readonly eventEmitter: EventEmitter2,
    private readonly sessionRegistry: McpSessionRegistryService,
    private readonly moduleRef: ModuleRef
  ) {
    // Generate unique instance ID on startup
    this.instanceId = crypto.randomUUID();
  }

  async onModuleInit(): Promise<void> {
    this.logger.log('Initializing...');

    // Lazily resolve swarm services to avoid circular module dependency
    // (McpModule ↔ SwarmModule). By the time onModuleInit runs all
    // providers are registered, so moduleRef.get() is safe here.
    const { SwarmService } = await import('../swarm/swarm.service');
    const { SwarmTaskService } = await import('../swarm/swarm-task.service');
    const { SwarmMessagingService } = await import('../swarm/swarm-messaging.service');
    this.swarmService = this.moduleRef.get(SwarmService, { strict: false });
    this.swarmTaskService = this.moduleRef.get(SwarmTaskService, { strict: false });
    this.swarmMessagingService = this.moduleRef.get(SwarmMessagingService, { strict: false });

    await this.startServer();
    this.logger.log('Initialization complete');
  }

  async onModuleDestroy(): Promise<void> {
    await this.stopServer();
  }

  /**
   * Find an available port in the configured range
   */
  private findAvailablePort(): Promise<number | null> {
    return new Promise(resolve => {
      let currentPort = this.PORT_RANGE_START;

      const tryPort = (): void => {
        if (currentPort > this.PORT_RANGE_END) {
          resolve(null);
          return;
        }

        const testServer = http.createServer();
        const timeout = setTimeout(() => {
          testServer.close();
          currentPort++;
          tryPort();
        }, 1000); // 1 second timeout per port

        testServer.once('error', () => {
          clearTimeout(timeout);
          currentPort++;
          tryPort();
        });
        testServer.once('listening', () => {
          clearTimeout(timeout);
          testServer.close(() => {
            resolve(currentPort);
          });
        });
        testServer.listen(currentPort, LOCALHOST);
      };

      tryPort();
    });
  }

  /**
   * Start the HTTP status server
   */
  private async startServer(): Promise<void> {
    this.logger.log('Finding available port...');
    const availablePort = await this.findAvailablePort();
    this.logger.log(`Found port: ${availablePort}`);

    if (!availablePort) {
      this.logger.error(
        `No available port found in range ${this.PORT_RANGE_START}-${this.PORT_RANGE_END}`
      );
      return;
    }

    this.server = http.createServer((req, res) => {
      this.handleRequest(req, res);
    });

    return new Promise((resolve, reject) => {
      this.server!.once('error', err => {
        this.logger.error('Server error:', err);
        reject(err);
      });

      this.server!.listen(availablePort, LOCALHOST, () => {
        this.port = availablePort;
        this.logger.log(`Started on http://${LOCALHOST}:${this.port}`);
        this.logger.log(`Instance ID: ${this.instanceId}`);
        resolve();
      });
    });
  }

  /**
   * Stop the HTTP status server
   */
  private async stopServer(): Promise<void> {
    return new Promise(resolve => {
      if (this.server) {
        this.server.close(() => {
          this.logger.log('Stopped');
          this.server = null;
          this.port = null;
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * Handle incoming HTTP requests
   */
  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    // Only accept POST method
    if (req.method !== 'POST') {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
      return;
    }

    let body = '';

    req.on('data', chunk => {
      body += chunk.toString();
      // Limit body size to prevent abuse
      if (body.length > 10000) {
        req.destroy();
      }
    });

    req.on('end', () => {
      try {
        const payload = JSON.parse(body);

        // Route based on URL path
        switch (req.url) {
          case '/status':
            this.handleStatusUpdate(payload as StatusPayload, res);
            break;
          case '/tasks':
            this.handleTasksUpdate(payload as TasksPayload, res);
            break;
          case '/swarm/get-assignment':
            this.handleSwarmGetAssignment(payload as SwarmGetAssignmentPayload, res);
            break;
          case '/swarm/report-result':
            this.handleSwarmReportResult(payload as SwarmReportResultPayload, res);
            break;
          case '/swarm/claim-files':
            this.handleSwarmClaimFiles(payload as SwarmClaimFilesPayload, res);
            break;
          case '/swarm/release-files':
            this.handleSwarmReleaseFiles(payload as SwarmReleaseFilesPayload, res);
            break;
          case '/swarm/send-message':
            this.handleSwarmSendMessage(payload as SwarmSendMessagePayload, res);
            break;
          case '/swarm/get-messages':
            this.handleSwarmGetMessages(payload as SwarmGetMessagesPayload, res);
            break;
          case '/swarm/get-context':
            this.handleSwarmGetContext(payload as SwarmGetContextPayload, res);
            break;
          case '/swarm/spawn-teammate':
            this.handleSwarmSpawnTeammate(payload as SwarmSpawnTeammatePayload, res);
            break;
          case '/swarm/create-task':
            this.handleSwarmCreateTask(payload as SwarmCreateTaskPayload, res);
            break;
          default:
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Not found' }));
        }
      } catch (error) {
        this.logger.error('Invalid JSON payload:', error);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    });

    req.on('error', error => {
      this.logger.error('Request error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal error' }));
    });
  }

  /**
   * Handle a status update from the MCP server
   */
  private handleStatusUpdate(payload: StatusPayload, res: http.ServerResponse): void {
    this.logger.debug(
      `Received: sessionId=${payload.sessionId}, instanceId=${payload.instanceId}, state=${payload.state}`
    );

    // Validate instance ID to prevent cross-instance pollution
    if (payload.instanceId !== this.instanceId) {
      this.logger.debug(
        `REJECTED - wrong instance: expected ${this.instanceId}, got ${payload.instanceId}`
      );
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ accepted: false, reason: 'instance_mismatch' }));
      return;
    }

    // Check if this session is registered
    const projectPath = this.sessionRegistry.getProjectPath(payload.sessionId);
    if (!projectPath) {
      this.logger.debug(`REJECTED - unknown session ${payload.sessionId}`);
      this.logger.debug(
        `Registered sessions: ${this.sessionRegistry.getRegisteredSessions().join(', ')}`
      );
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ accepted: false, reason: 'unknown_session' }));
      return;
    }

    // Mark session as MCP-ready (used for swarm spawn serialization)
    this.markSessionMcpReady(payload.sessionId);

    this.logger.debug(`EMITTING: session=${payload.sessionId} status=${payload.state}`);

    // Emit an internal event so SessionService can update backend state.
    // We use an event (instead of a direct call) to avoid a circular module
    // dependency between McpModule and SessionModule.
    this.eventEmitter.emit(InternalSessionEvents.MCP_STATUS_RECEIVED, {
      sessionId: payload.sessionId,
      status: payload.state as SessionStatusState,
      message: payload.message,
      needsInputPrompt: payload.needsInputPrompt,
    });

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ accepted: true }));
  }

  /**
   * Handle a tasks update from the MCP server
   */
  private handleTasksUpdate(payload: TasksPayload, res: http.ServerResponse): void {
    this.logger.debug(
      `Received tasks: sessionId=${payload.sessionId}, instanceId=${payload.instanceId}, count=${payload.tasks?.length ?? 0}`
    );

    // Validate instance ID to prevent cross-instance pollution
    if (payload.instanceId !== this.instanceId) {
      this.logger.debug(`REJECTED - wrong instance`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ accepted: false, reason: 'instance_mismatch' }));
      return;
    }

    // Check if this session is registered
    const projectPath = this.sessionRegistry.getProjectPath(payload.sessionId);
    if (!projectPath) {
      this.logger.debug(`REJECTED - unknown session ${payload.sessionId}`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ accepted: false, reason: 'unknown_session' }));
      return;
    }

    // Emit tasks event for UI
    const event: SessionTasksUpdate = {
      sessionId: payload.sessionId,
      tasks: payload.tasks ?? [],
    };

    this.eventEmitter.emit(InternalSessionEvents.TASKS, event);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ accepted: true }));
  }

  /**
   * Validate a swarm request: check instanceId, sessionId registration, and swarm membership.
   * Returns the agentId if valid, or writes an error response and returns null.
   */
  private validateSwarmRequest(
    payload: { sessionId: string; instanceId: string; swarmId: string },
    res: http.ServerResponse
  ): { id: string; role: string } | null {
    // Validate instance ID
    if (payload.instanceId !== this.instanceId) {
      this.logger.debug(`REJECTED swarm request - wrong instance`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ accepted: false, reason: 'instance_mismatch' }));
      return null;
    }

    // Check if this session is registered
    const projectPath = this.sessionRegistry.getProjectPath(payload.sessionId);
    if (!projectPath) {
      this.logger.debug(`REJECTED swarm request - unknown session ${payload.sessionId}`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ accepted: false, reason: 'unknown_session' }));
      return null;
    }

    // Validate session belongs to the specified swarm
    const agents = this.swarmService.getAgentsForSwarm(payload.swarmId);
    const agent = agents.find(a => a.sessionId === payload.sessionId);
    if (!agent) {
      this.logger.debug(
        `REJECTED swarm request - session ${payload.sessionId} not in swarm ${payload.swarmId}`
      );
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Session is not a member of the specified swarm' }));
      return null;
    }

    return agent;
  }

  /**
   * Handle swarm get-assignment request
   */
  private handleSwarmGetAssignment(
    payload: SwarmGetAssignmentPayload,
    res: http.ServerResponse
  ): void {
    const agent = this.validateSwarmRequest(payload, res);
    if (!agent) return;
    const agentId = agent.id;

    try {
      const task = this.swarmTaskService.getAssignment(payload.swarmId, agentId, agent.role);
      // Update the agent's assignedTaskIds so the frontend reflects the count
      if (task) {
        this.swarmService.addTaskToAgent(payload.swarmId, agentId, task.id);
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ accepted: true, task }));
    } catch (error) {
      this.logger.error(`Error in swarm/get-assignment: ${extractErrorMessage(error)}`);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: extractErrorMessage(error) }));
    }
  }

  /**
   * Handle swarm report-result request
   */
  private handleSwarmReportResult(
    payload: SwarmReportResultPayload,
    res: http.ServerResponse
  ): void {
    const agent = this.validateSwarmRequest(payload, res);
    if (!agent) return;

    try {
      const task = this.swarmTaskService.reportResult(
        payload.swarmId,
        payload.taskId,
        payload.result,
        payload.status
      );
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ accepted: true, task }));
    } catch (error) {
      this.logger.error(`Error in swarm/report-result: ${extractErrorMessage(error)}`);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: extractErrorMessage(error) }));
    }
  }

  /**
   * Handle swarm claim-files request
   */
  private handleSwarmClaimFiles(payload: SwarmClaimFilesPayload, res: http.ServerResponse): void {
    const agent = this.validateSwarmRequest(payload, res);
    if (!agent) return;
    const agentId = agent.id;

    try {
      const result = this.swarmTaskService.claimFiles(payload.swarmId, agentId, payload.files);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ accepted: true, ...result }));
    } catch (error) {
      this.logger.error(`Error in swarm/claim-files: ${extractErrorMessage(error)}`);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: extractErrorMessage(error) }));
    }
  }

  /**
   * Handle swarm release-files request
   */
  private handleSwarmReleaseFiles(
    payload: SwarmReleaseFilesPayload,
    res: http.ServerResponse
  ): void {
    const agent = this.validateSwarmRequest(payload, res);
    if (!agent) return;
    const agentId = agent.id;

    try {
      this.swarmTaskService.releaseFiles(payload.swarmId, agentId, payload.files);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ accepted: true }));
    } catch (error) {
      this.logger.error(`Error in swarm/release-files: ${extractErrorMessage(error)}`);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: extractErrorMessage(error) }));
    }
  }

  /**
   * Handle swarm send-message request
   */
  private handleSwarmSendMessage(payload: SwarmSendMessagePayload, res: http.ServerResponse): void {
    const agent = this.validateSwarmRequest(payload, res);
    if (!agent) return;
    const agentId = agent.id;

    try {
      const message = this.swarmMessagingService.sendMessage(
        payload.swarmId,
        agentId,
        payload.toAgentId,
        payload.content,
        payload.type
      );
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ accepted: true, message }));
    } catch (error) {
      this.logger.error(`Error in swarm/send-message: ${extractErrorMessage(error)}`);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: extractErrorMessage(error) }));
    }
  }

  /**
   * Handle swarm get-messages request
   */
  private handleSwarmGetMessages(payload: SwarmGetMessagesPayload, res: http.ServerResponse): void {
    const agent = this.validateSwarmRequest(payload, res);
    if (!agent) return;
    const agentId = agent.id;

    try {
      const messages = this.swarmMessagingService.getMessages(payload.swarmId, agentId);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ accepted: true, messages }));
    } catch (error) {
      this.logger.error(`Error in swarm/get-messages: ${extractErrorMessage(error)}`);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: extractErrorMessage(error) }));
    }
  }

  /**
   * Handle swarm get-context request
   */
  private handleSwarmGetContext(payload: SwarmGetContextPayload, res: http.ServerResponse): void {
    const agent = this.validateSwarmRequest(payload, res);
    if (!agent) return;

    try {
      const context = this.swarmService.getSwarmContext(payload.swarmId);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ accepted: true, ...context }));
    } catch (error) {
      this.logger.error(`Error in swarm/get-context: ${extractErrorMessage(error)}`);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: extractErrorMessage(error) }));
    }
  }

  /**
   * Handle swarm spawn-teammate request
   */
  private async handleSwarmSpawnTeammate(
    payload: SwarmSpawnTeammatePayload,
    res: http.ServerResponse
  ): Promise<void> {
    const agent = this.validateSwarmRequest(payload, res);
    if (!agent) return;

    // Only the lead agent can spawn teammates
    if (agent.role !== 'lead') {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Only the lead agent can spawn teammates' }));
      return;
    }

    try {
      const teammate = await this.swarmService.spawnTeammate(
        payload.swarmId,
        payload.role,
        payload.taskDescription
      );
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ accepted: true, agent: teammate }));
    } catch (error) {
      this.logger.error(`Error in swarm/spawn-teammate: ${extractErrorMessage(error)}`);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: extractErrorMessage(error) }));
    }
  }

  /**
   * Handle swarm create-task request
   */
  private handleSwarmCreateTask(payload: SwarmCreateTaskPayload, res: http.ServerResponse): void {
    const agent = this.validateSwarmRequest(payload, res);
    if (!agent) return;

    // Only the lead agent can create tasks
    if (agent.role !== 'lead') {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Only the lead agent can create tasks' }));
      return;
    }

    try {
      const task = this.swarmTaskService.createTask(payload.swarmId, {
        subject: payload.subject,
        description: payload.description,
        assignedRole: payload.assignedRole,
        dependsOn: payload.dependsOn,
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ accepted: true, task }));
    } catch (error) {
      this.logger.error(`Error in swarm/create-task: ${extractErrorMessage(error)}`);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: extractErrorMessage(error) }));
    }
  }

  /**
   * Wait for a session's MCP server to report in for the first time.
   * Used to serialize swarm agent spawning — ensures .mcp.json has been
   * read before the next agent can overwrite it.
   */
  async waitForSessionMcpReady(sessionId: string, timeoutMs = 15000): Promise<boolean> {
    if (this.mcpReadySessions.has(sessionId)) return true;

    return new Promise<boolean>(resolve => {
      const resolveWaiter = () => {
        clearTimeout(timeout);
        resolve(true);
      };

      const timeout = setTimeout(() => {
        const waiters = this.mcpReadyWaiters.get(sessionId);
        if (waiters) {
          const idx = waiters.indexOf(resolveWaiter);
          if (idx >= 0) waiters.splice(idx, 1);
          if (waiters.length === 0) this.mcpReadyWaiters.delete(sessionId);
        }
        this.logger.warn(`Timed out waiting for MCP ready from session ${sessionId}`);
        resolve(false);
      }, timeoutMs);

      const waiters = this.mcpReadyWaiters.get(sessionId) ?? [];
      waiters.push(resolveWaiter);
      this.mcpReadyWaiters.set(sessionId, waiters);
    });
  }

  /**
   * Mark a session's MCP server as ready (has reported in at least once).
   */
  private markSessionMcpReady(sessionId: string): void {
    if (this.mcpReadySessions.has(sessionId)) return;
    this.mcpReadySessions.add(sessionId);

    const waiters = this.mcpReadyWaiters.get(sessionId);
    if (waiters) {
      waiters.forEach(resolve => resolve());
      this.mcpReadyWaiters.delete(sessionId);
    }
  }

  /**
   * Get the status URL for MCP servers to report to
   * @returns Status URL or null if server not running
   */
  getStatusUrl(): string | null {
    if (!this.port) {
      return null;
    }
    return `http://${LOCALHOST}:${this.port}/status`;
  }

  /**
   * Get the unique instance ID for this Omniscribe instance
   * @returns Instance UUID
   */
  getInstanceId(): string {
    return this.instanceId;
  }

  /**
   * Check if the status server is running
   * @returns True if server is running
   */
  isRunning(): boolean {
    return this.port !== null;
  }

  /**
   * Get the port the server is listening on
   * @returns Port number or null if not running
   */
  getPort(): number | null {
    return this.port;
  }
}
