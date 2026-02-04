/**
 * MCP server transport type
 */
export type McpTransportType = 'stdio' | 'sse' | 'websocket';

/**
 * MCP server status
 */
export type McpServerStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'error';

/**
 * MCP server configuration
 */
export interface McpServerConfig {
  /** Unique server identifier */
  id: string;

  /** Display name */
  name: string;

  /** Server description */
  description?: string;

  /** Transport type */
  transport: McpTransportType;

  /** Server command (for stdio transport) */
  command?: string;

  /** Command arguments */
  args?: string[];

  /** Environment variables */
  env?: Record<string, string>;

  /** Server URL (for SSE/WebSocket transport) */
  url?: string;

  /** Whether server is enabled */
  enabled: boolean;

  /** Auto-connect on startup */
  autoConnect: boolean;

  /** Connection timeout in milliseconds */
  timeout?: number;

  /** Retry configuration */
  retry?: {
    maxAttempts: number;
    delayMs: number;
    backoffMultiplier: number;
  };
}

/**
 * MCP tool definition
 */
export interface McpTool {
  /** Tool name */
  name: string;

  /** Tool description */
  description: string;

  /** Input schema (JSON Schema) */
  inputSchema: Record<string, unknown>;

  /** Server ID this tool belongs to */
  serverId: string;
}

/**
 * MCP resource definition
 */
export interface McpResource {
  /** Resource URI */
  uri: string;

  /** Resource name */
  name: string;

  /** Resource description */
  description?: string;

  /** MIME type */
  mimeType?: string;

  /** Server ID this resource belongs to */
  serverId: string;
}

/**
 * MCP prompt definition
 */
export interface McpPrompt {
  /** Prompt name */
  name: string;

  /** Prompt description */
  description?: string;

  /** Prompt arguments */
  arguments?: McpPromptArgument[];

  /** Server ID this prompt belongs to */
  serverId: string;
}

/**
 * MCP prompt argument
 */
export interface McpPromptArgument {
  /** Argument name */
  name: string;

  /** Argument description */
  description?: string;

  /** Whether argument is required */
  required?: boolean;
}

/**
 * MCP server state
 */
export interface McpServerState {
  /** Server configuration */
  config: McpServerConfig;

  /** Current status */
  status: McpServerStatus;

  /** Error message if status is 'error' */
  errorMessage?: string;

  /** Available tools */
  tools: McpTool[];

  /** Available resources */
  resources: McpResource[];

  /** Available prompts */
  prompts: McpPrompt[];

  /** Last connected timestamp */
  lastConnectedAt?: Date;

  /** Protocol version */
  protocolVersion?: string;

  /** Server info */
  serverInfo?: {
    name: string;
    version: string;
  };
}

/**
 * MCP tool call request
 */
export interface McpToolCallRequest {
  /** Tool name */
  name: string;

  /** Tool arguments */
  arguments: Record<string, unknown>;

  /** Server ID */
  serverId: string;
}

/**
 * MCP tool call result
 */
export interface McpToolCallResult {
  /** Whether call succeeded */
  success: boolean;

  /** Result content */
  content?: unknown;

  /** Error message if failed */
  error?: string;

  /** Execution time in milliseconds */
  executionTimeMs: number;
}

/**
 * MCP resource read request
 */
export interface McpResourceReadRequest {
  /** Resource URI */
  uri: string;

  /** Server ID */
  serverId: string;
}

/**
 * MCP resource read result
 */
export interface McpResourceReadResult {
  /** Resource URI */
  uri: string;

  /** MIME type */
  mimeType?: string;

  /** Resource content (text or base64) */
  content: string;

  /** Whether content is base64 encoded */
  isBase64?: boolean;
}

/**
 * Session status states for MCP status reporting
 */
export type SessionStatusState =
  | 'idle'
  | 'working'
  | 'planning'
  | 'needs_input'
  | 'finished'
  | 'error';

/**
 * Status payload received from MCP server via HTTP POST
 */
export interface StatusPayload {
  /** Session identifier */
  sessionId: string;

  /** Omniscribe instance ID for validation */
  instanceId: string;

  /** Current agent state */
  state: SessionStatusState;

  /** Human-readable status message (optional - preserves existing if not provided) */
  message?: string;

  /** Question or prompt for user when state is "needs_input" */
  needsInputPrompt?: string;

  /** ISO timestamp of status update */
  timestamp: string;
}
