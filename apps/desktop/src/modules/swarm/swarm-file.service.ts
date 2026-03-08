import { Injectable } from '@nestjs/common';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import {
  SWARM_DATA_DIR,
  createLogger,
  type SwarmConfig,
  type SwarmStatus,
  type SwarmTask,
  type SwarmMessage,
  type SwarmAgent,
} from '@omniscribe/shared';

/**
 * On-disk shape of swarm state (written by backend, read by agents).
 */
export interface SwarmStateFile {
  swarmId: string;
  status: SwarmStatus;
  error?: string;
  updatedAt: string;
}

/**
 * Per-agent file written by the backend when an agent is registered/updated.
 */
export interface AgentStateFile {
  id: string;
  sessionId: string;
  role: string;
  status: string;
  assignedTaskIds: string[];
  claimedFiles: string[];
  updatedAt: string;
}

/**
 * File-locks registry shape.
 */
export interface FileLocksFile {
  locks: Record<string, { agentId: string; claimedAt: string }>;
  updatedAt: string;
}

/**
 * SwarmFileService — manages `.omniscribe/swarm/{swarmId}/` directories
 * for file-based swarm coordination.
 *
 * Directory structure:
 *   .omniscribe/swarm/{swarmId}/
 *     config.json          — Immutable SwarmConfig
 *     state.json           — Current status (backend writes)
 *     tasks.json           — Task list
 *     messages.json        — Message log
 *     file-locks.json      — File claim registry
 *     agents/
 *       {agentId}.json     — Per-agent state
 *
 * All writes use atomic temp-file-then-rename to prevent partial reads.
 */
@Injectable()
export class SwarmFileService {
  private readonly logger = createLogger('SwarmFileService');

  // ──────────────────────────────────────────────
  // Directory helpers
  // ──────────────────────────────────────────────

  /** Get the swarm data root for a project: {projectPath}/.omniscribe/swarm/{swarmId} */
  getSwarmDir(projectPath: string, swarmId: string): string {
    return path.join(projectPath, SWARM_DATA_DIR, swarmId);
  }

  /** Get the agents subdirectory */
  private getAgentsDir(projectPath: string, swarmId: string): string {
    return path.join(this.getSwarmDir(projectPath, swarmId), 'agents');
  }

  // ──────────────────────────────────────────────
  // Atomic file I/O
  // ──────────────────────────────────────────────

  /**
   * Atomically write JSON to a file (write to temp, then rename).
   * This prevents partial reads when agents or file watchers read concurrently.
   */
  private async atomicWriteJson(filePath: string, data: unknown): Promise<void> {
    const dir = path.dirname(filePath);
    await fs.promises.mkdir(dir, { recursive: true });

    // Write temp file in the SAME directory as the target to avoid EXDEV errors
    // on Linux when os.tmpdir() is on a different filesystem.
    const tmpPath = path.join(
      dir,
      `.${path.basename(filePath)}.${crypto.randomUUID().slice(0, 8)}.tmp`
    );

    try {
      await fs.promises.writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
      await fs.promises.rename(tmpPath, filePath);
    } catch (error) {
      // Clean up temp file on failure
      try {
        await fs.promises.unlink(tmpPath);
      } catch {
        // ignore cleanup errors
      }
      throw error;
    }
  }

  /**
   * Read and parse a JSON file. Returns null if the file doesn't exist.
   */
  private async readJson<T>(filePath: string): Promise<T | null> {
    try {
      const content = await fs.promises.readFile(filePath, 'utf-8');
      return JSON.parse(content) as T;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      this.logger.warn(`Failed to read ${filePath}: ${String(error)}`);
      return null;
    }
  }

  // ──────────────────────────────────────────────
  // Initialization / Cleanup
  // ──────────────────────────────────────────────

  /**
   * Initialize the swarm directory with config and initial state files.
   */
  async initSwarmDirectory(projectPath: string, swarm: SwarmConfig): Promise<void> {
    const swarmDir = this.getSwarmDir(projectPath, swarm.id);
    const agentsDir = this.getAgentsDir(projectPath, swarm.id);

    await fs.promises.mkdir(agentsDir, { recursive: true });

    // Write immutable config
    await this.atomicWriteJson(path.join(swarmDir, 'config.json'), swarm);

    // Write initial state
    const state: SwarmStateFile = {
      swarmId: swarm.id,
      status: swarm.status,
      updatedAt: swarm.updatedAt,
    };
    await this.atomicWriteJson(path.join(swarmDir, 'state.json'), state);

    // Write empty tasks/messages/file-locks
    await this.atomicWriteJson(path.join(swarmDir, 'tasks.json'), []);
    await this.atomicWriteJson(path.join(swarmDir, 'messages.json'), []);
    await this.atomicWriteJson(path.join(swarmDir, 'file-locks.json'), {
      locks: {},
      updatedAt: new Date().toISOString(),
    } satisfies FileLocksFile);

    this.logger.info(`Initialized swarm directory: ${swarmDir}`);
  }

  /**
   * Remove the swarm directory and all its contents.
   */
  async cleanupSwarmDirectory(projectPath: string, swarmId: string): Promise<void> {
    const swarmDir = this.getSwarmDir(projectPath, swarmId);

    try {
      await fs.promises.rm(swarmDir, { recursive: true, force: true });
      this.logger.info(`Cleaned up swarm directory: ${swarmDir}`);
    } catch (error) {
      this.logger.warn(`Failed to clean up swarm directory: ${String(error)}`);
    }
  }

  // ──────────────────────────────────────────────
  // State (status)
  // ──────────────────────────────────────────────

