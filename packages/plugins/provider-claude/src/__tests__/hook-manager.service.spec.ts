import * as path from 'path';

// ---- Module-level mocks ----

const mockFsPromises = {
  mkdir: jest.fn().mockResolvedValue(undefined),
  writeFile: jest.fn().mockResolvedValue(undefined),
  readFile: jest.fn().mockResolvedValue('{}'),
  unlink: jest.fn().mockResolvedValue(undefined),
  rename: jest.fn().mockResolvedValue(undefined),
  access: jest.fn().mockResolvedValue(undefined),
};

const mockWatcherClose = jest.fn();
const mockWatcher = {
  close: mockWatcherClose,
};

let watchCallback: ((eventType: string, filename: string | null) => void) | null = null;

jest.mock('fs', () => ({
  promises: mockFsPromises,
  mkdirSync: jest.fn(),
  watch: jest.fn((_path: string, cb: (eventType: string, filename: string | null) => void) => {
    watchCallback = cb;
    return mockWatcher;
  }),
}));

jest.mock('os', () => ({
  tmpdir: jest.fn().mockReturnValue('/tmp'),
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
}));

// Import AFTER mocks are set up
import { ClaudeHookManagerService, type HookEventData } from '../services/hook-manager.service';

describe('ClaudeHookManagerService', () => {
  let service: ClaudeHookManagerService;

  beforeEach(() => {
    jest.clearAllMocks();
    watchCallback = null;
    service = new ClaudeHookManagerService();
  });

  // ==================================================================
  // registerHooks
  // ==================================================================
  describe('registerHooks', () => {
    it('should create hook directory and write hook script', async () => {
      mockFsPromises.readFile.mockRejectedValueOnce(new Error('ENOENT'));

      await service.registerHooks('/my/project');

      expect(mockFsPromises.mkdir).toHaveBeenCalledWith(
        expect.stringContaining(path.join('.claude', 'hooks')),
        { recursive: true }
      );

      expect(mockFsPromises.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('omniscribe-notify.js'),
        expect.stringContaining('process.stdin.on'),
        'utf-8'
      );
    });

    it('should create settings.local.json when it does not exist', async () => {
      mockFsPromises.readFile.mockRejectedValueOnce(new Error('ENOENT'));

      await service.registerHooks('/my/project');

      const writeCall = mockFsPromises.writeFile.mock.calls.find((call: unknown[]) =>
        (call[0] as string).includes('settings.local.json')
      );
      expect(writeCall).toBeDefined();

      const written = JSON.parse(writeCall![1] as string);
      expect(written.hooks).toBeDefined();
      expect(written.hooks.SessionStart).toHaveLength(1);
      expect(written.hooks.SessionEnd).toHaveLength(1);
      expect(written.hooks.SessionStart[0].hooks[0].type).toBe('command');
      expect(written.hooks.SessionStart[0].hooks[0].async).toBe(true);
    });

    it('should merge into existing settings preserving other keys', async () => {
      const existingSettings = {
        customSetting: true,
        hooks: {
          SessionStart: [
            { hooks: [{ type: 'command', command: 'other-tool', timeout: 10, async: false }] },
          ],
        },
      };
      mockFsPromises.readFile.mockResolvedValueOnce(JSON.stringify(existingSettings));

      await service.registerHooks('/my/project');

      const writeCall = mockFsPromises.writeFile.mock.calls.find((call: unknown[]) =>
        (call[0] as string).includes('settings.local.json')
      );
      const written = JSON.parse(writeCall![1] as string);

      expect(written.customSetting).toBe(true);
      expect(written.hooks.SessionStart).toHaveLength(2);
      expect(written.hooks.SessionStart[0].hooks[0].command).toBe('other-tool');
      expect(written.hooks.SessionEnd).toHaveLength(1);
    });

    it('should be idempotent - not add duplicate hooks', async () => {
      // First registration
      mockFsPromises.readFile.mockRejectedValueOnce(new Error('ENOENT'));
      await service.registerHooks('/my/project');

      const firstWriteCall = mockFsPromises.writeFile.mock.calls.find((call: unknown[]) =>
        (call[0] as string).includes('settings.local.json')
      );
      const firstSettings = JSON.parse(firstWriteCall![1] as string);

      // Second registration - simulate reading back what we wrote
      mockFsPromises.writeFile.mockClear();
      mockFsPromises.readFile.mockResolvedValueOnce(JSON.stringify(firstSettings));
      await service.registerHooks('/my/project');

      const secondWriteCall = mockFsPromises.writeFile.mock.calls.find((call: unknown[]) =>
        (call[0] as string).includes('settings.local.json')
      );
      const secondSettings = JSON.parse(secondWriteCall![1] as string);

      expect(secondSettings.hooks.SessionStart).toHaveLength(1);
      expect(secondSettings.hooks.SessionEnd).toHaveLength(1);
    });

    it('should handle errors gracefully without throwing', async () => {
      mockFsPromises.mkdir.mockRejectedValueOnce(new Error('Permission denied'));

      await expect(service.registerHooks('/my/project')).resolves.toBeUndefined();
    });
  });

  // ==================================================================
  // registerHooks — OSC 777 marker channel
  // ==================================================================
  describe('registerHooks — OSC marker channel', () => {
    /** Find and parse the settings.local.json the atomic write produced. */
    function writtenSettings(): Record<string, unknown> {
      const writeCall = mockFsPromises.writeFile.mock.calls.find((call: unknown[]) =>
        (call[0] as string).includes('settings.local.json')
      );
      expect(writeCall).toBeDefined();
      return JSON.parse(writeCall![1] as string);
    }

    it('writes OSC marker hooks for UserPromptSubmit/Notification/Stop', async () => {
      mockFsPromises.readFile.mockRejectedValueOnce(new Error('ENOENT'));

      await service.registerHooks('/my/project');

      const written = writtenSettings();
      const hooks = written.hooks as Record<string, Array<{ hooks: Array<{ command: string }> }>>;

      expect(hooks.UserPromptSubmit).toHaveLength(1);
      expect(hooks.Notification).toHaveLength(1);
      expect(hooks.Stop).toHaveLength(1);

      expect(hooks.UserPromptSubmit[0].hooks[0].command).toContain('notify;omniscribe;working');
      expect(hooks.Notification[0].hooks[0].command).toContain('notify;omniscribe;attention');
      expect(hooks.Stop[0].hooks[0].command).toContain('notify;omniscribe;finished');
    });

    it('emits the marker via terminalSequence gated on OMNISCRIBE_SESSION_ID', async () => {
      mockFsPromises.readFile.mockRejectedValueOnce(new Error('ENOENT'));

      await service.registerHooks('/my/project');

      const written = writtenSettings();
      const hooks = written.hooks as Record<string, Array<{ hooks: Array<{ command: string }> }>>;
      const cmd = hooks.Stop[0].hooks[0].command;

      expect(cmd).toContain('terminalSequence');
      expect(cmd).toContain('$OMNISCRIBE_SESSION_ID');
      // OSC 777 BEL-terminated sequence (escaped for JSON output).
      expect(cmd).toContain('\\u001b]777;notify;omniscribe;finished\\u0007');
      // Must not depend on /dev/tty (lost in newer Claude Code).
      expect(cmd).not.toContain('/dev/tty');
    });

    it('uses an atomic temp+rename write', async () => {
      mockFsPromises.readFile.mockRejectedValueOnce(new Error('ENOENT'));

      await service.registerHooks('/my/project');

      const tmpWrite = mockFsPromises.writeFile.mock.calls.find((call: unknown[]) =>
        (call[0] as string).includes('settings.local.json.omniscribe-tmp')
      );
      expect(tmpWrite).toBeDefined();
      expect(mockFsPromises.rename).toHaveBeenCalledWith(
        expect.stringContaining('settings.local.json.omniscribe-tmp'),
        expect.stringContaining('settings.local.json')
      );
    });

    it('is idempotent — re-install does not accumulate OSC hooks', async () => {
      mockFsPromises.readFile.mockRejectedValueOnce(new Error('ENOENT'));
      await service.registerHooks('/my/project');
      const first = writtenSettings();

      mockFsPromises.writeFile.mockClear();
      mockFsPromises.readFile.mockResolvedValueOnce(JSON.stringify(first));
      await service.registerHooks('/my/project');
      const second = writtenSettings();

      const hooks = second.hooks as Record<string, unknown[]>;
      expect(hooks.UserPromptSubmit).toHaveLength(1);
      expect(hooks.Notification).toHaveLength(1);
      expect(hooks.Stop).toHaveLength(1);
    });

    it('preserves foreign hooks on the OSC events', async () => {
      const existing = {
        hooks: {
          Stop: [{ hooks: [{ type: 'command', command: 'my-own-stop-hook' }] }],
        },
      };
      mockFsPromises.readFile.mockResolvedValueOnce(JSON.stringify(existing));

      await service.registerHooks('/my/project');

      const written = writtenSettings();
      const hooks = written.hooks as Record<string, Array<{ hooks: Array<{ command: string }> }>>;
      expect(hooks.Stop).toHaveLength(2);
      expect(hooks.Stop[0].hooks[0].command).toBe('my-own-stop-hook');
      expect(hooks.Stop[1].hooks[0].command).toContain('notify;omniscribe;finished');
    });

    it('refuses to clobber an unparseable settings file', async () => {
      mockFsPromises.readFile.mockResolvedValueOnce('{ this is not json');

      await service.registerHooks('/my/project');

      // No settings write at all (the hook-script write may still happen, but
      // never the settings file).
      const settingsWrite = mockFsPromises.writeFile.mock.calls.find((call: unknown[]) =>
        (call[0] as string).includes('settings.local.json')
      );
      expect(settingsWrite).toBeUndefined();
      expect(mockFsPromises.rename).not.toHaveBeenCalled();
    });

    it('cleans up the temp file when rename fails', async () => {
      mockFsPromises.readFile.mockRejectedValueOnce(new Error('ENOENT'));
      mockFsPromises.rename.mockRejectedValueOnce(new Error('EXDEV'));

      // registerHooks swallows the error (logged warn), so this resolves.
      await expect(service.registerHooks('/my/project')).resolves.toBeUndefined();

      expect(mockFsPromises.unlink).toHaveBeenCalledWith(
        expect.stringContaining('settings.local.json.omniscribe-tmp')
      );
    });

    it('removes OSC marker hooks on unregister', async () => {
      const settings = {
        hooks: {
          Stop: [
            { hooks: [{ type: 'command', command: 'my-own-stop-hook' }] },
            {
              hooks: [
                {
                  type: 'command',
                  command:
                    '[ -n "$OMNISCRIBE_SESSION_ID" ] && printf \'{"terminalSequence":"\\u001b]777;notify;omniscribe;finished\\u0007"}\' || true',
                },
              ],
            },
          ],
        },
      };
      mockFsPromises.readFile.mockResolvedValueOnce(JSON.stringify(settings));

      await service.unregisterHooks('/my/project');

      const writeCall = mockFsPromises.writeFile.mock.calls.find((call: unknown[]) =>
        (call[0] as string).includes('settings.local.json')
      );
      expect(writeCall).toBeDefined();
      const written = JSON.parse(writeCall![1] as string);
      // Foreign hook preserved; ours stripped.
      expect(written.hooks.Stop).toHaveLength(1);
      expect(written.hooks.Stop[0].hooks[0].command).toBe('my-own-stop-hook');
    });
  });

  // ==================================================================
  // unregisterHooks
  // ==================================================================
  describe('unregisterHooks', () => {
    it('should remove Omniscribe hooks from settings', async () => {
      const settings = {
        hooks: {
          SessionStart: [
            {
              hooks: [
                {
                  type: 'command',
                  command: 'node "/my/project/.claude/hooks/omniscribe-notify.js"',
                  timeout: 5,
                  async: true,
                },
              ],
            },
          ],
          SessionEnd: [
            {
              hooks: [
                {
                  type: 'command',
                  command: 'node "/my/project/.claude/hooks/omniscribe-notify.js"',
                  timeout: 5,
                  async: true,
                },
              ],
            },
          ],
        },
      };
      mockFsPromises.readFile.mockResolvedValueOnce(JSON.stringify(settings));

      await service.unregisterHooks('/my/project');

      const writeCall = mockFsPromises.writeFile.mock.calls[0];
      expect(writeCall).toBeDefined();
      const written = JSON.parse(writeCall[1] as string);
      expect(written.hooks.SessionStart).toBeUndefined();
      expect(written.hooks.SessionEnd).toBeUndefined();
    });

    it('should preserve other hooks when removing ours', async () => {
      const settings = {
        hooks: {
          SessionStart: [
            { hooks: [{ type: 'command', command: 'other-tool', timeout: 10, async: false }] },
            {
              hooks: [
                {
                  type: 'command',
                  command: 'node "/my/project/.claude/hooks/omniscribe-notify.js"',
                  timeout: 5,
                  async: true,
                },
              ],
            },
          ],
        },
      };
      mockFsPromises.readFile.mockResolvedValueOnce(JSON.stringify(settings));

      await service.unregisterHooks('/my/project');

      const writeCall = mockFsPromises.writeFile.mock.calls[0];
      const written = JSON.parse(writeCall[1] as string);
      expect(written.hooks.SessionStart).toHaveLength(1);
      expect(written.hooks.SessionStart[0].hooks[0].command).toBe('other-tool');
    });

    it('should be a no-op when settings file does not exist', async () => {
      mockFsPromises.readFile.mockRejectedValueOnce(new Error('ENOENT'));

      await service.unregisterHooks('/my/project');

      expect(mockFsPromises.writeFile).not.toHaveBeenCalled();
    });

    it('should be a no-op when settings has no hooks key', async () => {
      mockFsPromises.readFile.mockResolvedValueOnce(JSON.stringify({ otherSetting: true }));

      await service.unregisterHooks('/my/project');

      expect(mockFsPromises.writeFile).not.toHaveBeenCalled();
    });

    it('should not write file when nothing changed', async () => {
      const settings = {
        hooks: {
          SessionStart: [
            { hooks: [{ type: 'command', command: 'other-tool', timeout: 10, async: false }] },
          ],
        },
      };
      mockFsPromises.readFile.mockResolvedValueOnce(JSON.stringify(settings));

      await service.unregisterHooks('/my/project');

      expect(mockFsPromises.writeFile).not.toHaveBeenCalled();
    });

    it('should handle errors gracefully without throwing', async () => {
      mockFsPromises.readFile.mockResolvedValueOnce('invalid json{{{');

      await expect(service.unregisterHooks('/my/project')).resolves.toBeUndefined();
    });
  });

  // ==================================================================
  // startWatching / stopWatching
  // ==================================================================
  describe('startWatching', () => {
    it('should create hook directory and start watching', () => {
      const fs = require('fs');

      service.startWatching();

      expect(fs.mkdirSync).toHaveBeenCalledWith(expect.stringContaining('omniscribe-hooks'), {
        recursive: true,
      });
      expect(fs.watch).toHaveBeenCalledWith(
        expect.stringContaining('omniscribe-hooks'),
        expect.any(Function)
      );
    });

    it('should not start a second watcher if already watching', () => {
      const fs = require('fs');

      service.startWatching();
      service.startWatching();

      expect(fs.watch).toHaveBeenCalledTimes(1);
    });

    it('should handle errors when starting watcher', () => {
      const fs = require('fs');
      fs.mkdirSync.mockImplementationOnce(() => {
        throw new Error('Permission denied');
      });

      expect(() => service.startWatching()).not.toThrow();
    });
  });

  describe('stopWatching', () => {
    it('should close the watcher and clear processed files', () => {
      service.startWatching();
      service.stopWatching();

      expect(mockWatcherClose).toHaveBeenCalled();
    });

    it('should be a no-op when not watching', () => {
      expect(() => service.stopWatching()).not.toThrow();
      expect(mockWatcherClose).not.toHaveBeenCalled();
    });
  });

  describe('destroy', () => {
    it('should stop watching on destroy', () => {
      service.startWatching();
      service.destroy();

      expect(mockWatcherClose).toHaveBeenCalled();
    });
  });

  // ==================================================================
  // detectFootprint
  // ==================================================================
  describe('detectFootprint', () => {
    it('reports no footprint for a clean project', async () => {
      mockFsPromises.access.mockRejectedValueOnce(new Error('ENOENT'));
      mockFsPromises.readFile.mockResolvedValueOnce('{}');

      const result = await service.detectFootprint('/my/project');

      expect(result).toEqual({ hooksPresent: false, hookCount: 0, scriptPresent: false });
    });

    it('detects the hook script file when present', async () => {
      mockFsPromises.access.mockResolvedValueOnce(undefined);
      mockFsPromises.readFile.mockResolvedValueOnce('{}');

      const result = await service.detectFootprint('/my/project');

      expect(result.scriptPresent).toBe(true);
      expect(mockFsPromises.access).toHaveBeenCalledWith(
        expect.stringContaining('omniscribe-notify.js')
      );
    });

    it('counts tmpdir lifecycle hooks (matched by exact command)', async () => {
      mockFsPromises.access.mockRejectedValueOnce(new Error('ENOENT'));
      const settings = {
        hooks: {
          SessionStart: [
            {
              hooks: [
                {
                  type: 'command',
                  command: 'node "/my/project/.claude/hooks/omniscribe-notify.js"',
                },
              ],
            },
          ],
          SessionEnd: [
            {
              hooks: [
                {
                  type: 'command',
                  command: 'node "/my/project/.claude/hooks/omniscribe-notify.js"',
                },
              ],
            },
          ],
        },
      };
      mockFsPromises.readFile.mockResolvedValueOnce(JSON.stringify(settings));

      const result = await service.detectFootprint('/my/project');

      expect(result.hooksPresent).toBe(true);
      expect(result.hookCount).toBe(2);
    });

    it('counts OSC marker hooks (matched by owned marker substring)', async () => {
      mockFsPromises.access.mockRejectedValueOnce(new Error('ENOENT'));
      const settings = {
        hooks: {
          Stop: [
            {
              hooks: [
                {
                  type: 'command',
                  command:
                    '[ -n "$OMNISCRIBE_SESSION_ID" ] && printf \'{"terminalSequence":"\\u001b]777;notify;omniscribe;finished\\u0007"}\' || true',
                },
              ],
            },
          ],
        },
      };
      mockFsPromises.readFile.mockResolvedValueOnce(JSON.stringify(settings));

      const result = await service.detectFootprint('/my/project');

      expect(result.hooksPresent).toBe(true);
      expect(result.hookCount).toBe(1);
    });

    it('does NOT count foreign hooks as Omniscribe-owned', async () => {
      mockFsPromises.access.mockRejectedValueOnce(new Error('ENOENT'));
      const settings = {
        hooks: {
          SessionStart: [{ hooks: [{ type: 'command', command: 'some-other-tool' }] }],
          Stop: [{ hooks: [{ type: 'command', command: 'my-own-stop-hook' }] }],
        },
      };
      mockFsPromises.readFile.mockResolvedValueOnce(JSON.stringify(settings));

      const result = await service.detectFootprint('/my/project');

      expect(result.hooksPresent).toBe(false);
      expect(result.hookCount).toBe(0);
    });

    it('does not crash on an unparseable settings file', async () => {
      mockFsPromises.access.mockRejectedValueOnce(new Error('ENOENT'));
      mockFsPromises.readFile.mockResolvedValueOnce('{ not json');

      const result = await service.detectFootprint('/my/project');

      expect(result.hooksPresent).toBe(false);
      expect(result.hookCount).toBe(0);
    });
  });

  // ==================================================================
  // removeHookScript
  // ==================================================================
  describe('removeHookScript', () => {
    it('unlinks the hook script and returns true', async () => {
      mockFsPromises.unlink.mockResolvedValueOnce(undefined);

      const removed = await service.removeHookScript('/my/project');

      expect(removed).toBe(true);
      expect(mockFsPromises.unlink).toHaveBeenCalledWith(
        expect.stringContaining('omniscribe-notify.js')
      );
    });

    it('returns false (no-op) when the script is missing (ENOENT)', async () => {
      const enoent = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      mockFsPromises.unlink.mockRejectedValueOnce(enoent);

      const removed = await service.removeHookScript('/my/project');

      expect(removed).toBe(false);
    });

    it('returns false and does not throw on other unlink errors', async () => {
      const eacces = Object.assign(new Error('EACCES'), { code: 'EACCES' });
      mockFsPromises.unlink.mockRejectedValueOnce(eacces);

      await expect(service.removeHookScript('/my/project')).resolves.toBe(false);
    });
  });

  // ==================================================================
  // path helpers
  // ==================================================================
  describe('path helpers', () => {
    it('getHookScriptPath points at .claude/hooks/omniscribe-notify.js', () => {
      const p = service.getHookScriptPath('/my/project');
      expect(p).toContain(path.join('.claude', 'hooks', 'omniscribe-notify.js'));
    });

    it('getSettingsPath points at .claude/settings.local.json', () => {
      const p = service.getSettingsPath('/my/project');
      expect(p).toContain(path.join('.claude', 'settings.local.json'));
    });
  });

  // ==================================================================
  // setHookCallback and file watcher callback
  // ==================================================================
  describe('hook callback pattern', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should invoke hookCallback when SessionStart event is detected', async () => {
      const callback = jest.fn();
      service.setHookCallback(callback);
      service.startWatching();

      const hookData = { hook_event_name: 'SessionStart', session_id: 'abc-123' };
      mockFsPromises.readFile.mockResolvedValueOnce(JSON.stringify(hookData));

      watchCallback!('rename', '12345-999.json');

      await jest.advanceTimersByTimeAsync(150);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ hook_event_name: 'SessionStart', session_id: 'abc-123' })
      );
      expect(mockFsPromises.unlink).toHaveBeenCalled();
    });

    it('should invoke hookCallback when SessionEnd event is detected', async () => {
      const callback = jest.fn();
      service.setHookCallback(callback);
      service.startWatching();

      const hookData = { hook_event_name: 'SessionEnd', session_id: 'abc-123' };
      mockFsPromises.readFile.mockResolvedValueOnce(JSON.stringify(hookData));

      watchCallback!('rename', '12345-888.json');

      await jest.advanceTimersByTimeAsync(150);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ hook_event_name: 'SessionEnd', session_id: 'abc-123' })
      );
    });

    it('should invoke hookCallback for unknown event types too', async () => {
      const callback = jest.fn();
      service.setHookCallback(callback);
      service.startWatching();

      const hookData: HookEventData = {
        hook_event_name: 'UnknownEvent',
        session_id: 'abc-123',
      };
      mockFsPromises.readFile.mockResolvedValueOnce(JSON.stringify(hookData));

      watchCallback!('rename', '12345-555.json');

      await jest.advanceTimersByTimeAsync(150);

      // Plugin version calls hookCallback for ALL event types (unlike NestJS version)
      expect(callback).toHaveBeenCalledWith(expect.objectContaining(hookData));
    });

    it('should not crash when no hookCallback is set', async () => {
      // Do NOT set hookCallback
      service.startWatching();

      const hookData = { hook_event_name: 'SessionStart', session_id: 'abc-123' };
      mockFsPromises.readFile.mockResolvedValueOnce(JSON.stringify(hookData));

      watchCallback!('rename', '12345-999.json');

      // Should not throw
      await jest.advanceTimersByTimeAsync(150);
    });

    it('should ignore non-rename events', () => {
      service.startWatching();
      expect(watchCallback).not.toBeNull();

      watchCallback!('change', 'test.json');

      expect(mockFsPromises.readFile).not.toHaveBeenCalled();
    });

    it('should ignore non-json files', () => {
      service.startWatching();

      watchCallback!('rename', 'test.txt');

      expect(mockFsPromises.readFile).not.toHaveBeenCalled();
    });

    it('should ignore null filename', () => {
      service.startWatching();

      watchCallback!('rename', null);

      expect(mockFsPromises.readFile).not.toHaveBeenCalled();
    });

    it('should not process the same file twice', async () => {
      const callback = jest.fn();
      service.setHookCallback(callback);
      service.startWatching();

      const hookData = { hook_event_name: 'SessionStart', session_id: 'abc-123' };
      mockFsPromises.readFile.mockResolvedValue(JSON.stringify(hookData));

      watchCallback!('rename', 'same-file.json');
      await jest.advanceTimersByTimeAsync(150);

      callback.mockClear();
      mockFsPromises.readFile.mockClear();

      watchCallback!('rename', 'same-file.json');
      await jest.advanceTimersByTimeAsync(150);

      expect(mockFsPromises.readFile).not.toHaveBeenCalled();
      expect(callback).not.toHaveBeenCalled();
    });

    it('should handle errors in processHookFile gracefully', async () => {
      service.startWatching();

      mockFsPromises.readFile.mockRejectedValueOnce(new Error('File not found'));

      watchCallback!('rename', 'bad-file.json');

      await jest.advanceTimersByTimeAsync(150);

      // Should not throw
    });

    it('should handle invalid JSON in hook file gracefully', async () => {
      const callback = jest.fn();
      service.setHookCallback(callback);
      service.startWatching();

      mockFsPromises.readFile.mockResolvedValueOnce('not valid json{{{');

      watchCallback!('rename', 'invalid.json');

      await jest.advanceTimersByTimeAsync(150);

      expect(callback).not.toHaveBeenCalled();
    });
  });
});
