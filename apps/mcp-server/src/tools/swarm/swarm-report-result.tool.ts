/**
 * Swarm Report Result Tool
 * Reports the result of a completed or failed task
 */

import { z } from 'zod';
import type { Tool, ToolDependencies, ToolMetadata, ToolResponse } from '../types.js';
import type { OmniscribeHttpClient } from '../../http/index.js';
import type { EnvironmentConfig } from '../../config/index.js';
import type { Logger } from '../../utils/index.js';

interface SwarmReportResultInput {
  taskId: string;
  result: string;
  status: 'completed' | 'failed';
}

export class SwarmReportResultTool implements Tool<SwarmReportResultInput> {
  readonly metadata: ToolMetadata = {
    name: 'omniscribe_swarm_report_result',
    title: 'Report Task Result',
    description: 'Report the result of a completed or failed task.',
  };

  readonly inputSchema = {
    taskId: z.string().describe('The ID of the task to report results for'),
    result: z.string().describe('Summary of the task result or failure reason'),
    status: z
      .enum(['completed', 'failed'])
      .describe('Whether the task was completed successfully or failed'),
  };

  private readonly httpClient: OmniscribeHttpClient;
  private readonly config: EnvironmentConfig;
  private readonly logger: Logger;

  constructor(deps: ToolDependencies) {
    this.httpClient = deps.httpClient;
    this.config = deps.config;
    this.logger = deps.logger;
  }

  async execute(input: SwarmReportResultInput): Promise<ToolResponse> {
    if (!this.config.swarmId) {
      return {
        content: [{ type: 'text' as const, text: 'Error: Not part of a swarm' }],
        isError: true,
      };
    }

    const { taskId, result, status } = input;
    this.logger.debug('omniscribe_swarm_report_result:', taskId, status);

    try {
      const success = await this.httpClient.swarmReportResult(taskId, result, status);

      if (success) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Task ${taskId} reported as ${status}`,
            },
          ],
        };
      } else {
        return {
          content: [
            {
              type: 'text' as const,
              text: 'Warning: Result could not be reported to Omniscribe (check configuration)',
            },
          ],
        };
      }
    } catch (error) {
      this.logger.error('swarmReportResult error:', error);
      return {
        content: [{ type: 'text' as const, text: `Error reporting result: ${String(error)}` }],
        isError: true,
      };
    }
  }
}
