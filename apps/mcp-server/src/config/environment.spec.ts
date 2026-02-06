import { loadEnvironmentConfig, isConfigured, EnvironmentConfig } from './environment';

describe('loadEnvironmentConfig', () => {
  const envKeys = [
    'OMNISCRIBE_SESSION_ID',
    'OMNISCRIBE_PROJECT_HASH',
    'OMNISCRIBE_STATUS_URL',
    'OMNISCRIBE_INSTANCE_ID',
  ] as const;

  afterEach(() => {
    for (const key of envKeys) {
      delete process.env[key];
    }
  });

  it('should return undefined for all fields when env vars are not set', () => {
    const config = loadEnvironmentConfig();

    expect(config.sessionId).toBeUndefined();
    expect(config.projectHash).toBeUndefined();
    expect(config.statusUrl).toBeUndefined();
    expect(config.instanceId).toBeUndefined();
  });

  it('should return correct values when all env vars are set', () => {
    process.env.OMNISCRIBE_SESSION_ID = 'session-1';
    process.env.OMNISCRIBE_PROJECT_HASH = 'hash-abc';
    process.env.OMNISCRIBE_STATUS_URL = 'http://localhost:3001/status';
    process.env.OMNISCRIBE_INSTANCE_ID = 'instance-1';

    const config = loadEnvironmentConfig();

    expect(config).toEqual({
      sessionId: 'session-1',
      projectHash: 'hash-abc',
      statusUrl: 'http://localhost:3001/status',
      instanceId: 'instance-1',
    });
  });

  it('should handle partial env var configuration', () => {
    process.env.OMNISCRIBE_SESSION_ID = 'session-1';

    const config = loadEnvironmentConfig();

    expect(config.sessionId).toBe('session-1');
    expect(config.projectHash).toBeUndefined();
    expect(config.statusUrl).toBeUndefined();
    expect(config.instanceId).toBeUndefined();
  });
});

describe('isConfigured', () => {
  it('should return true when sessionId, statusUrl, and instanceId are all set', () => {
    const config: EnvironmentConfig = {
      sessionId: 'session-1',
      projectHash: undefined,
      statusUrl: 'http://localhost:3001/status',
      instanceId: 'instance-1',
    };

    expect(isConfigured(config)).toBe(true);
  });

  it('should return false when sessionId is missing', () => {
    const config: EnvironmentConfig = {
      sessionId: undefined,
      projectHash: 'hash',
      statusUrl: 'http://localhost:3001/status',
      instanceId: 'instance-1',
    };

    expect(isConfigured(config)).toBe(false);
  });

  it('should return false when statusUrl is missing', () => {
    const config: EnvironmentConfig = {
      sessionId: 'session-1',
      projectHash: 'hash',
      statusUrl: undefined,
      instanceId: 'instance-1',
    };

    expect(isConfigured(config)).toBe(false);
  });

  it('should return false when instanceId is missing', () => {
    const config: EnvironmentConfig = {
      sessionId: 'session-1',
      projectHash: 'hash',
      statusUrl: 'http://localhost:3001/status',
      instanceId: undefined,
    };

    expect(isConfigured(config)).toBe(false);
  });

  it('should return false when all fields are undefined', () => {
    const config: EnvironmentConfig = {
      sessionId: undefined,
      projectHash: undefined,
      statusUrl: undefined,
      instanceId: undefined,
    };

    expect(isConfigured(config)).toBe(false);
  });
});
