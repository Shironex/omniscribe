import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { McpConfigService } from './mcp-config.service';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * Agent status file structure
 * Matches what the MCP server writes (omniscribe_status tool)
 */
interface AgentStatusFile {
  agentId: string;
  state: 'idle' | 'working' | 'needs_input' | 'finished' | 'error';
  message?: string;
  needsInputPrompt?: string;
  timestamp: string;
}

/**
 * Session status event payload
 */
export interface SessionStatusEvent {
  projectPath: string;
  sessionId: string;
  agentId: string;
  status: 'idle' | 'working' | 'needs_input' | 'finished' | 'error' | 'disconnected';
  message?: string;
  needsInputPrompt?: string;
}

/**
 * Tracked project state
 */
interface TrackedProject {
  projectPath: string;
  hash: string;
  lastStatuses: Map<string, AgentStatusFile>;
}

@Injectable()
export class McpMonitorService implements OnModuleInit, OnModuleDestroy {
  /** Polling interval in milliseconds */
  private readonly POLL_INTERVAL = 500;

  /** Threshold for considering a status file stale (5 minutes) */
  private readonly STALE_THRESHOLD = 5 * 60 * 1000;

  /** Base directory for agent status files */
  private readonly agentsDir: string;

  /** Map of project paths to tracked state */
  private trackedProjects = new Map<string, TrackedProject>();

  /** Polling interval timer */
  private pollTimer: NodeJS.Timeout | null = null;

  /** Whether monitoring is active */
  private isMonitoring = false;

  constructor(
    private readonly eventEmitter: EventEmitter2,
    private readonly configService: McpConfigService
  ) {
    this.agentsDir = path.join(os.tmpdir(), 'omniscribe', 'agents');
    this.ensureAgentsDir();
  }

  onModuleInit(): void {
    // Don't auto-start monitoring - wait for projects to be added
  }

  onModuleDestroy(): void {
    this.stopMonitoring();
  }

  /**
   * Add a project to be monitored
   * @param projectPath Full path to the project
   * @param hash Optional pre-computed hash (will be generated if not provided)
   */
  addProject(projectPath: string, hash?: string): void {
    if (this.trackedProjects.has(projectPath)) {
      return;
    }

    const projectHash = hash ?? this.configService.generateProjectHash(projectPath);

    this.trackedProjects.set(projectPath, {
      projectPath,
      hash: projectHash,
      lastStatuses: new Map(),
    });

    console.log(
      `[McpMonitorService] Added project for monitoring: ${projectPath} (hash: ${projectHash})`
    );

    // Ensure the project's agents directory exists
    this.ensureProjectAgentsDir(projectHash);

    // Start monitoring if not already running
    if (!this.isMonitoring && this.trackedProjects.size > 0) {
      this.startMonitoring();
    }
  }

  /**
   * Remove a project from monitoring
   * @param projectPath Full path to the project
   */
  removeProject(projectPath: string): void {
    const tracked = this.trackedProjects.get(projectPath);

    if (!tracked) {
      return;
    }

    this.trackedProjects.delete(projectPath);

    console.log(`[McpMonitorService] Removed project from monitoring: ${projectPath}`);

    // Stop monitoring if no projects left
    if (this.trackedProjects.size === 0) {
      this.stopMonitoring();
    }
  }

  /**
   * Remove status tracking for a specific session
   * @param projectPath Full path to the project
   * @param sessionId Session identifier
   */
  removeSessionStatus(projectPath: string, sessionId: string): void {
    const tracked = this.trackedProjects.get(projectPath);

    if (!tracked) {
      return;
    }

    // Remove from tracking - the key is sessionId (extracted from filename agent-{sessionId}.json)
    tracked.lastStatuses.delete(sessionId);

    // Also clean up the status file
    this.cleanupSessionStatusFiles(tracked.hash, sessionId);
  }

  /**
   * Get the agents directory for a project hash
   * @param hash Project hash
   * @returns Path to the project's agents directory
   */
  getProjectAgentsDir(hash: string): string {
    return path.join(this.agentsDir, hash);
  }

  /**
   * Start the polling loop
   */
  private startMonitoring(): void {
    if (this.isMonitoring) {
      return;
    }

    this.isMonitoring = true;
    this.pollTimer = setInterval(() => {
      this.poll();
    }, this.POLL_INTERVAL);

    console.log('[McpMonitorService] Started monitoring');
  }

  /**
   * Stop the polling loop
   */
  private stopMonitoring(): void {
    if (!this.isMonitoring) {
      return;
    }

    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }

    this.isMonitoring = false;

