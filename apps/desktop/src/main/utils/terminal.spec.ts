// ---- Mocks ----

import { createLoggerMock } from '../../../test/mocks/logger.mock';

const mockLogger = createLoggerMock();

jest.mock('@omniscribe/shared', () => ({
  createLogger: () => mockLogger,
}));

const mockSpawn = jest.fn();
const mockExecFileAsync = jest.fn();

jest.mock('child_process', () => ({
  execFile: jest.fn(),
  spawn: (...args: unknown[]) => mockSpawn(...args),
}));

jest.mock('util', () => ({
  promisify:
    () =>
    (...args: unknown[]) =>
      mockExecFileAsync(...args),
}));

// ---- Tests ----

import { openTerminalWithCommand } from './terminal';

describe('terminal utilities', () => {
  const originalPlatform = process.platform;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform });
  });

  // ================================================================
  // Command validation (tested through openTerminalWithCommand)
  // ================================================================
  describe('command validation', () => {
    it('should reject empty command', async () => {
      await expect(openTerminalWithCommand('')).rejects.toThrow('Invalid command');
    });

    it('should reject whitespace-only command', async () => {
      await expect(openTerminalWithCommand('   ')).rejects.toThrow('Invalid command');
    });

    it('should reject command with null bytes', async () => {
      await expect(openTerminalWithCommand('echo\0hello')).rejects.toThrow('Invalid command');
    });

    it('should reject excessively long command (>10000 chars)', async () => {
      const longCommand = 'a'.repeat(10001);
      await expect(openTerminalWithCommand(longCommand)).rejects.toThrow('Invalid command');
    });

    it('should accept command at exactly 10000 chars', async () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      const command = 'a'.repeat(10000);

      // Create a mock process that resolves
      mockSpawn.mockReturnValue({
        unref: jest.fn(),
        on: jest.fn(),
      });

      // Should not throw
      await openTerminalWithCommand(command);
      expect(mockSpawn).toHaveBeenCalled();
    });
  });

  // ================================================================
  // Windows (win32) platform
  // ================================================================
  describe('win32 platform', () => {
    beforeEach(() => {
      Object.defineProperty(process, 'platform', { value: 'win32' });
    });

    it('should spawn cmd.exe with EncodedCommand on Windows', async () => {
      mockSpawn.mockReturnValue({
        unref: jest.fn(),
        on: jest.fn(),
      });

      await openTerminalWithCommand('npm install');

      expect(mockSpawn).toHaveBeenCalledWith(
        'cmd.exe',
        expect.arrayContaining(['/c', 'start', 'powershell', '-NoExit', '-EncodedCommand']),
        expect.objectContaining({
          detached: true,
          stdio: 'ignore',
          shell: false,
        })
      );
    });

    it('should produce valid Base64-encoded UTF-16LE command', async () => {
      mockSpawn.mockReturnValue({
        unref: jest.fn(),
        on: jest.fn(),
      });

      await openTerminalWithCommand('echo hello');

      const spawnArgs = mockSpawn.mock.calls[0][1] as string[];
      const ecIndex = spawnArgs.indexOf('-EncodedCommand');
      const encodedCommand = spawnArgs[ecIndex + 1];

      // Decode and verify
      const decoded = Buffer.from(encodedCommand, 'base64').toString('utf16le');
      expect(decoded).toBe('echo hello');
    });

    it('should call unref() on the spawned process', async () => {
      const mockUnref = jest.fn();
      mockSpawn.mockReturnValue({
        unref: mockUnref,
        on: jest.fn(),
      });

      await openTerminalWithCommand('test');

      expect(mockUnref).toHaveBeenCalled();
    });

    it('should register an error listener on spawned process', async () => {
      const mockOn = jest.fn();
      mockSpawn.mockReturnValue({
        unref: jest.fn(),
        on: mockOn,
      });

      await openTerminalWithCommand('test');

      expect(mockOn).toHaveBeenCalledWith('error', expect.any(Function));
    });
  });

  // ================================================================
  // macOS (darwin) platform
  // ================================================================
  describe('darwin platform', () => {
    beforeEach(() => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });
    });

    it('should call osascript via execFile (no shell parsing)', async () => {
      mockExecFileAsync.mockResolvedValue({ stdout: '', stderr: '' });

      await openTerminalWithCommand('npm install');

      // First arg is the binary, second is the argv array — never one
      // command string.
      expect(mockExecFileAsync).toHaveBeenCalledWith('osascript', expect.arrayContaining(['-e']));
      const argvFromCall = mockExecFileAsync.mock.calls[0][1] as string[];
      const joined = argvFromCall.join('|');
      expect(joined).toContain('npm install');
      expect(joined).toContain('tell app "Terminal" to do script');
    });

    it('should escape backslashes in the command for AppleScript', async () => {
      mockExecFileAsync.mockResolvedValue({ stdout: '', stderr: '' });

      await openTerminalWithCommand('echo C:\\Users\\test');

      const argv = mockExecFileAsync.mock.calls[0][1] as string[];
      const joined = argv.join('|');
      expect(joined).toContain('C:\\\\Users\\\\test');
    });

    it('should escape double quotes in the command for AppleScript', async () => {
      mockExecFileAsync.mockResolvedValue({ stdout: '', stderr: '' });

      await openTerminalWithCommand('echo "hello"');

      const argv = mockExecFileAsync.mock.calls[0][1] as string[];
      const joined = argv.join('|');
      expect(joined).toContain('\\"hello\\"');
    });

    it('does not concatenate the command into a shell string', async () => {
      mockExecFileAsync.mockResolvedValue({ stdout: '', stderr: '' });

      await openTerminalWithCommand('rm -rf "/"; echo done');

      // The first arg is always the binary name, never a long shell line.
      expect(mockExecFileAsync.mock.calls[0][0]).toBe('osascript');
      // No argv element should look like a concatenated shell invocation,
      // and the dangerous payload must remain inside an AppleScript-escaped
      // -e value rather than be exposed as a separate spawn-style token.
      const argv = mockExecFileAsync.mock.calls[0][1] as string[];
      for (const arg of argv) {
        expect(arg).not.toMatch(/^osascript\s/);
      }
      expect(argv).not.toContain('rm -rf "/"; echo done');
    });
  });

  // ================================================================
  // Linux platform
  // ================================================================
  describe('linux platform', () => {
    beforeEach(() => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
    });

    it('should try gnome-terminal first', async () => {
      mockSpawn.mockReturnValue({
        unref: jest.fn(),
        on: jest.fn(),
      });

      await openTerminalWithCommand('npm install');

      expect(mockSpawn).toHaveBeenCalledWith(
        'gnome-terminal',
        expect.arrayContaining(['--', 'bash', '-c']),
        expect.objectContaining({
          detached: true,
          stdio: 'ignore',
          shell: false,
        })
      );
    });

    it('should escape single quotes in shell arguments for Linux', async () => {
      mockSpawn.mockReturnValue({
        unref: jest.fn(),
        on: jest.fn(),
      });

      await openTerminalWithCommand("it's a test");

      const spawnArgs = mockSpawn.mock.calls[0][1] as string[];
      const bashCommand = spawnArgs[3]; // The command arg after 'bash', '-c'
      // The escaped command should contain the properly escaped single quote
      expect(bashCommand).toContain("'it'\\''s a test'");
    });

    // Note: The Linux implementation uses a fire-and-forget pattern where resolve()
    // is called immediately after spawn+unref, before any error event can fire.
    // The fallback chain (gnome-terminal → konsole → xterm) runs in error handlers
    // after the promise has already resolved. These tests verify the fallback spawns occur.
    it('should fall back to konsole on gnome-terminal error', async () => {
      let gnomeErrorHandler: (err: Error) => void;

      mockSpawn.mockImplementation((cmd: string) => {
        if (cmd === 'gnome-terminal') {
          return {
            unref: jest.fn(),
            on: jest.fn((event: string, handler: (err: Error) => void) => {
              if (event === 'error') {
                gnomeErrorHandler = handler;
              }
            }),
          };
        }
        return {
          unref: jest.fn(),
          on: jest.fn(),
        };
      });

      const promise = openTerminalWithCommand('test');

      // Simulate gnome-terminal not found
      gnomeErrorHandler!(new Error('spawn gnome-terminal ENOENT'));

      await promise;

      expect(mockSpawn).toHaveBeenCalledWith('konsole', expect.any(Array), expect.any(Object));
    });

    it('should fall back to xterm if konsole also fails', async () => {
      let gnomeErrorHandler: (err: Error) => void;
      let konsoleErrorHandler: (err: Error) => void;

      mockSpawn.mockImplementation((cmd: string) => {
        if (cmd === 'gnome-terminal') {
          return {
            unref: jest.fn(),
            on: jest.fn((event: string, handler: (err: Error) => void) => {
              if (event === 'error') gnomeErrorHandler = handler;
            }),
          };
        }
        if (cmd === 'konsole') {
          return {
            unref: jest.fn(),
            on: jest.fn((event: string, handler: (err: Error) => void) => {
              if (event === 'error') konsoleErrorHandler = handler;
            }),
          };
        }
        // xterm
        return {
          unref: jest.fn(),
          on: jest.fn(),
        };
      });

      const promise = openTerminalWithCommand('test');

      // Simulate gnome-terminal not found
      gnomeErrorHandler!(new Error('ENOENT'));

      // Need to wait a tick for konsole to be spawned
      await new Promise(resolve => setImmediate(resolve));

      // Simulate konsole not found
      konsoleErrorHandler!(new Error('ENOENT'));

      await promise;

      expect(mockSpawn).toHaveBeenCalledWith('xterm', expect.any(Array), expect.any(Object));
    });
  });
});
