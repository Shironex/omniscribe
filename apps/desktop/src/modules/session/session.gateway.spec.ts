import { Test, TestingModule } from '@nestjs/testing';
import { Server, Socket } from 'socket.io';
import { SessionGateway } from './session.gateway';
import { SessionService, ExtendedSessionConfig } from './session.service';
import { TerminalGateway } from '../terminal/terminal.gateway';
import { WorktreeService } from '../git/worktree.service';
import { GitService } from '../git/git.service';
import { WorkspaceService } from '../workspace/workspace.service';
import type { SessionStatus } from '@omniscribe/shared';
import { MAX_CONCURRENT_SESSIONS } from '@omniscribe/shared';

// ---------------------------------------------------------------------------
// Mock crypto.randomUUID
// ---------------------------------------------------------------------------

jest.mock('crypto', () => ({
  ...jest.requireActual('crypto'),
  randomUUID: jest.fn().mockReturnValue('12345678-1234-1234-1234-123456789abc'),
}));

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function createMockSocket(id = 'client-1'): Socket {
  return {
    id,
    join: jest.fn(),
    leave: jest.fn(),
    emit: jest.fn(),
    broadcast: { emit: jest.fn() },
  } as unknown as Socket;
}

function createMockServer(): Server {
  const toEmit = jest.fn();
  const server = {
    emit: jest.fn(),
    to: jest.fn().mockReturnValue({ emit: toEmit }),
  } as unknown as Server;
  return server;
}

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function createMockSession(overrides?: Partial<ExtendedSessionConfig>): ExtendedSessionConfig {
  return {
    id: 'session-1-1700000000000',
    name: 'Session 1',
    workingDirectory: '/project',
    aiMode: 'claude-code',
    createdAt: new Date('2024-01-01'),
    lastActiveAt: new Date('2024-01-01'),
    projectPath: '/project',
    status: 'idle' as SessionStatus,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Service mocks
// ---------------------------------------------------------------------------

const mockSessionService = {
  create: jest.fn(),
  get: jest.fn(),
  getAll: jest.fn(),
  getForProject: jest.fn(),
  remove: jest.fn(),
  assignBranch: jest.fn(),
  launchSession: jest.fn(),
  getRunningSessions: jest.fn().mockReturnValue([]),
  getIdleSessions: jest.fn().mockReturnValue([]),
};

const mockTerminalGateway = {
  registerClientSession: jest.fn(),
};

const mockWorktreeService = {
  prepare: jest.fn(),
  cleanup: jest.fn(),
};

const mockGitService = {
  getCurrentBranch: jest.fn(),
};

const mockWorkspaceService = {
  getPreferences: jest.fn(),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SessionGateway', () => {
  let gateway: SessionGateway;
  let server: Server;
  let client: Socket;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SessionGateway,
        { provide: SessionService, useValue: mockSessionService },
        { provide: TerminalGateway, useValue: mockTerminalGateway },
        { provide: WorktreeService, useValue: mockWorktreeService },
        { provide: GitService, useValue: mockGitService },
        { provide: WorkspaceService, useValue: mockWorkspaceService },
      ],
    }).compile();

    gateway = module.get<SessionGateway>(SessionGateway);
    server = createMockServer();
    gateway.server = server;
    client = createMockSocket();
  });

  // ========================================================================
  // afterInit
  // ========================================================================

  describe('afterInit', () => {
    it('should not throw when called', () => {
      expect(() => gateway.afterInit()).not.toThrow();
    });
  });

  // ========================================================================
  // handleCreate
  // ========================================================================

  describe('handleCreate', () => {
    const basePayload = {
      mode: 'claude-code' as const,
      projectPath: '/project',
    };

    beforeEach(() => {
      // Default mock setup: worktree mode = never, launch succeeds
      const session = createMockSession();
      mockSessionService.create.mockReturnValue(session);
      mockSessionService.get.mockReturnValue(session);
      mockWorkspaceService.getPreferences.mockReturnValue({
        worktree: { mode: 'never', location: 'project', autoCleanup: false },
      });
      mockSessionService.launchSession.mockResolvedValue({
        success: true,
        terminalSessionId: 1,
      });
    });

    it('should create session with mode=never (no worktree)', async () => {
      const result = await gateway.handleCreate(basePayload, client);

      expect(mockSessionService.create).toHaveBeenCalledWith('claude-code', '/project', {
        name: undefined,
        workingDirectory: undefined,
        model: undefined,
        systemPrompt: undefined,
        mcpServers: undefined,
      });
      expect(mockWorktreeService.prepare).not.toHaveBeenCalled();
      expect(mockSessionService.launchSession).toHaveBeenCalledWith(
        'session-1-1700000000000',
        '/project',
        '/project', // workingDir = session.workingDirectory when no worktree
        'claude-code'
      );
      expect(client.join).toHaveBeenCalledWith('terminal:1');
      expect(mockTerminalGateway.registerClientSession).toHaveBeenCalledWith('client-1', 1);
      expect(result.session).toBeDefined();
      expect(result.error).toBeUndefined();
    });

    it('should pass optional fields to sessionService.create', async () => {
      const payload = {
        ...basePayload,
        name: 'My Session',
        workingDirectory: '/other/path',
        model: 'opus',
        systemPrompt: 'Be concise',
        mcpServers: ['server-a'],
      };

      await gateway.handleCreate(payload, client);

      expect(mockSessionService.create).toHaveBeenCalledWith('claude-code', '/project', {
        name: 'My Session',
        workingDirectory: '/other/path',
        model: 'opus',
        systemPrompt: 'Be concise',
        mcpServers: ['server-a'],
      });
    });

    it('should create isolated worktree with UUID suffix when mode=always', async () => {
      mockWorkspaceService.getPreferences.mockReturnValue({
        worktree: { mode: 'always', location: 'project', autoCleanup: false },
      });
      mockGitService.getCurrentBranch.mockResolvedValue('main');
      mockWorktreeService.prepare.mockResolvedValue('/project/.worktrees/main-12345678');

      const result = await gateway.handleCreate(basePayload, client);

      // UUID is sliced to first 8 chars: '12345678'
      expect(mockWorktreeService.prepare).toHaveBeenCalledWith(
        '/project',
        'main-12345678',
        'project'
      );
      expect(mockSessionService.assignBranch).toHaveBeenCalledWith(
        'session-1-1700000000000',
        'main',
        '/project/.worktrees/main-12345678'
      );
      expect(mockSessionService.launchSession).toHaveBeenCalledWith(
        'session-1-1700000000000',
        '/project',
        '/project/.worktrees/main-12345678',
        'claude-code'
      );
      expect(result.error).toBeUndefined();
    });

    it('should use provided branch for mode=always worktree', async () => {
      mockWorkspaceService.getPreferences.mockReturnValue({
        worktree: { mode: 'always', location: 'central', autoCleanup: true },
      });
      mockWorktreeService.prepare.mockResolvedValue('/home/.omniscribe/worktrees/feature-12345678');

      const payload = { ...basePayload, branch: 'feature' };
      await gateway.handleCreate(payload, client);

      expect(mockWorktreeService.prepare).toHaveBeenCalledWith(
        '/project',
        'feature-12345678',
        'central'
      );
      // Branch is assigned from payload.branch
      expect(mockSessionService.assignBranch).toHaveBeenCalledWith(
        'session-1-1700000000000',
        'feature',
        '/home/.omniscribe/worktrees/feature-12345678'
      );
    });

    it('should create worktree for non-current branch when mode=branch', async () => {
      mockWorkspaceService.getPreferences.mockReturnValue({
        worktree: { mode: 'branch', location: 'project', autoCleanup: false },
      });
      mockGitService.getCurrentBranch.mockResolvedValue('main');
      mockWorktreeService.prepare.mockResolvedValue('/project/.worktrees/feature-x');

      const payload = { ...basePayload, branch: 'feature-x' };
      await gateway.handleCreate(payload, client);

      expect(mockWorktreeService.prepare).toHaveBeenCalledWith('/project', 'feature-x', 'project');
      expect(mockSessionService.assignBranch).toHaveBeenCalledWith(
        'session-1-1700000000000',
        'feature-x',
        '/project/.worktrees/feature-x'
      );
    });

    it('should NOT create worktree for current branch when mode=branch', async () => {
      mockWorkspaceService.getPreferences.mockReturnValue({
        worktree: { mode: 'branch', location: 'project', autoCleanup: false },
      });
      mockGitService.getCurrentBranch.mockResolvedValue('main');

      const payload = { ...basePayload, branch: 'main' };
      await gateway.handleCreate(payload, client);

      expect(mockWorktreeService.prepare).not.toHaveBeenCalled();
      // Branch is still assigned (via payload.branch path)
      expect(mockSessionService.assignBranch).toHaveBeenCalledWith(
        'session-1-1700000000000',
        'main',
        undefined
      );
    });

    it('should NOT create worktree for mode=branch when no branch specified', async () => {
      mockWorkspaceService.getPreferences.mockReturnValue({
        worktree: { mode: 'branch', location: 'project', autoCleanup: false },
      });

      await gateway.handleCreate(basePayload, client);

      expect(mockWorktreeService.prepare).not.toHaveBeenCalled();
      // No branch in payload and no worktreePath, so assignBranch is not called
      expect(mockSessionService.assignBranch).not.toHaveBeenCalled();
    });

    it('should fall back to main project dir when worktree creation fails', async () => {
      mockWorkspaceService.getPreferences.mockReturnValue({
        worktree: { mode: 'always', location: 'project', autoCleanup: false },
      });
      mockGitService.getCurrentBranch.mockResolvedValue('main');
      mockWorktreeService.prepare.mockRejectedValue(new Error('disk full'));

      const result = await gateway.handleCreate(basePayload, client);

      // Should still launch with session.workingDirectory (no worktree)
      expect(mockSessionService.launchSession).toHaveBeenCalledWith(
        'session-1-1700000000000',
        '/project',
        '/project',
        'claude-code'
      );
      expect(result.error).toBeUndefined();
    });

    it('should return error when launch fails', async () => {
      mockSessionService.launchSession.mockResolvedValue({
        success: false,
        error: 'CLI not found',
      });

      const result = await gateway.handleCreate(basePayload, client);

      expect(result).toEqual({ error: 'CLI not found' });
    });

    it('should return generic error when launch fails without message', async () => {
      mockSessionService.launchSession.mockResolvedValue({
        success: false,
      });

      const result = await gateway.handleCreate(basePayload, client);

      expect(result).toEqual({ error: 'Failed to launch session' });
    });

    it('should not join terminal room when terminalSessionId is undefined', async () => {
      mockSessionService.launchSession.mockResolvedValue({
        success: true,
        terminalSessionId: undefined,
      });

      await gateway.handleCreate(basePayload, client);

      expect(client.join).not.toHaveBeenCalled();
      expect(mockTerminalGateway.registerClientSession).not.toHaveBeenCalled();
    });

    it('should use default worktree settings when preferences have no worktree', async () => {
      // DEFAULT_WORKTREE_SETTINGS has mode: 'branch'
      mockWorkspaceService.getPreferences.mockReturnValue({});

      // Without a branch, mode=branch does nothing
      await gateway.handleCreate(basePayload, client);

      // Should proceed without worktree creation since mode=branch but no branch specified
      expect(mockWorktreeService.prepare).not.toHaveBeenCalled();
    });

    it('should assign branch with worktree path when no explicit branch but worktree created (mode=always)', async () => {
      mockWorkspaceService.getPreferences.mockReturnValue({
        worktree: { mode: 'always', location: 'project', autoCleanup: false },
      });
      mockGitService.getCurrentBranch.mockResolvedValue('develop');
      mockWorktreeService.prepare.mockResolvedValue('/project/.worktrees/develop-12345678');

      // No explicit branch in payload
      await gateway.handleCreate(basePayload, client);

      // assignBranch called in the "worktreePath but no explicit branch" path
      // The first call is from the worktree path (getCurrentBranch is called and 'develop' returned)
      expect(mockSessionService.assignBranch).toHaveBeenCalledWith(
        'session-1-1700000000000',
        'develop',
        '/project/.worktrees/develop-12345678'
      );
    });

    // Concurrency limit tests
    it('should reject session creation when at concurrency limit', async () => {
      const runningSessions = Array.from({ length: MAX_CONCURRENT_SESSIONS }, (_, i) =>
        createMockSession({ id: `session-${i}`, name: `Session ${i}`, terminalSessionId: i })
      );
      mockSessionService.getRunningSessions.mockReturnValue(runningSessions);
      mockSessionService.getIdleSessions.mockReturnValue([
        createMockSession({
          id: 'session-3',
          name: 'Idle Session',
          status: 'idle' as SessionStatus,
        }),
      ]);

      const result = await gateway.handleCreate(basePayload, client);

      expect(result.error).toContain('Session limit reached');
      expect(result.error).toContain(`${MAX_CONCURRENT_SESSIONS}/${MAX_CONCURRENT_SESSIONS}`);
      expect(result.idleSessions).toEqual(['Idle Session']);
      expect(mockSessionService.create).not.toHaveBeenCalled();
    });

    it('should allow session creation when under concurrency limit', async () => {
      const runningSessions = Array.from({ length: MAX_CONCURRENT_SESSIONS - 1 }, (_, i) =>
        createMockSession({ id: `session-${i}`, terminalSessionId: i })
      );
      mockSessionService.getRunningSessions.mockReturnValue(runningSessions);

      const result = await gateway.handleCreate(basePayload, client);

      expect(result.error).toBeUndefined();
      expect(mockSessionService.create).toHaveBeenCalled();
    });

    it('should return empty idleSessions array when no idle sessions exist at limit', async () => {
      const runningSessions = Array.from({ length: MAX_CONCURRENT_SESSIONS }, (_, i) =>
        createMockSession({ id: `session-${i}`, terminalSessionId: i })
      );
      mockSessionService.getRunningSessions.mockReturnValue(runningSessions);
      mockSessionService.getIdleSessions.mockReturnValue([]);

      const result = await gateway.handleCreate(basePayload, client);

      expect(result.error).toContain('Session limit reached');
      expect(result.idleSessions).toEqual([]);
    });
  });

  // ========================================================================
  // handleUpdate
  // ========================================================================

  describe('handleUpdate', () => {
    it('should apply all update fields and emit status', () => {
      const session = createMockSession();
      mockSessionService.get.mockReturnValue(session);

      const result = gateway.handleUpdate(
        {
          sessionId: 'session-1-1700000000000',
          updates: {
            name: 'Renamed',
            aiMode: 'aider',
            model: 'sonnet',
            systemPrompt: 'Be verbose',
            maxTokens: 4096,
            temperature: 0.7,
            mcpServers: ['srv-a', 'srv-b'],
          },
        },
        client
      );

      expect(session.name).toBe('Renamed');
      expect(session.aiMode).toBe('aider');
      expect(session.model).toBe('sonnet');
      expect(session.systemPrompt).toBe('Be verbose');
      expect(session.maxTokens).toBe(4096);
      expect(session.temperature).toBe(0.7);
      expect(session.mcpServers).toEqual(['srv-a', 'srv-b']);
      expect(session.lastActiveAt).toBeInstanceOf(Date);

      expect(server.emit).toHaveBeenCalledWith('session:status', {
        sessionId: 'session-1-1700000000000',
        status: 'idle',
        message: 'Session updated',
      });

      expect(result.session).toBe(session);
      expect(result.error).toBeUndefined();
    });

    it('should apply partial updates', () => {
      const session = createMockSession({ name: 'Original' });
      mockSessionService.get.mockReturnValue(session);

      gateway.handleUpdate(
        {
          sessionId: 'session-1-1700000000000',
          updates: { name: 'Updated' },
        },
        client
      );

      expect(session.name).toBe('Updated');
      // Other fields should remain unchanged
      expect(session.aiMode).toBe('claude-code');
    });

    it('should return error for non-existent session', () => {
      mockSessionService.get.mockReturnValue(undefined);

      const result = gateway.handleUpdate(
        {
          sessionId: 'nonexistent',
          updates: { name: 'Test' },
        },
        client
      );

      expect(result).toEqual({ error: 'Session not found: nonexistent' });
    });
  });

  // ========================================================================
  // handleRemove
  // ========================================================================

  describe('handleRemove', () => {
    it('should remove session successfully', async () => {
      mockSessionService.remove.mockResolvedValue(true);

      const result = await gateway.handleRemove({ sessionId: 'session-1' }, client);

      expect(mockSessionService.remove).toHaveBeenCalledWith('session-1');
      expect(result).toEqual({ success: true });
    });

    it('should return error when session not found', async () => {
      mockSessionService.remove.mockResolvedValue(false);

      const result = await gateway.handleRemove({ sessionId: 'nonexistent' }, client);

      expect(result).toEqual({
        success: false,
        error: 'Session not found: nonexistent',
      });
    });
  });

  // ========================================================================
  // handleList
  // ========================================================================

  describe('handleList', () => {
    it('should return sessions for a specific project', () => {
      const sessions = [createMockSession()];
      mockSessionService.getForProject.mockReturnValue(sessions);

      const result = gateway.handleList({ projectPath: '/project' }, client);

      expect(mockSessionService.getForProject).toHaveBeenCalledWith('/project');
      expect(result).toEqual(sessions);
    });

    it('should return all sessions when no projectPath', () => {
      const sessions = [
        createMockSession({ projectPath: '/project-a' }),
        createMockSession({ projectPath: '/project-b' }),
      ];
      mockSessionService.getAll.mockReturnValue(sessions);

      const result = gateway.handleList({}, client);

      expect(mockSessionService.getAll).toHaveBeenCalled();
      expect(result).toEqual(sessions);
    });

    it('should return all sessions when projectPath is empty string', () => {
      mockSessionService.getAll.mockReturnValue([]);

      const result = gateway.handleList({ projectPath: '' }, client);

      expect(mockSessionService.getAll).toHaveBeenCalled();
      expect(result).toEqual([]);
    });
  });

  // ========================================================================
  // Event handlers
  // ========================================================================

  describe('onSessionCreated', () => {
    it('should broadcast session:created event', () => {
      const session = createMockSession();

      gateway.onSessionCreated(session);

      expect(server.emit).toHaveBeenCalledWith('session:created', session);
    });
  });

  describe('onSessionStatus', () => {
    it('should broadcast session:status event', () => {
      const update = {
        sessionId: 'session-1',
        status: 'working' as SessionStatus,
        message: 'Processing...',
      };

      gateway.onSessionStatus(update);

      expect(server.emit).toHaveBeenCalledWith('session:status', update);
    });

    it('should broadcast with needsInputPrompt', () => {
      const update = {
        sessionId: 'session-1',
        status: 'needs_input' as SessionStatus,
        message: 'Approve changes?',
        needsInputPrompt: true,
      };

      gateway.onSessionStatus(update);

      expect(server.emit).toHaveBeenCalledWith('session:status', update);
    });
  });

  describe('onSessionRemoved', () => {
    it('should broadcast session:removed event', () => {
      const payload = { sessionId: 'session-1' };

      gateway.onSessionRemoved(payload);

      expect(server.emit).toHaveBeenCalledWith('session:removed', payload);
    });
  });
});
