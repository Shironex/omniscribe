import { registerTools } from './index';
import { createMockHttpClient, createMockLogger, createMockConfig } from '../../test/helpers';
import type { ToolDependencies } from './types';

describe('registerTools', () => {
  let mockServer: { registerTool: jest.Mock };
  let deps: ToolDependencies;

  beforeEach(() => {
    mockServer = { registerTool: jest.fn() };
    deps = {
      httpClient: createMockHttpClient(),
      config: createMockConfig(),
      logger: createMockLogger(),
    };
  });

  it('should register the omniscribe_status tool', () => {
    registerTools(mockServer as never, deps);

    expect(mockServer.registerTool).toHaveBeenCalledWith(
      'omniscribe_status',
      expect.objectContaining({
        title: 'Report Status to Omniscribe',
        description: expect.any(String),
        inputSchema: expect.any(Object),
      }),
      expect.any(Function)
    );
  });

  it('should register exactly one tool', () => {
    registerTools(mockServer as never, deps);

    expect(mockServer.registerTool).toHaveBeenCalledTimes(1);
  });

  it('should log the number of registered tools', () => {
    registerTools(mockServer as never, deps);

    expect(deps.logger.info).toHaveBeenCalledWith('Registered 1 tools');
  });

  it('should register a callback that delegates to tool.execute', async () => {
    registerTools(mockServer as never, deps);

    const callback = mockServer.registerTool.mock.calls[0][2];
    const result = await callback({ state: 'working', message: 'test' });

    expect(result.content).toBeDefined();
    expect(result.content[0].type).toBe('text');
  });
});
