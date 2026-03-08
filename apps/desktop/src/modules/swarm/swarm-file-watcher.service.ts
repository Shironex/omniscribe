import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  SWARM_DATA_DIR,
  SwarmAgent,
  SwarmTask,
  SwarmMessage,
  createLogger,
} from '@omniscribe/shared';
import { InternalSwarmEvents } from '../shared/events';
import { SwarmTaskService } from './swarm-task.service';
import { SwarmMessagingService } from './swarm-messaging.service';
import type { AgentStateFile } from './swarm-file.service';

/** Debounce interval for file change events (ms) */
const DEBOUNCE_MS = 300;

@Injectable()
export class SwarmFileWatcherService implements OnModuleDestroy {
  private readonly logger = createLogger('SwarmFileWatcherService');

  /** swarmId -> list of active fs.FSWatcher instances */
  private watchers = new Map<string, fs.FSWatcher[]>();

  /** Debounce timers: key -> timeout */
  private debounceTimers = new Map<string, NodeJS.Timeout>();

  /** Last known file contents for change detection (hash or mtime) */
  private lastMtimes = new Map<string, number>();

  constructor(
    private readonly eventEmitter: EventEmitter2,
    private readonly swarmTaskService: SwarmTaskService,
    private readonly swarmMessagingService: SwarmMessagingService
  ) {}

  onModuleDestroy(): void {
    this.stopAll();
  }

  /**
   * Start watching a swarm's `.omniscribe/swarm/{swarmId}/` directory.
   * Call this after the swarm directory structure has been created.
   */
  startWatching(swarmId: string, projectPath: string): void {
    if (this.watchers.has(swarmId)) {
      this.logger.warn(`Already watching swarm ${swarmId}`);
      return;
    }

    const swarmDir = path.join(projectPath, SWARM_DATA_DIR, swarmId);
    const agentsDir = path.join(swarmDir, 'agents');

    // Ensure directories exist before watching
    if (!fs.existsSync(swarmDir)) {
      this.logger.warn(`Swarm directory does not exist: ${swarmDir}`);
      return;
    }

    const watcherList: fs.FSWatcher[] = [];

    // Watch the main swarm directory for tasks.json, messages.json, state.json changes
    try {
      const mainWatcher = fs.watch(swarmDir, (_eventType, filename) => {
        if (!filename) return;
        this.handleFileChange(swarmId, projectPath, filename);
      });
      mainWatcher.on('error', err => {
        this.logger.warn(`Watcher error for swarm ${swarmId}: ${err.message}`);
      });
      watcherList.push(mainWatcher);
    } catch (err) {
      this.logger.error(`Failed to watch swarm directory ${swarmDir}: ${(err as Error).message}`);
    }

    // Watch the agents/ subdirectory for per-agent state changes
    if (fs.existsSync(agentsDir)) {
      try {
        const agentsWatcher = fs.watch(agentsDir, (_eventType, filename) => {
          if (!filename || !filename.endsWith('.json')) return;
          this.handleAgentFileChange(swarmId, projectPath, filename);
        });
        agentsWatcher.on('error', err => {
          this.logger.warn(`Agents watcher error for swarm ${swarmId}: ${err.message}`);
        });
        watcherList.push(agentsWatcher);
      } catch (err) {
        this.logger.error(
          `Failed to watch agents directory ${agentsDir}: ${(err as Error).message}`
        );
      }
    }

    this.watchers.set(swarmId, watcherList);
    this.logger.info(`Started watching swarm ${swarmId} at ${swarmDir}`);
  }

  /**
   * Start watching the agents/ subdirectory if it was created after initial watch.
   * Safe to call multiple times — will skip if already watching.
   */
  ensureAgentsWatcher(swarmId: string, projectPath: string): void {
    const watcherList = this.watchers.get(swarmId);
    if (!watcherList) return;

    // If we already have 2+ watchers, the agents dir watcher is already set up
    if (watcherList.length >= 2) return;

    const agentsDir = path.join(projectPath, SWARM_DATA_DIR, swarmId, 'agents');
    if (!fs.existsSync(agentsDir)) return;

    try {
      const agentsWatcher = fs.watch(agentsDir, (_eventType, filename) => {
        if (!filename || !filename.endsWith('.json')) return;
        this.handleAgentFileChange(swarmId, projectPath, filename);
      });
      agentsWatcher.on('error', err => {
        this.logger.warn(`Agents watcher error for swarm ${swarmId}: ${err.message}`);
      });
      watcherList.push(agentsWatcher);
      this.logger.debug(`Added agents directory watcher for swarm ${swarmId}`);
    } catch (err) {
      this.logger.warn(`Failed to watch agents directory ${agentsDir}: ${(err as Error).message}`);
    }
  }

  /**
   * Stop watching a specific swarm.
   */
  stopWatching(swarmId: string): void {
    const watcherList = this.watchers.get(swarmId);
    if (watcherList) {
      for (const watcher of watcherList) {
        watcher.close();
      }
      this.watchers.delete(swarmId);
    }

    // Clean up debounce timers for this swarm
    for (const [key, timer] of this.debounceTimers.entries()) {
      if (key.startsWith(`${swarmId}:`)) {
        clearTimeout(timer);
        this.debounceTimers.delete(key);
      }
    }

    // Clean up mtime cache
    for (const key of this.lastMtimes.keys()) {
      if (key.startsWith(`${swarmId}:`)) {
        this.lastMtimes.delete(key);
      }
    }

    this.logger.info(`Stopped watching swarm ${swarmId}`);
  }

