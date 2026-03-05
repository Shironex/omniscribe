/**
 * Swarm Release Files Tool
 * Releases file editing locks after completing work
 */

import { z } from 'zod';
import type { Tool, ToolDependencies, ToolMetadata, ToolResponse } from '../types.js';
import type { OmniscribeHttpClient } from '../../http/index.js';
import type { EnvironmentConfig } from '../../config/index.js';
import type { Logger } from '../../utils/index.js';

interface SwarmReleaseFilesInput {
  files?: string[];
}

export class SwarmReleaseFilesTool implements Tool<SwarmReleaseFilesInput> {
  readonly metadata: ToolMetadata = {
    name: 'omniscribe_swarm_release_files',
    title: 'Release File Locks',
    description:
      'Release file editing locks. Call after completing work on files. If no files specified, releases all your locks.',
  };

  readonly inputSchema = {
    files: z
      .array(z.string())
      .optional()
      .describe('File paths to release. If omitted, releases all your file locks.'),
  };

  private readonly httpClient: OmniscribeHttpClient;
  private readonly config: EnvironmentConfig;
  private readonly logger: Logger;

  constructor(deps: ToolDependencies) {
    this.httpClient = deps.httpClient;
    this.config = deps.config;
    this.logger = deps.logger;
  }

  async execute(input: SwarmReleaseFilesInput): Promise<ToolResponse> {
    if (!this.config.swarmId) {
      return {
        content: [{ type: 'text' as const, text: 'Error: Not part of a swarm' }],
        isError: true,
      };
    }

    const { files } = input;
    this.logger.debug('omniscribe_swarm_release_files:', files ? `${files.length} file(s)` : 'all');

    try {
      const success = await this.httpClient.swarmReleaseFiles(files);

      if (success) {
        return {
          content: [
            {
              type: 'text' as const,
              text: files ? `Released locks on ${files.length} file(s)` : 'Released all file locks',
            },
          ],
        };
      } else {
        return {
          content: [
            {
              type: 'text' as const,
              text: 'Warning: File locks could not be released (check configuration)',
            },
          ],
        };
      }
    } catch (error) {
      this.logger.error('swarmReleaseFiles error:', error);
      return {
        content: [{ type: 'text' as const, text: `Error releasing files: ${String(error)}` }],
        isError: true,
      };
    }
  }
}
