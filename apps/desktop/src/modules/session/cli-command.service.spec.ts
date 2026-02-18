import { Test, TestingModule } from '@nestjs/testing';

// Mock ../plugin barrel to avoid electron-store import in test environment
jest.mock('../plugin', () => ({
  PluginRegistryService: jest.fn(),
}));

import { CliCommandService } from './cli-command.service';
import { PluginRegistryService } from '../plugin';

// Mock os module - platform() and homedir() are native bindings and can't be spied on
const mockPlatform = jest.fn().mockReturnValue('linux');
const mockHomedir = jest.fn().mockReturnValue('/home/testuser');

jest.mock('os', () => ({
  platform: (...args: unknown[]) => mockPlatform(...args),
  homedir: (...args: unknown[]) => mockHomedir(...args),
}));

const mockPluginRegistry = {
  isPluginMode: jest.fn().mockReturnValue(false),
  isValidMode: jest
    .fn()
    .mockImplementation((mode: string) => mode === 'claude' || mode === 'plain'),
  getProvider: jest.fn().mockImplementation(() => {
    throw new Error('No provider registered');
  }),
  getProviderEntry: jest.fn().mockReturnValue(undefined),
  listProviders: jest.fn().mockReturnValue([]),
};

describe('CliCommandService', () => {
  let service: CliCommandService;

  // Store original env values for restoration
  const originalEnv = { ...process.env };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CliCommandService,
        { provide: PluginRegistryService, useValue: mockPluginRegistry },
      ],
    }).compile();

    service = module.get<CliCommandService>(CliCommandService);

    // Reset to defaults
    mockPlatform.mockReturnValue('linux');
    mockHomedir.mockReturnValue('/home/testuser');
    jest.clearAllMocks();
    // Restore default mock implementations after clearAllMocks
    mockPluginRegistry.isPluginMode.mockReturnValue(false);
    mockPluginRegistry.isValidMode.mockImplementation(
      (mode: string) => mode === 'claude' || mode === 'plain'
    );
    mockPluginRegistry.getProvider.mockImplementation(() => {
      throw new Error('No provider registered');
    });
    mockPluginRegistry.getProviderEntry.mockReturnValue(undefined);
    mockPluginRegistry.listProviders.mockReturnValue([]);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  // =========================================================
  // getAiModeName
  // =========================================================

  describe('getAiModeName', () => {
    it('should return "Claude" for claude mode', () => {
      expect(service.getAiModeName('claude')).toBe('Claude');
    });

    it('should return "Plain Terminal" for plain mode', () => {
      expect(service.getAiModeName('plain')).toBe('Plain Terminal');
    });

    it('should return the mode string itself for an unrecognized mode with no plugin', () => {
      expect(service.getAiModeName('nonexistent' as any)).toBe('nonexistent');
    });

    it('should return plugin displayName for a registered plugin mode', () => {
      mockPluginRegistry.getProviderEntry.mockReturnValue({
        manifest: { displayName: 'My AI Tool' },
      });
      expect(service.getAiModeName('my-tool' as any)).toBe('My AI Tool');
    });
  });

  // =========================================================
  // getCliConfig - plain mode
  // =========================================================

  describe('getCliConfig (plain mode)', () => {
    it('should return shell command on linux', () => {
      mockPlatform.mockReturnValue('linux');
      process.env.SHELL = '/bin/zsh';

      const config = service.getCliConfig('plain', {});

      expect(config.command).toBe('/bin/zsh');
      expect(config.args).toEqual(['-l']);
    });

    it('should return shell command on macOS', () => {
      mockPlatform.mockReturnValue('darwin');
      process.env.SHELL = '/bin/bash';

      const config = service.getCliConfig('plain', {});

      expect(config.command).toBe('/bin/bash');
      expect(config.args).toEqual(['-l']);
    });

    it('should fall back to /bin/bash when SHELL is not set on unix', () => {
      mockPlatform.mockReturnValue('linux');
      delete process.env.SHELL;

      const config = service.getCliConfig('plain', {});

      expect(config.command).toBe('/bin/bash');
      expect(config.args).toEqual(['-l']);
    });

    it('should return cmd.exe on Windows', () => {
      mockPlatform.mockReturnValue('win32');
      process.env.COMSPEC = 'C:\\Windows\\System32\\cmd.exe';

      const config = service.getCliConfig('plain', {});

      expect(config.command).toBe('C:\\Windows\\System32\\cmd.exe');
      expect(config.args).toEqual([]);
    });

    it('should fall back to cmd.exe when COMSPEC is not set on Windows', () => {
      mockPlatform.mockReturnValue('win32');
      delete process.env.COMSPEC;

      const config = service.getCliConfig('plain', {});

      expect(config.command).toBe('cmd.exe');
      expect(config.args).toEqual([]);
    });
  });

  // =========================================================
  // getCliConfig - claude mode delegates to plugin
  // =========================================================

  describe('getCliConfig (claude mode via plugin)', () => {
    it('should delegate claude mode to getPluginCliConfig when isPluginMode returns true', () => {
      mockPluginRegistry.isPluginMode.mockReturnValue(true);
      mockPluginRegistry.getProvider.mockReturnValue({
        aiMode: 'claude',
        buildLaunchCommand: jest.fn().mockReturnValue({
          command: '/usr/local/bin/claude',
          args: ['--model', 'opus', '--append-system-prompt', 'test'],
        }),
      });

      const config = service.getCliConfig('claude', {
        sessionId: 'sess-1',
        workingDirectory: '/work',
        projectPath: '/project',
      });

      expect(mockPluginRegistry.isPluginMode).toHaveBeenCalledWith('claude');
      expect(config.command).toBe('/usr/local/bin/claude');
    });

    it('should pass session context as LaunchContext to provider', () => {
      mockPluginRegistry.isPluginMode.mockReturnValue(true);
      const buildLaunchCommand = jest.fn().mockReturnValue({
        command: 'claude',
        args: [],
      });
      mockPluginRegistry.getProvider.mockReturnValue({
        aiMode: 'claude',
        buildLaunchCommand,
      });

      service.getCliConfig('claude', {
        sessionId: 'sess-1',
        workingDirectory: '/work',
        projectPath: '/project',
        model: 'sonnet',
        systemPrompt: 'Be concise',
        skipPermissions: true,
      });

      expect(buildLaunchCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: 'sess-1',
          workingDirectory: '/work',
          projectPath: '/project',
          model: 'sonnet',
          systemPrompt: 'Be concise',
          skipPermissions: true,
        })
      );
    });
  });

  // =========================================================
  // getCliConfig - default case (unknown non-plugin mode)
  // =========================================================

  describe('getCliConfig default case', () => {
    it('should fall back to shell config for unknown non-plugin modes', () => {
      // Unknown mode that is NOT a plugin mode falls through to shell
      mockPluginRegistry.isPluginMode.mockReturnValue(false);
      process.env.SHELL = '/bin/bash';

      const config = service.getCliConfig('unknown-mode' as any, {});

      // Should fall back to shell config (the warning path)
      expect(config.command).toBe('/bin/bash');
      expect(config.args).toEqual(['-l']);
    });
  });

  // =========================================================
  // Plugin mode delegation
  // =========================================================

  describe('getCliConfig plugin mode delegation', () => {
    it('should delegate to plugin provider for a registered plugin mode', () => {
      mockPluginRegistry.isPluginMode.mockReturnValue(true);
      mockPluginRegistry.getProvider.mockReturnValue({
        aiMode: 'codex',
        buildLaunchCommand: jest.fn().mockReturnValue({
          command: 'codex',
          args: ['--project', '/project'],
        }),
      });

      const config = service.getCliConfig('codex' as any, {
        sessionId: 'sess-1',
        workingDirectory: '/work',
        projectPath: '/project',
      });

      expect(config.command).toBe('codex');
      expect(config.args).toEqual(['--project', '/project']);
    });

    it('should delegate to buildResumeCommand when resumeSessionId is set', () => {
      mockPluginRegistry.isPluginMode.mockReturnValue(true);
      mockPluginRegistry.getProvider.mockReturnValue({
        aiMode: 'codex',
        buildLaunchCommand: jest.fn(),
        buildResumeCommand: jest.fn().mockReturnValue({
          command: 'codex',
          args: ['--resume', 'provider-session-123'],
        }),
      });

      const config = service.getCliConfig('codex' as any, {
        sessionId: 'sess-1',
        workingDirectory: '/work',
        projectPath: '/project',
        resumeSessionId: 'provider-session-123',
      });

      expect(config.command).toBe('codex');
      expect(config.args).toContain('--resume');
    });

    it('should delegate to buildForkCommand when forkSessionId is set', () => {
      mockPluginRegistry.isPluginMode.mockReturnValue(true);
      mockPluginRegistry.getProvider.mockReturnValue({
        aiMode: 'codex',
        buildLaunchCommand: jest.fn(),
        buildForkCommand: jest.fn().mockReturnValue({
          command: 'codex',
          args: ['--fork', 'fork-id'],
        }),
      });

      const config = service.getCliConfig('codex' as any, {
        sessionId: 'sess-1',
        workingDirectory: '/work',
        projectPath: '/project',
        forkSessionId: 'fork-id',
      });

      expect(config.command).toBe('codex');
      expect(config.args).toContain('--fork');
    });

    it('should delegate to buildContinueCommand when continueLastSession is set', () => {
      mockPluginRegistry.isPluginMode.mockReturnValue(true);
      mockPluginRegistry.getProvider.mockReturnValue({
        aiMode: 'codex',
        buildLaunchCommand: jest.fn(),
        buildContinueCommand: jest.fn().mockReturnValue({
          command: 'codex',
          args: ['--continue'],
        }),
      });

      const config = service.getCliConfig('codex' as any, {
        sessionId: 'sess-1',
        workingDirectory: '/work',
        projectPath: '/project',
        continueLastSession: true,
      });

      expect(config.command).toBe('codex');
      expect(config.args).toContain('--continue');
    });

    it('should fall back to buildLaunchCommand when resume/fork/continue methods are missing', () => {
      mockPluginRegistry.isPluginMode.mockReturnValue(true);
      mockPluginRegistry.getProvider.mockReturnValue({
        aiMode: 'codex',
        buildLaunchCommand: jest.fn().mockReturnValue({
          command: 'codex',
          args: ['--new'],
        }),
        // No buildResumeCommand defined
      });

      const config = service.getCliConfig('codex' as any, {
        resumeSessionId: 'resume-123',
      });

      expect(config.command).toBe('codex');
      expect(config.args).toEqual(['--new']);
    });
  });
});
