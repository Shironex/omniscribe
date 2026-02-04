/**
 * Logger utility for MCP server
 * Uses stderr for logging (stdout is reserved for MCP protocol)
 */

import { createLogger } from '@omniscribe/shared';

// Create logger with stderr mode for MCP protocol compliance
export const logger = createLogger('omniscribe-mcp', { useStderr: true });
