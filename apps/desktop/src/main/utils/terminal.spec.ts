// ---- Mocks ----

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  log: jest.fn(),
};

jest.mock('@omniscribe/shared', () => ({
  createLogger: () => mockLogger,
}));

const mockSpawn = jest.fn();
const mockExecAsync = jest.fn();

jest.mock('child_process', () => ({
  exec: jest.fn(),
  spawn: (...args: unknown[]) => mockSpawn(...args),
}));

jest.mock('util', () => ({
  promisify:
    () =>
    (...args: unknown[]) =>
      mockExecAsync(...args),
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
      const encodedCommand = spawnArgs[5]; // The Base64 string after '-EncodedCommand'

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

    it('should use osascript to open Terminal.app', async () => {
      mockExecAsync.mockResolvedValue({ stdout: '', stderr: '' });

      await openTerminalWithCommand('npm install');

      expect(mockExecAsync).toHaveBeenCalledWith(expect.stringContaining('osascript'));
      expect(mockExecAsync).toHaveBeenCalledWith(expect.stringContaining('npm install'));
    });

    it('should escape backslashes in the command for AppleScript', async () => {
      mockExecAsync.mockResolvedValue({ stdout: '', stderr: '' });

      await openTerminalWithCommand('echo C:\\Users\\test');

      const calledWith = mockExecAsync.mock.calls[0][0] as string;
      expect(calledWith).toContain('C:\\\\Users\\\\test');
    });

    it('should escape double quotes in the command for AppleScript', async () => {
      mockExecAsync.mockResolvedValue({ stdout: '', stderr: '' });

      await openTerminalWithCommand('echo "hello"');

      const calledWith = mockExecAsync.mock.calls[0][0] as string;
      expect(calledWith).toContain('\\"hello\\"');
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
