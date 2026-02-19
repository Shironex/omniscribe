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
      saveActiveSessionsSnapshot: jest.fn(),
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

  describe('onModuleDestroy', () => {
    it('should snapshot active sessions with Claude session IDs', () => {
      const session = createMockSession({
        claudeSessionId: 'claude-id-123',
        terminalSessionId: 1,
      });
      sessionService.getRunningSessions.mockReturnValue([session]);

      service.onModuleDestroy();

      expect(workspaceService.saveActiveSessionsSnapshot).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            claudeSessionId: 'claude-id-123',
            projectPath: '/project',
            name: 'Test',
          }),
        ])
      );
    });

    it('should not include sessions without Claude session IDs', () => {
      const session = createMockSession(); // no claudeSessionId
      sessionService.getRunningSessions.mockReturnValue([session]);

      service.onModuleDestroy();

      expect(workspaceService.saveActiveSessionsSnapshot).toHaveBeenCalledWith([]);
    });
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

    it('should refresh snapshot on terminal close', () => {
      const session = createMockSession();
      sessionService.get.mockReturnValue(session);

      service.onTerminalClosedWithSession({
        sessionId: session.id,
        exitCode: 0,
      });

      expect(workspaceService.saveActiveSessionsSnapshot).toHaveBeenCalled();
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

  describe('onSessionRemoved', () => {
    it('should refresh snapshot on session removal', () => {
      service.onSessionRemoved();

      expect(workspaceService.saveActiveSessionsSnapshot).toHaveBeenCalled();
    });
  });

  describe('refreshActiveSessionsSnapshot', () => {
    it('should build snapshot from running sessions with claudeSessionId', () => {
      const sessions = [
        createMockSession({
          id: 'sess-1',
          claudeSessionId: 'claude-1',
          projectPath: '/project-a',
          branch: 'main',
          name: 'Session A',
        }),
        createMockSession({
          id: 'sess-2',
          // No claudeSessionId -- should be filtered out
          projectPath: '/project-b',
          name: 'Session B',
        }),
        createMockSession({
          id: 'sess-3',
          claudeSessionId: 'claude-3',
          projectPath: '/project-c',
          branch: 'feature',
          name: 'Session C',
        }),
      ];
      sessionService.getRunningSessions.mockReturnValue(sessions);

      service.refreshActiveSessionsSnapshot('test-reason');

      expect(workspaceService.saveActiveSessionsSnapshot).toHaveBeenCalledWith([
        expect.objectContaining({
          claudeSessionId: 'claude-1',
          projectPath: '/project-a',
          branch: 'main',
          name: 'Session A',
        }),
        expect.objectContaining({
          claudeSessionId: 'claude-3',
          projectPath: '/project-c',
          branch: 'feature',
          name: 'Session C',
        }),
      ]);
    });

    it('should handle errors gracefully', () => {
      sessionService.getRunningSessions.mockImplementation(() => {
        throw new Error('Service error');
      });

      // Should not throw
      expect(() => service.refreshActiveSessionsSnapshot('error-test')).not.toThrow();
    });
  });
});
