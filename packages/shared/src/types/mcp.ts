/**
 * MCP server status
 */
export type McpServerStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

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
  transport: 'stdio' | 'sse' | 'websocket';

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
  arguments?: { name: string; description?: string; required?: boolean }[];

  /** Server ID this prompt belongs to */
  serverId: string;
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

/**
 * Task status states for MCP task reporting
 */
export type TaskStatus = 'pending' | 'in_progress' | 'completed';

/**
 * A single task item reported by the AI agent
 */
export interface TaskItem {
  /** Unique task identifier */
  id: string;

  /** Brief task subject/title */
  subject: string;

  /** Current task status */
  status: TaskStatus;
}

/**
 * Descriptor for an MCP capability surfaced in the Settings UI.
 * Combines registry metadata with the per-project enabled flag.
 */
export interface McpCapabilityDescriptor {
  id: string;
  label: string;
  description: string;
  enabled: boolean;
  /**
   * If true, this capability only makes sense in dev/local environments
   * (e.g. drives a dev server). UI may show a "Dev only" badge.
   */
  requiresDev?: boolean;
}

/**
 * Tasks payload received from MCP server via HTTP POST
 */
export interface TasksPayload {
  /** Session identifier */
  sessionId: string;

  /** Omniscribe instance ID for validation */
  instanceId: string;

  /** Current task list (complete snapshot) */
  tasks: TaskItem[];

  /** ISO timestamp of task update */
  timestamp: string;
}
