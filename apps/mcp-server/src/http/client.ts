/**
 * HTTP client for communicating with Omniscribe desktop app
 */

import type {
  StatusPayload,
  SessionStatusState,
  TaskItem,
  TasksPayload,
  SwarmTask,
  SwarmMessage,
  SwarmContextResponse,
  SwarmClaimFilesResponse,
  SwarmGetAssignmentPayload,
  SwarmReportResultPayload,
  SwarmClaimFilesPayload,
  SwarmReleaseFilesPayload,
  SwarmSendMessagePayload,
  SwarmGetMessagesPayload,
  SwarmGetContextPayload,
  SwarmSpawnTeammatePayload,
  SwarmCreateTaskPayload,
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
   * Poll for the next available swarm task assignment
   */
  swarmGetAssignment(): Promise<SwarmTask | null>;

  /**
   * Report the result of a completed or failed swarm task
   */
  swarmReportResult(taskId: string, result: string, status: string): Promise<boolean>;

  /**
   * Claim exclusive editing rights on files
   */
  swarmClaimFiles(files: string[]): Promise<SwarmClaimFilesResponse>;

  /**
   * Release file editing locks
   */
  swarmReleaseFiles(files?: string[]): Promise<boolean>;

  /**
   * Send a message to another agent or broadcast
   */
  swarmSendMessage(toAgentId: string, content: string, type: string): Promise<boolean>;

  /**
   * Get unread messages for this agent
   */
  swarmGetMessages(): Promise<SwarmMessage[]>;

  /**
   * Get the full swarm context (agents, tasks, messages)
   */
  swarmGetContext(): Promise<SwarmContextResponse>;

  /**
   * Request a new teammate to join the swarm
   */
  swarmSpawnTeammate(role: string, taskDescription?: string): Promise<{ agentId: string }>;

  /**
   * Create a new task in the swarm
   */
  swarmCreateTask(
    subject: string,
    description?: string,
    assignedRole?: string,
    dependsOn?: string[]
  ): Promise<{ taskId: string }>;
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

  function getSwarmUrl(action: string): string {
    return new URL(statusUrl!).origin + `/swarm/${action}`;
  }

  function getSwarmBasePayload(): { sessionId: string; instanceId: string; swarmId: string } {
    return {
      sessionId: sessionId!,
      instanceId: instanceId!,
      swarmId: config.swarmId!,
    };
  }

  async function swarmGetAssignment(): Promise<SwarmTask | null> {
    if (!statusUrl || !sessionId || !instanceId || !config.swarmId) {
      logger.error('Swarm not configured');
      return null;
    }

    const url = getSwarmUrl('get-assignment');
    const payload: SwarmGetAssignmentPayload = getSwarmBasePayload();

    logger.debug(`Swarm get-assignment: ${url}`);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) return null;
      const data = await response.json();
      return (data as { task: SwarmTask | null }).task ?? null;
    } catch (error) {
      logger.error('Swarm get-assignment error:', error);
      return null;
    }
  }

  async function swarmReportResult(
    taskId: string,
    result: string,
    status: string
  ): Promise<boolean> {
    if (!statusUrl || !sessionId || !instanceId || !config.swarmId) {
      logger.error('Swarm not configured');
      return false;
    }

    const url = getSwarmUrl('report-result');
    const payload: SwarmReportResultPayload = {
      ...getSwarmBasePayload(),
      taskId,
      result,
      status: status as 'completed' | 'failed',
    };

    logger.debug(`Swarm report-result: ${url} taskId=${taskId} status=${status}`);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(5000),
      });

      return response.ok;
    } catch (error) {
      logger.error('Swarm report-result error:', error);
      return false;
    }
  }

  async function swarmClaimFiles(files: string[]): Promise<SwarmClaimFilesResponse> {
    if (!statusUrl || !sessionId || !instanceId || !config.swarmId) {
      logger.error('Swarm not configured');
      return { claimed: [], denied: files };
    }

    const url = getSwarmUrl('claim-files');
    const payload: SwarmClaimFilesPayload = {
      ...getSwarmBasePayload(),
      files,
    };

    logger.debug(`Swarm claim-files: ${url} ${files.length} file(s)`);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) return { claimed: [], denied: files };
      return (await response.json()) as SwarmClaimFilesResponse;
    } catch (error) {
      logger.error('Swarm claim-files error:', error);
      return { claimed: [], denied: files };
    }
  }

  async function swarmReleaseFiles(files?: string[]): Promise<boolean> {
    if (!statusUrl || !sessionId || !instanceId || !config.swarmId) {
      logger.error('Swarm not configured');
      return false;
    }

    const url = getSwarmUrl('release-files');
    const payload: SwarmReleaseFilesPayload = {
      ...getSwarmBasePayload(),
      files,
    };

    logger.debug(`Swarm release-files: ${url} ${files ? files.length + ' file(s)' : 'all'}`);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(5000),
      });

      return response.ok;
    } catch (error) {
      logger.error('Swarm release-files error:', error);
      return false;
    }
  }

  async function swarmSendMessage(
    toAgentId: string,
    content: string,
    type: string
  ): Promise<boolean> {
    if (!statusUrl || !sessionId || !instanceId || !config.swarmId) {
      logger.error('Swarm not configured');
      return false;
    }

    const url = getSwarmUrl('send-message');
    const payload: SwarmSendMessagePayload = {
      ...getSwarmBasePayload(),
      toAgentId,
      content,
      type: type as SwarmMessage['type'],
    };

    logger.debug(`Swarm send-message: ${url} to=${toAgentId} type=${type}`);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(5000),
      });

      return response.ok;
    } catch (error) {
      logger.error('Swarm send-message error:', error);
      return false;
    }
  }

  async function swarmGetMessages(): Promise<SwarmMessage[]> {
    if (!statusUrl || !sessionId || !instanceId || !config.swarmId) {
      logger.error('Swarm not configured');
      return [];
    }

    const url = getSwarmUrl('get-messages');
    const payload: SwarmGetMessagesPayload = getSwarmBasePayload();

    logger.debug(`Swarm get-messages: ${url}`);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) return [];
      const data = await response.json();
      return (data as { messages: SwarmMessage[] }).messages ?? [];
    } catch (error) {
      logger.error('Swarm get-messages error:', error);
      return [];
    }
  }

  async function swarmGetContext(): Promise<SwarmContextResponse> {
    if (!statusUrl || !sessionId || !instanceId || !config.swarmId) {
      logger.error('Swarm not configured');
      throw new Error('Swarm not configured');
    }

    const url = getSwarmUrl('get-context');
    const payload: SwarmGetContextPayload = getSwarmBasePayload();

    logger.debug(`Swarm get-context: ${url}`);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return (await response.json()) as SwarmContextResponse;
    } catch (error) {
      logger.error('Swarm get-context error:', error);
      throw error;
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

    const url = getSwarmUrl('spawn-teammate');
    const payload: SwarmSpawnTeammatePayload = {
      ...getSwarmBasePayload(),
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

  async function swarmCreateTask(
    subject: string,
    description?: string,
    assignedRole?: string,
    dependsOn?: string[]
  ): Promise<{ taskId: string }> {
    if (!statusUrl || !sessionId || !instanceId || !config.swarmId) {
      logger.error('Swarm not configured');
      throw new Error('Swarm not configured');
    }

    const url = getSwarmUrl('create-task');
    const payload: SwarmCreateTaskPayload = {
      ...getSwarmBasePayload(),
      subject,
      description,
      assignedRole: assignedRole as SwarmCreateTaskPayload['assignedRole'],
      dependsOn,
    };

    logger.debug(`Swarm create-task: ${url} subject=${subject}`);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = (await response.json()) as { taskId?: string; task?: { id?: string } };
      const taskId = data.taskId ?? data.task?.id;
      if (!taskId) throw new Error('Missing taskId in swarm create-task response');
      return { taskId };
    } catch (error) {
      logger.error('Swarm create-task error:', error);
      throw error;
    }
  }

  return {
    reportStatus,
    reportTasks,
    swarmGetAssignment,
    swarmReportResult,
    swarmClaimFiles,
    swarmReleaseFiles,
    swarmSendMessage,
    swarmGetMessages,
    swarmGetContext,
    swarmSpawnTeammate,
    swarmCreateTask,
  };
}
