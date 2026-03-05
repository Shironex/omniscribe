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
  /** Swarm ID if this session is part of a swarm */
  swarmId: string | undefined;
  /** Swarm role assigned to this session */
  swarmRole: string | undefined;
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
    swarmId: process.env.OMNISCRIBE_SWARM_ID,
    swarmRole: process.env.OMNISCRIBE_SWARM_ROLE,
  };
}

/**
 * Check if the environment is properly configured for status reporting
 */
export function isConfigured(config: EnvironmentConfig): boolean {
  return !!(config.sessionId && config.statusUrl && config.instanceId);
}
