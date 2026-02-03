#!/usr/bin/env node

/**
 * Omniscribe MCP Server
 *
 * This MCP server is spawned by Claude Code when it reads .mcp.json.
 * It provides tools for AI agents to report their state back to Omniscribe.
 *
 * Transport: stdio (spawned by Claude CLI)
 * Status: HTTP POST to Omniscribe desktop app
 *
 * Environment Variables:
 * - OMNISCRIBE_SESSION_ID: Session identifier
 * - OMNISCRIBE_PROJECT_HASH: Project hash for routing
 * - OMNISCRIBE_STATUS_URL: HTTP endpoint for status updates
 * - OMNISCRIBE_INSTANCE_ID: Omniscribe instance ID for validation
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

// ============================================================================
// Environment Configuration
// ============================================================================

const SESSION_ID = process.env.OMNISCRIBE_SESSION_ID;
const PROJECT_HASH = process.env.OMNISCRIBE_PROJECT_HASH;
const STATUS_URL = process.env.OMNISCRIBE_STATUS_URL;
const INSTANCE_ID = process.env.OMNISCRIBE_INSTANCE_ID;

// ============================================================================
// HTTP Status Reporter
// ============================================================================

interface StatusPayload {
  sessionId: string;
  instanceId: string;
  state: string;
  message: string;
  needsInputPrompt?: string;
  timestamp: string;
}

async function reportStatus(
  state: string,
  message: string,
  needsInputPrompt?: string
): Promise<boolean> {
  if (!STATUS_URL || !SESSION_ID || !INSTANCE_ID) {
    console.error('[omniscribe-mcp] Status reporting not configured');
    return false;
  }

  const payload: StatusPayload = {
    sessionId: SESSION_ID,
    instanceId: INSTANCE_ID,
    state,
    message,
    needsInputPrompt,
    timestamp: new Date().toISOString(),
  };

  console.error(
    `[omniscribe-mcp] Sending status to ${STATUS_URL}: state=${state}, message=${message}`
  );

  try {
    const response = await fetch(STATUS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    });

    console.error(`[omniscribe-mcp] Status response: ${response.status}`);
    return response.ok;
  } catch (error) {
    console.error('[omniscribe-mcp] Status report error:', error);
    return false;
  }
}

// ============================================================================
// MCP Server Setup
// ============================================================================

const server = new McpServer({
  name: 'omniscribe',
  version: '0.1.0',
});

// ============================================================================
// Tool: omniscribe_status
// ============================================================================

const OmniscribeStatusSchema = {
  state: z.enum(['idle', 'working', 'planning', 'needs_input', 'finished', 'error']).describe(
    'Current agent state: idle (waiting), working (executing), planning (in plan mode), needs_input (waiting for user), finished (task complete), error (something went wrong)'
  ),
  message: z.string().describe('Human-readable status message describing what the agent is doing'),
  needsInputPrompt: z.string().optional().describe(
    'Question or prompt for the user when state is "needs_input"'
  ),
};

server.registerTool(
  'omniscribe_status',
  {
    title: 'Report Status to Omniscribe',
    description:
      'Report the current agent state back to Omniscribe. Call this to update the status shown in the Omniscribe UI. Use "working" when actively processing, "needs_input" when waiting for user clarification, "finished" when the task is complete, and "error" if something went wrong.',
    inputSchema: OmniscribeStatusSchema,
  },
  async (input) => {
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
    const success = await reportStatus(state, message, needsInputPrompt);

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
);

// ============================================================================
// Tool: start_dev_server (MVP stub)
// ============================================================================

const StartDevServerSchema = {
  command: z.string().describe('Command to run (e.g., "npm", "pnpm", "yarn")'),
  args: z.array(z.string()).optional().describe('Command arguments (e.g., ["run", "dev"])'),
  cwd: z.string().optional().describe('Working directory for the command'),
  port: z.number().optional().describe('Port to use (will auto-select from range if not specified)'),
};

server.registerTool(
  'start_dev_server',
  {
    title: 'Start Development Server',
    description:
      'Start a development server in the background. The server will be managed by Omniscribe and can be stopped with stop_dev_server. Logs can be retrieved with get_server_logs. Note: This is a placeholder for future implementation.',
    inputSchema: StartDevServerSchema,
  },
  async (input) => {
    return {
      content: [
        {
          type: 'text' as const,
          text: `Development server management is not yet implemented. Command: ${input.command} ${(input.args || []).join(' ')}`,
        },
      ],
    };
  }
);

// ============================================================================
// Tool: stop_dev_server (MVP stub)
// ============================================================================

server.registerTool(
  'stop_dev_server',
  {
    title: 'Stop Development Server',
    description:
      "Stop the development server for this session. Note: This is a placeholder for future implementation.",
    inputSchema: {},
  },
  async () => {
    return {
      content: [
        {
          type: 'text' as const,
          text: 'Development server management is not yet implemented.',
        },
      ],
    };
  }
);

// ============================================================================
// Tool: get_server_logs (MVP stub)
// ============================================================================

const GetServerLogsSchema = {
  lines: z.number().optional().default(100).describe('Number of lines to retrieve (default: 100)'),
};

server.registerTool(
  'get_server_logs',
  {
    title: 'Get Server Logs',
    description:
      "Get stdout/stderr logs from the development server. Note: This is a placeholder for future implementation.",
    inputSchema: GetServerLogsSchema,
  },
  async (input) => {
    return {
      content: [
        {
          type: 'text' as const,
          text: `Development server management is not yet implemented. Requested ${input.lines || 100} lines.`,
        },
      ],
    };
  }
);

// ============================================================================
// Server Startup
// ============================================================================

async function main() {
  console.error('[omniscribe-mcp] Starting Omniscribe MCP Server v0.1.0');
  console.error(`[omniscribe-mcp] Session ID: ${SESSION_ID || 'not set'}`);
  console.error(`[omniscribe-mcp] Status URL: ${STATUS_URL || 'not set'}`);
  console.error(`[omniscribe-mcp] Instance ID: ${INSTANCE_ID || 'not set'}`);

  // Connect to stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error('[omniscribe-mcp] Server connected and ready');

  // Report initial idle status
  if (STATUS_URL && SESSION_ID && INSTANCE_ID) {
    reportStatus('idle', 'Agent connected').catch((err) => {
      console.error('[omniscribe-mcp] Failed to report initial status:', err);
    });
  }
}

main().catch((error) => {
  console.error('[omniscribe-mcp] Fatal error:', error);
  process.exit(1);
});
