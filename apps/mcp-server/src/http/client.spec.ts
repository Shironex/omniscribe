import { createHttpClient } from './client';
import { createMockLogger, createMockConfig } from '../../test/helpers';

describe('createHttpClient', () => {
  let mockLogger: ReturnType<typeof createMockLogger>;

  beforeEach(() => {
    mockLogger = createMockLogger();
  });

  describe('reportStatus - not configured', () => {
    it('should return false when statusUrl is missing', async () => {
      const config = createMockConfig({ statusUrl: undefined });
      const client = createHttpClient(config, mockLogger);

      const result = await client.reportStatus('working', 'test');

      expect(result).toBe(false);
      expect(mockLogger.error).toHaveBeenCalledWith('Status reporting not configured');
    });

    it('should return false when sessionId is missing', async () => {
      const config = createMockConfig({ sessionId: undefined });
      const client = createHttpClient(config, mockLogger);

      const result = await client.reportStatus('working', 'test');

      expect(result).toBe(false);
    });

    it('should return false when instanceId is missing', async () => {
      const config = createMockConfig({ instanceId: undefined });
      const client = createHttpClient(config, mockLogger);

      const result = await client.reportStatus('working', 'test');

      expect(result).toBe(false);
    });

    it('should not call fetch when not configured', async () => {
      const fetchSpy = jest.spyOn(global, 'fetch');
      const config = createMockConfig({ statusUrl: undefined });
      const client = createHttpClient(config, mockLogger);

      await client.reportStatus('working', 'test');

      expect(fetchSpy).not.toHaveBeenCalled();
      fetchSpy.mockRestore();
    });
  });

  describe('reportStatus - configured', () => {
    let fetchSpy: jest.SpiedFunction<typeof global.fetch>;

    beforeEach(() => {
      fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
      } as Response);
    });

    afterEach(() => {
      fetchSpy.mockRestore();
    });

    it('should call fetch with the correct URL and payload', async () => {
      const config = createMockConfig();
      const client = createHttpClient(config, mockLogger);

      await client.reportStatus('working', 'Building project');

      expect(fetchSpy).toHaveBeenCalledWith(
        config.statusUrl,
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
      );

      const body = JSON.parse(fetchSpy.mock.calls[0][1]!.body as string);
      expect(body).toMatchObject({
        sessionId: 'test-session',
        instanceId: 'test-instance',
        state: 'working',
        message: 'Building project',
      });
      expect(body.timestamp).toBeDefined();
    });

    it('should return true when response is ok', async () => {
      const config = createMockConfig();
      const client = createHttpClient(config, mockLogger);

      const result = await client.reportStatus('idle');

      expect(result).toBe(true);
    });

    it('should return false when response is not ok', async () => {
      fetchSpy.mockResolvedValue({ ok: false, status: 500 } as Response);
      const config = createMockConfig();
      const client = createHttpClient(config, mockLogger);

      const result = await client.reportStatus('working', 'test');

      expect(result).toBe(false);
    });

    it('should return false when fetch throws', async () => {
      fetchSpy.mockRejectedValue(new Error('Network error'));
      const config = createMockConfig();
      const client = createHttpClient(config, mockLogger);

      const result = await client.reportStatus('working', 'test');

      expect(result).toBe(false);
      expect(mockLogger.error).toHaveBeenCalledWith('Status report error:', expect.any(Error));
    });

    it('should include needsInputPrompt in payload when provided', async () => {
      const config = createMockConfig();
      const client = createHttpClient(config, mockLogger);

      await client.reportStatus('needs_input', 'Waiting', 'What file?');

      const body = JSON.parse(fetchSpy.mock.calls[0][1]!.body as string);
      expect(body.needsInputPrompt).toBe('What file?');
    });
  });

  describe('swarm HTTP helpers', () => {
    let fetchSpy: jest.SpiedFunction<typeof global.fetch>;

    beforeEach(() => {
      fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ agent: { id: 'agent-1' }, task: { id: 'task-1' } }),
      } as Response);
    });

    afterEach(() => {
      fetchSpy.mockRestore();
    });

    it('extracts agentId from the desktop swarm spawn response shape', async () => {
      const config = createMockConfig({ swarmId: 'swarm-1', swarmRole: 'lead' });
      const client = createHttpClient(config, mockLogger);

      const result = await client.swarmSpawnTeammate('builder', 'Build it');

      expect(result).toEqual({ agentId: 'agent-1' });
      expect(fetchSpy.mock.calls[0]?.[1]).toEqual(
        expect.objectContaining({
          method: 'POST',
        })
      );
    });

    it('extracts taskId from the desktop swarm create-task response shape', async () => {
      const config = createMockConfig({ swarmId: 'swarm-1', swarmRole: 'lead' });
      const client = createHttpClient(config, mockLogger);

      const result = await client.swarmCreateTask('Build it', 'Implement feature', 'builder');

      expect(result).toEqual({ taskId: 'task-1' });
    });

    it('uses a 20 second timeout when spawning teammates', async () => {
      const timeoutSpy = jest.spyOn(AbortSignal, 'timeout');
      const config = createMockConfig({ swarmId: 'swarm-1', swarmRole: 'lead' });
      const client = createHttpClient(config, mockLogger);

      await client.swarmSpawnTeammate('builder');

      expect(timeoutSpy).toHaveBeenCalledWith(20000);
      timeoutSpy.mockRestore();
    });
  });
});
