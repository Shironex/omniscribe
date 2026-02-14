import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ClaudeSessionTrackerService } from './claude-session-tracker.service';
import { SessionService } from './session.service';
import { ClaudeSessionReaderService } from './claude-session-reader.service';
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
      setClaudeSessionId: jest.fn(),
    } as unknown as jest.Mocked<SessionService>;

    workspaceService = {
      saveActiveSessionsSnapshot: jest.fn(),
      addSessionHistory: jest.fn(),
    } as unknown as jest.Mocked<WorkspaceService>;

    const eventEmitter = {
      emit: jest.fn(),
      on: jest.fn(),
    } as unknown as jest.Mocked<EventEmitter2>;

    const claudeSessionReader = {
      readSessionsIndex: jest.fn().mockResolvedValue([]),
      findNewSession: jest.fn().mockResolvedValue(null),
    } as unknown as jest.Mocked<ClaudeSessionReaderService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClaudeSessionTrackerService,
        { provide: EventEmitter2, useValue: eventEmitter },
        { provide: SessionService, useValue: sessionService },
        { provide: ClaudeSessionReaderService, useValue: claudeSessionReader },
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
  });

  describe('onSessionRemoved', () => {
    it('should refresh snapshot on session removal', () => {
      service.onSessionRemoved();

      expect(workspaceService.saveActiveSessionsSnapshot).toHaveBeenCalled();
    });
  });
});
