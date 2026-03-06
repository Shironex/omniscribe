import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as crypto from 'node:crypto';
import * as path from 'node:path';
import {
  MAX_SWARM_TASK_SUBJECT_LENGTH,
  MAX_SWARM_TASK_TEXT_LENGTH,
  SwarmTask,
  SwarmCreateTaskPayload,
  createLogger,
} from '@omniscribe/shared';
import { InternalSwarmEvents } from '../shared/events';
import { FileLock } from './types';

@Injectable()
export class SwarmTaskService {
  private readonly logger = createLogger('SwarmTaskService');

  /** swarmId -> tasks */
  private tasks = new Map<string, SwarmTask[]>();
  /** filePath -> lock */
  private fileLocks = new Map<string, FileLock>();

  constructor(private readonly eventEmitter: EventEmitter2) {}

  private validateTaskText(field: string, value: string | undefined, maxLength: number): void {
    if (value === undefined) return;

    const trimmed = value.trim();
    if (!trimmed) {
      throw new Error(`${field} cannot be empty`);
    }
    if (trimmed.length > maxLength) {
      throw new Error(`${field} exceeds maximum length of ${maxLength}`);
    }
  }

  private validateTaskInput(
    swarmId: string,
    payload: Pick<SwarmCreateTaskPayload, 'subject' | 'description' | 'assignedRole' | 'dependsOn'>
  ): void {
    this.validateTaskText('Task subject', payload.subject, MAX_SWARM_TASK_SUBJECT_LENGTH);
    this.validateTaskText('Task description', payload.description, MAX_SWARM_TASK_TEXT_LENGTH);

    const swarmTasks = this.tasks.get(swarmId) ?? [];
    const taskIds = new Set(swarmTasks.map(task => task.id));
    for (const dependencyId of payload.dependsOn ?? []) {
      if (!taskIds.has(dependencyId)) {
        throw new Error(`Unknown dependency: ${dependencyId}`);
      }
    }
  }

  private wouldIntroduceDependencyCycle(
    swarmId: string,
    taskId: string,
    dependsOn: string[]
  ): boolean {
    if (dependsOn.length === 0) return false;

    const adjacency = new Map<string, string[]>();
    for (const task of this.tasks.get(swarmId) ?? []) {
      adjacency.set(task.id, task.dependsOn);
    }
    adjacency.set(taskId, dependsOn);

    const visiting = new Set<string>();
    const visited = new Set<string>();

    const visit = (currentTaskId: string): boolean => {
      if (visiting.has(currentTaskId)) return true;
      if (visited.has(currentTaskId)) return false;

      visiting.add(currentTaskId);
      const deps = adjacency.get(currentTaskId) ?? [];
      for (const dependencyId of deps) {
        if (visit(dependencyId)) return true;
      }
      visiting.delete(currentTaskId);
      visited.add(currentTaskId);
      return false;
    };

    return visit(taskId);
  }

  /**
   * Normalize a file path for consistent lock keys.
   * Rejects absolute paths and .. traversal to prevent lock bypass.
   */
  private normalizeFilePath(filePath: string): string {
    const normalized = path.normalize(filePath).replace(/\\/g, '/');
    if (path.isAbsolute(normalized) || normalized.startsWith('..')) {
      throw new Error(`Invalid file path: ${filePath}`);
    }
    return normalized;
  }

  /**
   * Create a new task for a swarm.
   */
  createTask(
    swarmId: string,
    payload: Pick<SwarmCreateTaskPayload, 'subject' | 'description' | 'assignedRole' | 'dependsOn'>
  ): SwarmTask {
    this.validateTaskInput(swarmId, payload);

    const now = new Date().toISOString();
    const taskId = crypto.randomUUID();
    const dependsOn = payload.dependsOn ?? [];
    if (this.wouldIntroduceDependencyCycle(swarmId, taskId, dependsOn)) {
      throw new Error('Task dependencies would create a cycle');
    }

    const hasDependencies = payload.dependsOn && payload.dependsOn.length > 0;

    const task: SwarmTask = {
      id: taskId,
      swarmId,
      subject: payload.subject.trim(),
      description: payload.description?.trim(),
      status: hasDependencies ? 'blocked' : 'pending',
      assignedRole: payload.assignedRole,
      dependsOn,
      createdAt: now,
      updatedAt: now,
    };

    const swarmTasks = this.tasks.get(swarmId) ?? [];
    swarmTasks.push(task);
    this.tasks.set(swarmId, swarmTasks);

    this.logger.info(`Created task ${task.id} for swarm ${swarmId}: ${task.subject}`);

    this.eventEmitter.emit(InternalSwarmEvents.TASK_UPDATED, { swarmId, task });

    return task;
  }

