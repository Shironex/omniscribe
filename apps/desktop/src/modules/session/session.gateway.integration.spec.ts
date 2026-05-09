/**
 * Session Gateway Integration Tests
 *
 * Tests session create, list, update, remove, and status broadcast flows
 * with a real NestJS application and real socket.io connections.
 * All service dependencies are mocked at the service boundary.
 */
import { Module, INestApplication } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Socket } from 'socket.io-client';
import { createTestApp, getAppPort } from '../../../test/integration/helpers/create-test-app';
import {
  createSocketClient,
  connectClient,
  waitForEvent,
  emitWithAck,
} from '../../../test/integration/helpers/socket-client';

// Mock ../plugin barrel to avoid electron-store import in test environment
jest.mock('../plugin', () => ({
  PluginRegistryService: jest.fn(),
}));

import { SessionGateway } from './session.gateway';
import { SessionService } from './session.service';
import { SessionLauncherService } from './session-launcher.service';
import { TerminalGateway } from '../terminal/terminal.gateway';
import { WorktreeService } from '../git/worktree.service';
import { GitService } from '../git/git.service';
import { WorkspaceService } from '../workspace/workspace.service';
import { PluginRegistryService } from '../plugin';

const mockSession = {
  id: 'session-1-123',
  name: 'Test Session',
  aiMode: 'claude' as const,
  projectPath: '/tmp/test-project',
  workingDirectory: '/tmp/test-project',
  status: 'idle' as const,
  createdAt: new Date(),
  lastActiveAt: new Date(),
  terminalSessionId: 1,
};

