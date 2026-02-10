import type { CLITool } from './cli-detection';

// ---- Mocks ----

const mockExecAsync = jest.fn();
const mockExistsSync = jest.fn();

jest.mock('child_process', () => ({
  exec: jest.fn(),
}));

jest.mock('util', () => ({
  promisify:
    () =>
    (...args: unknown[]) =>
      mockExecAsync(...args),
}));

jest.mock('fs', () => ({
  existsSync: (...args: unknown[]) => mockExistsSync(...args),
}));

// ---- Tests ----

describe('cli-detection', () => {
  let checkCliAvailable: typeof import('./cli-detection').checkCliAvailable;
  let findCliInPath: typeof import('./cli-detection').findCliInPath;
  let findCliInLocalPaths: typeof import('./cli-detection').findCliInLocalPaths;
  let CLI_TOOLS: typeof import('./cli-detection').CLI_TOOLS;

  beforeEach(() => {
    jest.clearAllMocks();
    // Re-import to get fresh references with mocks applied
    const mod = require('./cli-detection');
    checkCliAvailable = mod.checkCliAvailable;
    findCliInPath = mod.findCliInPath;
    findCliInLocalPaths = mod.findCliInLocalPaths;
    CLI_TOOLS = mod.CLI_TOOLS;
  });

  // ================================================================
  // CLI_TOOLS constant
  // ================================================================
  describe('CLI_TOOLS', () => {
    it('should be a non-empty array of tool names', () => {
      expect(Array.isArray(CLI_TOOLS)).toBe(true);
      expect(CLI_TOOLS.length).toBeGreaterThan(0);
    });

    it('should include common CLI tools', () => {
      expect(CLI_TOOLS).toContain('claude');
      expect(CLI_TOOLS).toContain('npm');
      expect(CLI_TOOLS).toContain('node');
      expect(CLI_TOOLS).toContain('git');
    });
  });

  // ================================================================
  // checkCliAvailable
  // ================================================================
  describe('checkCliAvailable', () => {
    it('should return true when tool is available', async () => {
      mockExecAsync.mockResolvedValue({ stdout: 'v1.0.0', stderr: '' });

      const result = await checkCliAvailable('node' as CLITool);

      expect(result).toBe(true);
      expect(mockExecAsync).toHaveBeenCalledWith('node --version');
    });

    it('should return false when tool is not available', async () => {
      mockExecAsync.mockRejectedValue(new Error('command not found'));

      const result = await checkCliAvailable('claude' as CLITool);

      expect(result).toBe(false);
    });

    it('should call execAsync with the correct tool name', async () => {
      mockExecAsync.mockResolvedValue({ stdout: '', stderr: '' });

      await checkCliAvailable('git' as CLITool);

      expect(mockExecAsync).toHaveBeenCalledWith('git --version');
    });
  });

  // ================================================================
  // findCliInPath
  // ================================================================
  describe('findCliInPath', () => {
    const originalPlatform = process.platform;

    afterEach(() => {
      Object.defineProperty(process, 'platform', { value: originalPlatform });
    });

    it('should use "which" command on Unix', async () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      mockExecAsync.mockResolvedValue({ stdout: '/usr/local/bin/claude\n' });

      const result = await findCliInPath('claude');

      expect(result).toBe('/usr/local/bin/claude');
      expect(mockExecAsync).toHaveBeenCalledWith('which claude');
    });

    it('should use "where" command on Windows', async () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      mockExecAsync.mockResolvedValue({
        stdout: 'C:\\Program Files\\claude\\claude.exe\nC:\\Users\\user\\claude.exe\n',
      });

      const result = await findCliInPath('claude');

      expect(result).toBe('C:\\Program Files\\claude\\claude.exe');
      expect(mockExecAsync).toHaveBeenCalledWith('where claude');
    });

    it('should return the first line when multiple results are returned', async () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      mockExecAsync.mockResolvedValue({
        stdout: '/usr/local/bin/claude\n/opt/bin/claude\n',
      });

      const result = await findCliInPath('claude');

      expect(result).toBe('/usr/local/bin/claude');
    });

    it('should return undefined when command fails', async () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      mockExecAsync.mockRejectedValue(new Error('not found'));

      const result = await findCliInPath('nonexistent');

      expect(result).toBeUndefined();
    });

    it('should return undefined when stdout is empty', async () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      mockExecAsync.mockResolvedValue({ stdout: '  \n' });

      const result = await findCliInPath('claude');

      expect(result).toBeUndefined();
    });
  });

  // ================================================================
  // findCliInLocalPaths
  // ================================================================
  describe('findCliInLocalPaths', () => {
    it('should return the first existing path', () => {
      mockExistsSync.mockImplementation((p: string) => p === '/opt/bin/claude');

      const result = findCliInLocalPaths([
        '/usr/bin/claude',
        '/opt/bin/claude',
        '/home/user/claude',
      ]);

      expect(result).toBe('/opt/bin/claude');
    });

    it('should return undefined when no paths exist', () => {
      mockExistsSync.mockReturnValue(false);

      const result = findCliInLocalPaths(['/a', '/b', '/c']);

      expect(result).toBeUndefined();
    });

    it('should return the first path if it exists', () => {
      mockExistsSync.mockReturnValue(true);

      const result = findCliInLocalPaths(['/first', '/second']);

      expect(result).toBe('/first');
      // Should only check the first path since it exists
      expect(mockExistsSync).toHaveBeenCalledTimes(1);
    });

    it('should return undefined for an empty array', () => {
      const result = findCliInLocalPaths([]);

      expect(result).toBeUndefined();
      expect(mockExistsSync).not.toHaveBeenCalled();
    });
  });
});