  /**
   * Find the next pending task for an agent's role, assign it, and return it.
   * Returns null if no pending task is available for the given role.
   */
  getAssignment(swarmId: string, agentId: string, agentRole?: string): SwarmTask | null {
    const swarmTasks = this.tasks.get(swarmId);
    if (!swarmTasks) return null;

    // Find the first pending task matching the agent's role (or unassigned role)
    const task = swarmTasks.find(
      t => t.status === 'pending' && (!t.assignedRole || !agentRole || t.assignedRole === agentRole)
    );
    if (!task) return null;

    task.status = 'assigned';
    task.assignedTo = agentId;
    task.updatedAt = new Date().toISOString();

    this.logger.info(`Assigned task ${task.id} to agent ${agentId} in swarm ${swarmId}`);

    this.eventEmitter.emit(InternalSwarmEvents.TASK_UPDATED, { swarmId, task });

    return task;
  }

  /**
   * Report the result of a task.
   */
  reportResult(
    swarmId: string,
    taskId: string,
    reporterAgentId: string,
    result: string,
    status: 'completed' | 'failed'
  ): SwarmTask | null {
    const swarmTasks = this.tasks.get(swarmId);
    if (!swarmTasks) return null;

    const task = swarmTasks.find(t => t.id === taskId);
    if (!task) return null;

    this.validateTaskText('Task result', result, MAX_SWARM_TASK_TEXT_LENGTH);

    if (task.assignedTo && task.assignedTo !== reporterAgentId) {
      throw new Error('Only the assigned agent can report this task result');
    }

    task.status = status;
    task.result = result.trim();
    task.updatedAt = new Date().toISOString();

    this.logger.info(
      `Task ${taskId} in swarm ${swarmId} reported as ${status}: ${result.slice(0, 100)}`
    );

    this.eventEmitter.emit(InternalSwarmEvents.TASK_UPDATED, { swarmId, task });

    // Resolve dependencies if the task completed successfully
    if (status === 'completed') {
      this.resolveDependencies(swarmId);
    }

    return task;
  }

  /**
   * Claim file locks for an agent.
   * Returns which files were successfully claimed and which were denied.
   */
  claimFiles(
    swarmId: string,
    agentId: string,
    files: string[]
  ): { claimed: string[]; denied: string[] } {
    const claimed: string[] = [];
    const denied: string[] = [];

    for (const file of files) {
      try {
        const normalized = this.normalizeFilePath(file);
        const lockKey = `${swarmId}:${normalized}`;
        const existing = this.fileLocks.get(lockKey);

        if (existing && existing.agentId !== agentId) {
          denied.push(file);
        } else {
          this.fileLocks.set(lockKey, { agentId, claimedAt: new Date() });
          claimed.push(file);
        }
      } catch {
        denied.push(file);
      }
    }

    this.logger.debug(
      `Agent ${agentId} in swarm ${swarmId}: claimed ${claimed.length} files, denied ${denied.length}`
    );

    return { claimed, denied };
  }

  /**
   * Release file locks for an agent.
   * If no files are specified, releases all locks held by the agent.
   */
  releaseFiles(swarmId: string, agentId: string, files?: string[]): void {
    if (files) {
      for (const file of files) {
        try {
          const normalized = this.normalizeFilePath(file);
          const lockKey = `${swarmId}:${normalized}`;
          const existing = this.fileLocks.get(lockKey);
          if (existing && existing.agentId === agentId) {
            this.fileLocks.delete(lockKey);
          }
        } catch {
          // Skip invalid paths silently during release
        }
      }
    } else {
      // Release all locks held by this agent in this swarm
      const prefix = `${swarmId}:`;
      for (const [key, lock] of this.fileLocks.entries()) {
        if (key.startsWith(prefix) && lock.agentId === agentId) {
          this.fileLocks.delete(key);
        }
      }
    }

    this.logger.debug(
      `Released file locks for agent ${agentId} in swarm ${swarmId}${files ? ` (${files.length} files)` : ' (all)'}`
    );
  }

  /**
   * Get all tasks for a swarm.
   */
  getTasksForSwarm(swarmId: string): SwarmTask[] {
    return this.tasks.get(swarmId) ?? [];
  }

  /**
   * Unblock tasks whose dependencies are all completed.
   */
  resolveDependencies(swarmId: string): void {
    const swarmTasks = this.tasks.get(swarmId);
    if (!swarmTasks) return;

    const completedIds = new Set(swarmTasks.filter(t => t.status === 'completed').map(t => t.id));

    for (const task of swarmTasks) {
      if (task.status !== 'blocked') continue;

      const allDepsCompleted = task.dependsOn.every(depId => completedIds.has(depId));
      if (allDepsCompleted) {
        task.status = 'pending';
        task.updatedAt = new Date().toISOString();

        this.logger.info(`Task ${task.id} unblocked in swarm ${swarmId}`);

        this.eventEmitter.emit(InternalSwarmEvents.TASK_UPDATED, { swarmId, task });
      }
    }
  }

  /**
   * Remove all tasks and file locks for a swarm.
   */
  cleanup(swarmId: string): void {
    this.tasks.delete(swarmId);

    // Remove all file locks for this swarm
    const prefix = `${swarmId}:`;
    for (const key of this.fileLocks.keys()) {
      if (key.startsWith(prefix)) {
        this.fileLocks.delete(key);
      }
    }

    this.logger.info(`Cleaned up tasks and file locks for swarm ${swarmId}`);
  }
}
