import { createServer } from './server';

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
});
