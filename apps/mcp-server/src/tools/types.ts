/**
 * Tool interface and types for MCP server tools
 */

import type { ZodRawShape } from 'zod';
import type { OmniscribeHttpClient } from '../http/index.js';
import type { EnvironmentConfig } from '../config/index.js';
import type { Logger } from '../utils/index.js';

/**
 * Tool response content item
 */
export interface ToolResponseContent {
  type: 'text';
  text: string;
}

/**
 * Tool response returned by execute()
 * Includes index signature for MCP SDK compatibility
 */
export interface ToolResponse {
  [key: string]: unknown;
  content: ToolResponseContent[];
  isError?: boolean;
}

/**
 * Tool metadata for registration
 */
export interface ToolMetadata {
  /** Unique tool name (used in MCP protocol) */
  name: string;
  /** Human-readable title */
  title: string;
  /** Tool description for the AI */
  description: string;
}

/**
 * Dependencies injected into tools
 */
export interface ToolDependencies {
  httpClient: OmniscribeHttpClient;
  config: EnvironmentConfig;
  logger: Logger;
}

/**
 * Base interface for all MCP tools
 */
export interface Tool<TInput = unknown> {
  /** Tool metadata for registration */
  readonly metadata: ToolMetadata;
  /** Zod schema for input validation */
  readonly inputSchema: ZodRawShape;
  /** Execute the tool with validated input */
  execute(input: TInput): Promise<ToolResponse>;
}

/**
 * Constructor type for tools
 */
export type ToolConstructor = new (deps: ToolDependencies) => Tool;
