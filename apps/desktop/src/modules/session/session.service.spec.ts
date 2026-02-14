import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { SessionService } from './session.service';
import { TerminalService } from '../terminal/terminal.service';
import { WorktreeService } from '../git/worktree.service';
import { WorkspaceService } from '../workspace/workspace.service';
import type { SessionStatus } from '@omniscribe/shared';

describe('SessionService', () => {
  let service: SessionService;
  let eventEmitter: jest.Mocked<EventEmitter2>;
  let terminalService: jest.Mocked<TerminalService>;
  let worktreeService: jest.Mocked<WorktreeService>;
  let workspaceService: jest.Mocked<WorkspaceService>;

  beforeEach(async () => {
    eventEmitter = {
      emit: jest.fn(),
      on: jest.fn(),
      removeAllListeners: jest.fn(),
    } as unknown as jest.Mocked<EventEmitter2>;

    terminalService = {
      spawnCommand: jest.fn().mockReturnValue(1),
      hasSession: jest.fn().mockReturnValue(true),
      kill: jest.fn().mockResolvedValue(undefined),
      write: jest.fn(),
      resize: jest.fn(),
    } as unknown as jest.Mocked<TerminalService>;

    worktreeService = {
      cleanup: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<WorktreeService>;

    workspaceService = {
      getPreferences: jest.fn().mockReturnValue({
        theme: 'dark',
        worktree: { mode: 'always', autoCleanup: true, location: 'project' },
      }),
      saveActiveSessionsSnapshot: jest.fn(),
      getActiveSessionsSnapshot: jest.fn().mockReturnValue([]),
      addSessionHistory: jest.fn(),
    } as unknown as jest.Mocked<WorkspaceService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SessionService,
        { provide: EventEmitter2, useValue: eventEmitter },
        { provide: TerminalService, useValue: terminalService },
        { provide: WorktreeService, useValue: worktreeService },
        { provide: WorkspaceService, useValue: workspaceService },
      ],
    }).compile();

    service = module.get<SessionService>(SessionService);
  });

  describe('create', () => {
    it('should create a session with the given mode and project path', () => {
      const session = service.create('claude', '/project');

      expect(session.id).toMatch(/^session-\d+-\d+$/);
      expect(session.aiMode).toBe('claude');
      expect(session.projectPath).toBe('/project');
      expect(session.status).toBe('idle');
    });

    it('should apply optional config', () => {
      const session = service.create('claude', '/project', {
        name: 'My Session',
        model: 'sonnet',
        systemPrompt: 'Be concise',
      });

      expect(session.name).toBe('My Session');
      expect(session.model).toBe('sonnet');
      expect(session.systemPrompt).toBe('Be concise');
    });

    it('should emit session.created event', () => {
      const session = service.create('claude', '/project');

      expect(eventEmitter.emit).toHaveBeenCalledWith('session.created', session);
    });

    it('should generate unique IDs', () => {
      const s1 = service.create('claude', '/project');
      const s2 = service.create('claude', '/project');

      expect(s1.id).not.toBe(s2.id);
    });

    it('should use default name when not provided', () => {
      const session = service.create('claude', '/project');

      expect(session.name).toMatch(/^Session \d+$/);
    });
  });

  describe('updateStatus', () => {
    it('should update session status and emit event', () => {
      const session = service.create('claude', '/project');

      const updated = service.updateStatus(session.id, 'working', 'Implementing feature');

      expect(updated?.status).toBe('working');
      expect(updated?.statusMessage).toBe('Implementing feature');
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'session.status',
        expect.objectContaining({
          sessionId: session.id,
          status: 'working',
          message: 'Implementing feature',
        })
      );
    });

    it('should handle needsInputPrompt', () => {
      const session = service.create('claude', '/project');

      // Transition through a valid path: idle -> working -> needs_input
      service.updateStatus(session.id, 'working');
      const updated = service.updateStatus(
        session.id,
        'needs_input' as SessionStatus,
        'Waiting for clarification',
        true
      );

      expect(updated?.needsInputPrompt).toBe(true);
    });

    it('should return undefined for non-existent session', () => {
      const result = service.updateStatus('nonexistent', 'idle');

      expect(result).toBeUndefined();
    });

    it('should update lastActiveAt', () => {
      const session = service.create('claude', '/project');
      const originalTime = session.lastActiveAt;

      // Small delay to ensure time difference
      const updated = service.updateStatus(session.id, 'working');

      expect(updated?.lastActiveAt.getTime()).toBeGreaterThanOrEqual(originalTime.getTime());
    });
  });

  describe('assignBranch', () => {
    it('should assign branch to session', () => {
      const session = service.create('claude', '/project');

      const updated = service.assignBranch(session.id, 'feature/test', '/worktrees/feature_test');

      expect(updated?.branch).toBe('feature/test');
      expect(updated?.worktreePath).toBe('/worktrees/feature_test');
    });

    it('should emit session.status event', () => {
      const session = service.create('claude', '/project');
      eventEmitter.emit.mockClear();

      service.assignBranch(session.id, 'main');

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'session.status',
        expect.objectContaining({
          sessionId: session.id,
          message: 'Branch assigned: main',
        })
      );
    });

    it('should return undefined for non-existent session', () => {
      const result = service.assignBranch('nonexistent', 'main');
      expect(result).toBeUndefined();
    });
  });

  describe('get / getAll / getForProject', () => {
    it('should retrieve a session by ID', () => {
      const session = service.create('claude', '/project');

      expect(service.get(session.id)).toEqual(session);
    });

    it('should return all sessions', () => {
      service.create('claude', '/project1');
      service.create('claude', '/project2');

      expect(service.getAll()).toHaveLength(2);
    });

    it('should filter sessions by project path', () => {
      service.create('claude', '/project1');
      service.create('claude', '/project1');
      service.create('claude', '/project2');

      expect(service.getForProject('/project1')).toHaveLength(2);
      expect(service.getForProject('/project2')).toHaveLength(1);
    });
  });

  describe('getRunningSessions', () => {
    it('should return sessions with active terminals', () => {
      const session1 = service.create('claude', '/project');
      const session2 = service.create('claude', '/project');
      service.create('claude', '/project'); // session3 - not launched

      // Simulate terminal registration (normally done by launcher)
      service.registerTerminal(session1.id, 1, '/worktree');
      service.registerTerminal(session2.id, 2, '/worktree');

      const running = service.getRunningSessions();

      expect(running).toHaveLength(2);
      expect(running.map(s => s.id)).toContain(session1.id);
      expect(running.map(s => s.id)).toContain(session2.id);
    });

    it('should not count sessions without active terminals', () => {
      service.create('claude', '/project'); // not launched

      const running = service.getRunningSessions();

      expect(running).toHaveLength(0);
    });

    it('should not count sessions whose terminal no longer exists', () => {
      const session = service.create('claude', '/project');
      service.registerTerminal(session.id, 1, '/worktree');

      // Terminal no longer exists
      terminalService.hasSession.mockReturnValue(false);

      const running = service.getRunningSessions();

      expect(running).toHaveLength(0);
    });
  });

  describe('getIdleSessions', () => {
    it('should return running sessions with idle or needs_input status', () => {
      const session1 = service.create('claude', '/project');
      const session2 = service.create('claude', '/project');
      const session3 = service.create('claude', '/project');

      // Simulate terminal registration
      service.registerTerminal(session1.id, 1, '/worktree');
      service.registerTerminal(session2.id, 2, '/worktree');
      service.registerTerminal(session3.id, 3, '/worktree');

      // session1 is idle (default after create)
      // session2 is working
      service.updateStatus(session2.id, 'working', 'Processing...');
      // session3 needs input
      service.updateStatus(session3.id, 'needs_input', 'Waiting for input', true);

      const idle = service.getIdleSessions();

      expect(idle).toHaveLength(2);
      expect(idle.map(s => s.id)).toContain(session1.id);
      expect(idle.map(s => s.id)).toContain(session3.id);
    });

    it('should return empty array when no idle sessions', () => {
      const session = service.create('claude', '/project');
      service.registerTerminal(session.id, 1, '/worktree');
      service.updateStatus(session.id, 'working', 'Processing...');

      const idle = service.getIdleSessions();

      expect(idle).toHaveLength(0);
    });
  });

  describe('remove', () => {
    it('should remove a session', async () => {
      const session = service.create('claude', '/project');

      const removed = await service.remove(session.id);

      expect(removed).toBe(true);
      expect(service.get(session.id)).toBeUndefined();
    });

    it('should kill terminal when removing a running session', async () => {
      const session = service.create('claude', '/project');
      service.registerTerminal(session.id, 1, '/worktree');

      await service.remove(session.id);

      expect(terminalService.kill).toHaveBeenCalled();
    });

    it('should cleanup worktree when autoCleanup is enabled', async () => {
      const session = service.create('claude', '/project');
      service.assignBranch(session.id, 'feature/test', '/worktrees/feature_test');

      await service.remove(session.id);

      expect(worktreeService.cleanup).toHaveBeenCalledWith('/project', '/worktrees/feature_test');
    });

    it('should skip worktree cleanup when autoCleanup is disabled', async () => {
      workspaceService.getPreferences.mockReturnValue({
        theme: 'dark',
        worktree: { mode: 'always', autoCleanup: false, location: 'project' },
      });

      const session = service.create('claude', '/project');
      service.assignBranch(session.id, 'feature/test', '/worktrees/feature_test');

      await service.remove(session.id);

      expect(worktreeService.cleanup).not.toHaveBeenCalled();
    });

    it('should continue removal even if worktree cleanup fails', async () => {
      worktreeService.cleanup.mockRejectedValue(new Error('cleanup failed'));

      const session = service.create('claude', '/project');
      service.assignBranch(session.id, 'feature/test', '/worktrees/feature_test');

      const removed = await service.remove(session.id);

      expect(removed).toBe(true);
      expect(service.get(session.id)).toBeUndefined();
    });

    it('should emit session.removed event', async () => {
      const session = service.create('claude', '/project');
      eventEmitter.emit.mockClear();

      await service.remove(session.id);

      expect(eventEmitter.emit).toHaveBeenCalledWith('session.removed', {
        sessionId: session.id,
      });
    });

    it('should return false for non-existent session', async () => {
      const result = await service.remove('nonexistent');
      expect(result).toBe(false);
    });
  });

  describe('removeForProject', () => {
    it('should remove all sessions for a project', async () => {
      service.create('claude', '/project1');
      service.create('claude', '/project1');
      service.create('claude', '/project2');

      const count = await service.removeForProject('/project1');

      expect(count).toBe(2);
      expect(service.getForProject('/project1')).toHaveLength(0);
      expect(service.getForProject('/project2')).toHaveLength(1);
    });
  });

  describe('writeToSession / resizeSession', () => {
    it('should write data to a running session terminal', () => {
      const session = service.create('claude', '/project');
      service.registerTerminal(session.id, 1, '/worktree');

      const result = service.writeToSession(session.id, 'hello\n');

      expect(result).toBe(true);
      expect(terminalService.write).toHaveBeenCalledWith(1, 'hello\n');
    });

    it('should return false for non-running session', () => {
      const session = service.create('claude', '/project');
      expect(service.writeToSession(session.id, 'hello')).toBe(false);
    });

    it('should resize a running session terminal', () => {
      const session = service.create('claude', '/project');
      service.registerTerminal(session.id, 1, '/worktree');

      const result = service.resizeSession(session.id, 120, 40);

      expect(result).toBe(true);
      expect(terminalService.resize).toHaveBeenCalledWith(1, 120, 40);
    });
  });

  describe('isSessionRunning', () => {
    it('should return true when session has active terminal', () => {
      const session = service.create('claude', '/project');
      service.registerTerminal(session.id, 1, '/worktree');

      expect(service.isSessionRunning(session.id)).toBe(true);
    });

    it('should return false when session has no terminal', () => {
      const session = service.create('claude', '/project');

      expect(service.isSessionRunning(session.id)).toBe(false);
    });

    it('should return false for non-existent session', () => {
      expect(service.isSessionRunning('nonexistent')).toBe(false);
    });
  });

  describe('stopSession', () => {
    it('should stop a running session', async () => {
      const session = service.create('claude', '/project');
      service.registerTerminal(session.id, 1, '/worktree');

      const stopped = await service.stopSession(session.id);

      expect(stopped).toBe(true);
      expect(terminalService.kill).toHaveBeenCalled();
      expect(service.get(session.id)?.status).toBe('idle');
    });

    it('should return false for non-existent session', async () => {
      expect(await service.stopSession('nonexistent')).toBe(false);
    });

    it('should return false when session has no terminal', async () => {
      const session = service.create('claude', '/project');
      expect(await service.stopSession(session.id)).toBe(false);
    });
  });

  describe('create with fork/continue options', () => {
    it('should create a session with forkSessionId', () => {
      const session = service.create('claude', '/project', {
        forkSessionId: 'abc-123-fork',
      });

      expect(session.forkSessionId).toBe('abc-123-fork');
      expect(session.isResumed).toBe(false);
      expect(session.continueLastSession).toBeUndefined();
    });

    it('should create a session with continueLastSession', () => {
      const session = service.create('claude', '/project', {
        continueLastSession: true,
      });

      expect(session.continueLastSession).toBe(true);
      expect(session.isResumed).toBe(false);
      expect(session.forkSessionId).toBeUndefined();
    });

    it('should create a session with resumeSessionId', () => {
      const session = service.create('claude', '/project', {
        resumeSessionId: 'resume-456',
      });

      expect(session.resumeSessionId).toBe('resume-456');
      expect(session.claudeSessionId).toBe('resume-456');
      expect(session.isResumed).toBe(true);
    });
  });

  describe('handleTerminalClosed', () => {
    it('should emit TERMINAL_CLOSED_WITH_SESSION when terminal closes', () => {
      // Create and register a session with a terminal
      const session = service.create('claude', '/project');
      service.registerTerminal(session.id, 42, '/worktree');
      service.setClaudeSessionId(session.id, 'claude-abc');

      // Extract the terminal.closed listener registered in the constructor
      const onCall = eventEmitter.on.mock.calls.find(call => call[0] === 'terminal.closed');
      expect(onCall).toBeDefined();
      const terminalClosedHandler = onCall![1] as (event: {
        sessionId: number;
        externalId?: string;
        exitCode: number;
      }) => void;

      // Clear previous emit calls (from create, registerTerminal, setClaudeSessionId)
      eventEmitter.emit.mockClear();

      // Simulate terminal close
      terminalClosedHandler({
        sessionId: 42,
        externalId: session.id,
        exitCode: 0,
      });

      // Should emit session.status and session.terminal-closed-with-session
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'session.terminal-closed-with-session',
        expect.objectContaining({
          sessionId: session.id,
          claudeSessionId: 'claude-abc',
          exitCode: 0,
        })
      );
    });
  });

  describe('registerTerminal', () => {
    it('should register terminal reference for a session', () => {
      const session = service.create('claude', '/project');
      service.registerTerminal(session.id, 42, '/worktree');

      const updated = service.get(session.id);
      expect(updated?.terminalSessionId).toBe(42);
      expect(updated?.worktreePath).toBe('/worktree');
    });
  });

  describe('setClaudeSessionId', () => {
    it('should set Claude session ID for a session', () => {
      const session = service.create('claude', '/project');
      service.setClaudeSessionId(session.id, 'claude-abc-123');

      expect(service.get(session.id)?.claudeSessionId).toBe('claude-abc-123');
    });
  });
});
