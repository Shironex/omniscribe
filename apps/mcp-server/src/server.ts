/**
 * MCP Server setup and initialization
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadEnvironmentConfig, isConfigured } from './config/index.js';
import { createHttpClient } from './http/index.js';
import { registerTools } from './tools/index.js';
import { logger } from './utils/index.js';

declare const __VERSION__: string;

/**
 * Create and configure the MCP server
 */
export function createServer(): {
  server: McpServer;
  config: ReturnType<typeof loadEnvironmentConfig>;
} {
  const config = loadEnvironmentConfig();
  const httpClient = createHttpClient(config, logger);

  const server = new McpServer({
    name: 'omniscribe',
    version: __VERSION__,
  });

  // Register all tools
  registerTools(server, {
    httpClient,
    config,
    logger,
  });

  return { server, config };
}

/**
 * Start the MCP server
 */
export async function startServer(): Promise<void> {
  logger.info(`Starting Omniscribe MCP Server v${__VERSION__}`);

  const { server, config } = createServer();

  logger.info(`Session ID: ${config.sessionId || 'not set'}`);
  logger.info(`Status URL: ${config.statusUrl || 'not set'}`);
  logger.info(`Instance ID: ${config.instanceId || 'not set'}`);

  // Connect to stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  logger.info('Server connected and ready');

  // Report initial idle status if configured
  if (isConfigured(config)) {
    const httpClient = createHttpClient(config, logger);
    httpClient.reportStatus('idle').catch((err: unknown) => {
      logger.error('Failed to report initial status:', err);
    });
  }
}
