// ---- Mocks for service dependencies ----

// Mock fs, child_process, os, and util to prevent real filesystem access
jest.mock('fs', () => ({
  existsSync: jest.fn().mockReturnValue(false),
  readFileSync: jest.fn(),
  mkdirSync: jest.fn(),
  watch: jest.fn(() => ({
    close: jest.fn(),
    on: jest.fn().mockReturnThis(),
  })),
  createReadStream: jest.fn(),
  promises: {
    readFile: jest.fn(),
    readdir: jest.fn(),
    stat: jest.fn(),
    mkdir: jest.fn(),
    writeFile: jest.fn(),
    unlink: jest.fn(),
  },
}));

jest.mock('child_process', () => ({
  exec: jest.fn(),
  // Callback-aware: cli-resolution's execFilePromise calls execFile(cmd, args, opts, cb)
  execFile: jest.fn(
    (_cmd: string, _args: unknown, _opts: unknown, cb?: (...cbArgs: unknown[]) => void) => {
      if (typeof cb === 'function') {
        cb(new Error('not found'), '', '');
      }
    }
  ),
  execFileSync: jest.fn().mockReturnValue('/usr/local/bin/claude\n'),
}));

jest.mock('util', () => ({
  promisify: () => jest.fn().mockRejectedValue(new Error('not found')),
}));

jest.mock('os', () => ({
  platform: jest.fn().mockReturnValue('linux'),
  homedir: jest.fn().mockReturnValue('/home/testuser'),
  tmpdir: jest.fn().mockReturnValue('/tmp'),
}));

jest.mock('readline', () => ({
  createInterface: jest.fn(() => ({
    close: jest.fn(),
    [Symbol.asyncIterator]: () => ({
      next: () => Promise.resolve({ value: undefined, done: true }),
    }),
  })),
}));

jest.mock('@omniscribe/shared', () => {
  const actual = jest.requireActual('@omniscribe/shared');
  return {
    ...actual,
    createLogger: () => ({
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    }),
    getClaudeSessionsDir: jest.fn().mockReturnValue('/home/user/.claude/projects/encoded'),
    getSessionsIndexPath: jest
      .fn()
      .mockReturnValue('/home/user/.claude/projects/encoded/sessions-index.json'),
  };
});

// Import after mocks
import { ClaudeProviderPlugin } from '../claude-provider.plugin';
import type { LaunchContext, PluginContext } from '@omniscribe/plugin-api';

