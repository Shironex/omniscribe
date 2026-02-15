/**
 * Omniscribe Tasks Tool
 * Reports the current task list back to Omniscribe UI
 */

import { z } from 'zod';
import type { Tool, ToolDependencies, ToolMetadata, ToolResponse } from '../types.js';
import type { OmniscribeHttpClient } from '../../http/index.js';
import type { Logger } from '../../utils/index.js';
import { TASK_STATUSES, type TaskItem, type TaskStatus } from '@omniscribe/shared';

interface OmniscribeTasksInput {
  tasks: Array<{ id: string; subject: string; status: TaskStatus }>;
}

export class OmniscribeTasksTool implements Tool<OmniscribeTasksInput> {
  readonly metadata: ToolMetadata = {
    name: 'omniscribe_tasks',
    title: 'Report Task List to Omniscribe',
    description:
      'Report the current task list to the Omniscribe UI. Always send the complete current task list as a snapshot — every call replaces the previous list. Use this to keep the user informed about planned work and progress.',
  };

  readonly inputSchema = {
    tasks: z
      .array(
        z.object({
          id: z.string().describe('Unique task identifier'),
          subject: z.string().describe('Brief task subject or title'),
          status: z
            .enum(TASK_STATUSES)
            .describe(
              'Current task status: pending (not started), in_progress (actively working), completed (done)'
            ),
        })
      )
      .describe('Current task list snapshot. Always send the complete list of all tasks.'),
  };

  private readonly httpClient: OmniscribeHttpClient;
  private readonly logger: Logger;

  constructor(deps: ToolDependencies) {
    this.httpClient = deps.httpClient;
    this.logger = deps.logger;
  }

  async execute(input: OmniscribeTasksInput): Promise<ToolResponse> {
    const tasks: TaskItem[] = input.tasks;
    this.logger.debug('omniscribe_tasks:', tasks.length, 'task(s)');

    const success = await this.httpClient.reportTasks(tasks);

    if (success) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `Tasks updated: ${tasks.length} task(s) reported`,
          },
        ],
      };
    } else {
      return {
        content: [
          {
            type: 'text' as const,
            text: 'Warning: Tasks could not be reported to Omniscribe (check configuration)',
          },
        ],
      };
    }
  }
}
