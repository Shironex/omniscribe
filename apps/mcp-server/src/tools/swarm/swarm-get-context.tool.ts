/**
 * Swarm Get Context Tool
 * Gets the full swarm state including agents, tasks, and messages
 */

import type { Tool, ToolDependencies, ToolMetadata, ToolResponse } from '../types.js';
import type { OmniscribeHttpClient } from '../../http/index.js';
import type { EnvironmentConfig } from '../../config/index.js';
import type { Logger } from '../../utils/index.js';

type SwarmGetContextInput = Record<string, never>;

export class SwarmGetContextTool implements Tool<SwarmGetContextInput> {
  readonly metadata: ToolMetadata = {
    name: 'omniscribe_swarm_get_context',
    title: 'Get Swarm Context',
    description:
      'Get the current state of the swarm including all agents, tasks, and recent messages. Use this to understand the overall progress.',
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

  async execute(_input: SwarmGetContextInput): Promise<ToolResponse> {
    if (!this.config.swarmId) {
      return {
        content: [{ type: 'text' as const, text: 'Error: Not part of a swarm' }],
        isError: true,
      };
    }

    this.logger.debug('omniscribe_swarm_get_context: fetching swarm state');

    try {
      const context = await this.httpClient.swarmGetContext();

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(context, null, 2),
          },
        ],
      };
    } catch (error) {
      this.logger.error('swarmGetContext error:', error);
      return {
        content: [{ type: 'text' as const, text: `Error getting swarm context: ${String(error)}` }],
        isError: true,
      };
    }
  }
}