    console.log('[McpMonitorService] Stopped monitoring');
  }

  /**
   * Poll all tracked projects for status updates
   */
  private async poll(): Promise<void> {
    for (const [projectPath, tracked] of this.trackedProjects) {
      try {
        await this.pollProject(projectPath, tracked);
      } catch (error) {
        console.error(
          `[McpMonitorService] Error polling project ${projectPath}:`,
          error
        );
      }
    }
  }

  /**
   * Poll a single project for status updates
   * @param projectPath Full path to the project
   * @param tracked Tracked project state
   */
  private async pollProject(
    projectPath: string,
    tracked: TrackedProject
  ): Promise<void> {
    const agentsDir = this.getProjectAgentsDir(tracked.hash);

    if (!fs.existsSync(agentsDir)) {
      return;
    }

    const files = await fs.promises.readdir(agentsDir);
    const now = Date.now();
    const seenAgents = new Set<string>();

    for (const file of files) {
      if (!file.startsWith('agent-') || !file.endsWith('.json')) {
        continue;
      }

      const agentId = file.replace('agent-', '').replace('.json', '');
      seenAgents.add(agentId);

      const filePath = path.join(agentsDir, file);

      try {
        const stat = await fs.promises.stat(filePath);
        const fileAge = now - stat.mtimeMs;

        // Check if file is stale
        if (fileAge > this.STALE_THRESHOLD) {
          // Clean up stale file
          await this.cleanupStaleFile(filePath, tracked, agentId);
          continue;
        }

        // Read and parse the status file
        const content = await fs.promises.readFile(filePath, 'utf-8');
        const status = JSON.parse(content) as AgentStatusFile;

        // Check if status has changed
        const lastStatus = tracked.lastStatuses.get(agentId);

        if (
          !lastStatus ||
          lastStatus.state !== status.state ||
          lastStatus.message !== status.message ||
          lastStatus.timestamp !== status.timestamp
        ) {
          // Status changed - emit event
          tracked.lastStatuses.set(agentId, status);

          // Extract sessionId from agentId (format: agent-{sessionId})
          const sessionId = status.agentId.replace('agent-', '');

          const event: SessionStatusEvent = {
            projectPath,
            sessionId,
            agentId: status.agentId,
            status: status.state,
            message: status.message,
            needsInputPrompt: status.needsInputPrompt,
          };

          this.eventEmitter.emit('session.status', event);

          console.log(
            `[McpMonitorService] Status change for agent ${agentId}: ${status.state}`
          );
        }
      } catch (error) {
        // Ignore read errors (file might be being written)
      }
    }

    // Check for agents that have disappeared (stopped)
    for (const [agentId, lastStatus] of tracked.lastStatuses) {
      if (!seenAgents.has(agentId)) {
        // Agent status file removed - emit disconnected event
        tracked.lastStatuses.delete(agentId);

        // Extract sessionId from agentId (format: agent-{sessionId})
        const sessionId = lastStatus.agentId.replace('agent-', '');

        const event: SessionStatusEvent = {
          projectPath,
          sessionId,
          agentId: lastStatus.agentId,
          status: 'disconnected',
          message: 'Agent status file removed',
        };

        this.eventEmitter.emit('session.status', event);

        console.log(
          `[McpMonitorService] Agent ${agentId} disconnected (file removed)`
        );
      }
    }
  }

  /**
   * Clean up a stale status file
   * @param filePath Path to the stale file
   * @param tracked Tracked project state
   * @param agentId Agent identifier
   */
  private async cleanupStaleFile(
    filePath: string,
    tracked: TrackedProject,
    agentId: string
  ): Promise<void> {
    try {
      const lastStatus = tracked.lastStatuses.get(agentId);

      // Remove from tracking
      tracked.lastStatuses.delete(agentId);

      // Delete the file
      await fs.promises.unlink(filePath);

      console.log(`[McpMonitorService] Cleaned up stale status file: ${filePath}`);

      // Emit disconnected event if we had previous status
      if (lastStatus) {
        // Extract sessionId from agentId (format: agent-{sessionId})
        const sessionId = lastStatus.agentId.replace('agent-', '');

        const event: SessionStatusEvent = {
          projectPath: tracked.projectPath,
          sessionId,
          agentId: lastStatus.agentId,
          status: 'disconnected',
          message: 'Status file became stale',
        };

        this.eventEmitter.emit('session.status', event);
      }
    } catch (error) {
      console.error(
        `[McpMonitorService] Error cleaning up stale file ${filePath}:`,
        error
      );
    }
  }

  /**
   * Clean up status files for a session
   * @param hash Project hash
   * @param sessionId Session identifier
   */
  private async cleanupSessionStatusFiles(
    hash: string,
    sessionId: string
  ): Promise<void> {
    const agentsDir = this.getProjectAgentsDir(hash);

    if (!fs.existsSync(agentsDir)) {
      return;
    }

    try {
      // File format is agent-{sessionId}.json
      const expectedFileName = `agent-${sessionId}.json`;
      const filePath = path.join(agentsDir, expectedFileName);

      if (fs.existsSync(filePath)) {
        await fs.promises.unlink(filePath);
        console.log(
          `[McpMonitorService] Cleaned up status file for session ${sessionId}: ${expectedFileName}`
        );
      }
    } catch (error) {
      console.error(
        `[McpMonitorService] Error cleaning up session status files:`,
        error
      );
    }
  }

  /**
   * Ensure the base agents directory exists
   */
  private ensureAgentsDir(): void {
    try {
      if (!fs.existsSync(this.agentsDir)) {
        fs.mkdirSync(this.agentsDir, { recursive: true });
      }
    } catch (error) {
      console.error(`[McpMonitorService] Error creating agents dir:`, error);
    }
  }

  /**
   * Ensure a project's agents directory exists
   * @param hash Project hash
   */
  private ensureProjectAgentsDir(hash: string): void {
    const dir = this.getProjectAgentsDir(hash);

    try {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    } catch (error) {
      console.error(
        `[McpMonitorService] Error creating project agents dir:`,
        error
      );
    }
  }
}
