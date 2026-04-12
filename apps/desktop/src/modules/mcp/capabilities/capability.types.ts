/**
 * Types for the MCP capability registry.
 *
 * A "capability" is a self-contained MCP server entry that Omniscribe can
 * inject into a session's `.mcp.json`. The registry pattern lets us add
 * new internal MCP servers (omniscribe status, playwright, etc.) without
 * touching the writer service.
 */

/**
 * Server entry format for written `.mcp.json` config.
 * Note: Claude Code expects "type" not "transport".
 */
export interface McpWrittenServerEntry {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  type: string;
}

/**
 * Context passed to a capability when building its config entry.
 */
export interface CapabilityBuildContext {
  sessionId: string;
  workingDir: string;
  projectPath: string;
  projectHash: string;
  statusUrl: string | null;
  instanceId: string | null;
}

/**
 * A single MCP capability that can be enabled per-project.
 */
export interface McpCapability {
  /** Unique identifier — used as the key under `mcpServers` in `.mcp.json`. */
  id: string;
  /** Human-readable label for UI. */
  label: string;
  /** Short description for UI. */
  description: string;
  /** Whether this capability is enabled by default for new projects. */
  defaultEnabled?: boolean;
  /**
   * If true, this capability only works in dev/local environments. Surfaces
   * the "Dev only" badge in Settings. Propagated to the descriptor sent to
   * the UI.
   */
  requiresDev?: boolean;
  /**
   * Optional preflight check (e.g. binary present, port available).
   * If it returns `{ ok: false }`, the capability is skipped for this write.
   */
  preflight?(ctx: CapabilityBuildContext): Promise<{ ok: boolean; reason?: string }>;
  /**
   * Build the `.mcp.json` server entry for this capability.
   * Return `null` to skip insertion (e.g. binary not found).
   */
  buildConfig(ctx: CapabilityBuildContext): Promise<McpWrittenServerEntry | null>;
}
