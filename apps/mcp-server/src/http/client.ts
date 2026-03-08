/**
 * HTTP client for communicating with Omniscribe desktop app
 *
 * After migration to file-based swarm coordination, only spawn-teammate
 * remains as an HTTP endpoint. All other swarm operations (tasks, messages,
 * file locks, context) are handled via direct file reads/writes by agents.
 */

import type {
  StatusPayload,
  SessionStatusState,
  TaskItem,
  TasksPayload,
  SwarmSpawnTeammatePayload,
} from '@omniscribe/shared';
import type { EnvironmentConfig } from '../config/index.js';
import type { Logger } from '../utils/index.js';

export interface OmniscribeHttpClient {
  /**
   * Report session status to Omniscribe
   */
  reportStatus(
    state: SessionStatusState,
    message?: string,
    needsInputPrompt?: string
  ): Promise<boolean>;

  /**
   * Report task list to Omniscribe
   */
  reportTasks(tasks: TaskItem[]): Promise<boolean>;

  /**
   * Request a new teammate to join the swarm (Lead-only, requires backend session creation)
   */
  swarmSpawnTeammate(role: string, taskDescription?: string): Promise<{ agentId: string }>;
}

/**
 * Create an HTTP client for Omniscribe communication
 */
export function createHttpClient(config: EnvironmentConfig, logger: Logger): OmniscribeHttpClient {
  const { sessionId, instanceId, statusUrl } = config;

  async function reportStatus(
    state: SessionStatusState,
    message?: string,
    needsInputPrompt?: string
  ): Promise<boolean> {
    if (!statusUrl || !sessionId || !instanceId) {
      logger.error('Status reporting not configured');
      return false;
    }

    const payload: StatusPayload = {
      sessionId,
      instanceId,
      state,
      message,
      needsInputPrompt,
      timestamp: new Date().toISOString(),
    };

    logger.debug(
      `Sending status to ${statusUrl}: state=${state}${message ? `, message=${message}` : ''}`
    );

    try {
      const response = await fetch(statusUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(5000),
      });

      logger.debug(`Status response: ${response.status}`);
      return response.ok;
    } catch (error) {
      logger.error('Status report error:', error);
      return false;
    }
  }

  async function reportTasks(tasks: TaskItem[]): Promise<boolean> {
    if (!statusUrl || !sessionId || !instanceId) {
      logger.error('Tasks reporting not configured');
      return false;
    }

    const tasksUrl = new URL(statusUrl).origin + '/tasks';

    const payload: TasksPayload = {
      sessionId,
      instanceId,
      tasks,
      timestamp: new Date().toISOString(),
    };

    logger.debug(`Sending tasks to ${tasksUrl}: ${tasks.length} task(s)`);

    try {
      const response = await fetch(tasksUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(5000),
      });

      logger.debug(`Tasks response: ${response.status}`);
      return response.ok;
    } catch (error) {
      logger.error('Tasks report error:', error);
      return false;
    }
  }

  async function swarmSpawnTeammate(
    role: string,
    taskDescription?: string
  ): Promise<{ agentId: string }> {
    if (!statusUrl || !sessionId || !instanceId || !config.swarmId) {
      logger.error('Swarm not configured');
      throw new Error('Swarm not configured');
    }

    const url = new URL(statusUrl).origin + '/swarm/spawn-teammate';
    const payload: SwarmSpawnTeammatePayload = {
      sessionId,
      instanceId,
      swarmId: config.swarmId,
      role: role as SwarmSpawnTeammatePayload['role'],
      taskDescription,
    };

    logger.debug(`Swarm spawn-teammate: ${url} role=${role}`);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(20000),
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = (await response.json()) as { agentId?: string; agent?: { id?: string } };
      const agentId = data.agentId ?? data.agent?.id;
      if (!agentId) throw new Error('Missing agentId in swarm spawn response');
      return { agentId };
    } catch (error) {
      logger.error('Swarm spawn-teammate error:', error);
      throw error;
    }
  }

  return {
    reportStatus,
    reportTasks,
    swarmSpawnTeammate,
  };
}