  async writeState(
    projectPath: string,
    swarmId: string,
    status: SwarmStatus,
    error?: string
  ): Promise<void> {
    const state: SwarmStateFile = {
      swarmId,
      status,
      ...(error && { error }),
      updatedAt: new Date().toISOString(),
    };
    await this.atomicWriteJson(
      path.join(this.getSwarmDir(projectPath, swarmId), 'state.json'),
      state
    );
  }

  async readState(projectPath: string, swarmId: string): Promise<SwarmStateFile | null> {
    return this.readJson<SwarmStateFile>(
      path.join(this.getSwarmDir(projectPath, swarmId), 'state.json')
    );
  }

  // ──────────────────────────────────────────────
  // Tasks
  // ──────────────────────────────────────────────

  async writeTasks(projectPath: string, swarmId: string, tasks: SwarmTask[]): Promise<void> {
    await this.atomicWriteJson(
      path.join(this.getSwarmDir(projectPath, swarmId), 'tasks.json'),
      tasks
    );
  }

  async readTasks(projectPath: string, swarmId: string): Promise<SwarmTask[]> {
    return (
      (await this.readJson<SwarmTask[]>(
        path.join(this.getSwarmDir(projectPath, swarmId), 'tasks.json')
      )) ?? []
    );
  }

  // ──────────────────────────────────────────────
  // Messages
  // ──────────────────────────────────────────────

  async writeMessages(
    projectPath: string,
    swarmId: string,
    messages: SwarmMessage[]
  ): Promise<void> {
    await this.atomicWriteJson(
      path.join(this.getSwarmDir(projectPath, swarmId), 'messages.json'),
      messages
    );
  }

  async readMessages(projectPath: string, swarmId: string): Promise<SwarmMessage[]> {
    return (
      (await this.readJson<SwarmMessage[]>(
        path.join(this.getSwarmDir(projectPath, swarmId), 'messages.json')
      )) ?? []
    );
  }

  // ──────────────────────────────────────────────
  // Agents
  // ──────────────────────────────────────────────

  async writeAgent(projectPath: string, swarmId: string, agent: SwarmAgent): Promise<void> {
    const agentState: AgentStateFile = {
      id: agent.id,
      sessionId: agent.sessionId,
      role: agent.role,
      status: agent.status,
      assignedTaskIds: agent.assignedTaskIds,
      claimedFiles: agent.claimedFiles,
      updatedAt: new Date().toISOString(),
    };
    await this.atomicWriteJson(
      path.join(this.getAgentsDir(projectPath, swarmId), `${agent.id}.json`),
      agentState
    );
  }

  async readAgent(
    projectPath: string,
    swarmId: string,
    agentId: string
  ): Promise<AgentStateFile | null> {
    return this.readJson<AgentStateFile>(
      path.join(this.getAgentsDir(projectPath, swarmId), `${agentId}.json`)
    );
  }

  async readAllAgents(projectPath: string, swarmId: string): Promise<AgentStateFile[]> {
    const agentsDir = this.getAgentsDir(projectPath, swarmId);

    try {
      const files = await fs.promises.readdir(agentsDir);
      const agents: AgentStateFile[] = [];

      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        const agent = await this.readJson<AgentStateFile>(path.join(agentsDir, file));
        if (agent) agents.push(agent);
      }

      return agents;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      this.logger.warn(`Failed to read agents directory: ${String(error)}`);
      return [];
    }
  }

  async removeAgent(projectPath: string, swarmId: string, agentId: string): Promise<void> {
    const filePath = path.join(this.getAgentsDir(projectPath, swarmId), `${agentId}.json`);
    try {
      await fs.promises.unlink(filePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        this.logger.warn(`Failed to remove agent file: ${String(error)}`);
      }
    }
  }

  // ──────────────────────────────────────────────
  // File Locks
  // ──────────────────────────────────────────────

  async writeFileLocks(
    projectPath: string,
    swarmId: string,
    locks: Record<string, { agentId: string; claimedAt: string }>
  ): Promise<void> {
    const data: FileLocksFile = {
      locks,
      updatedAt: new Date().toISOString(),
    };
    await this.atomicWriteJson(
      path.join(this.getSwarmDir(projectPath, swarmId), 'file-locks.json'),
      data
    );
  }

  async readFileLocks(
    projectPath: string,
    swarmId: string
  ): Promise<Record<string, { agentId: string; claimedAt: string }>> {
    const data = await this.readJson<FileLocksFile>(
      path.join(this.getSwarmDir(projectPath, swarmId), 'file-locks.json')
    );
    return data?.locks ?? {};
  }

  // ──────────────────────────────────────────────
  // Config (read-only after creation)
  // ──────────────────────────────────────────────

  async readConfig(projectPath: string, swarmId: string): Promise<SwarmConfig | null> {
    return this.readJson<SwarmConfig>(
      path.join(this.getSwarmDir(projectPath, swarmId), 'config.json')
    );
  }

  // ──────────────────────────────────────────────
  // Discovery
  // ──────────────────────────────────────────────

  /**
   * List all swarm IDs that have directories under the project's .omniscribe/swarm/.
   */
  async listSwarmIds(projectPath: string): Promise<string[]> {
    const swarmRoot = path.join(projectPath, SWARM_DATA_DIR);
    try {
      const entries = await fs.promises.readdir(swarmRoot, { withFileTypes: true });
      return entries.filter(e => e.isDirectory()).map(e => e.name);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      this.logger.warn(`Failed to list swarm IDs: ${String(error)}`);
      return [];
    }
  }
}
