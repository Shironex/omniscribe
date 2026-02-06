/**
 * Tool registry for MCP server
 * Registers all available tools with the MCP server
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolConstructor, ToolDependencies } from './types.js';
import { OmniscribeStatusTool } from './status/index.js';

/**
 * All available tool constructors
 * Add new tools here to register them with the server
 */
const TOOL_CONSTRUCTORS: ToolConstructor[] = [OmniscribeStatusTool];

/**
 * Register all tools with the MCP server
 */
export function registerTools(server: McpServer, deps: ToolDependencies): void {
  for (const ToolClass of TOOL_CONSTRUCTORS) {
    const tool = new ToolClass(deps);

    server.registerTool(
      tool.metadata.name,
      {
        title: tool.metadata.title,
        description: tool.metadata.description,
        inputSchema: tool.inputSchema,
      },
      async input => tool.execute(input)
    );

    deps.logger.debug(`Registered tool: ${tool.metadata.name}`);
  }

  deps.logger.info(
    `Registered ${TOOL_CONSTRUCTORS.length} ${TOOL_CONSTRUCTORS.length === 1 ? 'tool' : 'tools'}`
  );
}

// Re-export types
export type {
  Tool,
  ToolConstructor,
  ToolDependencies,
  ToolMetadata,
  ToolResponse,
} from './types.js';
