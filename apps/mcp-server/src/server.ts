/**
 * MCP Server setup and initialization
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadEnvironmentConfig, isConfigured } from './config/index.js';
import { createHttpClient } from './http/index.js';
import { registerTools } from './tools/index.js';
import { logger } from './utils/index.js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// __VERSION__ is injected by esbuild in production builds.
// In dev (tsc), it's not defined, so we fall back to package.json.
declare const __VERSION__: string | undefined;

function getVersion(): string {
  if (typeof __VERSION__ !== 'undefined') return __VERSION__;
  try {
    // In dev: dist/server.js is one level below package.json.
    // process.argv[1] is the entry script (dist/index.js).
    const distDir = resolve(process.argv[1], '..');
    const pkg = JSON.parse(readFileSync(resolve(distDir, '..', 'package.json'), 'utf-8'));
    return pkg.version ?? '0.0.0-dev';
  } catch (error) {
    logger.warn('Failed to read version from package.json:', error);
    return '0.0.0-dev';
  }
}

const VERSION = getVersion();

/**
 * Create and configure the MCP server
 */
export function createServer(): {
  server: McpServer;
  config: ReturnType<typeof loadEnvironmentConfig>;
} {
  const config = loadEnvironmentConfig();
  const httpClient = createHttpClient(config, logger);

  const server = new McpServer(
    {
      name: 'omniscribe',
      version: VERSION,
    },
    {
      instructions: [
        'Omniscribe is the desktop app hosting your terminal session.',
        '',
        'You MUST use these tools proactively throughout your work:',
        '',
        '1. **omniscribe_status** — Call whenever your state changes:',
        '   - "working" when you start processing a request',
        '   - "needs_input" when you need user clarification (include a prompt)',
        '   - "finished" when you complete a task',
        '   - "error" if something goes wrong',
        '',
        '2. **omniscribe_tasks** — Call whenever your task list changes:',
        '   - When you create a plan with multiple steps, report all tasks immediately',
        '   - Update the full task list as you start, complete, or modify tasks',
        '   - Always send the complete current snapshot (it replaces the previous list)',
        '   - Each task needs: id (unique string), subject (brief title), status (pending/in_progress/completed)',
        '',
        'These tools keep the Omniscribe UI in sync with your progress.',
        'Call them frequently — at minimum at the start and end of every user request.',
      ].join('\n'),
    }
  );

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
  logger.info(`Starting Omniscribe MCP Server v${VERSION}`);

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
