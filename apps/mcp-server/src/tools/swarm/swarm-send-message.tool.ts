/**
 * Swarm Send Message Tool
 * Sends a message to another agent or broadcasts to all agents
 */

import { z } from 'zod';
import type { Tool, ToolDependencies, ToolMetadata, ToolResponse } from '../types.js';
import type { OmniscribeHttpClient } from '../../http/index.js';
import type { EnvironmentConfig } from '../../config/index.js';
import type { Logger } from '../../utils/index.js';

interface SwarmSendMessageInput {
  toAgentId: string;
  content: string;
  type: 'task_assignment' | 'result' | 'review' | 'info' | 'request';
}

export class SwarmSendMessageTool implements Tool<SwarmSendMessageInput> {
  readonly metadata: ToolMetadata = {
    name: 'omniscribe_swarm_send_message',
    title: 'Send Message to Agent',
    description: 'Send a message to another agent or broadcast to all agents in the swarm.',
  };

  readonly inputSchema = {
    toAgentId: z.string().describe('Target agent ID, or "all" to broadcast to all agents'),
    content: z.string().describe('Message content'),
    type: z
      .enum(['task_assignment', 'result', 'review', 'info', 'request'])
      .describe('Message type: task_assignment, result, review, info, or request'),
  };

  private readonly httpClient: OmniscribeHttpClient;
  private readonly config: EnvironmentConfig;
  private readonly logger: Logger;

  constructor(deps: ToolDependencies) {
    this.httpClient = deps.httpClient;
    this.config = deps.config;
    this.logger = deps.logger;
  }

  async execute(input: SwarmSendMessageInput): Promise<ToolResponse> {
    if (!this.config.swarmId) {
      return {
        content: [{ type: 'text' as const, text: 'Error: Not part of a swarm' }],
        isError: true,
      };
    }

    const { toAgentId, content, type } = input;
    this.logger.debug('omniscribe_swarm_send_message:', type, 'to', toAgentId);

    try {
      const success = await this.httpClient.swarmSendMessage(toAgentId, content, type);

      if (success) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Message sent to ${toAgentId === 'all' ? 'all agents' : toAgentId}`,
            },
          ],
        };
      } else {
        return {
          content: [
            {
              type: 'text' as const,
              text: 'Warning: Message could not be sent (check configuration)',
            },
          ],
        };
      }
    } catch (error) {
      this.logger.error('swarmSendMessage error:', error);
      return {
        content: [{ type: 'text' as const, text: `Error sending message: ${String(error)}` }],
        isError: true,
      };
    }
  }
}
