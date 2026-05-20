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
import { GitBaseService, GitService, WorktreeService } from '../git';
import { WorkspaceService } from '../workspace';
import { PluginRegistryService } from '../plugin';
import { CliCommandService } from './cli-command.service';
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
  let eventEmitter: jest.Mocked<EventEmitter2>;
  let worktreeService: { prepare: jest.Mock };
  let gitService: { getCurrentBranch: jest.Mock };
  let workspaceService: { getPreferences: jest.Mock };

  beforeEach(async () => {
    sessionService = {
      get: jest.fn(),
      create: jest.fn(),
      updateStatus: jest.fn(),
      registerTerminal: jest.fn(),
      clearTerminalRef: jest.fn(),
      setClaudeSessionId: jest.fn(),
      assignBranch: jest.fn(),
      getRunningSessions: jest.fn().mockReturnValue([]),
      getIdleSessions: jest.fn().mockReturnValue([]),
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
        { provide: PluginRegistryService, useValue: mockPluginRegistry },
        { provide: EventEmitter2, useValue: eventEmitter },
        {
          provide: WorktreeService,
          useValue: (worktreeService = {
            prepare: jest.fn().mockResolvedValue('/worktree'),
          }),
        },
        {
          provide: GitService,
          useValue: (gitService = { getCurrentBranch: jest.fn().mockResolvedValue('main') }),
        },
        {
          provide: WorkspaceService,
          useValue: (workspaceService = {
            getPreferences: jest
              .fn()
              .mockReturnValue({
                worktree: { mode: 'never' },
                session: { skipPermissions: false },
              }),
          }),
        },
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

    it('should emit CLAUDE_ID_CAPTURED when tracker finds new session', async () => {
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

  describe('launch (top-level flow)', () => {
    beforeEach(() => {
      const session = createMockSession();
      (sessionService.create as jest.Mock).mockReturnValue(session);
      sessionService.get.mockReturnValue(session);
    });

    it('should reject invalid mode before creating a session', async () => {
      mockPluginRegistry.isValidMode.mockReturnValue(false);

      const result = await service.launch({
        projectPath: '/project',
        mode: 'unknown',
        source: 'deeplink',
      });

      expect(result.error).toContain('Invalid AI mode');
      expect(sessionService.create).not.toHaveBeenCalled();
      mockPluginRegistry.isValidMode.mockImplementation(
        (mode: string) => mode === 'claude' || mode === 'plain'
      );
    });

    it('should reject invalid project path', async () => {
      const result = await service.launch({
        projectPath: 'relative/path',
        mode: 'claude',
        source: 'deeplink',
      });

      expect(result.error).toContain('absolute path');
      expect(sessionService.create).not.toHaveBeenCalled();
    });

    it('should reject name exceeding MAX_SESSION_NAME_LENGTH', async () => {
      const result = await service.launch({
        projectPath: '/project',
        mode: 'claude',
        name: 'x'.repeat(300),
        source: 'deeplink',
      });

      expect(result.error).toContain('exceeds maximum length');
    });

    it('should reject when concurrency limit is reached', async () => {
      const running = Array.from({ length: 12 }, (_, i) => ({ id: `s-${i}`, name: `S${i}` }));
      sessionService.getRunningSessions.mockReturnValue(running as never);
      sessionService.getIdleSessions.mockReturnValue([{ name: 'Idle 1' }] as never);

      const result = await service.launch({
        projectPath: '/project',
        mode: 'claude',
        source: 'gateway',
      });

      expect(result.error).toContain('Session limit reached');
      expect(result.idleSessions).toEqual(['Idle 1']);
    });

    it('should skip worktree setup when mode=never', async () => {
      workspaceService.getPreferences.mockReturnValue({ worktree: { mode: 'never' } });

      const result = await service.launch({
        projectPath: '/project',
        mode: 'claude',
        source: 'deeplink',
      });

      expect(worktreeService.prepare).not.toHaveBeenCalled();
      expect(gitService.getCurrentBranch).not.toHaveBeenCalled();
      expect(result.session).toBeDefined();
    });

    it('should create an isolated worktree when mode=always', async () => {
      workspaceService.getPreferences.mockReturnValue({
        worktree: { mode: 'always', location: 'project', autoCleanup: false },
      });
      gitService.getCurrentBranch.mockResolvedValue('main');
      worktreeService.prepare.mockResolvedValue('/project/.worktrees/main-deadbeef');

      const result = await service.launch({
        projectPath: '/project',
        mode: 'claude',
        source: 'gateway',
      });

      expect(worktreeService.prepare).toHaveBeenCalledWith(
        '/project',
        expect.stringMatching(/^main-/),
        'project',
        'main'
      );
      expect(result.session).toBeDefined();
    });

    it('should create a worktree for non-current branch when mode=branch', async () => {
      workspaceService.getPreferences.mockReturnValue({
        worktree: { mode: 'branch', location: 'project', autoCleanup: false },
      });
      gitService.getCurrentBranch.mockResolvedValue('main');
      worktreeService.prepare.mockResolvedValue('/project/.worktrees/feature-x');

      await service.launch({
        projectPath: '/project',
        mode: 'claude',
        branch: 'feature-x',
        source: 'deeplink',
      });

      expect(worktreeService.prepare).toHaveBeenCalledWith(
        '/project',
        'feature-x',
        'project',
        'main'
      );
    });

    it('should fall back to project dir and return a warning when worktree creation fails', async () => {
      workspaceService.getPreferences.mockReturnValue({
        worktree: { mode: 'always', location: 'project', autoCleanup: false },
      });
      gitService.getCurrentBranch.mockResolvedValue('main');
      worktreeService.prepare.mockRejectedValue(new Error('disk full'));

      const result = await service.launch({
        projectPath: '/project',
        mode: 'claude',
        source: 'gateway',
      });

      expect(result.session).toBeDefined();
      expect(result.worktreeWarning).toContain('disk full');
    });

    it('should still launch and warn when getCurrentBranch fails', async () => {
      workspaceService.getPreferences.mockReturnValue({
        worktree: { mode: 'branch', location: 'project', autoCleanup: false },
      });
      gitService.getCurrentBranch.mockRejectedValue(new Error('not a git repo'));

      const result = await service.launch({
        projectPath: '/project',
        mode: 'claude',
        source: 'deeplink',
      });

      expect(worktreeService.prepare).not.toHaveBeenCalled();
      expect(result.session).toBeDefined();
      expect(result.worktreeWarning).toContain('not a git repo');
    });

    it('should propagate launch errors from launchSession', async () => {
      workspaceService.getPreferences.mockReturnValue({ worktree: { mode: 'never' } });
      terminalService.spawnCommand.mockImplementation(() => {
        throw new Error('PTY spawn failed');
      });

      const result = await service.launch({
        projectPath: '/project',
        mode: 'claude',
        source: 'deeplink',
      });

      expect(result.error).toBe('PTY spawn failed');
    });
  });
});
