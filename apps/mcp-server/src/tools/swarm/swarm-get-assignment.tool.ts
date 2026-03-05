/**
 * Swarm Get Assignment Tool
 * Polls for the next available task assignment in the swarm
 */

import type { Tool, ToolDependencies, ToolMetadata, ToolResponse } from '../types.js';
import type { OmniscribeHttpClient } from '../../http/index.js';
import type { EnvironmentConfig } from '../../config/index.js';
import type { Logger } from '../../utils/index.js';

type SwarmGetAssignmentInput = Record<string, never>;

export class SwarmGetAssignmentTool implements Tool<SwarmGetAssignmentInput> {
  readonly metadata: ToolMetadata = {
    name: 'omniscribe_swarm_get_assignment',
    title: 'Get Swarm Task Assignment',
    description:
      'Poll for the next available task assignment in your swarm. Call this periodically to get work.',
  };

  readonly inputSchema = {};

  private readonly httpClient: OmniscribeHttpClient;
  private readonly config: EnvironmentConfig;
  private readonly logger: Logger;

  constructor(deps: ToolDependencies) {
    this.httpClient = deps.httpClient;
    this.config = deps.config;
    this.logger = deps.logger;
  }

  async execute(_input: SwarmGetAssignmentInput): Promise<ToolResponse> {
    if (!this.config.swarmId) {
      return {
        content: [{ type: 'text' as const, text: 'Error: Not part of a swarm' }],
        isError: true,
      };
    }

    this.logger.debug('omniscribe_swarm_get_assignment: polling for task');

    try {
      const task = await this.httpClient.swarmGetAssignment();

      if (task) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(task, null, 2),
            },
          ],
        };
      } else {
        return {
          content: [{ type: 'text' as const, text: 'No tasks available' }],
        };
      }
    } catch (error) {
      this.logger.error('swarmGetAssignment error:', error);
      return {
        content: [{ type: 'text' as const, text: `Error getting assignment: ${String(error)}` }],
        isError: true,
      };
    }
  }
}
