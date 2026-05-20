import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import { Server, Socket } from 'socket.io';

// Mock ../plugin barrel to avoid electron-store import in test environment
jest.mock('../plugin', () => ({
  PluginRegistryService: jest.fn(),
}));

import { SessionGateway } from './session.gateway';
import { SessionService } from './session.service';
import { SessionLauncherService } from './session-launcher.service';
import { BackendSessionConfig } from './types';
import { TerminalGateway } from '../terminal/terminal.gateway';
import { PluginRegistryService } from '../plugin';
import type { SessionStatus } from '@omniscribe/shared';

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

function createMockSession(overrides?: Partial<BackendSessionConfig>): BackendSessionConfig {
  return {
    id: 'session-1-1700000000000',
    name: 'Session 1',
    workingDirectory: '/project',
    aiMode: 'claude',
    createdAt: new Date('2024-01-01'),
    lastActiveAt: new Date('2024-01-01'),
    projectPath: '/project',
    status: 'idle' as SessionStatus,
    ...overrides,
  };
}

const mockSessionService = {
  create: jest.fn(),
  get: jest.fn(),
  getAll: jest.fn(),
  getForProject: jest.fn(),
  remove: jest.fn(),
  update: jest.fn(),
};

const mockSessionLauncherService = {
  launch: jest.fn(),
};

const mockTerminalGateway = {
  registerClientSession: jest.fn(),
};

const mockPluginRegistry = {
  isPluginMode: jest.fn().mockReturnValue(true),
  isValidMode: jest
    .fn()
    .mockImplementation((mode: string) => mode === 'claude' || mode === 'plain'),
  getProvider: jest.fn().mockReturnValue({
    capabilities: { supportsSessionHistory: true },
    getSessionReader: jest.fn().mockReturnValue({
      readSessionsIndex: jest.fn().mockResolvedValue([]),
    }),
  }),
  getProviderEntry: jest.fn().mockReturnValue(undefined),
  listProviders: jest.fn().mockReturnValue([]),
};

