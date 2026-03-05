/**
 * Swarm Claim Files Tool
 * Claims exclusive editing rights on files to prevent conflicts
 */

import { z } from 'zod';
import type { Tool, ToolDependencies, ToolMetadata, ToolResponse } from '../types.js';
import type { OmniscribeHttpClient } from '../../http/index.js';
import type { EnvironmentConfig } from '../../config/index.js';
import type { Logger } from '../../utils/index.js';

interface SwarmClaimFilesInput {
  files: string[];
}

export class SwarmClaimFilesTool implements Tool<SwarmClaimFilesInput> {
  readonly metadata: ToolMetadata = {
    name: 'omniscribe_swarm_claim_files',
    title: 'Claim File Ownership',
    description:
      'Claim exclusive editing rights on files before modifying them. This prevents conflicts with other agents.',
  };

  readonly inputSchema = {
    files: z.array(z.string()).describe('List of file paths to claim exclusive editing rights on'),
  };

  private readonly httpClient: OmniscribeHttpClient;
  private readonly config: EnvironmentConfig;
  private readonly logger: Logger;

  constructor(deps: ToolDependencies) {
    this.httpClient = deps.httpClient;
    this.config = deps.config;
    this.logger = deps.logger;
  }

  async execute(input: SwarmClaimFilesInput): Promise<ToolResponse> {
    if (!this.config.swarmId) {
      return {
        content: [{ type: 'text' as const, text: 'Error: Not part of a swarm' }],
        isError: true,
      };
    }

    const { files } = input;
    this.logger.debug('omniscribe_swarm_claim_files:', files.length, 'file(s)');

    try {
      const result = await this.httpClient.swarmClaimFiles(files);

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                claimed: result.claimed,
                denied: result.denied,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      this.logger.error('swarmClaimFiles error:', error);
      return {
        content: [{ type: 'text' as const, text: `Error claiming files: ${String(error)}` }],
        isError: true,
      };
    }
  }
}
