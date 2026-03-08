import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';

// Mock ../plugin barrel to avoid electron-store import in test environment
jest.mock('../plugin', () => ({
  PluginRegistryService: jest.fn(),
}));

import { SessionLauncherService } from './session-launcher.service';
import { SessionService } from './session.service';
import { TerminalService } from '../terminal/terminal.service';
import { McpWriterService, McpDiscoveryService } from '../mcp';
import { GitBaseService } from '../git';
import { PluginRegistryService } from '../plugin';
import { CliCommandService } from './cli-command.service';
import { ClaudeSessionTrackerService } from './claude-session-tracker.service';
import type { BackendSessionConfig } from './types';
import { InternalSessionEvents } from '../shared/events';

function createMockSession(overrides?: Partial<BackendSessionConfig>): BackendSessionConfig {
  return {
    id: 'session-1-1700000000000',
    name: 'Session 1',
    workingDirectory: '/project',
    aiMode: 'claude',
    createdAt: new Date('2024-01-01'),
    lastActiveAt: new Date('2024-01-01'),
    projectPath: '/project',
    status: 'idle',
    ...overrides,
  } as BackendSessionConfig;
}

const mockProvider = {
  capabilities: {
    supportsMcp: true,
    supportsUsage: true,
    supportsSessionHistory: true,
    supportedOperations: new Set(['resume', 'fork', 'continue']),
  },
  readSessionHistory: jest.fn().mockResolvedValue([]),
  getHookManager: jest.fn().mockReturnValue({
    registerHooks: jest.fn().mockResolvedValue(undefined),
    startWatching: jest.fn(),
  }),
  getSessionTracker: jest.fn().mockReturnValue({
    pollForNewSession: jest.fn().mockResolvedValue(null),
  }),
};

const mockPluginRegistry = {
  isPluginMode: jest.fn().mockReturnValue(true),
  isValidMode: jest
    .fn()
    .mockImplementation((mode: string) => mode === 'claude' || mode === 'plain'),
  getProvider: jest.fn().mockReturnValue(mockProvider),
  getProviderEntry: jest.fn().mockReturnValue(undefined),
  listProviders: jest.fn().mockReturnValue([]),
};