describe('SessionGateway', () => {
  let gateway: SessionGateway;
  let server: Server;
  let client: Socket;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([])],
      providers: [
        SessionGateway,
        { provide: SessionService, useValue: mockSessionService },
        { provide: SessionLauncherService, useValue: mockSessionLauncherService },
        { provide: TerminalGateway, useValue: mockTerminalGateway },
        { provide: PluginRegistryService, useValue: mockPluginRegistry },
      ],
    }).compile();

    gateway = module.get<SessionGateway>(SessionGateway);
    server = createMockServer();
    gateway.server = server;
    client = createMockSocket();
  });

  describe('afterInit', () => {
    it('should not throw when called', () => {
      expect(() => gateway.afterInit()).not.toThrow();
    });
  });

  describe('handleCreate', () => {
    const basePayload = {
      mode: 'claude' as const,
      projectPath: '/project',
    };

    beforeEach(() => {
      const session = createMockSession();
      mockSessionLauncherService.launch.mockResolvedValue({
        session,
        terminalSessionId: 1,
      });
    });

    it('should delegate to launcher and return the session', async () => {
      const result = await gateway.handleCreate(basePayload, client);

      expect(mockSessionLauncherService.launch).toHaveBeenCalledWith(
        expect.objectContaining({
          projectPath: '/project',
          mode: 'claude',
          source: 'gateway',
        })
      );
      expect(client.join).toHaveBeenCalledWith('terminal:1');
      expect(mockTerminalGateway.registerClientSession).toHaveBeenCalledWith('client-1', 1);
      expect(result.session).toBeDefined();
      expect(result.error).toBeUndefined();
    });

    it('should pass optional fields through createOptions', async () => {
      const payload = {
        ...basePayload,
        name: 'My Session',
        workingDirectory: '/other/path',
        model: 'opus',
        systemPrompt: 'Be concise',
        mcpServers: ['server-a'],
      };

      await gateway.handleCreate(payload, client);

      expect(mockSessionLauncherService.launch).toHaveBeenCalledWith(
        expect.objectContaining({
          projectPath: '/project',
          mode: 'claude',
          name: 'My Session',
          createOptions: expect.objectContaining({
            name: 'My Session',
            workingDirectory: '/other/path',
            model: 'opus',
            systemPrompt: 'Be concise',
            mcpServers: ['server-a'],
          }),
        })
      );
    });

    it('should propagate launcher errors', async () => {
      mockSessionLauncherService.launch.mockResolvedValue({ error: 'CLI not found' });

      const result = await gateway.handleCreate(basePayload, client);

      expect(result).toEqual({ error: 'CLI not found' });
    });

    it('should propagate idleSessions on concurrency-limit error', async () => {
      mockSessionLauncherService.launch.mockResolvedValue({
        error: 'Session limit reached',
        idleSessions: ['Idle 1', 'Idle 2'],
      });

      const result = await gateway.handleCreate(basePayload, client);

      expect(result.error).toBe('Session limit reached');
      expect(result.idleSessions).toEqual(['Idle 1', 'Idle 2']);
    });

    it('should propagate worktree warning when launch succeeds with a warning', async () => {
      const session = createMockSession();
      mockSessionLauncherService.launch.mockResolvedValue({
        session,
        terminalSessionId: 1,
        worktreeWarning: 'Worktree creation failed: disk full',
      });

      const result = await gateway.handleCreate(basePayload, client);

      expect(result.session).toBeDefined();
      expect(result.warning).toContain('disk full');
    });

    it('should not join terminal room when terminalSessionId is undefined', async () => {
      const session = createMockSession();
      mockSessionLauncherService.launch.mockResolvedValue({ session });

      await gateway.handleCreate(basePayload, client);

      expect(client.join).not.toHaveBeenCalled();
      expect(mockTerminalGateway.registerClientSession).not.toHaveBeenCalled();
    });

    it('should reject invalid workingDirectory before launching', async () => {
      const result = await gateway.handleCreate(
        { ...basePayload, workingDirectory: 'relative/path' },
        client
      );

      expect(result.error).toContain('absolute path');
      expect(mockSessionLauncherService.launch).not.toHaveBeenCalled();
    });
  });

  describe('handleResume', () => {
    it('should delegate to launcher with resume metadata', async () => {
      const session = createMockSession({ isResumed: true });
      mockSessionLauncherService.launch.mockResolvedValue({
        session,
        terminalSessionId: 1,
      });

      const result = await gateway.handleResume(
        { claudeSessionId: 'claude-abc-12345678', projectPath: '/project' },
        client
      );

      expect(mockSessionLauncherService.launch).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: 'claude',
          source: 'gateway',
          createOptions: expect.objectContaining({ resumeSessionId: 'claude-abc-12345678' }),
        })
      );
      expect(result.session).toBeDefined();
    });
  });

  describe('handleFork', () => {
    it('should delegate to launcher with fork metadata', async () => {
      const session = createMockSession({ forkSessionId: 'claude-abc-12345678' });
      mockSessionLauncherService.launch.mockResolvedValue({
        session,
        terminalSessionId: 1,
      });

      await gateway.handleFork(
        { claudeSessionId: 'claude-abc-12345678', projectPath: '/project' },
        client
      );

      expect(mockSessionLauncherService.launch).toHaveBeenCalledWith(
        expect.objectContaining({
          createOptions: expect.objectContaining({ forkSessionId: 'claude-abc-12345678' }),
        })
      );
    });
  });

  describe('handleContinueLast', () => {
    it('should delegate to launcher with continueLastSession=true', async () => {
      const session = createMockSession({ continueLastSession: true });
      mockSessionLauncherService.launch.mockResolvedValue({
        session,
        terminalSessionId: 1,
      });

      await gateway.handleContinueLast({ projectPath: '/project' }, client);

      expect(mockSessionLauncherService.launch).toHaveBeenCalledWith(
        expect.objectContaining({
          createOptions: expect.objectContaining({ continueLastSession: true }),
        })
      );
    });
  });

  describe('handleUpdate', () => {
    it('should delegate to sessionService.update and return result', () => {
      const session = createMockSession({ name: 'Renamed' });
      mockSessionService.update.mockReturnValue(session);

      const result = gateway.handleUpdate(
        { sessionId: 'session-1-1700000000000', updates: { name: 'Renamed' } },
        client
      );

      expect(mockSessionService.update).toHaveBeenCalledWith('session-1-1700000000000', {
        name: 'Renamed',
      });
      expect(result.session).toBe(session);
    });

    it('should return error for non-existent session', () => {
      mockSessionService.update.mockReturnValue(undefined);

      const result = gateway.handleUpdate(
        { sessionId: 'nonexistent', updates: { name: 'Test' } },
        client
      );

      expect(result).toEqual({ error: 'Session not found: nonexistent' });
    });
  });

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

      expect(result).toEqual({ success: false, error: 'Session not found: nonexistent' });
    });
  });

  describe('handleList', () => {
    it('should return sessions for a specific project', () => {
      const sessions = [createMockSession()];
      mockSessionService.getForProject.mockReturnValue(sessions);

      const result = gateway.handleList({ projectPath: '/project' }, client);

      expect(mockSessionService.getForProject).toHaveBeenCalledWith('/project');
      expect(result).toEqual(sessions);
    });

    it('should return all sessions when no projectPath', () => {
      const sessions = [createMockSession()];
      mockSessionService.getAll.mockReturnValue(sessions);

      const result = gateway.handleList({}, client);

      expect(mockSessionService.getAll).toHaveBeenCalled();
      expect(result).toEqual(sessions);
    });
  });

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
  });

  describe('onSessionRemoved', () => {
    it('should broadcast session:removed event', () => {
      gateway.onSessionRemoved({ sessionId: 'session-1' });
      expect(server.emit).toHaveBeenCalledWith('session:removed', { sessionId: 'session-1' });
    });
  });

  describe('onClaudeSessionIdCaptured', () => {
    it('should broadcast claude session ID captured event', () => {
      const payload = { sessionId: 'session-1', claudeSessionId: 'claude-abc-123' };
      gateway.onClaudeSessionIdCaptured(payload);
      expect(server.emit).toHaveBeenCalledWith('session:claude-id-captured', payload);
    });
  });

  describe('handleGetHistory', () => {
    it('should return session history via plugin provider', async () => {
      const mockReader = {
        readSessionsIndex: jest.fn().mockResolvedValue([
          {
            sessionId: 'abc-123',
            fullPath: '/path/to/abc-123.jsonl',
            fileMtime: Date.now(),
            firstPrompt: 'Help with tests',
            summary: '',
            messageCount: 0,
            created: '2024-01-01T00:00:00Z',
            modified: '2024-01-01T00:00:00Z',
            gitBranch: 'main',
            projectPath: '/project',
            isSidechain: false,
          },
        ]),
      };
      mockPluginRegistry.isPluginMode.mockReturnValue(true);
      mockPluginRegistry.getProvider.mockReturnValue({
        getSessionReader: jest.fn().mockReturnValue(mockReader),
      });

      const result = await gateway.handleGetHistory({ projectPath: '/project' }, client);

      expect(result.sessions).toHaveLength(1);
      expect(result.error).toBeUndefined();
    });

    it('should return error when no provider available', async () => {
      mockPluginRegistry.isPluginMode.mockReturnValue(false);

      const result = await gateway.handleGetHistory({ projectPath: '/project' }, client);

      expect(result.sessions).toEqual([]);
      expect(result.error).toBe('No session history provider available');
    });
  });

  describe('onSessionHookEnd', () => {
    it('should broadcast session:hook-ended when session_id present', () => {
      gateway.onSessionHookEnd({ session_id: 'abc-123' });
      expect(server.emit).toHaveBeenCalledWith('session:hook-ended', {
        claudeSessionId: 'abc-123',
      });
    });

    it('should not broadcast when session_id is missing', () => {
      gateway.onSessionHookEnd({});
      expect(server.emit).not.toHaveBeenCalledWith('session:hook-ended', expect.anything());
    });
  });
});