describe('SessionGateway (integration)', () => {
  let app: INestApplication;
  let client: Socket;
  let mockSessionService: Record<string, jest.Mock>;
  let mockSessionLauncherService: Record<string, jest.Mock>;

  beforeAll(async () => {
    mockSessionService = {
      create: jest.fn().mockReturnValue(mockSession),
      get: jest.fn().mockReturnValue({ ...mockSession }),
      getAll: jest.fn().mockReturnValue([mockSession]),
      getForProject: jest.fn().mockReturnValue([mockSession]),
      getRunningSessions: jest.fn().mockReturnValue([]),
      getIdleSessions: jest.fn().mockReturnValue([]),
      remove: jest.fn().mockResolvedValue(true),
      updateStatus: jest.fn().mockReturnValue(mockSession),
      assignBranch: jest.fn().mockReturnValue(mockSession),
      stopSession: jest.fn().mockResolvedValue(true),
      writeToSession: jest.fn().mockReturnValue(true),
      resizeSession: jest.fn().mockReturnValue(true),
      isSessionRunning: jest.fn().mockReturnValue(true),
    };

    mockSessionLauncherService = {
      launchSession: jest.fn().mockResolvedValue({ success: true, terminalSessionId: 1 }),
    };

    const mockTerminalGateway = {
      registerClientSession: jest.fn(),
      getClientSocket: jest.fn(),
    };

    const mockWorktreeService = {
      prepare: jest.fn().mockResolvedValue('/tmp/worktree'),
      list: jest.fn().mockResolvedValue([]),
      cleanup: jest.fn().mockResolvedValue(undefined),
    };

    const mockGitService = {
      getCurrentBranch: jest.fn().mockResolvedValue('main'),
      getBranches: jest.fn().mockResolvedValue([]),
    };

    const mockWorkspaceService = {
      getPreferences: jest.fn().mockReturnValue({ theme: 'dark' }),
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

    // Build a minimal module with just the SessionGateway and mocked providers
    @Module({
      providers: [
        SessionGateway,
        { provide: SessionService, useValue: mockSessionService },
        { provide: SessionLauncherService, useValue: mockSessionLauncherService },
        { provide: TerminalGateway, useValue: mockTerminalGateway },
        { provide: WorktreeService, useValue: mockWorktreeService },
        { provide: GitService, useValue: mockGitService },
        { provide: WorkspaceService, useValue: mockWorkspaceService },
        { provide: PluginRegistryService, useValue: mockPluginRegistry },
      ],
    })
    class TestSessionModule {}

    app = await createTestApp({
      modules: [TestSessionModule],
    });
  });

  afterAll(async () => {
    client?.disconnect();
    await app?.close();
  });

  beforeEach(async () => {
    client = createSocketClient(getAppPort(app));
    await connectClient(client);
    jest.clearAllMocks();
    // Restore default mock return values after clearAllMocks
    mockSessionService.create.mockReturnValue(mockSession);
    mockSessionService.get.mockReturnValue({ ...mockSession });
    mockSessionService.getAll.mockReturnValue([mockSession]);
    mockSessionService.getForProject.mockReturnValue([mockSession]);
    mockSessionService.getRunningSessions.mockReturnValue([]);
    mockSessionService.remove.mockResolvedValue(true);
    mockSessionLauncherService.launchSession.mockResolvedValue({
      success: true,
      terminalSessionId: 1,
    });
  });

  afterEach(() => {
    client?.disconnect();
  });

  it('should handle session:create and return session data', async () => {
    const response = await emitWithAck<{ session?: any; error?: string }>(
      client,
      'session:create',
      {
        mode: 'claude',
        projectPath: '/tmp/test-project',
        name: 'Test Session',
      }
    );

    expect(response.session).toBeDefined();
    expect(response.error).toBeUndefined();
    expect(mockSessionService.create).toHaveBeenCalledWith(
      'claude',
      '/tmp/test-project',
      expect.objectContaining({ name: 'Test Session' })
    );
  });

  it('should handle session:list and return all sessions', async () => {
    const response = await emitWithAck<any[]>(client, 'session:list', {});

    expect(Array.isArray(response)).toBe(true);
    expect(response.length).toBe(1);
    expect(mockSessionService.getAll).toHaveBeenCalled();
  });

  it('should handle session:list with projectPath filter', async () => {
    const response = await emitWithAck<any[]>(client, 'session:list', {
      projectPath: '/tmp/test-project',
    });

    expect(Array.isArray(response)).toBe(true);
    expect(mockSessionService.getForProject).toHaveBeenCalledWith('/tmp/test-project');
  });

  it('should handle session:remove and return success', async () => {
    const response = await emitWithAck<{ success: boolean }>(client, 'session:remove', {
      sessionId: 'session-1-123',
    });

    expect(response.success).toBe(true);
    expect(mockSessionService.remove).toHaveBeenCalledWith('session-1-123');
  });

  it('should broadcast session:status when session.status event is emitted', async () => {
    const statusPromise = waitForEvent<{
      sessionId: string;
      status: string;
      message?: string;
    }>(client, 'session:status');

    const eventEmitter = app.get(EventEmitter2);
    eventEmitter.emit('session.status', {
      sessionId: 'session-1-123',
      status: 'working',
      message: 'Processing...',
    });

    const status = await statusPromise;
    expect(status.sessionId).toBe('session-1-123');
    expect(status.status).toBe('working');
    expect(status.message).toBe('Processing...');
  });

  it('should broadcast session:created when session.created event is emitted', async () => {
    const createdPromise = waitForEvent<any>(client, 'session:created');

    const eventEmitter = app.get(EventEmitter2);
    eventEmitter.emit('session.created', mockSession);

    const created = await createdPromise;
    expect(created.id).toBe('session-1-123');
    expect(created.name).toBe('Test Session');
  });

  it('should broadcast session:removed when session.removed event is emitted', async () => {
    const removedPromise = waitForEvent<{ sessionId: string }>(client, 'session:removed');

    const eventEmitter = app.get(EventEmitter2);
    eventEmitter.emit('session.removed', { sessionId: 'session-1-123' });

    const removed = await removedPromise;
    expect(removed.sessionId).toBe('session-1-123');
  });
});
