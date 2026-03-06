import { buildInstructions, createServer } from './server';

jest.mock('./utils/index', () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
    log: jest.fn(),
  },
}));

describe('createServer', () => {
  const envKeys = [
    'OMNISCRIBE_SESSION_ID',
    'OMNISCRIBE_PROJECT_HASH',
    'OMNISCRIBE_STATUS_URL',
    'OMNISCRIBE_INSTANCE_ID',
    'OMNISCRIBE_SWARM_ID',
    'OMNISCRIBE_SWARM_ROLE',
  ] as const;

  afterEach(() => {
    for (const key of envKeys) {
      delete process.env[key];
    }
  });

  it('should return a server and config', () => {
    const result = createServer();

    expect(result.server).toBeDefined();
    expect(result.config).toBeDefined();
  });

  it('should load environment config', () => {
    process.env.OMNISCRIBE_SESSION_ID = 'test-session';

    const { config } = createServer();

    expect(config.sessionId).toBe('test-session');
  });

  it('should create an McpServer instance', () => {
    const { server } = createServer();

    expect(typeof server.connect).toBe('function');
  });

  it('omits swarm instructions for non-swarm sessions', () => {
    const instructions = buildInstructions({
      sessionId: 'test-session',
      projectHash: 'hash',
      statusUrl: 'http://127.0.0.1:3001/status',
      instanceId: 'instance',
      swarmId: undefined,
      swarmRole: undefined,
    });

    expect(instructions).not.toContain('## Swarm Coordination Tools');
    expect(instructions).not.toContain('omniscribe_swarm_spawn_teammate');
  });

  it('includes swarm instructions for swarm sessions', () => {
    const instructions = buildInstructions({
      sessionId: 'test-session',
      projectHash: 'hash',
      statusUrl: 'http://127.0.0.1:3001/status',
      instanceId: 'instance',
      swarmId: 'swarm-1',
      swarmRole: 'builder',
    });

    expect(instructions).toContain('## Swarm Coordination Tools');
    expect(instructions).toContain('omniscribe_swarm_spawn_teammate');
  });
});
