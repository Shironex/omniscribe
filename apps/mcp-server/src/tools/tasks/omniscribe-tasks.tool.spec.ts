import { OmniscribeTasksTool } from './omniscribe-tasks.tool';
import { createMockHttpClient, createMockLogger, createMockConfig } from '../../../test/helpers';
import type { ToolDependencies } from '../types';

describe('OmniscribeTasksTool', () => {
  let tool: OmniscribeTasksTool;
  let mockHttpClient: ReturnType<typeof createMockHttpClient>;
  let deps: ToolDependencies;

  beforeEach(() => {
    mockHttpClient = createMockHttpClient();
    deps = {
      httpClient: mockHttpClient,
      config: createMockConfig(),
      logger: createMockLogger(),
    };
    tool = new OmniscribeTasksTool(deps);
  });

  describe('metadata', () => {
    it('should have the correct name', () => {
      expect(tool.metadata.name).toBe('omniscribe_tasks');
    });

    it('should have the correct title', () => {
      expect(tool.metadata.title).toBe('Report Task List to Omniscribe');
    });

    it('should have a description', () => {
      expect(tool.metadata.description).toBeTruthy();
    });
  });

  describe('execute', () => {
    it('should call httpClient.reportTasks with the tasks array', async () => {
      const tasks = [
        { id: '1', subject: 'Setup project', status: 'completed' as const },
        { id: '2', subject: 'Implement feature', status: 'in_progress' as const },
      ];

      await tool.execute({ tasks });

      expect(mockHttpClient.reportTasks).toHaveBeenCalledWith(tasks);
    });

    it('should return success message with task count when httpClient returns true', async () => {
      const tasks = [
        { id: '1', subject: 'Task A', status: 'pending' as const },
        { id: '2', subject: 'Task B', status: 'in_progress' as const },
        { id: '3', subject: 'Task C', status: 'completed' as const },
      ];

      const result = await tool.execute({ tasks });

      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toBe('Tasks updated: 3 task(s) reported');
    });

    it('should return warning when httpClient returns false', async () => {
      mockHttpClient.reportTasks.mockResolvedValue(false);

      const result = await tool.execute({
        tasks: [{ id: '1', subject: 'Task A', status: 'pending' as const }],
      });

      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain('could not be reported');
    });

    it('should handle empty task array', async () => {
      const result = await tool.execute({ tasks: [] });

      expect(mockHttpClient.reportTasks).toHaveBeenCalledWith([]);
      expect(result.content[0].text).toBe('Tasks updated: 0 task(s) reported');
    });

    it('should handle tasks with all three status values', async () => {
      const tasks = [
        { id: '1', subject: 'Pending task', status: 'pending' as const },
        { id: '2', subject: 'Active task', status: 'in_progress' as const },
        { id: '3', subject: 'Done task', status: 'completed' as const },
      ];

      const result = await tool.execute({ tasks });

      expect(mockHttpClient.reportTasks).toHaveBeenCalledWith(tasks);
      expect(result.content[0].text).toBe('Tasks updated: 3 task(s) reported');
    });
  });
});
