import { Test, TestingModule } from '@nestjs/testing';
import { SessionLauncherService } from './session-launcher.service';
import { SessionService } from './session.service';
import { TerminalService } from '../terminal/terminal.service';
import { McpWriterService, McpDiscoveryService } from '../mcp';
import { CliCommandService } from './cli-command.service';
import { ClaudeSessionReaderService } from './claude-session-reader.service';
import { HookManagerService } from './hook-manager.service';
import { ClaudeSessionTrackerService } from './claude-session-tracker.service';
import type { BackendSessionConfig } from './types';

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

describe('SessionLauncherService', () => {
  let service: SessionLauncherService;
  let sessionService: jest.Mocked<SessionService>;
  let terminalService: jest.Mocked<TerminalService>;
  let mcpWriterService: jest.Mocked<McpWriterService>;
  let mcpDiscoveryService: jest.Mocked<McpDiscoveryService>;
  let cliCommandService: jest.Mocked<CliCommandService>;
  let claudeSessionReader: jest.Mocked<ClaudeSessionReaderService>;
  let hookManager: jest.Mocked<HookManagerService>;
  let claudeSessionTracker: jest.Mocked<ClaudeSessionTrackerService>;

  beforeEach(async () => {
    sessionService = {
      get: jest.fn(),
      updateStatus: jest.fn(),
      registerTerminal: jest.fn(),
      clearTerminalRef: jest.fn(),
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

    claudeSessionReader = {
      readSessionsIndex: jest.fn().mockResolvedValue([]),
      findNewSession: jest.fn().mockResolvedValue(null),
    } as unknown as jest.Mocked<ClaudeSessionReaderService>;

    hookManager = {
      registerHooks: jest.fn().mockResolvedValue(undefined),
      startWatching: jest.fn(),
    } as unknown as jest.Mocked<HookManagerService>;

    claudeSessionTracker = {
      startTracking: jest.fn(),
    } as unknown as jest.Mocked<ClaudeSessionTrackerService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SessionLauncherService,
        { provide: SessionService, useValue: sessionService },
        { provide: TerminalService, useValue: terminalService },
        { provide: McpWriterService, useValue: mcpWriterService },
        { provide: McpDiscoveryService, useValue: mcpDiscoveryService },
        { provide: CliCommandService, useValue: cliCommandService },
        { provide: ClaudeSessionReaderService, useValue: claudeSessionReader },
        { provide: HookManagerService, useValue: hookManager },
        { provide: ClaudeSessionTrackerService, useValue: claudeSessionTracker },
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

  describe('launchSession with hooks', () => {
    it('should register hooks and start watching for claude sessions', async () => {
      const session = createMockSession();
      sessionService.get.mockReturnValue(session);

      await service.launchSession(session.id, '/project', '/worktree', 'claude');

      expect(hookManager.registerHooks).toHaveBeenCalledWith('/project');
      expect(hookManager.startWatching).toHaveBeenCalled();
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

      expect(hookManager.registerHooks).not.toHaveBeenCalled();
      expect(hookManager.startWatching).not.toHaveBeenCalled();
    });

    it('should snapshot Claude sessions for non-resumed sessions', async () => {
      const session = createMockSession();
      sessionService.get.mockReturnValue(session);

      await service.launchSession(session.id, '/project', '/worktree', 'claude');

      expect(claudeSessionReader.readSessionsIndex).toHaveBeenCalledWith('/project');
    });

    it('should snapshot Claude sessions for fork sessions', async () => {
      const session = createMockSession({ forkSessionId: 'fork-id' });
      sessionService.get.mockReturnValue(session);

      await service.launchSession(session.id, '/project', '/worktree', 'claude');

      expect(claudeSessionReader.readSessionsIndex).toHaveBeenCalledWith('/project');
    });

    it('should snapshot Claude sessions for continue-last sessions', async () => {
      const session = createMockSession({ continueLastSession: true });
      sessionService.get.mockReturnValue(session);

      await service.launchSession(session.id, '/project', '/worktree', 'claude');

      expect(claudeSessionReader.readSessionsIndex).toHaveBeenCalledWith('/project');
    });
  });
});
