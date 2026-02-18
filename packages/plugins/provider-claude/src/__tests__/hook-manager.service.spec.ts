import * as path from 'path';

// ---- Module-level mocks ----

const mockFsPromises = {
  mkdir: jest.fn().mockResolvedValue(undefined),
  writeFile: jest.fn().mockResolvedValue(undefined),
  readFile: jest.fn().mockResolvedValue('{}'),
  unlink: jest.fn().mockResolvedValue(undefined),
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
