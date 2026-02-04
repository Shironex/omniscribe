/**
 * Environment configuration for the MCP server
 */

export interface EnvironmentConfig {
  /** Session identifier from Omniscribe */
  sessionId: string | undefined;
  /** Project hash for routing */
  projectHash: string | undefined;
  /** HTTP endpoint for status updates */
  statusUrl: string | undefined;
  /** Omniscribe instance ID for validation */
  instanceId: string | undefined;
}

/**
 * Load environment configuration from process.env
 */
export function loadEnvironmentConfig(): EnvironmentConfig {
  return {
    sessionId: process.env.OMNISCRIBE_SESSION_ID,
    projectHash: process.env.OMNISCRIBE_PROJECT_HASH,
    statusUrl: process.env.OMNISCRIBE_STATUS_URL,
    instanceId: process.env.OMNISCRIBE_INSTANCE_ID,
  };
}

/**
 * Check if the environment is properly configured for status reporting
 */
export function isConfigured(config: EnvironmentConfig): boolean {
  return !!(config.sessionId && config.statusUrl && config.instanceId);
}