describe('ClaudeProviderPlugin', () => {
  let plugin: ClaudeProviderPlugin;

  beforeEach(() => {
    jest.clearAllMocks();
    plugin = new ClaudeProviderPlugin();
  });

  // ==================================================================
  // Identity properties
  // ==================================================================
  describe('identity', () => {
    it('should have id "provider-claude"', () => {
      expect(plugin.id).toBe('provider-claude');
    });

    it('should have displayName "Claude Code"', () => {
      expect(plugin.displayName).toBe('Claude Code');
    });

    it('should have aiMode "claude"', () => {
      expect(plugin.aiMode).toBe('claude');
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

    it('should support session history', () => {
      expect(plugin.capabilities.supportsSessionHistory).toBe(true);
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
    it('should include onSessionCreateWithMode for claude', () => {
      expect(plugin.activationEvents).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ event: 'onSessionCreateWithMode', mode: 'claude' }),
        ])
      );
    });
  });

  // ==================================================================
  // detectCli delegation
  // ==================================================================
  describe('detectCli', () => {
    it('should delegate to internal ClaudeCliDetectionService', async () => {
      const detectSpy = jest.spyOn(plugin.getCliDetectionService(), 'detect');
      detectSpy.mockResolvedValue({
        installed: true,
        version: '1.0.0',
        path: '/usr/local/bin/claude',
        auth: { authenticated: true },
      });

      const result = await plugin.detectCli();

      expect(detectSpy).toHaveBeenCalled();
      expect(result.installed).toBe(true);
      expect(result.version).toBe('1.0.0');
    });
  });

  // ==================================================================
  // Command building delegation
  // ==================================================================
  describe('buildLaunchCommand', () => {
    it('should delegate to internal ClaudeCliCommandService', () => {
      const context: LaunchContext = { model: 'opus' };
      const result = plugin.buildLaunchCommand(context);

      expect(result.command).toBeDefined();
      expect(result.args).toBeDefined();
      expect(result.args).toContain('--model');
      expect(result.args).toContain('opus');
    });
  });

  describe('buildResumeCommand', () => {
    it('should delegate correctly with session ID', () => {
      const result = plugin.buildResumeCommand('session-123', {});

      expect(result.args).toContain('--resume');
      expect(result.args).toContain('session-123');
    });

    it('should not include system prompt flags', () => {
      const result = plugin.buildResumeCommand('session-123', { systemPrompt: 'Be concise.' });

      expect(result.args).not.toContain('--system-prompt');
      expect(result.args).not.toContain('--append-system-prompt');
    });
  });

  describe('buildForkCommand', () => {
    it('should delegate correctly with session ID and fork flag', () => {
      const result = plugin.buildForkCommand('fork-456', {});

      expect(result.args).toContain('--resume');
      expect(result.args).toContain('fork-456');
      expect(result.args).toContain('--fork-session');
    });
  });

  describe('buildContinueCommand', () => {
    it('should delegate correctly with continue flag', () => {
      const result = plugin.buildContinueCommand({});

      expect(result.args).toContain('--continue');
    });
  });

  // ==================================================================
  // parseTerminalStatus delegation
  // ==================================================================
  describe('parseTerminalStatus', () => {
    it('should delegate to internal ClaudeStatusParserService', () => {
      expect(plugin.parseTerminalStatus('\n> ')).toBe('idle');
      expect(plugin.parseTerminalStatus('Goodbye!')).toBe('finished');
      expect(plugin.parseTerminalStatus('Error: Not authenticated')).toBe('error');
      expect(plugin.parseTerminalStatus('Processing...')).toBeNull();
    });
  });

  // ==================================================================
  // readSessionHistory delegation
  // ==================================================================
  describe('readSessionHistory', () => {
    it('should delegate to internal ClaudeSessionReaderService', async () => {
      const readSpy = jest.spyOn(plugin.getSessionReader(), 'readSessionHistory');
      readSpy.mockResolvedValue([
        {
          sessionId: 'session-1',
          projectPath: '/project',
          summary: 'Test session',
          created: '2025-01-01T00:00:00Z',
          modified: '2025-01-01T00:00:00Z',
        },
      ]);

      const result = await plugin.readSessionHistory('/project');

      expect(readSpy).toHaveBeenCalledWith('/project');
      expect(result).toHaveLength(1);
      expect(result[0].sessionId).toBe('session-1');
    });
  });

  // ==================================================================
  // getSystemPromptAdditions
  // ==================================================================
  describe('getSystemPromptAdditions', () => {
    it('should return Omniscribe MCP prompt', () => {
      const additions = plugin.getSystemPromptAdditions({});

      expect(additions).toHaveLength(1);
      expect(additions[0]).toContain('Omniscribe Integration');
      expect(additions[0]).toContain('mcp__omniscribe__omniscribe_status');
    });
  });

  // ==================================================================
  // getMcpConfig
  // ==================================================================
  describe('getMcpConfig', () => {
    it('should return null (MCP handled by core)', async () => {
      const result = await plugin.getMcpConfig('session-1', '/project');

      expect(result).toBeNull();
    });
  });

  // ==================================================================
  // Lifecycle: activate / deactivate
  // ==================================================================
  describe('lifecycle', () => {
    it('should store context on activate', async () => {
      const mockContext: PluginContext = {
        logger: {
          debug: jest.fn(),
          info: jest.fn(),
          warn: jest.fn(),
          error: jest.fn(),
        },
        storage: {
          get: jest.fn(),
          set: jest.fn(),
          delete: jest.fn(),
          has: jest.fn(),
          clear: jest.fn(),
        },
      };

      await plugin.activate(mockContext);

      expect(mockContext.logger.info).toHaveBeenCalledWith('Claude Code provider plugin activated');
    });

    it('should clean up resources on deactivate', async () => {
      const mockContext: PluginContext = {
        logger: {
          debug: jest.fn(),
          info: jest.fn(),
          warn: jest.fn(),
          error: jest.fn(),
        },
        storage: {
          get: jest.fn(),
          set: jest.fn(),
          delete: jest.fn(),
          has: jest.fn(),
          clear: jest.fn(),
        },
      };

      await plugin.activate(mockContext);

      const readerDestroySpy = jest.spyOn(plugin.getSessionReader(), 'destroy');
      const hookDestroySpy = jest.spyOn(plugin.getHookManager(), 'destroy');

      await plugin.deactivate();

      expect(readerDestroySpy).toHaveBeenCalled();
      expect(hookDestroySpy).toHaveBeenCalled();
      expect(mockContext.logger.info).toHaveBeenCalledWith(
        'Claude Code provider plugin deactivated'
      );
    });

    it('should handle deactivate without prior activate', async () => {
      // Should not throw even if context is null
      await expect(plugin.deactivate()).resolves.toBeUndefined();
    });
  });

  // ==================================================================
  // Accessor methods
  // ==================================================================
  describe('accessor methods', () => {
    it('should return the session reader service', () => {
      const reader = plugin.getSessionReader();
      expect(reader).toBeDefined();
      expect(typeof reader.readSessionsIndex).toBe('function');
      expect(typeof reader.readSessionHistory).toBe('function');
    });

    it('should return the hook manager service', () => {
      const hookManager = plugin.getHookManager();
      expect(hookManager).toBeDefined();
      expect(typeof hookManager.registerHooks).toBe('function');
      expect(typeof hookManager.startWatching).toBe('function');
    });

    it('should return the session tracker service', () => {
      const tracker = plugin.getSessionTracker();
      expect(tracker).toBeDefined();
      expect(typeof tracker.pollForNewSession).toBe('function');
    });

    it('should return the CLI detection service', () => {
      const detection = plugin.getCliDetectionService();
      expect(detection).toBeDefined();
      expect(typeof detection.detect).toBe('function');
      expect(typeof detection.getFullStatus).toBe('function');
    });

    it('should lazily create usage fetcher', () => {
      const fetcher1 = plugin.getUsageFetcher();
      const fetcher2 = plugin.getUsageFetcher();

      expect(fetcher1).toBeDefined();
      expect(fetcher1).toBe(fetcher2); // Same instance
    });

    it('should return same service instances on repeated access', () => {
      expect(plugin.getSessionReader()).toBe(plugin.getSessionReader());
      expect(plugin.getHookManager()).toBe(plugin.getHookManager());
      expect(plugin.getSessionTracker()).toBe(plugin.getSessionTracker());
      expect(plugin.getCliDetectionService()).toBe(plugin.getCliDetectionService());
    });
  });

  // ==================================================================
  // parseUsage
  // ==================================================================
  describe('parseUsage', () => {
    it('should return null when usage fetcher fails', async () => {
      const fetcher = plugin.getUsageFetcher();
      jest.spyOn(fetcher, 'fetchUsage').mockRejectedValue(new Error('PTY failed'));

      const result = await plugin.parseUsage('/project');

      expect(result).toBeNull();
    });
  });
});