  /**
   * Stop all watchers.
   */
  stopAll(): void {
    for (const [swarmId, watcherList] of this.watchers.entries()) {
      for (const watcher of watcherList) {
        watcher.close();
      }
      this.logger.debug(`Closed watchers for swarm ${swarmId}`);
    }
    this.watchers.clear();

    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
    this.lastMtimes.clear();
  }

  /**
   * Handle a file change in the main swarm directory.
   */
  private handleFileChange(swarmId: string, projectPath: string, filename: string): void {
    const debounceKey = `${swarmId}:${filename}`;
    this.debounce(debounceKey, () => {
      const filePath = path.join(projectPath, SWARM_DATA_DIR, swarmId, filename);

      // Check if file actually changed (mtime check)
      if (!this.hasFileChanged(debounceKey, filePath)) return;

      switch (filename) {
        case 'tasks.json':
          this.processTasksFile(swarmId, filePath);
          break;
        case 'messages.json':
          this.processMessagesFile(swarmId, filePath);
          break;
        case 'state.json':
          this.processStateFile(swarmId, filePath);
          break;
        default:
          // Ignore other files (config.json is immutable, file-locks.json handled separately)
          break;
      }
    });
  }

  /**
   * Handle a file change in the agents/ subdirectory.
   */
  private handleAgentFileChange(swarmId: string, projectPath: string, filename: string): void {
    const debounceKey = `${swarmId}:agents/${filename}`;
    this.debounce(debounceKey, () => {
      const filePath = path.join(projectPath, SWARM_DATA_DIR, swarmId, 'agents', filename);

      if (!this.hasFileChanged(debounceKey, filePath)) return;

      this.processAgentFile(swarmId, filePath);
    });
  }

  /**
   * Read tasks from file and sync to in-memory store.
   * Uses syncFromFile which emits events with `fromFile` flag to prevent re-persist loops.
   */
  private processTasksFile(swarmId: string, filePath: string): void {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const tasks: SwarmTask[] = JSON.parse(content);

      if (!Array.isArray(tasks)) {
        this.logger.warn(`Invalid tasks.json for swarm ${swarmId}: not an array`);
        return;
      }

      this.swarmTaskService.syncFromFile(swarmId, tasks);
    } catch (err) {
      this.logger.warn(
        `Failed to process tasks.json for swarm ${swarmId}: ${(err as Error).message}`
      );
    }
  }

  /**
   * Read messages from file and sync to in-memory store.
   * Uses syncFromFile which merges new messages and emits events with `fromFile` flag.
   */
  private processMessagesFile(swarmId: string, filePath: string): void {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const messages: SwarmMessage[] = JSON.parse(content);

      if (!Array.isArray(messages)) {
        this.logger.warn(`Invalid messages.json for swarm ${swarmId}: not an array`);
        return;
      }

      this.swarmMessagingService.syncFromFile(swarmId, messages);
    } catch (err) {
      this.logger.warn(
        `Failed to process messages.json for swarm ${swarmId}: ${(err as Error).message}`
      );
    }
  }

  /**
   * Read and emit status update from a state.json file.
   */
  private processStateFile(swarmId: string, filePath: string): void {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const state = JSON.parse(content) as { status: string; error?: string };

      this.eventEmitter.emit(InternalSwarmEvents.STATUS, {
        swarmId,
        status: state.status,
        error: state.error,
        fromFile: true,
      });

      this.logger.debug(`Processed state.json for swarm ${swarmId}: status=${state.status}`);
    } catch (err) {
      this.logger.warn(
        `Failed to process state.json for swarm ${swarmId}: ${(err as Error).message}`
      );
    }
  }

  /**
   * Read and emit updates from a per-agent state file.
   */
  private processAgentFile(swarmId: string, filePath: string): void {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const agentState: AgentStateFile = JSON.parse(content);

      // Convert to SwarmAgent shape for the existing event system
      const agent: SwarmAgent = {
        id: agentState.id,
        swarmId,
        sessionId: agentState.sessionId,
        role: agentState.role as SwarmAgent['role'],
        status: agentState.status as SwarmAgent['status'],
        assignedTaskIds: agentState.assignedTaskIds,
        claimedFiles: agentState.claimedFiles,
      };

      this.eventEmitter.emit(InternalSwarmEvents.AGENT_UPDATED, { swarmId, agent });

      this.logger.debug(
        `Processed agent file for ${agentState.id} in swarm ${swarmId}: status=${agentState.status}`
      );
    } catch (err) {
      this.logger.warn(
        `Failed to process agent file for swarm ${swarmId}: ${(err as Error).message}`
      );
    }
  }

  /**
   * Debounce a callback by key.
   */
  private debounce(key: string, callback: () => void): void {
    const existing = this.debounceTimers.get(key);
    if (existing) {
      clearTimeout(existing);
    }
    this.debounceTimers.set(
      key,
      setTimeout(() => {
        this.debounceTimers.delete(key);
        callback();
      }, DEBOUNCE_MS)
    );
  }

  /**
   * Check if a file has actually changed by comparing mtime.
   * Returns true if changed or if we haven't seen this file before.
   */
  private hasFileChanged(key: string, filePath: string): boolean {
    try {
      const stat = fs.statSync(filePath);
      const mtime = stat.mtimeMs;
      const lastMtime = this.lastMtimes.get(key);

      if (lastMtime !== undefined && lastMtime === mtime) {
        return false;
      }

      this.lastMtimes.set(key, mtime);
      return true;
    } catch {
      // File might have been deleted — still counts as a change
      return true;
    }
  }
}
