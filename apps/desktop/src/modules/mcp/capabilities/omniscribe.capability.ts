import { MCP_SERVER_NAME } from '@omniscribe/shared';
import { McpInternalService } from '../services/mcp-internal.service';
import type {
  CapabilityBuildContext,
  McpCapability,
  McpWrittenServerEntry,
} from './capability.types';

/**
 * Factory for the built-in Omniscribe status-reporting capability.
 *
 * Reproduces exactly the previously hardcoded `omniscribe` entry written by
 * `McpWriterService` so existing `.mcp.json` output is byte-identical.
 */
export function createOmniscribeCapability(internal: McpInternalService): McpCapability {
  return {
    id: MCP_SERVER_NAME,
    label: 'Omniscribe Status',
    description:
      'Reports session status (working / needs input / finished) back to the Omniscribe UI.',
    defaultEnabled: true,
    async buildConfig(ctx: CapabilityBuildContext): Promise<McpWrittenServerEntry | null> {
      const internalPath = internal.getPath();
      if (!internalPath) {
        return null;
      }

      const env: Record<string, string> = {
        OMNISCRIBE_SESSION_ID: ctx.sessionId,
        OMNISCRIBE_PROJECT_HASH: ctx.projectHash,
      };
      if (ctx.statusUrl) {
        env.OMNISCRIBE_STATUS_URL = ctx.statusUrl;
      }
      if (ctx.instanceId) {
        env.OMNISCRIBE_INSTANCE_ID = ctx.instanceId;
      }

      return {
        type: 'stdio',
        command: 'node',
        args: [internalPath],
        env,
      };
    },
  };
}
