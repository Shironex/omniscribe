import type { OmniscribeHttpClient } from '../../src/http/client';

export function createMockHttpClient(): jest.Mocked<OmniscribeHttpClient> {
  return {
    reportStatus: jest.fn().mockResolvedValue(true),
    reportTasks: jest.fn().mockResolvedValue(true),
    swarmGetAssignment: jest.fn().mockResolvedValue(null),
    swarmReportResult: jest.fn().mockResolvedValue(true),
    swarmClaimFiles: jest.fn().mockResolvedValue({ claimed: [], denied: [] }),
    swarmReleaseFiles: jest.fn().mockResolvedValue(true),
    swarmSendMessage: jest.fn().mockResolvedValue(true),
    swarmGetMessages: jest.fn().mockResolvedValue([]),
    swarmGetContext: jest
      .fn()
      .mockResolvedValue({ swarm: {}, agents: [], tasks: [], recentMessages: [] }),
    swarmSpawnTeammate: jest.fn().mockResolvedValue({ agentId: 'mock-agent-id' }),
    swarmCreateTask: jest.fn().mockResolvedValue({ taskId: 'mock-task-id' }),
  };
}
