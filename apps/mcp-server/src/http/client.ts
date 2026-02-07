/**
 * HTTP client for communicating with Omniscribe desktop app
 */

import type { StatusPayload, SessionStatusState, TaskItem, TasksPayload } from '@omniscribe/shared';
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

    const tasksUrl = statusUrl.replace('/status', '/tasks');

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

  return {
    reportStatus,
    reportTasks,
  };
}
