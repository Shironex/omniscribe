/**
 * Swarm Spawn Teammate Tool
 * Requests a new teammate to join the swarm (Lead-only)
 */

import { z } from 'zod';
import type { Tool, ToolDependencies, ToolMetadata, ToolResponse } from '../types.js';
import type { OmniscribeHttpClient } from '../../http/index.js';
import type { EnvironmentConfig } from '../../config/index.js';
import type { Logger } from '../../utils/index.js';
import type { SwarmRole } from '@omniscribe/shared';

type SpawnableSwarmRole = Exclude<SwarmRole, 'lead'>;

interface SwarmSpawnTeammateInput {
  role: SpawnableSwarmRole;
  taskDescription?: string;
}

export class SwarmSpawnTeammateTool implements Tool<SwarmSpawnTeammateInput> {
  readonly metadata: ToolMetadata = {
    name: 'omniscribe_swarm_spawn_teammate',
    title: 'Spawn Teammate',
    description: 'Request a new teammate to join the swarm. Only available to the Lead agent.',
  };

  readonly inputSchema = {
    role: z
      .enum(['builder', 'reviewer', 'architect', 'tester', 'security'])
      .describe('Role for the new teammate: builder, reviewer, architect, tester, or security'),
    taskDescription: z
      .string()
      .optional()
      .describe('Optional initial task description for the new teammate'),
  };

  private readonly httpClient: OmniscribeHttpClient;
  private readonly config: EnvironmentConfig;
  private readonly logger: Logger;

  constructor(deps: ToolDependencies) {
    this.httpClient = deps.httpClient;
    this.config = deps.config;
    this.logger = deps.logger;
  }

  async execute(input: SwarmSpawnTeammateInput): Promise<ToolResponse> {
    if (!this.config.swarmId) {
      return {
        content: [{ type: 'text' as const, text: 'Error: Not part of a swarm' }],
        isError: true,
      };
    }

    if (this.config.swarmRole !== 'lead') {
      return {
        content: [
          { type: 'text' as const, text: 'Error: Only the lead agent can spawn teammates' },
        ],
        isError: true,
      };
    }

    const { role, taskDescription } = input;
    this.logger.debug('omniscribe_swarm_spawn_teammate:', role);

    try {
      const result = await this.httpClient.swarmSpawnTeammate(role, taskDescription);

      return {
        content: [
          {
            type: 'text' as const,
            text: `Teammate spawned with agent ID: ${result.agentId}`,
          },
        ],
      };
    } catch (error) {
      this.logger.error('swarmSpawnTeammate error:', error);
      return {
        content: [{ type: 'text' as const, text: `Error spawning teammate: ${String(error)}` }],
        isError: true,
      };
    }
  }
}
