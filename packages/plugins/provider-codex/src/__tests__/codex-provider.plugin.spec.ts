// ---- Mocks for service dependencies ----

jest.mock('fs', () => ({
  existsSync: jest.fn().mockReturnValue(false),
  readFileSync: jest.fn(),
  readdirSync: jest.fn().mockReturnValue([]),
}));

jest.mock('child_process', () => ({
  exec: jest.fn(),
  execFile: jest.fn(),
  execFileSync: jest.fn().mockReturnValue('/usr/local/bin/codex\n'),
  spawn: jest.fn(),
}));

jest.mock('util', () => ({
  promisify: () => jest.fn().mockRejectedValue(new Error('not found')),
}));

jest.mock('os', () => ({
  platform: jest.fn().mockReturnValue('linux'),
  homedir: jest.fn().mockReturnValue('/home/testuser'),
}));

jest.mock('readline', () => ({
  createInterface: jest.fn(() => ({
    close: jest.fn(),
    on: jest.fn().mockReturnThis(),
    [Symbol.asyncIterator]: () => ({
      next: () => Promise.resolve({ value: undefined, done: true }),
    }),
  })),
}));

jest.mock('@omniscribe/shared', () => ({
  createLogger: () => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
  extractErrorMessage: (err: unknown) => (err instanceof Error ? err.message : String(err)),
  normalizePath: (p: string) => p.replace(/\\/g, '/'),
  // eslint-disable-next-line no-control-regex
  stripAnsiCodes: (s: string) => s.replace(new RegExp('\x1B\\[[0-9;]*[a-zA-Z]', 'g'), ''),
}));

// Import after mocks
import { CodexProviderPlugin } from '../codex-provider.plugin';
import type { LaunchContext, PluginContext } from '@omniscribe/plugin-api';

