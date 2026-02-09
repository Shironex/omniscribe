import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { SessionService } from './session.service';
import { TerminalService } from '../terminal/terminal.service';
import { McpWriterService, McpDiscoveryService } from '../mcp';
import { WorktreeService } from '../git/worktree.service';
import { WorkspaceService } from '../workspace/workspace.service';
import { CliCommandService } from './cli-command.service';
import { ClaudeSessionReaderService } from './claude-session-reader.service';
import { HookManagerService } from './hook-manager.service';
import type { SessionStatus } from '@omniscribe/shared';

describe('SessionService', () => {
  let service: SessionService;
  let eventEmitter: jest.Mocked<EventEmitter2>;
  let terminalService: jest.Mocked<TerminalService>;
  let mcpWriterService: jest.Mocked<McpWriterService>;
  let mcpDiscoveryService: jest.Mocked<McpDiscoveryService>;
  let worktreeService: jest.Mocked<WorktreeService>;
  let workspaceService: jest.Mocked<WorkspaceService>;
  let cliCommandService: jest.Mocked<CliCommandService>;
  let claudeSessionReader: jest.Mocked<ClaudeSessionReaderService>;
  let hookManager: jest.Mocked<HookManagerService>;

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

    mcpWriterService = {
      writeConfig: jest.fn().mockResolvedValue(undefined),
      generateProjectHash: jest.fn().mockReturnValue('abc123'),
    } as unknown as jest.Mocked<McpWriterService>;

    mcpDiscoveryService = {
      discoverServers: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<McpDiscoveryService>;

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

    cliCommandService = {
      getCliConfig: jest.fn().mockReturnValue({
        command: 'claude',
        args: ['--model', 'opus'],
      }),
      getAiModeName: jest.fn().mockReturnValue('Claude'),
    } as unknown as jest.Mocked<CliCommandService>;

    claudeSessionReader = {
      readSessionsIndex: jest.fn().mockResolvedValue([]),
      findNewSession: jest.fn().mockResolvedValue(null),
      watchSessionsIndex: jest.fn().mockReturnValue(() => {}),
    } as unknown as jest.Mocked<ClaudeSessionReaderService>;

    hookManager = {
      registerHooks: jest.fn().mockResolvedValue(undefined),
      unregisterHooks: jest.fn().mockResolvedValue(undefined),
      startWatching: jest.fn(),
      stopWatching: jest.fn(),
    } as unknown as jest.Mocked<HookManagerService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SessionService,
        { provide: EventEmitter2, useValue: eventEmitter },
        { provide: TerminalService, useValue: terminalService },
        { provide: McpWriterService, useValue: mcpWriterService },
        { provide: McpDiscoveryService, useValue: mcpDiscoveryService },
        { provide: WorktreeService, useValue: worktreeService },
        { provide: WorkspaceService, useValue: workspaceService },
        { provide: CliCommandService, useValue: cliCommandService },
        { provide: ClaudeSessionReaderService, useValue: claudeSessionReader },
        { provide: HookManagerService, useValue: hookManager },
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
    it('should return sessions with active terminals', async () => {
      const session1 = service.create('claude', '/project');
      const session2 = service.create('claude', '/project');
      service.create('claude', '/project'); // session3 - not launched

      await service.launchSession(session1.id, '/project', '/worktree', 'claude');
      await service.launchSession(session2.id, '/project', '/worktree', 'claude');

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

    it('should not count sessions whose terminal no longer exists', async () => {
      const session = service.create('claude', '/project');
      await service.launchSession(session.id, '/project', '/worktree', 'claude');

      // Terminal no longer exists
      terminalService.hasSession.mockReturnValue(false);

      const running = service.getRunningSessions();

      expect(running).toHaveLength(0);
    });
  });

  describe('getIdleSessions', () => {
    it('should return running sessions with idle or needs_input status', async () => {
      const session1 = service.create('claude', '/project');
      const session2 = service.create('claude', '/project');
      const session3 = service.create('claude', '/project');

      await service.launchSession(session1.id, '/project', '/worktree', 'claude');
      await service.launchSession(session2.id, '/project', '/worktree', 'claude');
      await service.launchSession(session3.id, '/project', '/worktree', 'claude');

      // session1 is idle (default after launch)
      // session2 is working
      service.updateStatus(session2.id, 'working', 'Processing...');
      // session3 needs input
      service.updateStatus(session3.id, 'needs_input', 'Waiting for input', true);

      const idle = service.getIdleSessions();

      expect(idle).toHaveLength(2);
      expect(idle.map(s => s.id)).toContain(session1.id);
      expect(idle.map(s => s.id)).toContain(session3.id);
    });

    it('should return empty array when no idle sessions', async () => {
      const session = service.create('claude', '/project');
      await service.launchSession(session.id, '/project', '/worktree', 'claude');
      service.updateStatus(session.id, 'working', 'Processing...');

      const idle = service.getIdleSessions();

      expect(idle).toHaveLength(0);
    });
  });

  describe('launchSession', () => {
    it('should discover MCP servers and spawn a terminal', async () => {
      const session = service.create('claude', '/project');

      const result = await service.launchSession(session.id, '/project', '/worktree', 'claude');

      expect(result.success).toBe(true);
      expect(result.terminalSessionId).toBe(1);
      expect(mcpDiscoveryService.discoverServers).toHaveBeenCalledWith('/project');
      expect(mcpWriterService.writeConfig).toHaveBeenCalledWith(
        '/worktree',
        session.id,
        '/project',
        []
      );
      expect(terminalService.spawnCommand).toHaveBeenCalledWith(
        'claude',
        ['--model', 'opus'],
        '/worktree',
        expect.objectContaining({
          OMNISCRIBE_SESSION_ID: session.id,
          OMNISCRIBE_PROJECT_PATH: '/project',
        }),
        session.id
      );
    });

    it('should return error for non-existent session', async () => {
      const result = await service.launchSession('nonexistent', '/project', '/worktree', 'claude');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Session not found');
    });

    it('should prevent launching when terminal already active', async () => {
      const session = service.create('claude', '/project');
      await service.launchSession(session.id, '/project', '/worktree', 'claude');

      const result = await service.launchSession(session.id, '/project', '/worktree', 'claude');

      expect(result.success).toBe(false);
      expect(result.error).toContain('already has an active terminal');
    });

    it('should handle launch errors gracefully', async () => {
      const session = service.create('claude', '/project');
      terminalService.spawnCommand.mockImplementation(() => {
        throw new Error('PTY spawn failed');
      });

      const result = await service.launchSession(session.id, '/project', '/worktree', 'claude');

      expect(result.success).toBe(false);
      expect(result.error).toBe('PTY spawn failed');
      // Session should be in error state
      expect(service.get(session.id)?.status).toBe('error');
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
      await service.launchSession(session.id, '/project', '/worktree', 'claude');

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
    it('should write data to a running session terminal', async () => {
      const session = service.create('claude', '/project');
      await service.launchSession(session.id, '/project', '/worktree', 'claude');

      const result = service.writeToSession(session.id, 'hello\n');

      expect(result).toBe(true);
      expect(terminalService.write).toHaveBeenCalledWith(1, 'hello\n');
    });

    it('should return false for non-running session', () => {
      const session = service.create('claude', '/project');
      expect(service.writeToSession(session.id, 'hello')).toBe(false);
    });

    it('should resize a running session terminal', async () => {
      const session = service.create('claude', '/project');
      await service.launchSession(session.id, '/project', '/worktree', 'claude');

      const result = service.resizeSession(session.id, 120, 40);

      expect(result).toBe(true);
      expect(terminalService.resize).toHaveBeenCalledWith(1, 120, 40);
    });
  });

  describe('isSessionRunning', () => {
    it('should return true when session has active terminal', async () => {
      const session = service.create('claude', '/project');
      await service.launchSession(session.id, '/project', '/worktree', 'claude');

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
      await service.launchSession(session.id, '/project', '/worktree', 'claude');

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

  describe('onModuleDestroy', () => {
    it('should snapshot active sessions with Claude session IDs', async () => {
      const session = service.create('claude', '/project', { name: 'Test' });
      await service.launchSession(session.id, '/project', '/worktree', 'claude');
      // Manually set claudeSessionId (normally done by polling)
      const storedSession = service.get(session.id);
      if (storedSession) storedSession.claudeSessionId = 'claude-id-123';

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

    it('should not include sessions without Claude session IDs', async () => {
      service.create('claude', '/project');
      // No claudeSessionId set

      service.onModuleDestroy();

      expect(workspaceService.saveActiveSessionsSnapshot).toHaveBeenCalledWith([]);
    });
  });

  describe('launchSession with hooks', () => {
    it('should register hooks and start watching for claude sessions', async () => {
      const session = service.create('claude', '/project');

      await service.launchSession(session.id, '/project', '/worktree', 'claude');

      expect(hookManager.registerHooks).toHaveBeenCalledWith('/project');
      expect(hookManager.startWatching).toHaveBeenCalled();
    });

    it('should not register hooks for plain mode sessions', async () => {
      cliCommandService.getCliConfig.mockReturnValue({
        command: '/bin/bash',
        args: ['-l'],
      });
      cliCommandService.getAiModeName.mockReturnValue('Plain Terminal');

      const session = service.create('plain', '/project');

      await service.launchSession(session.id, '/project', '/worktree', 'plain');

      expect(hookManager.registerHooks).not.toHaveBeenCalled();
      expect(hookManager.startWatching).not.toHaveBeenCalled();
    });

    it('should snapshot Claude sessions for non-resumed sessions', async () => {
      const session = service.create('claude', '/project');

      await service.launchSession(session.id, '/project', '/worktree', 'claude');

      expect(claudeSessionReader.readSessionsIndex).toHaveBeenCalledWith('/project');
    });

    it('should snapshot Claude sessions for fork sessions', async () => {
      const session = service.create('claude', '/project', {
        forkSessionId: 'fork-id',
      });

      await service.launchSession(session.id, '/project', '/worktree', 'claude');

      expect(claudeSessionReader.readSessionsIndex).toHaveBeenCalledWith('/project');
    });

    it('should snapshot Claude sessions for continue-last sessions', async () => {
      const session = service.create('claude', '/project', {
        continueLastSession: true,
      });

      await service.launchSession(session.id, '/project', '/worktree', 'claude');

      expect(claudeSessionReader.readSessionsIndex).toHaveBeenCalledWith('/project');
    });
  });
});
