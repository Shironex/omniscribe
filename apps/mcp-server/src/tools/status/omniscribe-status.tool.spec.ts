import { OmniscribeStatusTool } from './omniscribe-status.tool';
import { createMockHttpClient, createMockLogger, createMockConfig } from '../../../test/helpers';
import type { ToolDependencies } from '../types';

describe('OmniscribeStatusTool', () => {
  let tool: OmniscribeStatusTool;
  let mockHttpClient: ReturnType<typeof createMockHttpClient>;
  let deps: ToolDependencies;

  beforeEach(() => {
    mockHttpClient = createMockHttpClient();
    deps = {
      httpClient: mockHttpClient,
      config: createMockConfig(),
      logger: createMockLogger(),
    };
    tool = new OmniscribeStatusTool(deps);
  });

  describe('metadata', () => {
    it('should have the correct name', () => {
      expect(tool.metadata.name).toBe('omniscribe_status');
    });

    it('should have the correct title', () => {
      expect(tool.metadata.title).toBe('Report Status to Omniscribe');
    });

    it('should have a description', () => {
      expect(tool.metadata.description).toBeTruthy();
    });
  });

  describe('execute', () => {
    it('should return error when state is needs_input without needsInputPrompt', async () => {
      const result = await tool.execute({
        state: 'needs_input',
        message: 'Waiting for input',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('needsInputPrompt is required');
      expect(mockHttpClient.reportStatus).not.toHaveBeenCalled();
    });

    it('should call httpClient.reportStatus with correct args', async () => {
      await tool.execute({ state: 'working', message: 'Building' });

      expect(mockHttpClient.reportStatus).toHaveBeenCalledWith('working', 'Building', undefined);
    });

    it('should return success message when httpClient returns true', async () => {
      const result = await tool.execute({
        state: 'working',
        message: 'Building project',
      });

      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain('working');
      expect(result.content[0].text).toContain('Building project');
    });

    it('should return warning when httpClient returns false', async () => {
      mockHttpClient.reportStatus.mockResolvedValue(false);

      const result = await tool.execute({ state: 'idle', message: 'Ready' });

      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain('could not be reported');
    });

    it('should pass needsInputPrompt for needs_input state', async () => {
      await tool.execute({
        state: 'needs_input',
        message: 'Waiting',
        needsInputPrompt: 'Which file?',
      });

      expect(mockHttpClient.reportStatus).toHaveBeenCalledWith(
        'needs_input',
        'Waiting',
        'Which file?'
      );
    });

    it.each(['idle', 'working', 'planning', 'finished', 'error'] as const)(
      'should handle %s state',
      async state => {
        const result = await tool.execute({ state, message: `State: ${state}` });

        expect(result.content[0].text).toContain(state);
        expect(mockHttpClient.reportStatus).toHaveBeenCalledWith(
          state,
          `State: ${state}`,
          undefined
        );
      }
    );
  });
});
