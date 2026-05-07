import { Test, TestingModule } from '@nestjs/testing';
import { ClaudeSessionTrackerService } from './claude-session-tracker.service';
import { SessionService } from './session.service';
import { WorkspaceService } from '../workspace/workspace.service';
import type { BackendSessionConfig } from './types';

function createMockSession(overrides?: Partial<BackendSessionConfig>): BackendSessionConfig {
  return {
    id: 'session-1-1700000000000',
    name: 'Test',
    workingDirectory: '/project',
    aiMode: 'claude',
    createdAt: new Date('2024-01-01'),
    lastActiveAt: new Date('2024-01-01'),
    projectPath: '/project',
    status: 'idle',
    ...overrides,
  } as BackendSessionConfig;
}

describe('ClaudeSessionTrackerService', () => {
  let service: ClaudeSessionTrackerService;
  let sessionService: jest.Mocked<SessionService>;
  let workspaceService: jest.Mocked<WorkspaceService>;

  beforeEach(async () => {
    sessionService = {
      get: jest.fn(),
      getRunningSessions: jest.fn().mockReturnValue([]),
    } as unknown as jest.Mocked<SessionService>;

    workspaceService = {
      addSessionHistory: jest.fn(),
    } as unknown as jest.Mocked<WorkspaceService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClaudeSessionTrackerService,
        { provide: SessionService, useValue: sessionService },
        { provide: WorkspaceService, useValue: workspaceService },
      ],
    }).compile();

    service = module.get<ClaudeSessionTrackerService>(ClaudeSessionTrackerService);
  });

  describe('onTerminalClosedWithSession', () => {
    it('should persist session history when session has claudeSessionId', () => {
      const session = createMockSession({ claudeSessionId: 'claude-abc' });
      sessionService.get.mockReturnValue(session);

      service.onTerminalClosedWithSession({
        sessionId: session.id,
        claudeSessionId: 'claude-abc',
        exitCode: 0,
      });

      expect(workspaceService.addSessionHistory).toHaveBeenCalledWith(
        expect.objectContaining({
          omniscribeSessionId: session.id,
          claudeSessionId: 'claude-abc',
          exitCode: 0,
        })
      );
    });

    it('should not persist history when no claudeSessionId', () => {
      const session = createMockSession();
      sessionService.get.mockReturnValue(session);

      service.onTerminalClosedWithSession({
        sessionId: session.id,
        exitCode: 0,
      });

      expect(workspaceService.addSessionHistory).not.toHaveBeenCalled();
    });

    it('should not crash when session is not found', () => {
      sessionService.get.mockReturnValue(undefined);

      expect(() =>
        service.onTerminalClosedWithSession({
          sessionId: 'nonexistent',
          exitCode: 0,
        })
      ).not.toThrow();
    });
  });
});