describe('SessionLauncherService', () => {
  let service: SessionLauncherService;
  let sessionService: jest.Mocked<SessionService>;
  let terminalService: jest.Mocked<TerminalService>;
  let mcpWriterService: jest.Mocked<McpWriterService>;
  let mcpDiscoveryService: jest.Mocked<McpDiscoveryService>;
  let cliCommandService: jest.Mocked<CliCommandService>;
  let claudeSessionTracker: jest.Mocked<ClaudeSessionTrackerService>;
  let eventEmitter: jest.Mocked<EventEmitter2>;

  beforeEach(async () => {
    sessionService = {
      get: jest.fn(),
      updateStatus: jest.fn(),
      registerTerminal: jest.fn(),
      clearTerminalRef: jest.fn(),
      setClaudeSessionId: jest.fn(),
    } as unknown as jest.Mocked<SessionService>;

    terminalService = {
      spawnCommand: jest.fn().mockReturnValue(1),
      hasSession: jest.fn().mockReturnValue(false),
    } as unknown as jest.Mocked<TerminalService>;

    mcpWriterService = {
      writeConfig: jest.fn().mockResolvedValue(undefined),
      generateProjectHash: jest.fn().mockReturnValue('abc123'),
    } as unknown as jest.Mocked<McpWriterService>;

    mcpDiscoveryService = {
      discoverServers: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<McpDiscoveryService>;

    cliCommandService = {
      getCliConfig: jest.fn().mockReturnValue({
        command: 'claude',
        args: ['--model', 'opus'],
      }),
      getAiModeName: jest.fn().mockReturnValue('Claude'),
    } as unknown as jest.Mocked<CliCommandService>;

    claudeSessionTracker = {
      refreshActiveSessionsSnapshot: jest.fn(),
    } as unknown as jest.Mocked<ClaudeSessionTrackerService>;

    eventEmitter = {
      emit: jest.fn(),
    } as unknown as jest.Mocked<EventEmitter2>;

    // Reset plugin registry mock
    mockPluginRegistry.isPluginMode.mockReturnValue(true);
    mockPluginRegistry.getProvider.mockReturnValue(mockProvider);

    // Reset provider mocks
    mockProvider.readSessionHistory.mockResolvedValue([]);
    mockProvider.getHookManager.mockReturnValue({
      registerHooks: jest.fn().mockResolvedValue(undefined),
      startWatching: jest.fn(),
    });
    mockProvider.getSessionTracker.mockReturnValue({
      pollForNewSession: jest.fn().mockResolvedValue(null),
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SessionLauncherService,
        { provide: SessionService, useValue: sessionService },
        { provide: TerminalService, useValue: terminalService },
        { provide: McpWriterService, useValue: mcpWriterService },
        { provide: McpDiscoveryService, useValue: mcpDiscoveryService },
        {
          provide: GitBaseService,
          useValue: { execGit: jest.fn().mockResolvedValue({ stdout: 'abc123\n', stderr: '' }) },
        },
        { provide: CliCommandService, useValue: cliCommandService },
        { provide: ClaudeSessionTrackerService, useValue: claudeSessionTracker },
        { provide: PluginRegistryService, useValue: mockPluginRegistry },
        { provide: EventEmitter2, useValue: eventEmitter },
      ],
    }).compile();

    service = module.get<SessionLauncherService>(SessionLauncherService);
  });

  describe('launchSession', () => {
    it('should discover MCP servers and spawn a terminal', async () => {
      const session = createMockSession();
      sessionService.get.mockReturnValue(session);

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
      sessionService.get.mockReturnValue(undefined);

      const result = await service.launchSession('nonexistent', '/project', '/worktree', 'claude');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Session not found');
    });

    it('should prevent launching when terminal already active', async () => {
      const session = createMockSession({ terminalSessionId: 1 });
      sessionService.get.mockReturnValue(session);
      terminalService.hasSession.mockReturnValue(true);

      const result = await service.launchSession(session.id, '/project', '/worktree', 'claude');

      expect(result.success).toBe(false);
      expect(result.error).toContain('already has an active terminal');
    });

    it('should handle launch errors gracefully', async () => {
      const session = createMockSession();
      sessionService.get.mockReturnValue(session);
      terminalService.spawnCommand.mockImplementation(() => {
        throw new Error('PTY spawn failed');
      });

      const result = await service.launchSession(session.id, '/project', '/worktree', 'claude');

      expect(result.success).toBe(false);
      expect(result.error).toBe('PTY spawn failed');
      expect(sessionService.updateStatus).toHaveBeenCalledWith(
        session.id,
        'error',
        'Launch failed: PTY spawn failed'
      );
    });
  });

  describe('launchSession with plugin delegation', () => {
    it('should register hooks through provider via hasHookManager type guard', async () => {
      const session = createMockSession();
      sessionService.get.mockReturnValue(session);
      const hookMgr = {
        registerHooks: jest.fn().mockResolvedValue(undefined),
        startWatching: jest.fn(),
      };
      mockProvider.getHookManager.mockReturnValue(hookMgr);

      await service.launchSession(session.id, '/project', '/worktree', 'claude');

      expect(mockPluginRegistry.getProvider).toHaveBeenCalledWith('claude');
      expect(hookMgr.registerHooks).toHaveBeenCalledWith('/project');
      expect(hookMgr.startWatching).toHaveBeenCalled();
    });

    it('should not register hooks for plain mode sessions', async () => {
      const session = createMockSession({ aiMode: 'plain' });
      sessionService.get.mockReturnValue(session);
      cliCommandService.getCliConfig.mockReturnValue({
        command: '/bin/bash',
        args: ['-l'],
      });
      cliCommandService.getAiModeName.mockReturnValue('Plain Terminal');

      await service.launchSession(session.id, '/project', '/worktree', 'plain');

      // Should not call getProvider for 'plain' mode (plain is filtered out)
      expect(mockProvider.getHookManager).not.toHaveBeenCalled();
    });

    it('should write MCP config when provider supports MCP', async () => {
      const session = createMockSession();
      sessionService.get.mockReturnValue(session);

      await service.launchSession(session.id, '/project', '/worktree', 'claude');

      expect(mcpDiscoveryService.discoverServers).toHaveBeenCalledWith('/project');
      expect(mcpWriterService.writeConfig).toHaveBeenCalledWith(
        '/worktree',
        session.id,
        '/project',
        []
      );
    });

    it('should snapshot sessions via provider for non-resumed sessions', async () => {
      const session = createMockSession();
      sessionService.get.mockReturnValue(session);

      await service.launchSession(session.id, '/project', '/worktree', 'claude');

      expect(mockProvider.readSessionHistory).toHaveBeenCalledWith('/project');
    });

    it('should snapshot sessions for fork sessions', async () => {
      const session = createMockSession({ forkSessionId: 'fork-id' });
      sessionService.get.mockReturnValue(session);

      await service.launchSession(session.id, '/project', '/worktree', 'claude');

      expect(mockProvider.readSessionHistory).toHaveBeenCalledWith('/project');
    });

    it('should snapshot sessions for continue-last sessions', async () => {
      const session = createMockSession({ continueLastSession: true });
      sessionService.get.mockReturnValue(session);

      await service.launchSession(session.id, '/project', '/worktree', 'claude');

      expect(mockProvider.readSessionHistory).toHaveBeenCalledWith('/project');
    });

    it('should skip snapshot for resumed sessions without fork or continue', async () => {
      const session = createMockSession({ isResumed: true });
      sessionService.get.mockReturnValue(session);

      await service.launchSession(session.id, '/project', '/worktree', 'claude');

      expect(mockProvider.readSessionHistory).not.toHaveBeenCalled();
    });

    it('should delegate to plugin provider for Claude session launch', async () => {
      const session = createMockSession();
      sessionService.get.mockReturnValue(session);

      const result = await service.launchSession(session.id, '/project', '/worktree', 'claude');

      expect(result.success).toBe(true);
      // Verify the plugin registry was consulted
      expect(mockPluginRegistry.isPluginMode).toHaveBeenCalledWith('claude');
      expect(mockPluginRegistry.getProvider).toHaveBeenCalledWith('claude');
    });

    it('should emit CLAUDE_ID_CAPTURED and refresh snapshot when tracker finds new session', async () => {
      const session = createMockSession();
      sessionService.get.mockReturnValue(session);
      mockProvider.readSessionHistory.mockResolvedValue([
        { sessionId: 'old-1' },
        { sessionId: 'old-2' },
      ]);
      mockProvider.getSessionTracker.mockReturnValue({
        pollForNewSession: jest.fn().mockResolvedValue('new-session-id'),
      });

      await service.launchSession(session.id, '/project', '/worktree', 'claude');

      // Wait for the fire-and-forget promise to resolve
      await new Promise(resolve => process.nextTick(resolve));
      await new Promise(resolve => process.nextTick(resolve));

      expect(sessionService.setClaudeSessionId).toHaveBeenCalledWith(session.id, 'new-session-id');
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        InternalSessionEvents.CLAUDE_ID_CAPTURED,
        expect.objectContaining({
          sessionId: session.id,
          claudeSessionId: 'new-session-id',
        })
      );
      expect(claudeSessionTracker.refreshActiveSessionsSnapshot).toHaveBeenCalledWith(
        'claude-id-captured'
      );
    });

    it('should handle snapshot failure gracefully', async () => {
      const session = createMockSession();
      sessionService.get.mockReturnValue(session);
      mockProvider.readSessionHistory.mockRejectedValue(new Error('Snapshot failed'));

      const result = await service.launchSession(session.id, '/project', '/worktree', 'claude');

      // Should still succeed -- snapshot failure is non-fatal
      expect(result.success).toBe(true);
    });
  });
});