describe('CodexProviderPlugin', () => {
  let plugin: CodexProviderPlugin;

  beforeEach(() => {
    jest.clearAllMocks();
    plugin = new CodexProviderPlugin();
  });

  // ==================================================================
  // Identity properties
  // ==================================================================
  describe('identity', () => {
    it('should have id "provider-codex"', () => {
      expect(plugin.id).toBe('provider-codex');
    });

    it('should have displayName "Codex"', () => {
      expect(plugin.displayName).toBe('Codex');
    });

    it('should have aiMode "codex"', () => {
      expect(plugin.aiMode).toBe('codex');
    });

    it('should have type "provider"', () => {
      expect(plugin.type).toBe('provider');
    });
  });

  // ==================================================================
  // Capabilities
  // ==================================================================
  describe('capabilities', () => {
    it('should support MCP', () => {
      expect(plugin.capabilities.supportsMcp).toBe(true);
    });

    it('should support usage tracking', () => {
      expect(plugin.capabilities.supportsUsage).toBe(true);
    });

    it('should NOT support session history', () => {
      expect(plugin.capabilities.supportsSessionHistory).toBe(false);
    });

    it('should support resume, fork, and continue operations', () => {
      const ops = plugin.capabilities.supportedOperations;
      expect(ops.has('resume')).toBe(true);
      expect(ops.has('fork')).toBe(true);
      expect(ops.has('continue')).toBe(true);
    });

    it('should return a fresh capabilities object each time', () => {
      const caps1 = plugin.capabilities;
      const caps2 = plugin.capabilities;

      expect(caps1).not.toBe(caps2);
      expect(caps1).toEqual(caps2);
    });
  });

  // ==================================================================
  // Activation events
  // ==================================================================
  describe('activationEvents', () => {
    it('should include onSessionCreateWithMode for codex', () => {
      expect(plugin.activationEvents).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ event: 'onSessionCreateWithMode', mode: 'codex' }),
        ])
      );
    });
  });

  // ==================================================================
  // detectCli delegation
  // ==================================================================
  describe('detectCli', () => {
    it('should delegate to internal CodexCliDetectionService', async () => {
      // When CLI is not found (default mocks), should return not installed
      const result = await plugin.detectCli();

      expect(result.installed).toBe(false);
    });
  });

  // ==================================================================
  // Command building delegation
  // ==================================================================
  describe('buildLaunchCommand', () => {
    it('should delegate to internal CodexCliCommandService', () => {
      const context: LaunchContext = { model: 'o3' };
      const result = plugin.buildLaunchCommand(context);

      expect(result.command).toBeDefined();
      expect(result.args).toBeDefined();
      expect(result.args).toContain('--model');
      expect(result.args).toContain('o3');
    });
  });

  describe('buildResumeCommand', () => {
    it('should delegate with session ID as subcommand', () => {
      const result = plugin.buildResumeCommand('session-123', {});

      expect(result.args).toContain('resume');
      expect(result.args).toContain('session-123');
    });
  });

  describe('buildForkCommand', () => {
    it('should delegate with session ID and fork subcommand', () => {
      const result = plugin.buildForkCommand('fork-456', {});

      expect(result.args).toContain('fork');
      expect(result.args).toContain('fork-456');
    });
  });

  describe('buildContinueCommand', () => {
    it('should delegate with resume --last', () => {
      const result = plugin.buildContinueCommand({});

      expect(result.args).toContain('resume');
      expect(result.args).toContain('--last');
    });
  });

  // ==================================================================
  // parseTerminalStatus delegation
  // ==================================================================
  describe('parseTerminalStatus', () => {
    it('should delegate to internal CodexStatusParserService', () => {
      expect(plugin.parseTerminalStatus('Error: Not authenticated')).toBe('error');
      expect(plugin.parseTerminalStatus('Goodbye!')).toBe('finished');
      expect(plugin.parseTerminalStatus('[y/n]')).toBe('needs_input');
      expect(plugin.parseTerminalStatus('Thinking about this...')).toBe('working');
      expect(plugin.parseTerminalStatus('some random code output')).toBeNull();
    });
  });

  // ==================================================================
  // readSessionHistory
  // ==================================================================
  describe('readSessionHistory', () => {
    it('should return empty array (Codex does not support session history)', async () => {
      const result = await plugin.readSessionHistory('/project');

      expect(result).toEqual([]);
    });
  });

  // ==================================================================
  // getMcpConfig
  // ==================================================================
  describe('getMcpConfig', () => {
    it('should return null (MCP config is TODO for Codex TOML)', async () => {
      const result = await plugin.getMcpConfig('session-1', '/project');

      expect(result).toBeNull();
    });
  });

  // ==================================================================
  // Lifecycle: activate / deactivate
  // ==================================================================
  describe('lifecycle', () => {
    const createMockContext = (): PluginContext => ({
      pluginId: 'provider-codex',
      logger: {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      },
      subscriptions: [],
    });

    it('should store context on activate', async () => {
      const mockContext = createMockContext();

      await plugin.activate(mockContext);

      expect(mockContext.logger.info).toHaveBeenCalledWith('Codex provider plugin activated');
    });

    it('should clean up resources on deactivate', async () => {
      const mockContext = createMockContext();

      await plugin.activate(mockContext);
      await plugin.deactivate();

      expect(mockContext.logger.info).toHaveBeenCalledWith('Codex provider plugin deactivated');
    });

    it('should handle deactivate without prior activate', async () => {
      // Should not throw even if context is null
      await expect(plugin.deactivate()).resolves.toBeUndefined();
    });
  });

  // ==================================================================
  // parseUsage
  // ==================================================================
  describe('parseUsage', () => {
    it('should return null when usage fetcher fails', async () => {
      const fetcher = plugin.getUsageFetcher();
      jest.spyOn(fetcher, 'fetchUsage').mockRejectedValue(new Error('Fetch failed'));

      const result = await plugin.parseUsage('/project');

      expect(result).toBeNull();
    });
  });

  // ==================================================================
  // Accessor: getUsageFetcher
  // ==================================================================
  describe('getUsageFetcher', () => {
    it('should lazily create usage fetcher', () => {
      const fetcher1 = plugin.getUsageFetcher();
      const fetcher2 = plugin.getUsageFetcher();

      expect(fetcher1).toBeDefined();
      expect(fetcher1).toBe(fetcher2); // Same instance
    });
  });
});
