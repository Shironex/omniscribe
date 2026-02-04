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

import { startServer } from './server.js';

startServer().catch((error) => {
  console.error('[omniscribe-mcp] Fatal error:', error);
  process.exit(1);
});
