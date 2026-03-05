/**
 * Swarm Get Messages Tool
 * Gets unread messages addressed to this agent or broadcast to all
 */

import type { Tool, ToolDependencies, ToolMetadata, ToolResponse } from '../types.js';
import type { OmniscribeHttpClient } from '../../http/index.js';
import type { EnvironmentConfig } from '../../config/index.js';
import type { Logger } from '../../utils/index.js';

type SwarmGetMessagesInput = Record<string, never>;

export class SwarmGetMessagesTool implements Tool<SwarmGetMessagesInput> {
  readonly metadata: ToolMetadata = {
    name: 'omniscribe_swarm_get_messages',
    title: 'Get Unread Messages',
    description: 'Get unread messages addressed to you or broadcast to all agents.',
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

  async execute(_input: SwarmGetMessagesInput): Promise<ToolResponse> {
    if (!this.config.swarmId) {
      return {
        content: [{ type: 'text' as const, text: 'Error: Not part of a swarm' }],
        isError: true,
      };
    }

    this.logger.debug('omniscribe_swarm_get_messages: fetching unread messages');

    try {
      const messages = await this.httpClient.swarmGetMessages();

      if (messages.length > 0) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(messages, null, 2),
            },
          ],
        };
      } else {
        return {
          content: [{ type: 'text' as const, text: 'No new messages' }],
        };
      }
    } catch (error) {
      this.logger.error('swarmGetMessages error:', error);
      return {
        content: [{ type: 'text' as const, text: `Error getting messages: ${String(error)}` }],
        isError: true,
      };
    }
  }
}
