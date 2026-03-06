/**
 * Swarm Create Task Tool
 * Creates a new task for the swarm (Lead-only)
 */

import { z } from 'zod';
import type { Tool, ToolDependencies, ToolMetadata, ToolResponse } from '../types.js';
import type { OmniscribeHttpClient } from '../../http/index.js';
import type { EnvironmentConfig } from '../../config/index.js';
import type { Logger } from '../../utils/index.js';
import type { SwarmRole } from '@omniscribe/shared';

type AssignableSwarmRole = Exclude<SwarmRole, 'lead'>;

interface SwarmCreateTaskInput {
  subject: string;
  description?: string;
  assignedRole?: AssignableSwarmRole;
  dependsOn?: string[];
}

export class SwarmCreateTaskTool implements Tool<SwarmCreateTaskInput> {
  readonly metadata: ToolMetadata = {
    name: 'omniscribe_swarm_create_task',
    title: 'Create Task',
    description:
      'Create a new task for the swarm. Only available to the Lead agent. Tasks can depend on other tasks.',
  };

  readonly inputSchema = {
    subject: z.string().describe('Brief task subject or title'),
    description: z.string().optional().describe('Detailed task description'),
    assignedRole: z
      .enum(['builder', 'reviewer', 'architect', 'tester', 'security'])
      .optional()
      .describe('Role to assign this task to'),
    dependsOn: z
      .array(z.string())
      .optional()
      .describe('Task IDs that must complete before this task can start'),
  };

  private readonly httpClient: OmniscribeHttpClient;
  private readonly config: EnvironmentConfig;
  private readonly logger: Logger;

  constructor(deps: ToolDependencies) {
    this.httpClient = deps.httpClient;
    this.config = deps.config;
    this.logger = deps.logger;
  }

  async execute(input: SwarmCreateTaskInput): Promise<ToolResponse> {
    if (!this.config.swarmId) {
      return {
        content: [{ type: 'text' as const, text: 'Error: Not part of a swarm' }],
        isError: true,
      };
    }

    if (this.config.swarmRole !== 'lead') {
      return {
        content: [{ type: 'text' as const, text: 'Error: Only the lead agent can create tasks' }],
        isError: true,
      };
    }

    const { subject, description, assignedRole, dependsOn } = input;
    this.logger.debug('omniscribe_swarm_create_task:', subject);

    try {
      const result = await this.httpClient.swarmCreateTask(
        subject,
        description,
        assignedRole,
        dependsOn
      );

      return {
        content: [
          {
            type: 'text' as const,
            text: `Task created with ID: ${result.taskId}`,
          },
        ],
      };
    } catch (error) {
      this.logger.error('swarmCreateTask error:', error);
      return {
        content: [{ type: 'text' as const, text: `Error creating task: ${String(error)}` }],
        isError: true,
      };
    }
  }
}
