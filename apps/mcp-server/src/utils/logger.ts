/**
 * Logger utility for MCP server
 * Uses stderr for logging (stdout is reserved for MCP protocol)
 */

export interface Logger {
  info(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  debug(message: string, ...args: unknown[]): void;
}

const PREFIX = '[omniscribe-mcp]';

export const logger: Logger = {
  info(message: string, ...args: unknown[]): void {
    console.error(`${PREFIX} ${message}`, ...args);
  },
  error(message: string, ...args: unknown[]): void {
    console.error(`${PREFIX} ERROR: ${message}`, ...args);
  },
  warn(message: string, ...args: unknown[]): void {
    console.error(`${PREFIX} WARN: ${message}`, ...args);
  },
  debug(message: string, ...args: unknown[]): void {
    if (process.env.DEBUG) {
      console.error(`${PREFIX} DEBUG: ${message}`, ...args);
    }
  },
};
