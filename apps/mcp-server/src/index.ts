#!/usr/bin/env node

/**
 * Omniscribe MCP Server
 *
 * This MCP server is spawned by Claude Code when it reads .mcp.json.
 * It provides tools for AI agents to report their state back to Omniscribe.
 *
 * Transport: stdio (spawned by Claude CLI)
 * Status files: /tmp/omniscribe/agents/{project-hash}/agent-{session-id}.json
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

// ============================================================================
// Types
// ============================================================================

/**
 * Agent status values
 */
type AgentStatus = 'idle' | 'working' | 'needs_input' | 'finished' | 'error';

/**
 * Status file schema written to /tmp/omniscribe/agents/{hash}/agent-{id}.json
 */
interface AgentState {
  agentId: string;
  state: AgentStatus;
  message: string;
  needsInputPrompt?: string;
  timestamp: string;
}

// ============================================================================
// Environment Configuration
// ============================================================================

const SESSION_ID = process.env.OMNISCRIBE_SESSION_ID;
const PROJECT_HASH = process.env.OMNISCRIBE_PROJECT_HASH;
const PORT_RANGE_START = process.env.OMNISCRIBE_PORT_RANGE_START || '3000';
const PORT_RANGE_END = process.env.OMNISCRIBE_PORT_RANGE_END || '3099';

/**
 * Get the base directory for agent status files
 * Uses platform-appropriate temp directory
 */
function getBaseDir(): string {
  // Use platform temp directory
  const tmpDir = os.tmpdir();
  return path.join(tmpDir, 'omniscribe', 'agents');
}

/**
 * Get the status file path for the current session
 */
function getStatusFilePath(): string | null {
  if (!SESSION_ID || !PROJECT_HASH) {
    return null;
  }
  const baseDir = getBaseDir();
  return path.join(baseDir, PROJECT_HASH, `agent-${SESSION_ID}.json`);
}

/**
 * Ensure the status directory exists
 */
function ensureStatusDir(): boolean {
  if (!PROJECT_HASH) {
    return false;
  }

  const statusDir = path.join(getBaseDir(), PROJECT_HASH);
  try {
    fs.mkdirSync(statusDir, { recursive: true });
    return true;
  } catch (error) {
    console.error('[omniscribe-mcp] Failed to create status directory:', error);
    return false;
  }
}

/**
 * Write agent state to status file
 */
function writeStatus(state: AgentState): boolean {
  const filePath = getStatusFilePath();
  if (!filePath) {
    console.error('[omniscribe-mcp] Cannot write status: missing SESSION_ID or PROJECT_HASH');
    return false;
  }

  if (!ensureStatusDir()) {
    return false;
  }

  try {
    fs.writeFileSync(filePath, JSON.stringify(state, null, 2), 'utf-8');
    return true;
  } catch (error) {
    console.error('[omniscribe-mcp] Failed to write status file:', error);
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
  state: z.enum(['idle', 'working', 'needs_input', 'finished', 'error']).describe(
    'Current agent state: idle (waiting), working (processing), needs_input (waiting for user), finished (task complete), error (something went wrong)'
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

    // Check environment configuration
    if (!SESSION_ID || !PROJECT_HASH) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `Warning: Omniscribe environment not configured. Status not recorded. Missing: ${!SESSION_ID ? 'OMNISCRIBE_SESSION_ID' : ''} ${!PROJECT_HASH ? 'OMNISCRIBE_PROJECT_HASH' : ''}`.trim(),
          },
        ],
      };
    }

    // Build agent state
    const agentState: AgentState = {
      agentId: `agent-${SESSION_ID}`,
      state: state as AgentStatus,
      message,
      timestamp: new Date().toISOString(),
    };

    if (needsInputPrompt) {
      agentState.needsInputPrompt = needsInputPrompt;
    }

    // Write to status file
    const success = writeStatus(agentState);

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
            text: 'Failed to write status file',
          },
        ],
        isError: true,
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
    // MVP stub - actual implementation will spawn and manage processes
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
    // MVP stub
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
    // MVP stub
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
  // Log startup info (to stderr so it doesn't interfere with stdio transport)
  console.error('[omniscribe-mcp] Starting Omniscribe MCP Server v0.1.0');
  console.error(`[omniscribe-mcp] Session ID: ${SESSION_ID || 'not set'}`);
  console.error(`[omniscribe-mcp] Project Hash: ${PROJECT_HASH || 'not set'}`);
  console.error(`[omniscribe-mcp] Port Range: ${PORT_RANGE_START}-${PORT_RANGE_END}`);
  console.error(`[omniscribe-mcp] Status Dir: ${getBaseDir()}`);

  // Connect to stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error('[omniscribe-mcp] Server connected and ready');

  // Write initial idle status if configured
  if (SESSION_ID && PROJECT_HASH) {
    const initialState: AgentState = {
      agentId: `agent-${SESSION_ID}`,
      state: 'idle',
      message: 'Agent connected',
      timestamp: new Date().toISOString(),
    };
    writeStatus(initialState);
  }
}

main().catch((error) => {
  console.error('[omniscribe-mcp] Fatal error:', error);
  process.exit(1);
});
