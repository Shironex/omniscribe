/**
 * Omniscribe Status Tool
 * Reports agent state back to Omniscribe UI
 */

import { z } from 'zod';
import type { Tool, ToolDependencies, ToolMetadata, ToolResponse } from '../types.js';
import type { OmniscribeHttpClient } from '../../http/index.js';
import type { SessionStatusState } from '@omniscribe/shared';

const STATUS_STATES = ['idle', 'working', 'planning', 'needs_input', 'finished', 'error'] as const;

interface OmniscribeStatusInput {
  state: SessionStatusState;
  message: string;
  needsInputPrompt?: string;
}

export class OmniscribeStatusTool implements Tool<OmniscribeStatusInput> {
  readonly metadata: ToolMetadata = {
    name: 'omniscribe_status',
    title: 'Report Status to Omniscribe',
    description:
      'Report the current agent state back to Omniscribe. Call this to update the status shown in the Omniscribe UI. Use "working" when actively processing, "needs_input" when waiting for user clarification, "finished" when the task is complete, and "error" if something went wrong.',
  };

  readonly inputSchema = {
    state: z
      .enum(STATUS_STATES)
      .describe(
        'Current agent state: idle (waiting), working (executing), planning (in plan mode), needs_input (waiting for user), finished (task complete), error (something went wrong)'
      ),
    message: z
      .string()
      .describe('Human-readable status message describing what the agent is doing'),
    needsInputPrompt: z
      .string()
      .optional()
      .describe('Question or prompt for the user when state is "needs_input"'),
  };

  private readonly httpClient: OmniscribeHttpClient;

  constructor(deps: ToolDependencies) {
    this.httpClient = deps.httpClient;
  }

  async execute(input: OmniscribeStatusInput): Promise<ToolResponse> {
    const { state, message, needsInputPrompt } = input;

    // Validate needsInputPrompt requirement
    if (state === 'needs_input' && !needsInputPrompt) {
      return {
        content: [
          {
            type: 'text' as const,
            text: 'Error: needsInputPrompt is required when state is "needs_input"',
          },
        ],
        isError: true,
      };
    }

    // Report status via HTTP
    const success = await this.httpClient.reportStatus(state, message, needsInputPrompt);

    if (success) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `Status updated: ${state} - ${message}`,
          },
        ],
      };
    } else {
      return {
        content: [
          {
            type: 'text' as const,
            text: 'Warning: Status could not be reported to Omniscribe (check configuration)',
          },
        ],
      };
    }
  }
}
