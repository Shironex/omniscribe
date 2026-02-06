import type { EnvironmentConfig } from '../../src/config/environment';

export function createMockConfig(overrides: Partial<EnvironmentConfig> = {}): EnvironmentConfig {
  return {
    sessionId: 'test-session',
    projectHash: 'test-hash',
    statusUrl: 'http://127.0.0.1:3001/mcp/status',
    instanceId: 'test-instance',
    ...overrides,
  };
}
